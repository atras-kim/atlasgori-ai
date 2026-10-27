import {timingSafeEqual} from 'node:crypto';
import {createServer,Server} from 'node:http';
import {SponsorError} from './zetaris';
import {OWNER,UUID,safeCode} from './worker-protocol';
import {SponsorWorkerQueue} from './worker-queue';
export function checkWorkerToken(token:string){if(!/^[A-Za-z0-9_-]{43,128}$/.test(token))throw new SponsorError('WORKER_AUTH_NOT_CONFIGURED');}
function authorized(header:string|null,token:string){const value=header?.startsWith('Bearer ')?header.slice(7):'';return /^[A-Za-z0-9_-]{43,128}$/.test(value)&&value.length===token.length&&timingSafeEqual(Buffer.from(value),Buffer.from(token));}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createWorkerHandler(queue:SponsorWorkerQueue,token:string){
 checkWorkerToken(token);
 return async(req:Request)=>{
  try{
   if(!authorized(req.headers.get('authorization'),token))return json({error:'WORKER_UNAUTHORIZED'},401);
   if(req.headers.has('origin'))return json({error:'WORKER_BROWSER_ACCESS_REJECTED'},403);
   const url=new URL(req.url);if(url.search)return json({error:'WORKER_REQUEST_INVALID'},400);
   if(req.method==='GET'&&url.pathname==='/health')return json(queue.health());
   if(req.method==='POST'&&url.pathname==='/v1/jobs'){
    if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'WORKER_REQUEST_INVALID'},400);
    const text=await req.text();if(Buffer.byteLength(text)>1024)return json({error:'WORKER_REQUEST_TOO_LARGE'},413);
    let body:unknown;try{body=JSON.parse(text);}catch{return json({error:'WORKER_REQUEST_INVALID'},400);}
    return json(await queue.submit(body),202);
   }
   const id=url.pathname.match(/^\/v1\/jobs\/([a-f0-9-]+)$/i)?.[1],owner=req.headers.get('x-atlas-owner');
   if(!id||!UUID.test(id)||!owner||!OWNER.test(owner))return json({error:'WORKER_JOB_NOT_FOUND'},404);
   if(req.method==='GET')return json(await queue.get(id,owner));
   if(req.method==='DELETE')return json(await queue.cancel(id,owner));
   return json({error:'WORKER_METHOD_REJECTED'},405);
  }catch(e){return json({error:e instanceof SponsorError?safeCode(e.code):'WORKER_REQUEST_FAILED'},e instanceof SponsorError?e.status:503);}
 };
}
export function createWorkerServer(queue:SponsorWorkerQueue,token:string):Server{
 checkWorkerToken(token);const handler=createWorkerHandler(queue,token);
 const server=createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:5000},(req,res)=>{
  const reply=(body:unknown,status:number)=>{if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}};
  if(!authorized(typeof req.headers.authorization==='string'?req.headers.authorization:null,token)){reply({error:'WORKER_UNAUTHORIZED'},401);req.resume();return;}
  if(Number(req.headers['content-length']||0)>1024){reply({error:'WORKER_REQUEST_TOO_LARGE'},413);req.resume();return;}
  let size=0,failed=false;const chunks:Buffer[]=[];
  req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1024){failed=true;reply({error:'WORKER_REQUEST_TOO_LARGE'},413);}else if(!failed)chunks.push(chunk);});
  req.on('error',()=>reply({error:'WORKER_REQUEST_FAILED'},400));
  req.on('end',()=>{if(failed)return;void(async()=>{try{
   const headers=new Headers();for(const [name,value]of Object.entries(req.headers)){if(typeof value==='string')headers.set(name,value);}
   const method=req.method||'GET';const request=new Request('http://127.0.0.1'+(req.url||'/'),{method,headers,...(method==='GET'||method==='HEAD'?{}:{body:Buffer.concat(chunks)})});
   const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{reply({error:'WORKER_REQUEST_FAILED'},503);}})();});
 });server.maxRequestsPerSocket=100;return server;
}
export async function listenPrivateWorker(server:Server,port=0){if(!Number.isInteger(port)||port<0||port>65535)throw new SponsorError('WORKER_PORT_INVALID');await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});const address=server.address();if(!address||typeof address==='string')throw new SponsorError('WORKER_ADDRESS_INVALID');return `http://127.0.0.1:${address.port}`;}
export async function closePrivateWorker(server:Server){server.closeIdleConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(new SponsorError('WORKER_CLOSE_FAILED')):resolve()));}