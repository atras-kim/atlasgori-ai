import { db } from '@/lib/db';
import { appOrigin } from '@/lib/security';
export async function GET(request:Request){
 const code=new URL(request.url).searchParams.get('code');
 if(code){const client=await db();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return Response.redirect(`${appOrigin()}/workspace`);}
 return Response.redirect(`${appOrigin()}/?confirmation=failed`);
}
