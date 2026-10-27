import { authenticated, limit } from '@/lib/db';
import { assertOrigin,jsonBody,errorResponse } from '@/lib/security';
import { readWork,saveWork } from '@/lib/saved-work';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request) {
  try { const {user}=await authenticated();const url=new URL(req.url);
    return Response.json(await readWork(user.id,url.searchParams.get('id')||undefined,url.searchParams.get('kind')||undefined),{headers});
  } catch(error) {return errorResponse(error);}
}
export async function POST(req:Request) {
  try {assertOrigin(req);const {user}=await authenticated();await limit(user.id,'save-work',30);
    return Response.json(await saveWork(user.id,await jsonBody(req)),{headers});
  } catch(error) {return errorResponse(error);}
}
