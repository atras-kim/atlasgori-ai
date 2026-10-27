import { admin, checked, authenticated } from './db';
import { AppError } from './security';
export async function requireOperator(){
 const {user}=await authenticated();
 const member=checked(await admin().from('app_members').select('is_operator,state').eq('id',user.id).single()).data;
 if(!member?.is_operator||member.state!=='active')throw new AppError('운영자만 접근할 수 있습니다.',403);
 return user;
}
