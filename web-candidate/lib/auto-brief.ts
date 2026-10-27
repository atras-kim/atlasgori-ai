import {admin,checked,ownedAccount} from './db';
import {generateBrief} from './ai';

const running=new Set<string>();
const retryAfter=new Map<string,number>();
/** One dirty private project per sync; unchanged evidence never triggers another charge. */
export async function refreshAutomaticBrief(owner:string,accountId:string,previous:Map<string,unknown>){
 // Historical cross-account automatic analysis is currently opted in by the operator only.
 if(owner!==process.env.ATLAS_DESKTOP_OWNER)return {enabled:false};
 if(running.has(owner))return {pending:true};
 running.add(owner);
 try{
  const account=await ownedAccount(accountId,owner);
  if(!account.ai_enabled||!account.automation_enabled)return {enabled:false};
  const ids=new Set<string>();
  for(let offset=0;;offset+=500){
   const page=checked(await admin().from('messages').select('project_id').eq('owner_id',owner).eq('account_id',accountId).not('project_id','is',null).order('id').range(offset,offset+499)).data||[];
   page.forEach(m=>ids.add(m.project_id));if(page.length<500)break;
  }
  const projects=checked(await admin().from('projects').select('id,brief,evidence_version').eq('owner_id',owner).eq('visibility','Private').order('updated_at',{ascending:true})).data||[];
  const dirty=projects.filter(p=>ids.has(p.id)&&p.brief?.source_version!==p.evidence_version);
  const next=dirty.find(p=>(retryAfter.get(`${owner}:${p.id}`)||0)<Date.now());
  if(!next)return {pending:dirty.length>0};
  const key=`${owner}:${next.id}`;
  retryAfter.set(key,Date.now()+10*60*1000);
  await generateBrief(owner,next.id,previous.get(next.id),accountId);
  retryAfter.delete(key);
  return {updated:next.id,pending:dirty.length>1};
 }finally{running.delete(owner);}
}
