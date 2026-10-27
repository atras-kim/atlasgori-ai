import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db,admin } from '@/lib/db';
import { address,assertOrigin,jsonBody,errorResponse,AppError,appOrigin } from '@/lib/security';
export async function POST(request:Request){try{
 assertOrigin(request);
 const input=z.object({email:address,password:z.string().min(12).max(128),invite:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).parse(await jsonBody(request,5000));
 const hash=createHash('sha256').update(input.invite).digest('hex');
 const invite=await admin().from('member_invites').select('id').eq('token_hash',hash).eq('email',input.email.toLowerCase()).eq('revoked',false).is('consumed_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(invite.error||!invite.data)throw new AppError('초대코드와 이메일을 확인해 주세요. 코드는 7일 동안 한 번 사용할 수 있습니다.');
 const client=await db();
 const {data:signup,error}=await client.auth.signUp({email:input.email,password:input.password,options:{data:{atlas_invite_hash:hash},emailRedirectTo:`${appOrigin()}/api/auth/confirm`}});
 if(error)throw new AppError('가입을 완료하지 못했습니다. 기존 가입 여부 또는 이메일 인증 설정을 확인해 주세요.');
 if(signup.user){
  const claimed=await admin().from('member_invites').select('id').eq('id',invite.data.id).eq('consumed_by',signup.user.id).maybeSingle();
  if(claimed.data){
   const grant=await admin().from('app_members').update({monthly_limit:100000}).eq('id',signup.user.id).eq('monthly_limit',0).eq('is_operator',false);
   if(grant.error) throw new AppError('가입은 접수됐지만 기본 AI 한도 설정에 실패했습니다. 운영자에게 문의해 주세요.');
  }
 }
 return Response.json({ok:true,message:'가입 요청을 접수했습니다. 인증 메일을 확인한 뒤 로그인해 주세요.'});
}catch(e){return errorResponse(e);}}
