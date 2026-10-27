import {SponsorError} from './zetaris';
import {JobView,OWNER,UUID,parseJobView,parseStart,safeCode} from './worker-protocol';
export type WorkerClientConfig={baseUrl:string;token:string;allowLoopbackHttp?:boolean};
export interface SponsorWorkerClient{start(ownerId:string,requestId:string):Promise<JobView>;get(ownerId:string,id:string):Promise<JobView>;cancel(ownerId:string,id:string):Promise<JobView>;}
function base(config:WorkerClientConfig){let u:URL;try{u=new URL(config.baseUrl);}catch{throw new SponsorError('WORKER_CONFIG_INVALID');}const loopback=['127.0.0.1','localhost','[::1]'].includes(u.hostname);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.protocol!=='https:'&&!(config.allowLoopbackHttp&&loopback&&u.protocol==='http:'))||!/^[A-Za-z0-9_-]{43,128}$/.test(config.token))throw new SponsorError('WORKER_CONFIG_INVALID');return u.origin;}
export function readWorkerClientConfig(env:Record<string,string|undefined>=process.env):WorkerClientConfig{const config={baseUrl:env.ATLAS_WORKER_URL||'',token:env.ATLAS_WORKER_TOKEN||'',allowLoopbackHttp:env.ATLAS_WORKER_ALLOW_LOOPBACK_HTTP==='1'};base(config);return config;}
export class PrivateWorkerClient implements SponsorWorkerClient{
 constructor(private config:WorkerClientConfig,private transport:typeof fetch=fetch){base(config);}
 private async call(path:string,ownerId:string,method:string,body?:unknown){
  if(!OWNER.test(ownerId))throw new SponsorError('WORKER_OWNER_INVALID');
  let response:Response;try{response=await this.transport(base(this.config)+path,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+this.config.token,'Content-Type':'application/json','x-atlas-owner':ownerId},...(body?{body:JSON.stringify(body)}:{})});}catch{throw new SponsorError('WORKER_UNREACHABLE',503);}
  const reader=response.body?.getReader();if(!reader)throw new SponsorError('WORKER_RESPONSE_INVALID',502);let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new SponsorError('WORKER_RESPONSE_TOO_LARGE',502);}chunks.push(value);}const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!response.ok)throw new SponsorError(safeCode(data?.error,'WORKER_HTTP_FAILURE'),[400,401,403,404,409,413,429,503].includes(response.status)?response.status:502);return parseJobView(data);}
  catch(e){if(e instanceof SponsorError)throw e;throw new SponsorError('WORKER_RESPONSE_INVALID',502);}finally{reader.releaseLock();}
 }
 start(ownerId:string,requestId:string){const body=parseStart({scenario:'paper-packaging',ownerId,requestId});return this.call('/v1/jobs',ownerId,'POST',body);}
 get(ownerId:string,id:string){if(!UUID.test(id))throw new SponsorError('WORKER_JOB_ID_INVALID',400);return this.call('/v1/jobs/'+id,ownerId,'GET');}
 cancel(ownerId:string,id:string){if(!UUID.test(id))throw new SponsorError('WORKER_JOB_ID_INVALID',400);return this.call('/v1/jobs/'+id,ownerId,'DELETE');}
}