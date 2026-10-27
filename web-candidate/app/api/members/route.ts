import { z } from 'zod';
import { createHash,randomBytes } from 'node:crypto';
import { requireOperator } from '@/lib/membership';
import { admin,checked } from '@/lib/db';
import { assertOrigin,jsonBody,errorResponse,address } from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(){try{
 await requireOperator();const db=admin();
 const members=checked(await db.rpc('atlas_member_summary')).data;
 const audit=checked(await db.from('member_audit').select('*').order('created_at',{ascending:false}).limit(100)).data;
 const invites=checked(await db.from('member_invites').select('id,email,created_at,expires_at,consumed_at,revoked').order('created_at',{ascending:false}).limit(100)).data;
 return Response.json({members,audit,invites},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 assertOrigin(request);const user=await requireOperator(),body=await jsonBody(request,10000),db=admin();
 if(body.action==='invite'){
  const email=address.parse(body.email).toLowerCase(),token=randomBytes(32).toString('base64url');
  const expires=new Date(Date.now()+7*86400000).toISOString();
  checked(await db.from('member_invites').insert({email,token_hash:createHash('sha256').update(token).digest('hex'),created_by:user.id,expires_at:expires}));
  checked(await db.from('member_audit').insert({actor_id:user.id,action:'invitation_created',details:{email,expires_at:expires}}));
  return Response.json({token,email,expires_at:expires},{headers:{'Cache-Control':'no-store'}});
 }
 const input=z.object({id:z.uuid(),state:z.enum(['active','suspended']),monthlyLimit:z.number().int().min(0).max(1000000000)}).parse(body);
 checked(await db.rpc('manage_atlas_member',{p_actor:user.id,p_member:input.id,p_state:input.state,p_limit:input.monthlyLimit}));
 return Response.json({ok:true});
}catch(e){return errorResponse(e);}}
