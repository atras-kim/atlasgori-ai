import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {runSponsorScenario} from '../lib/sponsors/scenario-service';
import {syntheticFixtureDependencies} from '../lib/sponsors/scenario-fixture';
async function main(){
 if(process.argv.includes('--live'))throw Error('Use verify-sponsors-local.ts with explicit credential paths for live execution.');
 const config={zetarisEnv:'unused-fixture',meterlessTokenFile:'unused-fixture',memoryRoot:resolve('.runtime/sponsor-cli-synthetic',randomUUID())};
 const first=await runSponsorScenario({config,ownerId:'synthetic-cli',dependencies:syntheticFixtureDependencies()}),second=await runSponsorScenario({config,ownerId:'synthetic-cli',dependencies:syntheticFixtureDependencies()});
 console.log(JSON.stringify({notice:'MOCK service responses; real local H-MEM subset. Shared service with web worker. Not live integration evidence.',first,second},null,2));if(first.overall!=='mock-services-local-memory'||second.overall!=='mock-services-local-memory')process.exitCode=1;
}
main().catch(()=>{console.error('SYNTHETIC_FIXTURE_FAILED');process.exitCode=1;});