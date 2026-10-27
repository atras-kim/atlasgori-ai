import { z } from 'zod';
import { admin,authenticated,checked,limit } from '@/lib/db';
import { readWork } from '@/lib/saved-work';
import { AppError,assertOrigin,errorResponse,jsonBody } from '@/lib/security';
import { exportDesktop } from '@/lib/desktop-export';
export const runtime='nodejs';
export async function POST(req:Request) {
 try {
  assertOrigin(req);const {user}=await authenticated();await limit(user.id,'organize-analysis',20);
  const input=z.object({savedId:z.uuid(),messageId:z.uuid(),name:z.string().trim().min(1).max(120),confirmed:z.literal(true)}).parse(await jsonBody(req));
  const [entry]=await readWork(user.id,input.savedId,'analysis');
  const item=entry.value.items.find((i:{id:string})=>i.id===input.messageId);
  const source=entry.value.messages.find((m:{id:string})=>m.id===input.messageId);
  if(!item||!source)throw new AppError('저장된 분석의 원메일을 찾을 수 없습니다.',404);
  const result=checked(await admin().rpc('organize_saved_message',{p_user:user.id,p_message:input.messageId,p_name:input.name,p_product:item.product,p_company:item.company,p_subject:source.subject,p_sender:source.sender}));
  return Response.json({...result.data,desktopExport:await exportDesktop(user.id)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}
