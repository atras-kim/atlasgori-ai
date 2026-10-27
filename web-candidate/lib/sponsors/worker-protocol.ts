import {SponsorError,validateSyntheticRows} from './zetaris';
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const OWNER=/^synthetic-[a-f0-9]{64}$/;
export type JobStatus='queued'|'running'|'succeeded'|'failed'|'cancelled'|'expired'|'interrupted';
export type SafeResult={verification:'live-synthetic-services'|'mock-services-local-memory';runId:string;zetarisRows:2;selected:'SYNTH-PAPER-002';model:string;serverRequestId:string;localOnly:true;signatureValidWithEmbeddedKey:true;memory:{priorRecallCount:number;recallCount:2;persistedAcrossInstances:true;implementation:'local-hmem-subset'}};
export type JobView={id:string;scenario:'paper-packaging';status:JobStatus;createdAt:string;updatedAt:string;result?:SafeResult;error?:string};
export type JobRecord=JobView&{ownerId:string;requestId:string;queuedUntil:number};
const statuses=new Set(['queued','running','succeeded','failed','cancelled','expired','interrupted']);
export function safeCode(value:unknown,fallback='WORKER_JOB_FAILED'){return typeof value==='string'&&/^(?:WORKER|SCENARIO|ZETARIS|METERLESS)_[A-Z_]{1,68}$/.test(value)?value:fallback;}
export function parseStart(value:unknown):{scenario:'paper-packaging';ownerId:string;requestId:string}{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SponsorError('WORKER_REQUEST_INVALID',400);
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='ownerId,requestId,scenario'||v.scenario!=='paper-packaging'||typeof v.ownerId!=='string'||!OWNER.test(v.ownerId)||typeof v.requestId!=='string'||!UUID.test(v.requestId))throw new SponsorError('WORKER_REQUEST_INVALID',400);
 return v as {scenario:'paper-packaging';ownerId:string;requestId:string};
}
export function resultFromReport(report:Record<string,any>):SafeResult{
 if(!UUID.test(report.runId)||!['live-synthetic-services-confirmed','mock-services-local-memory'].includes(report.overall)||report.dataClass!=='fixed-synthetic-only'||report.zetaris?.ok!==true||report.meterless?.ok!==true)throw new SponsorError('WORKER_RESULT_INVALID');
 validateSyntheticRows(report.zetaris.rows);
 const transport=report.mockUsed===false?'live':report.mockUsed===true?'mock':undefined;
 const r=report.meterless.receipt,e=report.meterless.runtimeEvidence,m=report.memory;
 if(!transport||report.overall!==(transport==='live'?'live-synthetic-services-confirmed':'mock-services-local-memory')||report.zetaris.receipt?.transport!==transport||r?.transport!==transport||r.localOnly!==true||report.meterless.selected!=='SYNTH-PAPER-002'||typeof r.model!=='string'||!/^local-runtime\/[a-z0-9._-]+$/.test(r.model)||typeof r.serverRequestId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(r.serverRequestId)||e?.serverRequestId!==r.serverRequestId||e.model!==r.model||e.localOnly!==true||e.signatureValidWithEmbeddedKey!==true||m?.implementation!=='local-hmem-subset'||m.recallCount!==2||!Number.isSafeInteger(m.priorRecallCount)||m.priorRecallCount<0||m.priorRecallCount>2||m.persistedAcrossInstances!==true)throw new SponsorError('WORKER_RESULT_INVALID');
 return {verification:transport==='live'?'live-synthetic-services':'mock-services-local-memory',runId:report.runId,zetarisRows:2,selected:'SYNTH-PAPER-002',model:r.model,serverRequestId:r.serverRequestId,localOnly:true,signatureValidWithEmbeddedKey:true,memory:{priorRecallCount:m.priorRecallCount,recallCount:2,persistedAcrossInstances:true,implementation:'local-hmem-subset'}};
}
export function parseJobView(value:unknown):JobView{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SponsorError('WORKER_RESPONSE_INVALID',502);
 const v=value as Record<string,any>;
 if(!UUID.test(v.id)||v.scenario!=='paper-packaging'||!statuses.has(v.status)||typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt))||typeof v.updatedAt!=='string'||!Number.isFinite(Date.parse(v.updatedAt)))throw new SponsorError('WORKER_RESPONSE_INVALID',502);
 const job:JobView={id:v.id,scenario:'paper-packaging',status:v.status,createdAt:v.createdAt,updatedAt:v.updatedAt};
 if(v.status==='succeeded'){
  const r=v.result,m=r?.memory;
  if(!r||!['live-synthetic-services','mock-services-local-memory'].includes(r.verification)||!UUID.test(r.runId)||r.runId!==v.id||r.zetarisRows!==2||r.selected!=='SYNTH-PAPER-002'||typeof r.model!=='string'||!/^local-runtime\/[a-z0-9._-]+$/.test(r.model)||typeof r.serverRequestId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(r.serverRequestId)||r.localOnly!==true||r.signatureValidWithEmbeddedKey!==true||!m||m.implementation!=='local-hmem-subset'||m.recallCount!==2||!Number.isSafeInteger(m.priorRecallCount)||m.priorRecallCount<0||m.priorRecallCount>2||m.persistedAcrossInstances!==true)throw new SponsorError('WORKER_RESPONSE_INVALID',502);
  job.result={verification:r.verification,runId:r.runId,zetarisRows:2,selected:r.selected,model:r.model,serverRequestId:r.serverRequestId,localOnly:true,signatureValidWithEmbeddedKey:true,memory:{implementation:'local-hmem-subset',priorRecallCount:m.priorRecallCount,recallCount:2,persistedAcrossInstances:true}};
 }else if(v.error!==undefined)job.error=safeCode(v.error);
 return job;
}