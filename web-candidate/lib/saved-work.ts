import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { admin, checked, ownedAccount } from './db';
import { seal, unseal, draftSchema, AppError } from './security';
import { previewResult } from './ai-preview';
export const savedDraftSchema = draftSchema.extend({to:z.string().max(13000),subject:z.string().max(998).refine(s=>!/[\r\n\0]/.test(s))});
export const saveRequest = z.object({kind:z.enum(['draft','analysis']),id:z.uuid().optional(),version:z.number().int().positive().optional(),value:z.unknown()})
  .refine(v=>Boolean(v.id)===Boolean(v.version),'저장 버전이 필요합니다.');
const context=(owner:string,id:string,kind:string)=>`saved-work:${owner}:${id}:${kind}`;
export async function saveWork(owner:string,input:unknown) {
  const request=saveRequest.parse(input);
  let value:unknown, title='';
  if(request.kind==='draft') {
    const draft=savedDraftSchema.parse(request.value);
    if(draft.attachments.reduce((sum,a)=>sum+Buffer.from(a.content,'base64').length,0)>10*1024*1024) throw new AppError('첨부파일 합계는 10 MB 이하여야 합니다.');
    await ownedAccount(draft.accountId,owner); value=draft; title=draft.subject || '(제목 없는 초안)';
  } else {
    const result=previewResult.parse(request.value), ids=result.items.map(item=>item.id);
    if(new Set(ids).size!==ids.length) throw new AppError('메일 분석 근거가 중복되었습니다.');
    const rows=checked(await admin().from('messages').select('id,account_id,owner_id,subject,sender').eq('owner_id',owner).in('id',ids)).data || [];
    if(rows.length!==ids.length) throw new AppError('분석한 원메일에 접근할 수 없습니다.',403);
    value={...result,messages:rows};
    title=rows.map(row=>row.subject).join(' / ');
  }
  const id=request.id || randomUUID(), ciphertext=seal(value,context(owner,id,request.kind));
  const title_ciphertext=seal(title,context(owner,id,`${request.kind}:title`));
  const db=admin(), now=new Date().toISOString();
  if(request.id) {
    const changed=checked(await db.from('saved_work').update({ciphertext,title_ciphertext,version:request.version!+1,updated_at:now}).eq('id',id).eq('owner_id',owner).eq('kind',request.kind).eq('version',request.version!).select('id')).data;
    if(!changed?.length) throw new AppError('다른 화면에서 수정된 내용이 있습니다. 저장본을 다시 열어 주세요. 현재 내용은 유지됩니다.',409);
  } else checked(await db.from('saved_work').insert({id,owner_id:owner,kind:request.kind,ciphertext,title_ciphertext}));
  return {id,version:(request.version||0)+1,updatedAt:now};
}
export async function readWork(owner:string,id?:string,kind?:string) {
  let query=admin().from('saved_work').select(id?'*':'id,kind,version,updated_at,title_ciphertext').eq('owner_id',owner);
  if(id)query=query.eq('id',z.uuid().parse(id));
  if(kind)query=query.eq('kind',z.enum(['analysis','draft']).parse(kind));
  const rows=checked(await query.order('updated_at',{ascending:false}).limit(id?1:50)).data || [];
  if(id && !rows.length)throw new AppError('저장한 내용을 찾을 수 없습니다.',404);
  return rows.map((row:any)=>{
    const value=id?unseal<any>(row.ciphertext,context(owner,row.id,row.kind)):undefined;
    return {id:row.id,kind:row.kind,version:row.version,updatedAt:row.updated_at,
      title:unseal<string>(row.title_ciphertext,context(owner,row.id,`${row.kind}:title`)),
      ...(id?{value}:{})};
  });
}
