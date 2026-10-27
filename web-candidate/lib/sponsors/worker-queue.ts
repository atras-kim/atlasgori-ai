import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,stat,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {SponsorError} from './zetaris';
import {JobRecord,JobStatus,JobView,OWNER,UUID,parseJobView,parseStart,resultFromReport,safeCode} from './worker-protocol';
type Executor=(job:{id:string;ownerId:string;signal:AbortSignal})=>Promise<Record<string,any>>;
const terminal=new Set<JobStatus>(['succeeded','failed','cancelled','expired','interrupted']);
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class SponsorWorkerQueue{
 private jobs=new Map<string,JobRecord>();private previous='genesis';private serial:Promise<unknown>=Promise.resolve();private running?:Promise<void>;private active?:string;private controller?:AbortController;private deadline?:ReturnType<typeof setTimeout>;private queuedTimers=new Map<string,ReturnType<typeof setTimeout>>();private lock?:Awaited<ReturnType<typeof open>>;private closed=false;private paused=false;private unhealthy=false;
 private constructor(private root:string,private execute:Executor,private settings:{queueLimit:number;jobLimit:number;queueTtlMs:number;runTimeoutMs:number}){}
 static async create(options:{root:string;execute:Executor;queueLimit?:number;jobLimit?:number;queueTtlMs?:number;runTimeoutMs?:number}){
  const q=new SponsorWorkerQueue(resolve(options.root),options.execute,{queueLimit:options.queueLimit??4,jobLimit:options.jobLimit??256,queueTtlMs:options.queueTtlMs??30000,runTimeoutMs:options.runTimeoutMs??270000});
  await mkdir(q.root,{recursive:true,mode:0o700});
  try{q.lock=await open(join(q.root,'worker.lock'),'wx',0o600);}catch{throw new SponsorError('WORKER_LOCKED');}
  try{
   let text='';try{if((await stat(q.file)).size>4194304)throw new SponsorError('WORKER_JOURNAL_TOO_LARGE');text=await readFile(q.file,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(text&&!text.endsWith('\n'))throw new SponsorError('WORKER_JOURNAL_CORRUPT');
   for(const line of text.split('\n').filter(Boolean))q.replay(line);
   const pending=[...q.jobs.values()].filter(j=>!terminal.has(j.status));
   if(pending.some(j=>j.status==='running'))await q.appendPause('WORKER_RESTART_REQUIRES_RUNTIME_CHECK');
   for(const j of pending)await q.save({...j,status:'interrupted',error:'WORKER_RESTARTED',updatedAt:new Date().toISOString()});
   return q;
  }catch{await q.lock.close();await unlink(join(q.root,'worker.lock'));throw new SponsorError('WORKER_JOURNAL_RECOVERY_REQUIRED');}
 }
 private get file(){return join(this.root,'jobs.jsonl');}
 private replay(line:string){
  const frame=JSON.parse(line),{hash,...body}=frame;
  if(body.version!==1||body.previous!==this.previous||digest(body)!==hash||!!body.job===!!body.pause)throw Error('journal');
  if(body.pause){if(safeCode(body.pause)!==body.pause)throw Error('pause');this.paused=true;}
  else{
   const raw=body.job,view=parseJobView(raw);if(!OWNER.test(raw.ownerId)||!UUID.test(raw.requestId)||!Number.isFinite(raw.queuedUntil))throw Error('owner');
   const old=this.jobs.get(view.id);
   if(!old&&view.status!=='queued')throw Error('initial');
   if(old&&(terminal.has(old.status)||old.ownerId!==raw.ownerId||old.requestId!==raw.requestId||!(old.status==='queued'?['running','cancelled','expired','interrupted']:['succeeded','failed','cancelled','expired','interrupted']).includes(view.status)))throw Error('transition');
   if(!old&&[...this.jobs.values()].some(j=>j.ownerId===raw.ownerId&&j.requestId===raw.requestId))throw Error('idempotency');
   this.jobs.set(view.id,{...view,ownerId:raw.ownerId,requestId:raw.requestId,queuedUntil:raw.queuedUntil});
  }
  this.previous=hash;
 }
 private async append(value:{job?:JobRecord;pause?:string}){
  const body={version:1,previous:this.previous,...value},hash=digest(body),line=JSON.stringify({...body,hash})+'\n';
  try{let size=0;try{size=(await stat(this.file)).size;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}if(size+Buffer.byteLength(line)>4194304)throw Error();const f=await open(this.file,'a',0o600);try{await f.writeFile(line);await f.sync();}finally{await f.close();}this.previous=hash;}catch{this.unhealthy=true;this.paused=true;throw new SponsorError('WORKER_STORAGE_FAILURE');}
 }
 private async save(job:JobRecord){await this.append({job});this.jobs.set(job.id,job);if(terminal.has(job.status)){clearTimeout(this.queuedTimers.get(job.id));this.queuedTimers.delete(job.id);}}
 private async appendPause(reason:string){await this.append({pause:reason});this.paused=true;}
 private mutate<T>(fn:()=>Promise<T>):Promise<T>{const result=this.serial.catch(()=>undefined).then(fn);this.serial=result.catch(()=>undefined);return result;}
 private usable(){if(this.closed||this.unhealthy)throw new SponsorError('WORKER_UNAVAILABLE',503);}
 async submit(input:unknown):Promise<JobView>{
  const value=parseStart(input);
  const view=await this.mutate(async()=>{
   this.usable();const old=[...this.jobs.values()].find(j=>j.ownerId===value.ownerId&&j.requestId===value.requestId);if(old)return parseJobView(old);
   if(this.paused)throw new SponsorError('WORKER_PAUSED',503);
   if(this.jobs.size>=this.settings.jobLimit)throw new SponsorError('WORKER_RETENTION_LIMIT',503);
   if([...this.jobs.values()].filter(j=>j.status==='queued').length>=this.settings.queueLimit)throw new SponsorError('WORKER_QUEUE_FULL',429);
   const now=Date.now(),job:JobRecord={...value,id:randomUUID(),status:'queued',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),queuedUntil:now+this.settings.queueTtlMs};await this.save(job);
   this.queuedTimers.set(job.id,setTimeout(()=>{void this.mutate(async()=>{const current=this.jobs.get(job.id);if(current?.status==='queued')await this.save({...current,status:'expired',error:'WORKER_QUEUE_EXPIRED',updatedAt:new Date().toISOString()});}).catch(()=>undefined);},this.settings.queueTtlMs));
   return parseJobView(job);
  });this.kick();return view;
 }
 async get(id:string,ownerId:string){return this.mutate(async()=>{this.usable();const j=this.jobs.get(id);if(!j||j.ownerId!==ownerId)throw new SponsorError('WORKER_JOB_NOT_FOUND',404);if(j.status==='queued'&&j.queuedUntil<=Date.now()){const next={...j,status:'expired' as const,error:'WORKER_QUEUE_EXPIRED',updatedAt:new Date().toISOString()};await this.save(next);return parseJobView(next);}return parseJobView(j);});}
 async cancel(id:string,ownerId:string){return this.mutate(async()=>{this.usable();const j=this.jobs.get(id);if(!j||j.ownerId!==ownerId)throw new SponsorError('WORKER_JOB_NOT_FOUND',404);if(terminal.has(j.status))return parseJobView(j);if(j.status==='running'){this.controller?.abort();await this.pauseAndCancelQueued('WORKER_CANCELLED_RUNTIME_CHECK_REQUIRED');}const next={...j,status:'cancelled' as const,error:'WORKER_CANCELLED',updatedAt:new Date().toISOString()};await this.save(next);return parseJobView(next);});}
 private async pauseAndCancelQueued(reason:string){if(!this.paused)await this.appendPause(reason);for(const j of this.jobs.values())if(j.status==='queued')await this.save({...j,status:'cancelled',error:'WORKER_PAUSED',updatedAt:new Date().toISOString()});}
 private kick(){if(this.running||this.closed||this.paused||this.unhealthy||![...this.jobs.values()].some(j=>j.status==='queued'))return;this.running=this.pump().catch(()=>{this.unhealthy=true;this.paused=true;}).finally(()=>{this.running=undefined;this.kick();});}
 private async pump(){
  const job=await this.mutate(async()=>{
   if(this.closed||this.paused)return undefined;
   const j=[...this.jobs.values()].find(j=>j.status==='queued');if(!j)return undefined;
   if(j.queuedUntil<=Date.now()){await this.save({...j,status:'expired',error:'WORKER_QUEUE_EXPIRED',updatedAt:new Date().toISOString()});return undefined;}
   clearTimeout(this.queuedTimers.get(j.id));this.queuedTimers.delete(j.id);const running={...j,status:'running' as const,updatedAt:new Date().toISOString()};await this.save(running);this.active=j.id;this.controller=new AbortController();return running;
  });if(!job)return;
  const signal=this.controller!.signal;
  this.deadline=setTimeout(()=>{void this.mutate(async()=>{const current=this.jobs.get(job.id);if(current?.status==='running'){this.controller?.abort();await this.pauseAndCancelQueued('WORKER_DEADLINE_RUNTIME_CHECK_REQUIRED');await this.save({...current,status:'expired',error:'WORKER_RUN_EXPIRED',updatedAt:new Date().toISOString()});}}).catch(()=>undefined);},this.settings.runTimeoutMs);
  let result:JobView['result'],error:string|undefined;
  try{const report=await this.execute({id:job.id,ownerId:job.ownerId,signal});if(signal.aborted)throw new SponsorError('WORKER_CANCELLED');if(!['live-synthetic-services-confirmed','mock-services-local-memory'].includes(report.overall))throw new SponsorError(safeCode(report.failure?.code||report.meterless?.code||report.zetaris?.code));result=resultFromReport(report);if(result.runId!==job.id)throw new SponsorError('WORKER_RESULT_INVALID');}
  catch(e){error=e instanceof SponsorError?safeCode(e.code):'WORKER_JOB_FAILED';}
  clearTimeout(this.deadline);
  await this.mutate(async()=>{const current=this.jobs.get(job.id);if(current?.status==='running')await this.save({...current,status:result?'succeeded':'failed',result,error,updatedAt:new Date().toISOString()});this.active=undefined;this.controller=undefined;});
 }
 health(){return {ok:!this.closed&&!this.paused&&!this.unhealthy,paused:this.paused,queued:[...this.jobs.values()].filter(j=>j.status==='queued').length,running:this.active?1:0};}
 async close(){
  this.closed=true;
  await this.mutate(async()=>{if(this.active){this.controller?.abort();await this.pauseAndCancelQueued('WORKER_SHUTDOWN_RUNTIME_CHECK_REQUIRED');const j=this.jobs.get(this.active);if(j?.status==='running')await this.save({...j,status:'cancelled',error:'WORKER_SHUTDOWN',updatedAt:new Date().toISOString()});}else for(const j of this.jobs.values())if(j.status==='queued')await this.save({...j,status:'cancelled',error:'WORKER_SHUTDOWN',updatedAt:new Date().toISOString()});});
  let timer:ReturnType<typeof setTimeout>|undefined;try{if(this.running)await Promise.race([this.running,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new SponsorError('WORKER_SHUTDOWN_PENDING')),6000);})]);}finally{clearTimeout(timer);}
  for(const t of this.queuedTimers.values())clearTimeout(t);this.queuedTimers.clear();await this.serial;await this.lock?.close();this.lock=undefined;await unlink(join(this.root,'worker.lock'));
 }
}