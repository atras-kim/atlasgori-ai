import {resolve} from 'node:path';
import {runSponsorScenario} from '../lib/sponsors/scenario-service';
import {SponsorWorkerQueue} from '../lib/sponsors/worker-queue';
import {checkWorkerToken,createWorkerServer,listenPrivateWorker,closePrivateWorker} from '../lib/sponsors/worker-server';
import {SponsorError} from '../lib/sponsors/zetaris';
const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
async function main(){
 if(!args.includes('--live'))throw new SponsorError('EXPLICIT_LIVE_FLAG_REQUIRED');
 const token=process.env.ATLAS_WORKER_TOKEN||'';checkWorkerToken(token);
 const zetarisEnv=option('--zetaris-env'),meterlessTokenFile=option('--meterless-token-file');if(!zetarisEnv||!meterlessTokenFile)throw new SponsorError('EXPLICIT_CREDENTIAL_FILES_REQUIRED');
 const root=resolve(option('--data-dir')||'.runtime/private-sponsor-worker'),config={zetarisEnv,meterlessTokenFile,pipe:option('--pipe'),model:option('--model'),memoryRoot:resolve(root,'memory')};
 const queue=await SponsorWorkerQueue.create({root:resolve(root,'queue'),execute:job=>runSponsorScenario({config,ownerId:job.ownerId,runId:job.id,signal:job.signal})});
 const server=createWorkerServer(queue,token);let closing=false;
 const shutdown=async()=>{if(closing)return;closing=true;try{await queue.close();await closePrivateWorker(server);}catch{process.exitCode=1;server.close();console.error('WORKER_SHUTDOWN_REQUIRES_REVIEW');}};
 try{const url=await listenPrivateWorker(server,Number(option('--port')||4318));console.log(JSON.stringify({ready:true,url,scope:'development-loopback-only'}));process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());}catch(e){await queue.close();throw e;}
}
main().catch(e=>{console.error(e instanceof SponsorError?e.code:'WORKER_START_FAILED');process.exitCode=1;});