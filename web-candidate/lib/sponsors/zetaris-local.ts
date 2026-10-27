import {createHash,randomUUID} from 'node:crypto';
import {boundedJson,EXPECTED_ROWS,SYNTHETIC_SQL,SponsorError,validateSyntheticRows,ZetarisSyntheticClient} from './zetaris';
export type LocalZetarisConfig={baseUrl:string;username:string;password:string;signal?:AbortSignal};
export class ZetarisLocalSyntheticClient extends ZetarisSyntheticClient{
 private localFetch:typeof fetch;
 constructor(private local:LocalZetarisConfig,transport?:{fetch:typeof fetch}){
  super({restUrl:'http://127.0.0.1:3000/api/v1.0',orgId:'1',apiKey:'unused'},transport);
  this.localFetch=transport?.fetch||fetch;
 }
 private origin(){
  let u:URL;try{u=new URL(this.local.baseUrl);}catch{throw new SponsorError('ZETARIS_LOCAL_INVALID_URL');}
  if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!this.local.username.trim()||!this.local.password||/[\r\n]/.test(this.local.username+this.local.password))throw new SponsorError('ZETARIS_LOCAL_INVALID_CONFIG');
  return u.origin;
 }
 private async call(path:string,body:unknown,headers:Record<string,string>={}){
  const origin=this.origin();let response:Response;
  try{response=await this.localFetch(origin+path,{method:'POST',redirect:'error',cache:'no-store',signal:this.local.signal?AbortSignal.any([this.local.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}catch(e){const cause=(e as {cause?:{code?:string}})?.cause;throw new SponsorError(cause?.code==='EPERM'||cause?.code==='EACCES'?'ZETARIS_LOCAL_ACCESS_DENIED':'ZETARIS_LOCAL_UNREACHABLE_OR_TIMEOUT',502);}
  if(!response.ok){await response.body?.cancel();throw new SponsorError(response.status===401||response.status===403?'ZETARIS_UNAUTHORIZED':'ZETARIS_HTTP_FAILURE',502);}
  const data=await boundedJson(response) as Record<string,unknown>;
  if(!data||typeof data!=='object'||Array.isArray(data)||data.error||data.success===false)throw new SponsorError('ZETARIS_LOCAL_REQUEST_FAILED',502);
  return data;
 }
 async query(){
  const started=Date.now(),requestId=randomUUID(),queryId=randomUUID();
  const auth=await this.call('/api/auth/login',{username:this.local.username,password:this.local.password});
  if(typeof auth.idToken!=='string'||!auth.idToken.trim()||/[\r\n]/.test(auth.idToken)||!Number.isSafeInteger(auth.orgId)||Number(auth.orgId)<1)throw new SponsorError('ZETARIS_LOCAL_INVALID_SESSION',502);
  const result=await this.call('/api/proxy/query/sql/start',{select:SYNTHETIC_SQL,pageLimit:2},{Authorization:'Bearer '+auth.idToken,'X-Org-ID':String(auth.orgId),'X-Request-ID':requestId});
  if(['error','failed','pending','running','queued'].includes(String(result.status||'').toLowerCase()))throw new SponsorError('ZETARIS_QUERY_FAILED',502);
  const fields=['supplier_id','name','product','country'];
  if(!Array.isArray(result.records)||result.records.some(r=>!r||typeof r!=='object'||Object.keys(r).length!==fields.length||!fields.every(f=>Object.hasOwn(r,f))))throw new SponsorError('ZETARIS_UNEXPECTED_SYNTHETIC_RESULT',502);
  const rows=validateSyntheticRows(result.records.map(r=>fields.map(f=>r[f])));
  const serverRequestId=typeof result.requestId==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(result.requestId)&&![auth.idToken,this.local.username,this.local.password].some(secret=>result.requestId!.toString().includes(String(secret)))?result.requestId:undefined;
  return {rows,receipt:{transport:this.transport,requestId,queryId,rowCount:EXPECTED_ROWS.length,serverRequestId,method:'local-ui-proxy',sqlSha256:createHash('sha256').update(SYNTHETIC_SQL).digest('hex'),durationMs:Date.now()-started,verifiedAt:new Date().toISOString(),status:this.transport==='live'?'live-query-confirmed':'mock-contract-tested'}};
 }
}