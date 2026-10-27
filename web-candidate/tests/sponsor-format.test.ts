import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticSelectionJson,MeterlessSyntheticClient} from '../lib/sponsors/meterless-runtime';
import {EXPECTED_ROWS} from '../lib/sponsors/zetaris';
test('observed local supplier_id shape normalizes without accepting additional data',async()=>{
 const content='```json\n{"supplier_id":"SYNTH-PAPER-002"}\n```';
 const normalized=syntheticSelectionJson(content);assert.equal(normalized.json,'{"selected":"SYNTH-PAPER-002"}');assert.equal(normalized.format,'json-fence-supplier-id');
 const config={baseUrl:'http://127.0.0.1:8088/v1',model:'local-runtime/llama-3.2-3b-instruct',token:'synthetic-token',allowLoopbackHttp:true};
 const result=await new MeterlessSyntheticClient(config,{fetch:async url=>Response.json(String(url).endsWith('/models')?{data:[{id:config.model}]}:{id:'chatcmpl-fixture',meterless:{privacy:{path:'local-only'}},choices:[{message:{content},finish_reason:'stop'}]})}).reason(EXPECTED_ROWS);
 assert.equal(result.selected,'SYNTH-PAPER-002');
 for(const invalid of ['{"supplier_id":"SYNTH-PAPER-002","selected":"SYNTH-PAPER-001"}','{"supplier_id":"SYNTH-PAPER-001","supplier_id":"SYNTH-PAPER-002"}','[{"supplier_id":"SYNTH-PAPER-002"}]',content+'\nExplanation','x'.repeat(4097)])assert.equal(syntheticSelectionJson(invalid).json,undefined);
});
