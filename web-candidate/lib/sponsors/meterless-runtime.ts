import {runtimePipeFetch} from './local-runtime';
import { randomUUID } from 'node:crypto';
import { SponsorError,validateSyntheticRows } from './zetaris';
// Official provider contract v4: https://meterless.ai/engines.html
export type MeterlessConfig={baseUrl:string;token:string;model:string;allowLoopbackHttp?:boolean;signal?:AbortSignal};
export function readMeterlessConfig(env:Record<string,string|undefined>=process.env):MeterlessConfig{
 const {METERLESS_BASE_URL:baseUrl,METERLESS_RUNTIME_TOKEN:token}=env;
 if(!baseUrl||!token)throw new SponsorError('METERLESS_NOT_CONFIGURED');
 return {baseUrl,token,model:env.METERLESS_MODEL||'meterless/auto',allowLoopbackHttp:env.METERLESS_ALLOW_LOOPBACK_HTTP==='1'};
}
function base(config:MeterlessConfig){
 let url:URL;try{url=new URL(config.baseUrl);}catch{throw new SponsorError('METERLESS_INVALID_URL');}
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname.replace(/\/$/,'')!=='/v1'||
 (url.protocol!=='https:'&&!(config.allowLoopbackHttp&&local&&url.protocol==='http:'))||
 !config.token.trim()||config.token==='rt-local'||/[\r\n]/.test(config.token)||!/^(meterless|local-runtime)\/[a-z0-9._-]+$/.test(config.model)||(config.model.startsWith('local-runtime/')&&!local))throw new SponsorError('METERLESS_INVALID_CONFIG');
 return config.baseUrl.replace(/\/$/,'');
}
// Normalize presentation only. Never extract JSON from surrounding prose or repair values.
export function syntheticSelectionJson(content:unknown){
 if(typeof content!=='string'||content.length>4096)return {json:undefined,format:'invalid' as const};
 const trimmed=content.trim(),fence=/^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
 const json=fence?fence[1].trim():trimmed;
 const format=fence?'json-fence' as const:'json' as const;
 const match=/^\{\s*"(selected|supplier_id)"\s*:\s*"(SYNTH-PAPER-00[12])"\s*\}$/.exec(json);
 if(!match)return {json:undefined,format:'invalid' as const};
 return {json:JSON.stringify({selected:match[2]}),format:match[1]==='supplier_id'?`${format}-supplier-id` as const:format};
}
export class MeterlessSyntheticClient{
 readonly transport:'live'|'mock';private fetcher:typeof fetch;
 constructor(private config:MeterlessConfig,testTransport?:{fetch:typeof fetch},runtimePipe?:string){
  this.fetcher=testTransport?.fetch||(runtimePipe?((url:unknown,init?:RequestInit)=>runtimePipeFetch(runtimePipe,String(url),init)) as typeof fetch:fetch);
  this.transport=testTransport?'mock':'live';
 }
 private async call(path:string,body?:unknown){
  const url=base(this.config)+path;let response:Response;
  try{response=await this.fetcher(url,{method:body?'POST':'GET',redirect:'error',cache:'no-store',signal:this.config.signal?AbortSignal.any([this.config.signal,AbortSignal.timeout(path==='/models'?15000:180000)]):AbortSignal.timeout(path==='/models'?15000:180000),
   headers:{Authorization:`Bearer ${this.config.token}`,'Content-Type':'application/json','meterless-app':'atlasgori-synthetic-demo','meterless-scope':'user','meterless-tier-split':'off'},
   ...(body?{body:JSON.stringify(body)}:{})});}catch(e){if(e instanceof SponsorError)throw e;throw new SponsorError('METERLESS_UNREACHABLE_OR_TIMEOUT',502);}
  if(!response.ok){await response.body?.cancel();throw Object.assign(new SponsorError(response.status===401||response.status===403?'METERLESS_UNAUTHORIZED':'METERLESS_HTTP_FAILURE',502),{diagnostics:{phase:path==='/models'?'model-discovery':'inference',httpStatus:response.status}});}
  const reader=response.body?.getReader();if(!reader)throw new SponsorError('METERLESS_INVALID_RESPONSE',502);
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new SponsorError('METERLESS_RESPONSE_TOO_LARGE',502);}chunks.push(value);}
   const parsed:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Object.assign(new SponsorError('METERLESS_INVALID_RESPONSE',502),{diagnostics:{phase:path==='/models'?'model-discovery':'inference',httpStatus:response.status,jsonKind:parsed===null?'null':Array.isArray(parsed)?'array':typeof parsed}});
   return parsed as Record<string,unknown>;
  }catch(e){if(e instanceof SponsorError)throw e;throw new SponsorError('METERLESS_INVALID_RESPONSE',502);}finally{reader.releaseLock();}
 }
 async reason(rows:unknown){
  const syntheticRows=validateSyntheticRows(rows);
  const requestId=randomUUID(),models=await this.call('/models');
  const entries=models.data;
  if(!Array.isArray(entries)||!entries.some(x=>x&&typeof x==='object'&&x.id===this.config.model))throw new SponsorError('METERLESS_MODEL_UNAVAILABLE',502);
  // All data below is immutable synthetic fixture data. No mail, user prompt or recalled customer content.
  const prompt='Synthetic integration test. Columns: supplier_id,name,product,country. Data: '+JSON.stringify(syntheticRows)+'. Choose the supplier whose product is recycled paper packaging. Return its supplier_id in the selected field.';
  const result=await this.call('/chat/completions',{model:this.config.model,messages:[{role:'system',content:'Return only one JSON object with exactly one key: selected. Its value must be one supplier_id from the supplied rows. Do not reproduce rows or explain. No markdown.'},{role:'user',content:prompt}],max_tokens:256,stream:false,temperature:0,response_format:{type:'json_object'}});
  const localModel=this.config.model.startsWith('local-runtime/');
  const metadata=result.meterless as {privacy?:{path?:unknown}}|undefined;
  if(localModel&&metadata?.privacy?.path!=='local-only')throw new SponsorError('METERLESS_LOCAL_PRIVACY_UNCONFIRMED',502);
  if(Array.isArray(result.choices)&&result.choices.some(c=>c?.finish_reason==='length'))throw new SponsorError('METERLESS_TRUNCATED_RESPONSE',502);
  const serverRequestId=typeof result.id==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(result.id)&&!result.id.includes(this.config.token)?result.id:undefined;
  const choices=result.choices;
  let content:unknown;
  if(Array.isArray(choices)&&choices.length===1)content=choices[0]?.message?.content;
  const normalized=syntheticSelectionJson(content);
  let selected:unknown,jsonKeyCount:number|undefined,jsonParsed=false;try{const parsed=normalized.json?JSON.parse(normalized.json):null;
   jsonParsed=!!normalized.json;if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))jsonKeyCount=Object.keys(parsed).length;
   if(parsed&&Object.keys(parsed).length===1)selected=parsed.selected;
  }catch{/* Never return arbitrary provider output. */}
  if(selected!=='SYNTH-PAPER-002'){
   const finish=Array.isArray(choices)?choices[0]?.finish_reason:undefined;
   throw Object.assign(new SponsorError('METERLESS_UNEXPECTED_SYNTHETIC_RESULT',502),{diagnostics:{phase:'synthetic-selection-validation',serverRequestId,contentType:typeof content,contentLength:typeof content==='string'?content.length:undefined,jsonParsed,jsonKeyCount,knownSelection:selected==='SYNTH-PAPER-001'?selected:undefined,finishReason:['stop','length','content_filter'].includes(finish)?finish:undefined}});
  }
  return {selected: 'SYNTH-PAPER-002' as const,receipt:{requestId,serverRequestId,responseFormat:normalized.format,localOnly:localModel?true:undefined,transport:this.transport,model:this.config.model,
   verifiedAt:new Date().toISOString(),status:this.transport==='live'?'live-runtime-confirmed':'mock-contract-tested'}};
 }
}



