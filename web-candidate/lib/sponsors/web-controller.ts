import {createHash,randomUUID} from 'node:crypto';
import {AppError,jsonBody} from '../security';
import {SponsorError} from './zetaris';
import {UUID} from './worker-protocol';
import {SponsorWorkerClient} from './worker-client';
export function createSponsorHandlers(deps:{enabled:()=>boolean;authorize:()=>Promise<{id:string}>;origin:(req:Request)=>void;rateLimit:(id:string,bucket:string,max:number)=>Promise<void>;client:()=>SponsorWorkerClient}){
 const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
 async function handle(req:Request,action:'start'|'get'|'cancel'){
  try{
   if(!deps.enabled())return json({error:'SPONSOR_DEMO_DISABLED'},404);
   if(action!=='get'||req.headers.has('origin'))deps.origin(req);else if(req.headers.get('sec-fetch-site')==='cross-site')throw new AppError('Origin rejected',403);
   const user=await deps.authorize();
   await deps.rateLimit(user.id,action==='start'?'sponsor-demo':'sponsor-job-status',action==='start'?2:300);
   const ownerId='synthetic-'+createHash('sha256').update(user.id).digest('hex');
   if(action==='start'){
    const body=await jsonBody(req,512) as Record<string,unknown>;
    if(!body||typeof body!=='object'||Array.isArray(body)||body.scenario!=='paper-packaging'||Object.keys(body).some(k=>!['scenario','requestId'].includes(k))||(body.requestId!==undefined&&(typeof body.requestId!=='string'||!UUID.test(body.requestId))))return json({error:'SYNTHETIC_SCENARIO_REQUIRED'},400);
    return json(await deps.client().start(ownerId,typeof body.requestId==='string'?body.requestId:randomUUID()),202);
   }
   const url=new URL(req.url),id=url.searchParams.get('id');
   if(!id||!UUID.test(id)||[...url.searchParams.keys()].some(k=>k!=='id'))return json({error:'SPONSOR_JOB_ID_INVALID'},400);
   return json(action==='get'?await deps.client().get(ownerId,id):await deps.client().cancel(ownerId,id));
  }catch(e){if(e instanceof AppError)return json({error:'SPONSOR_REQUEST_REJECTED'},e.status);if(e instanceof SponsorError)return json({error:e.code},e.status);return json({error:'SPONSOR_DEMO_FAILED'},503);}
 }
 return {POST:(req:Request)=>handle(req,'start'),GET:(req:Request)=>handle(req,'get'),DELETE:(req:Request)=>handle(req,'cancel')};
}