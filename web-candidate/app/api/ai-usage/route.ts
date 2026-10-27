import { authenticated, checked, admin } from "@/lib/db";
import { errorResponse } from "@/lib/security";
export const dynamic="force-dynamic";
export async function GET(){try{
 const {client,user}=await authenticated();
 const result=checked(await client.rpc('my_ai_usage'));
 const membership=checked(await admin().rpc('atlas_member_summary',{p_owner:user.id})).data?.[0];
 return Response.json({...result.data,membership},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
