import {z} from 'zod';
import {authenticated,limit} from '@/lib/db';
import {AppError,assertOrigin,errorResponse,jsonBody} from '@/lib/security';
import {analyzeQuote,editQuote,listQuotes} from '@/lib/quotes';
export const runtime='nodejs';
export const maxDuration=90;
const running=new Set<string>();
export async function GET(req:Request){try{const {user}=await authenticated();const project=z.uuid().parse(new URL(req.url).searchParams.get('project'));return Response.json({quotes:await listQuotes(user.id,project)},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{assertOrigin(req);const {user}=await authenticated();const body=await jsonBody(req,200000);let result;
 if(body.action==='analyze'||body.action==='compare-project'){const p=z.object({project:z.uuid(),attachmentId:z.uuid(),consent:z.literal(true)}).parse(body);const key=`${user.id}:${p.attachmentId}`;if(running.has(key))throw new AppError('이 파일을 이미 분석하고 있습니다.',409);running.add(key);try{await limit(user.id,'quote-ai',body.action==='compare-project'?60:3);result=await analyzeQuote(user.id,p.project,p.attachmentId);}finally{running.delete(key);}}
 else if(body.action==='save'){await limit(user.id,'quote-save',30);result=await editQuote(user.id,body);}
 else throw new AppError('지원하지 않는 요청입니다.');
 return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return errorResponse(e);}}
