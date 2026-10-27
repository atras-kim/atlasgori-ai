import {z} from 'zod';
import {authenticated,checked} from '@/lib/db';
import {errorResponse} from '@/lib/security';
export async function GET(req:Request){try{
 const {client}=await authenticated();const params=new URL(req.url).searchParams;
 const id=z.uuid().parse(params.get('project')),offset=z.coerce.number().int().min(0).parse(params.get('offset')||0);
 const result=checked(await client.from('messages').select('id,subject,sender,body,received_at',{count:'exact'}).eq('project_id',id).order('received_at',{ascending:false}).order('id').range(offset,offset+49));
 return Response.json({messages:result.data,total:result.count},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return errorResponse(e);}}
