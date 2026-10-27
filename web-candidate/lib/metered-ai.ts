import { admin, checked } from "./db";
import { openaiJson } from "./openai";
import { reportedTokens, type UsageReport } from "./token-usage";
import { AppError } from "./security";
export type AiFeature='preview'|'classification'|'brief'|'reply'|'sourcing';
export async function meteredOpenai(ownerId:string,feature:AiFeature,task:string,data:unknown,schema?:Record<string,unknown>) {
 const reserve=Buffer.byteLength(JSON.stringify({task,data,schema}),'utf8')+10000;
 return meteredRequest(ownerId,feature,record=>openaiJson(task,data,record,schema),reserve);
}
export async function meteredRequest<T>(ownerId:string,feature:AiFeature,operation:(record:(report:UsageReport)=>Promise<void>)=>Promise<T>,reserve=200000) {
 const db=admin();
 const reservation=await db.rpc('reserve_atlas_ai',{p_owner:ownerId,p_feature:feature,p_model:process.env.ATLAS_OPENAI_MODEL||'gpt-4.1-mini',p_reserve:reserve});
 if(reservation.error){
  if(reservation.error.message?.includes('AI_QUOTA_EXCEEDED')){
   const summary=await db.rpc('atlas_member_summary',{p_owner:ownerId});
   const member=summary.error?null:summary.data?.[0];
   const remaining=member?Math.max(0,Number(member.monthly_limit)-Number(member.used_tokens)-Number(member.held_tokens)):null;
   throw new AppError(`이번 달 AI 잔여 한도가 부족합니다. ${remaining===null?'':`예약 가능 잔여량 ${remaining.toLocaleString('ko-KR')}토큰 / `}이번 요청 예약량 ${reserve.toLocaleString('ko-KR')}토큰. 완료 후 실제 사용량만 차감합니다.`,429);
  }
  throw new AppError(reservation.error.message?.includes('AI_QUOTA_REVIEW_REQUIRED')?'실제 AI 사용량 확인이 필요해 추가 요청을 보류했습니다. 관리자에게 문의해 주세요.':'AI 이용 권한 또는 사용량 예약을 확인하지 못했습니다.',429);
 }
 const row=reservation.data?{id:reservation.data}:null;
 if(!row)throw new AppError('AI 사용량 기록을 준비하지 못했습니다.',503);
 let received=false;
 try {
  return await operation(async report=>{
   const usage=reportedTokens(report.usage);
   checked(await db.rpc('settle_atlas_ai',{p_owner:ownerId,p_id:row.id,p_report:{...(usage||{}),response_id:report.id||null,...(report.model?{model:report.model}:{})}}));
   received=true;
  });
 } catch(error) {
  if(!received)await db.from('ai_usage_events').update({status:'unknown'}).eq('id',row.id).eq('owner_id',ownerId).eq('status','pending');
  throw error;
 }
}
