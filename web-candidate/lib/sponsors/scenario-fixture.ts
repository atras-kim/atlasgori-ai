import {randomUUID} from 'node:crypto';
import {EXPECTED_ROWS} from './zetaris';
import type {ScenarioDependencies} from './scenario-service';
export function syntheticFixtureDependencies():ScenarioDependencies{
 const model='local-runtime/llama-3.2-3b-instruct';
 return {transport:'mock',status:async()=>({version:'fixture',localModels:[model]}),query:async()=>({rows:EXPECTED_ROWS,receipt:{transport:'mock',rowCount:2}}),decide:async()=>({selected:'SYNTH-PAPER-002',receipt:{transport:'mock',serverRequestId:'fixture-'+randomUUID(),model,localOnly:true,responseFormat:'json'}}),confirm:async expected=>({serverRequestId:expected.requestId,model,localOnly:true,signatureValidWithEmbeddedKey:true,verification:'MOCK_SIGNATURE_FIXTURE'})};
}