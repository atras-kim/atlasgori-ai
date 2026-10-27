import { authenticated,limit } from '@/lib/db';
import { assertOrigin,errorResponse,AppError } from '@/lib/security';
import { desktopStatus,desktopConfig,exportDesktop } from '@/lib/desktop-export';
export const runtime='nodejs';
export async function GET(){try{const {user}=await authenticated();return Response.json(desktopStatus(user.id),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{assertOrigin(req);const {user}=await authenticated();if(!desktopConfig(user.id))throw new AppError('이 PC의 저장 설정이 필요합니다.',403);await limit(user.id,'desktop-export',10);return Response.json(await exportDesktop(user.id),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
