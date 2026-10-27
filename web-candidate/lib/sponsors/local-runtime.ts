import {setTimeout as delay} from 'node:timers/promises';
import {createPublicKey,verify} from 'node:crypto';
import {dirname,join} from 'node:path';
import {open} from 'node:fs/promises';
import {readdir,readFile} from 'node:fs/promises';
import http from 'node:http';
import {SponsorError} from './zetaris';
const PIPE_ROOT=String.fromCharCode(92,92,46,92)+'pipe'+String.fromCharCode(92);
export function selectRuntimePipe(names:string[],explicit?:string){
 const candidates=[...new Set(names.map(n=>n.startsWith(PIPE_ROOT)?n.slice(PIPE_ROOT.length):n).filter(n=>/^ai\.meterless\.runtime-[a-f0-9]{12}-runtime$/.test(n)))];
 if(explicit){if(!explicit.startsWith(PIPE_ROOT)||!candidates.includes(explicit.slice(PIPE_ROOT.length)))throw new SponsorError('METERLESS_PIPE_NOT_FOUND');return explicit;}
 if(candidates.length!==1)throw new SponsorError(candidates.length?'METERLESS_PIPE_AMBIGUOUS':'METERLESS_PIPE_NOT_FOUND');
 return PIPE_ROOT+candidates[0];
}
export async function discoverRuntimePipe(explicit?:string){
 let names:string[];try{names=await readdir(PIPE_ROOT);}catch{throw new SponsorError('METERLESS_PIPE_DISCOVERY_DENIED');}
 return selectRuntimePipe(names,explicit);
}
// Exact installed GGUF/API pair corroborated by this Runtime's historical receipts.
// Never derive aliases from arbitrary filenames. Discovery still must advertise the API ID.
export function canonicalLocalModelId(model:unknown):string|undefined{
 if(typeof model!=='string')return undefined;
 if(/^local-runtime\/[a-z0-9._-]+$/.test(model))return model;
 if(model==='Llama-3.2-3B-Instruct-Q4_K_M.gguf')return 'local-runtime/llama-3.2-3b-instruct';
 return undefined;
}
export function readRuntimeStatus(pipe:string,signal?:AbortSignal):Promise<{version?:string;localModels:string[]}>{
 if(!pipe.startsWith(PIPE_ROOT)||!/^ai\.meterless\.runtime-[a-f0-9]{12}-runtime$/.test(pipe.slice(PIPE_ROOT.length)))throw new SponsorError('METERLESS_PIPE_INVALID');
 return new Promise((resolve,reject)=>{
  const req=http.request({socketPath:pipe,path:'/admin/status',method:'GET',headers:{host:'meterlessd'}},res=>{
   let size=0;const chunks:Buffer[]=[];
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536)req.destroy(new SponsorError('METERLESS_STATUS_TOO_LARGE'));else chunks.push(chunk);});
   res.on('error',()=>reject(new SponsorError('METERLESS_STATUS_INCOMPLETE')));
   res.on('end',()=>{try{
    if(!res.complete)throw new SponsorError('METERLESS_STATUS_INCOMPLETE');
    if(res.statusCode!==200)throw new SponsorError('METERLESS_STATUS_HTTP_FAILURE');
    const state=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!Array.isArray(state.keys_configured)||state.keys_configured.length||!Array.isArray(state.lanes)||state.lanes.some((l:Record<string,unknown>)=>l?.provider))throw new SponsorError('METERLESS_LOCAL_ONLY_UNCONFIRMED');
    const localModels=state.lanes.filter((l:Record<string,unknown>)=>l?.state==='ready'&&l.kind==='local').map((l:Record<string,unknown>)=>canonicalLocalModelId(l.model)).filter((x:unknown):x is string=>typeof x==='string');
    if(!localModels.length){
     const readyLocalLaneCount=state.lanes.filter((l:Record<string,unknown>)=>l?.state==='ready'&&l.kind==='local').length;
     const diagnostics={laneCount:state.lanes.length,readyLocalLaneCount,lanes:state.lanes.map((l:Record<string,unknown>)=>({
      state:['ready','stopped','starting','loading','error','failed','disabled'].includes(String(l?.state))?l.state:'unrecognized',
      kind:['local','cloud','media','llama'].includes(String(l?.kind))?l.kind:'unrecognized',
      model:typeof l?.model==='string'&&/^(local-runtime\/[a-z0-9._-]+|Llama-[A-Za-z0-9._-]+\.gguf|llama-[a-z0-9._-]+)$/.test(l.model)?l.model:undefined,
      modelId:typeof l?.model_id==='string'&&/^local-runtime\/[a-z0-9._-]+$/.test(l.model_id)?l.model_id:undefined,
      hasModelField:Object.hasOwn(l||{},'model'),hasModelIdField:Object.hasOwn(l||{},'model_id'),hasIdField:Object.hasOwn(l||{},'id')
     }))};
     throw Object.assign(new SponsorError(readyLocalLaneCount?'METERLESS_MODEL_ID_MAPPING_UNCONFIRMED':'METERLESS_LOCAL_MODEL_NOT_READY'),{diagnostics});
    }
    resolve({version:typeof state.version==='string'&&/^[a-zA-Z0-9._-]{1,40}$/.test(state.version)?state.version:undefined,localModels});
   }catch(e){reject(e instanceof SponsorError?e:new SponsorError('METERLESS_STATUS_INVALID'));}});
  });
  const totalTimer=setTimeout(()=>req.destroy(new SponsorError('METERLESS_STATUS_TIMEOUT')),5000);
  req.once('close',()=>{clearTimeout(totalTimer);reject(new SponsorError('METERLESS_STATUS_CLOSED_WITHOUT_RESPONSE'));});
  req.once('upgrade',(_res,socket)=>{socket.destroy();reject(new SponsorError('METERLESS_STATUS_UNEXPECTED_UPGRADE'));});
  const abort=()=>req.destroy(new SponsorError('SCENARIO_CANCELLED'));
  signal?.addEventListener('abort',abort,{once:true});req.once('close',()=>signal?.removeEventListener('abort',abort));
  if(signal?.aborted)abort();
  req.setTimeout(5000,()=>req.destroy(new SponsorError('METERLESS_STATUS_TIMEOUT')));
  req.on('error',(e:NodeJS.ErrnoException)=>reject(e instanceof SponsorError?e:new SponsorError(e.code==='EPERM'||e.code==='EACCES'?'METERLESS_PIPE_ACCESS_DENIED':'METERLESS_STATUS_UNREACHABLE')));req.end();
 });
}
export async function readLocalZetarisCredentials(file:string){
 let text:string;try{text=await readFile(file,'utf8');}catch{throw new SponsorError('ZETARIS_CREDENTIAL_FILE_UNREADABLE');}
 const values:Record<string,string>={};
 for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const m=/^(ZETARIS_ADMIN_EMAIL|ZETARIS_ADMIN_PASSWORD)=(.*)$/.exec(line);
  if(!m)continue;if(Object.hasOwn(values,m[1]))throw new SponsorError('ZETARIS_DUPLICATE_CREDENTIAL_FIELD');
  let value=m[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);values[m[1]]=value;
 }
 if(!values.ZETARIS_ADMIN_EMAIL||!values.ZETARIS_ADMIN_PASSWORD)throw new SponsorError('ZETARIS_LOCAL_CREDENTIALS_MISSING');
 return {username:values.ZETARIS_ADMIN_EMAIL,password:values.ZETARIS_ADMIN_PASSWORD};
}

// Optional pipe HTTP adapter. Runtime 1.2.2 local runner uses admin pipe + explicit loopback model HTTP instead.
export async function runtimePipeFetch(pipe:string,url:string,init:RequestInit={}):Promise<Response>{
 selectRuntimePipe([pipe],pipe);
 if(!['http://127.0.0.1:8088/v1/models','http://127.0.0.1:8088/v1/chat/completions'].includes(url))throw new SponsorError('METERLESS_PIPE_ROUTE_INVALID');
 if(init.signal?.aborted)throw new SponsorError('METERLESS_PIPE_REQUEST_ABORTED');
 return new Promise((resolve,reject)=>{
  const headers=Object.fromEntries(new Headers(init.headers));
  const req=http.request({socketPath:pipe,path:new URL(url).pathname,method:init.method||'GET',headers:{...headers,host:'meterlessd'}},res=>{
   let size=0;const chunks:Buffer[]=[];
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536)req.destroy(new SponsorError('METERLESS_RESPONSE_TOO_LARGE'));else chunks.push(chunk);});
   res.on('error',()=>reject(new SponsorError('METERLESS_PIPE_RESPONSE_INCOMPLETE')));
   res.on('end',()=>{try{
    if(!res.complete)throw new SponsorError('METERLESS_PIPE_RESPONSE_INCOMPLETE');
    if([204,205,304].includes(res.statusCode||0))throw new SponsorError('METERLESS_PIPE_EMPTY_RESPONSE');
    resolve(new Response(Buffer.concat(chunks),{status:res.statusCode||502}));
   }catch(e){reject(e instanceof SponsorError?e:new SponsorError('METERLESS_PIPE_RESPONSE_INVALID'));}});
  });
  const abort=()=>req.destroy(new SponsorError('METERLESS_PIPE_REQUEST_TIMEOUT'));
  init.signal?.addEventListener('abort',abort,{once:true});req.on('close',()=>init.signal?.removeEventListener('abort',abort));
  const deadline=url.endsWith('/models')?15000:180000;
  const totalTimer=setTimeout(abort,deadline);
  req.once('close',()=>{clearTimeout(totalTimer);reject(new SponsorError('METERLESS_PIPE_CLOSED_WITHOUT_RESPONSE'));});
  req.once('upgrade',(_res,socket)=>{socket.destroy();reject(new SponsorError('METERLESS_PIPE_UNEXPECTED_UPGRADE'));});
  req.setTimeout(deadline,abort);
  req.on('error',(e:NodeJS.ErrnoException)=>reject(e instanceof SponsorError?e:new SponsorError(e.code==='EPERM'||e.code==='EACCES'?'METERLESS_PIPE_ACCESS_DENIED':'METERLESS_PIPE_REQUEST_FAILED')));
  if(typeof init.body==='string')req.write(init.body);req.end();
 });
}
export function requireReadyLocalModel(models:string[],model:string){
 if(!/^local-runtime\/[a-z0-9._-]+$/.test(model)||!models.includes(model))throw new SponsorError('METERLESS_SELECTED_MODEL_NOT_READY');
 return model;
}
export async function readExplicitRuntimeToken(file:string){
 try{
  const token=(await readFile(file,'utf8')).trim();
  if(!token||token==='rt-local'||/[\r\n]/.test(token))throw new SponsorError('METERLESS_TOKEN_FILE_INVALID');
  return token;
 }catch(e){
  if(e instanceof SponsorError)throw e;
  const code=(e as NodeJS.ErrnoException)?.code;
  throw new SponsorError(code==='ENOENT'?'METERLESS_TOKEN_FILE_NOT_FOUND':code==='EACCES'||code==='EPERM'?'METERLESS_TOKEN_FILE_ACCESS_DENIED':'METERLESS_TOKEN_FILE_UNREADABLE');
 }
}
export function verifyMatchingRuntimeReceipt(document:unknown,expected:{requestId:string;model:string;startedAt:number;signal?:AbortSignal}){
 try{
  const d=document as {body?:{ts_ms?:number;receipt?:Record<string,any>};pubkey_b64?:string;sig_b64?:string};
  const r=d?.body?.receipt;
  if(!r||r.request_id!==expected.requestId||r.app!=='atlasgori-synthetic-demo'||r.status!=='ok'||r.privacy?.path!=='local-only'||r.winning_route?.kind!=='local'||r.winning_route?.model!==expected.model||typeof d.body?.ts_ms!=='number'||d.body.ts_ms<expected.startedAt-1000||d.body.ts_ms>Date.now()+5000)return undefined;
  if(typeof d.pubkey_b64!=='string'||d.pubkey_b64.length!==44||typeof d.sig_b64!=='string'||d.sig_b64.length!==88)return undefined;
  const keyBytes=Buffer.from(d.pubkey_b64,'base64'),signature=Buffer.from(d.sig_b64,'base64');if(keyBytes.length!==32||signature.length!==64)return undefined;
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),keyBytes]),format:'der',type:'spki'});
  if(!verify(null,Buffer.from(JSON.stringify(d.body)),key,signature))return undefined;
  return {serverRequestId:expected.requestId,model:expected.model,localOnly:true,signatureValidWithEmbeddedKey:true,recordedAt:new Date(d.body.ts_ms).toISOString(),binding:'matching-runtime-receipt-in-token-directory'};
 }catch{return undefined;}
}
export async function confirmRuntimeReceipt(tokenFile:string,expected:{requestId:string;model:string;startedAt:number;signal?:AbortSignal}){
 const file=join(dirname(tokenFile),'receipts.jsonl');
 for(let attempt=0;attempt<11;attempt++){
  if(expected.signal?.aborted)throw new SponsorError('SCENARIO_CANCELLED');
  let handle:Awaited<ReturnType<typeof open>>|undefined;
  try{
   handle=await open(file,'r');const {size}=await handle.stat();const length=Math.min(size,1048576);const bytes=Buffer.alloc(length);const {bytesRead}=await handle.read(bytes,0,length,size-length);
   const lines=bytes.subarray(0,bytesRead).toString('utf8').split(/\r?\n/);if(size>length)lines.shift();
   for(const line of lines.slice(-4096).reverse()){if(line.length>65536)continue;let doc;try{doc=JSON.parse(line);}catch{continue;}const result=verifyMatchingRuntimeReceipt(doc,expected);if(result)return result;}
  }catch{throw new SponsorError('METERLESS_RUNTIME_RECEIPTS_UNREADABLE');}
  finally{await handle?.close();}
  if(attempt<10)try{await delay(150,undefined,{signal:expected.signal});}catch{throw new SponsorError('SCENARIO_CANCELLED');}
 }
 throw new SponsorError('METERLESS_MATCHING_RUNTIME_RECEIPT_NOT_CONFIRMED');
}