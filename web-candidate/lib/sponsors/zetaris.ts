import { createHash, randomUUID } from 'node:crypto';
// Official REST contract: zetaris/getting-started/scripts/zetaris_sql.py (RestChannel.run).
// Constant SELECT only; callers cannot submit SQL or customer data.
export const SYNTHETIC_SQL = "SELECT 'SYNTH-PAPER-001' AS supplier_id, 'Synthetic Han River Paper' AS name, 'paper packaging' AS product, 'KR' AS country UNION ALL SELECT 'SYNTH-PAPER-002' AS supplier_id, 'Synthetic Blue Box' AS name, 'recycled paper packaging' AS product, 'KR' AS country";
export const EXPECTED_ROWS = [
 ['SYNTH-PAPER-001','Synthetic Han River Paper','paper packaging','KR'],
 ['SYNTH-PAPER-002','Synthetic Blue Box','recycled paper packaging','KR'],
] as const;
export class SponsorError extends Error {
 constructor(public code:string,public status=503){super(code);}
}
export type ZetarisConfig={restUrl:string;orgId:string;apiKey:string;allowLoopbackHttp?:boolean};
export function readZetarisConfig(env:Record<string,string|undefined>=process.env):ZetarisConfig{
 const {ZETARIS_REST_URL:restUrl,ZETARIS_ORG_ID:orgId,ZETARIS_API_KEY:apiKey}=env;
 if(!restUrl||!orgId||!apiKey)throw new SponsorError('ZETARIS_NOT_CONFIGURED');
 return {restUrl,orgId,apiKey,allowLoopbackHttp:env.ZETARIS_ALLOW_LOOPBACK_HTTP==='1'};
}
function endpoint(config:ZetarisConfig){
 let url:URL;try{url=new URL(config.restUrl);}catch{throw new SponsorError('ZETARIS_INVALID_URL');}
 const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||
 (url.protocol!=='https:'&&!(config.allowLoopbackHttp&&loopback&&url.protocol==='http:'))||
 url.pathname.replace(/\/$/,'')!=='/api/v1.0')throw new SponsorError('ZETARIS_INVALID_URL');
 if(!config.apiKey.trim()||/[\r\n]/.test(config.apiKey)||!/^[A-Za-z0-9_-]{1,128}$/.test(config.orgId))throw new SponsorError('ZETARIS_INVALID_CREDENTIAL_FORMAT');
 return config.restUrl.replace(/\/$/,'')+'/sql-editor/sqls/run';
}
export function validateSyntheticRows(value:unknown):string[][]{
 if(!Array.isArray(value)||value.length!==2)throw new SponsorError('ZETARIS_UNEXPECTED_SYNTHETIC_RESULT',502);
 for(const expected of EXPECTED_ROWS){
  if(value.filter(row=>Array.isArray(row)&&row.length===4&&row.every((v,i)=>v===expected[i])).length!==1)throw new SponsorError('ZETARIS_UNEXPECTED_SYNTHETIC_RESULT',502);
 }
 return EXPECTED_ROWS.map(row=>[...row]);
}
export async function boundedJson(response:Response){
 const reader=response.body?.getReader();if(!reader)throw new SponsorError('ZETARIS_INVALID_RESPONSE',502);
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
   if(size>65536){await reader.cancel();throw new SponsorError('ZETARIS_RESPONSE_TOO_LARGE',502);}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as {data?:unknown;error?:unknown;status?:unknown};
 }catch(error){if(error instanceof SponsorError)throw error;throw new SponsorError('ZETARIS_INVALID_RESPONSE',502);}
 finally{reader.releaseLock();}
}
export class ZetarisSyntheticClient{
 readonly transport:'live'|'mock';private fetcher:typeof fetch;
 constructor(private config:ZetarisConfig,testTransport?:{fetch:typeof fetch}){
  this.transport=testTransport?'mock':'live';this.fetcher=testTransport?.fetch||fetch;
 }
 async query(){
  const url=endpoint(this.config),requestId=randomUUID(),queryId=randomUUID(),started=Date.now();let response:Response;
  try{response=await this.fetcher(url,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
   headers:{Authorization:`Bearer ${this.config.apiKey}`,'X-Org-ID':this.config.orgId,'X-Request-ID':requestId,'Content-Type':'application/json'},
   body:JSON.stringify({queryId,sql:SYNTHETIC_SQL,source:'SqlEditor',limit:2})});
  }catch{throw new SponsorError('ZETARIS_UNREACHABLE_OR_TIMEOUT',502);}
  if(!response.ok){await response.body?.cancel();throw new SponsorError(response.status===401||response.status===403?'ZETARIS_UNAUTHORIZED':'ZETARIS_HTTP_FAILURE',502);}
  const data=await boundedJson(response);
  if(!data||typeof data!=='object'||data.error||data.status==='error'||data.status==='failed')throw new SponsorError('ZETARIS_QUERY_FAILED',502);
  const rows=validateSyntheticRows(data.data);
  return {rows,receipt:{transport:this.transport,requestId,queryId,rowCount:rows.length,
   sqlSha256:createHash('sha256').update(SYNTHETIC_SQL).digest('hex'),durationMs:Date.now()-started,
   verifiedAt:new Date().toISOString(),status:this.transport==='live'?'live-query-confirmed':'mock-contract-tested'}};
 }
}

