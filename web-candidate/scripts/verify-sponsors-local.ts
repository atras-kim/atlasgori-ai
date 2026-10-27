import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {runSponsorScenario} from '../lib/sponsors/scenario-service';
import {SponsorError} from '../lib/sponsors/zetaris';
const args=process.argv.slice(2);const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
async function main(){
 if(!args.includes('--live'))throw new SponsorError('EXPLICIT_LIVE_FLAG_REQUIRED');
 const zetarisEnv=option('--zetaris-env'),meterlessTokenFile=option('--meterless-token-file');if(!zetarisEnv||!meterlessTokenFile)throw new SponsorError('EXPLICIT_CREDENTIAL_FILES_REQUIRED');
 const report=await runSponsorScenario({config:{zetarisEnv,meterlessTokenFile,model:option('--model'),pipe:option('--pipe'),memoryRoot:resolve(option('--memory-root')||'.runtime/sponsor-common-memory')},ownerId:'synthetic-cli'});
 const dir=resolve('.runtime/sponsor-live-receipts');await mkdir(dir,{recursive:true});const path=join(dir,`local-live-${report.runId}.json`),text=JSON.stringify(report,null,2);await writeFile(path,text,{encoding:'utf8',flag:'wx',mode:0o600});if(await readFile(path,'utf8')!==text)throw new SponsorError('REPORT_READBACK_FAILED');console.log(JSON.stringify({...report,reportFile:path},null,2));if(report.overall!=='live-synthetic-services-confirmed')process.exitCode=1;
}
main().catch(e=>{console.error(e instanceof SponsorError?e.code:'LOCAL_LIVE_VERIFICATION_FAILED');process.exitCode=1;});