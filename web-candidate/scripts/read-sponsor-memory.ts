import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {SyntheticHmem} from '../lib/sponsors/meterless-memory';
import {OWNER} from '../lib/sponsors/worker-protocol';
async function main(){const [root,ownerId]=process.argv.slice(2);if(!root||!OWNER.test(ownerId||''))throw Error();const hits=await new SyntheticHmem(resolve(root),{ownerId,namespace:'sponsor-demo',projectId:'synthetic-paper',runId:'synthetic-'+randomUUID()}).recall('paper-packaging');console.log(JSON.stringify({implementation:'local-hmem-subset',recallCount:hits.length,fixedSyntheticIdsOnly:hits.every(x=>['paper-packaging-001','paper-packaging-002'].includes(x.id))}));}
main().catch(()=>{console.error('MEMORY_PROCESS_READ_FAILED');process.exitCode=1;});