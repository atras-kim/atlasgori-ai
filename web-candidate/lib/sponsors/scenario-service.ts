import {randomUUID} from 'node:crypto';
import {ZetarisLocalSyntheticClient} from './zetaris-local';
import {MeterlessSyntheticClient} from './meterless-runtime';
import {discoverRuntimePipe,readRuntimeStatus,readLocalZetarisCredentials,requireReadyLocalModel,readExplicitRuntimeToken,confirmRuntimeReceipt} from './local-runtime';
import {SponsorError,validateSyntheticRows} from './zetaris';
import {SyntheticHmem,SYNTHETIC_FACTS} from './meterless-memory';
export type ScenarioConfig={zetarisEnv:string;meterlessTokenFile:string;memoryRoot:string;model?:string;pipe?:string};
export type ScenarioDependencies={transport:'live'|'mock';status:()=>Promise<{version?:string;localModels:string[]}>;query:()=>Promise<{rows:unknown;receipt:Record<string,any>}>;decide:(rows:unknown)=>Promise<{selected:'SYNTH-PAPER-002';receipt:Record<string,any>}>;confirm:(expected:{requestId:string;model:string;startedAt:number;signal?:AbortSignal})=>Promise<Record<string,any>>};
export function liveScenarioDependencies(config:ScenarioConfig,signal?:AbortSignal):ScenarioDependencies{
 return {transport:'live',status:async()=>readRuntimeStatus(await discoverRuntimePipe(config.pipe),signal),
  query:async()=>{const credentials=await readLocalZetarisCredentials(config.zetarisEnv);return new ZetarisLocalSyntheticClient({baseUrl:'http://127.0.0.1:3000',...credentials,signal}).query();},
  decide:async rows=>{const token=await readExplicitRuntimeToken(config.meterlessTokenFile);return new MeterlessSyntheticClient({baseUrl:'http://127.0.0.1:8088/v1',token,model:config.model||'local-runtime/llama-3.2-3b-instruct',allowLoopbackHttp:true,signal}).reason(rows);},
  confirm:expected=>confirmRuntimeReceipt(config.meterlessTokenFile,expected)};
}
export function scenarioError(error:unknown){
 return error instanceof SponsorError?{code:error.code,diagnostics:(error as SponsorError&{diagnostics?:unknown}).diagnostics}:{code:'SCENARIO_FAILED'};
}
function check(signal?:AbortSignal){if(signal?.aborted)throw new SponsorError('SCENARIO_CANCELLED');}
export async function runSponsorScenario(options:{config:ScenarioConfig;ownerId:string;runId?:string;signal?:AbortSignal;dependencies?:ScenarioDependencies}){
 const {config,ownerId,signal}=options,runId=options.runId||randomUUID();
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(ownerId)||!/^[a-f0-9-]{36}$/.test(runId))throw new SponsorError('SCENARIO_ID_INVALID');
 const dep=options.dependencies||liveScenarioDependencies(config,signal),startedAt=new Date().toISOString();
 const report:Record<string,any>={schema:'atlas-local-live-v1',sharedService:'sponsor-scenario-v1',runId,startedAt,dataClass:'fixed-synthetic-only',mockUsed:dep.transport==='mock',productionChanged:false,deployed:false};
 let status:Awaited<ReturnType<ScenarioDependencies['status']>>|undefined,rows:string[][]|undefined;
 check(signal);
 try{status=await dep.status();check(signal);report.meterlessStatus={ok:true,...status};}catch(e){report.meterlessStatus={ok:false,...scenarioError(e)};}
 check(signal);
 try{const data=await dep.query();check(signal);if(data.receipt.transport!==dep.transport)throw new SponsorError('SCENARIO_TRANSPORT_MISMATCH');rows=validateSyntheticRows(data.rows);report.zetaris={ok:true,rows,receipt:data.receipt};}catch(e){report.zetaris={ok:false,...scenarioError(e)};}
 check(signal);
 let phase='model-configuration',apiSelectionConfirmed=false;
 if(status&&rows){try{
  const model=config.model||'local-runtime/llama-3.2-3b-instruct';requireReadyLocalModel(status.localModels,model);check(signal);
  phase='model-discovery-or-inference';const inferenceStarted=Date.now(),decision=await dep.decide(rows);check(signal);
  if(decision.selected!=='SYNTH-PAPER-002'||decision.receipt.transport!==dep.transport)throw new SponsorError('SCENARIO_DECISION_INVALID');
  apiSelectionConfirmed=true;phase='runtime-receipt-correlation';
  if(!decision.receipt.serverRequestId)throw new SponsorError('METERLESS_SERVER_REQUEST_ID_MISSING');
  const evidence=await dep.confirm({requestId:decision.receipt.serverRequestId,model,startedAt:inferenceStarted,signal});check(signal);
  if(evidence.serverRequestId!==decision.receipt.serverRequestId||evidence.model!==model||evidence.localOnly!==true||evidence.signatureValidWithEmbeddedKey!==true)throw new SponsorError('SCENARIO_RECEIPT_INVALID');
  report.meterless={ok:true,...decision,runtimeEvidence:evidence,statusTransport:'named-pipe',inferenceTransport:'loopback-http'};
  phase='synthetic-memory';
  const scope={ownerId,namespace:'sponsor-demo' as const,projectId:'synthetic-paper',runId:'synthetic-'+runId};
  const memory=new SyntheticHmem(config.memoryRoot,scope,signal);check(signal);const before=await memory.recall('paper-packaging');check(signal);
  for(const fact of SYNTHETIC_FACTS){check(signal);await memory.remember(fact.id);}
  check(signal);const after=await new SyntheticHmem(config.memoryRoot,{...scope,runId:'synthetic-'+randomUUID()},signal).recall('paper-packaging');check(signal);
  if(after.length!==2||!after.some(x=>x.provenance.refs.includes(decision.selected)))throw new SponsorError('SCENARIO_MEMORY_INVALID');
  report.memory={implementation:'local-hmem-subset',priorRecallCount:before.length,recallCount:after.length,persistedAcrossInstances:true,ledgerEntries:(await memory.audit()).length};check(signal);
  report.overall=dep.transport==='live'?'live-synthetic-services-confirmed':'mock-services-local-memory';
 }catch(e){check(signal);report.failure={phase,...scenarioError(e)};if(!report.meterless)report.meterless={ok:false,apiSelectionConfirmed,phase,...scenarioError(e)};report.overall='failed';}}
 else{report.meterless={ok:false,status:'not-executed',reason:'runtime-status-or-zetaris-prerequisite-failed'};report.overall='blocked';}
 report.finishedAt=new Date().toISOString();return report;
}