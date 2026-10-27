import {randomUUID} from 'node:crypto';
import {SyntheticHmem,SYNTHETIC_FACTS,type HmemScope} from './meterless-memory';
import {ZetarisSyntheticClient} from './zetaris';
import {MeterlessSyntheticClient} from './meterless-runtime';
export async function runSyntheticIntegration(options:{zetaris:ZetarisSyntheticClient;meterless:MeterlessSyntheticClient;memoryRoot:string;ownerId:string}){
 const runId='synthetic-'+randomUUID();
 const scope:HmemScope={ownerId:options.ownerId,namespace:'sponsor-demo',projectId:'synthetic-paper',runId};
 const memory=new SyntheticHmem(options.memoryRoot,scope);
 const before=await memory.recall('paper-packaging');
 const data=await options.zetaris.query();
 const decision=await options.meterless.reason(data.rows);
 for(const fact of SYNTHETIC_FACTS)await memory.remember(fact.id);
 const after=await new SyntheticHmem(options.memoryRoot,{...scope,runId:'synthetic-'+randomUUID()}).recall('paper-packaging');
 if(!after.some(m=>m.provenance.refs.includes(decision.selected)))throw Error('Synthetic memory recall failed');
 return {scenario:'paper-packaging',dataClass:'synthetic-only',runId,
  verification:options.zetaris.transport==='live'&&options.meterless.transport==='live'?'live-synthetic-services':'mock-services-local-memory',
  zetaris:data.receipt,meterless:decision.receipt,
  memory:{implementation:'Meterless H-MEM contract-based subset',priorRecallCount:before.length,recallCount:after.length,persistedAcrossInstances:true,
   matches:after.map(m=>({id:m.id,source:m.source,score:m.score,retrievalReason:m.retrievalReason,lineage:m.lineage})),ledgerEntries:(await memory.audit()).length},
  recommendation:{supplierId:decision.selected,name:'Synthetic Blue Box',reason:'Recycled paper packaging; synthetic test only.'}};
}
