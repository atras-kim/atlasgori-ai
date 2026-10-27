import JSZip from 'jszip';
import {z} from 'zod';
import {authenticated,checked,limit} from '@/lib/db';
import {AppError,errorResponse} from '@/lib/security';
import {safeName,messageCompanyFolder,attachmentFolder,exportFilename} from '@/lib/desktop-files';
export const runtime='nodejs';
export async function GET(req:Request){try{
 const {client,user}=await authenticated();await limit(user.id,'project-export',10);
 const id=z.uuid().parse(new URL(req.url).searchParams.get('project'));
 const project=checked(await client.from('projects').select('id,name').eq('id',id).eq('owner_id',user.id).single()).data;
 if(!project)throw new AppError('본인 프로젝트만 저장할 수 있습니다.',403);
 const zip=new JSZip();const base=`Atlasgori/${safeName(project.name,28)}--${id}`;zip.folder(base);let bytes=0;
 for(let offset=0;;offset+=50){
  const messages=checked(await client.from('messages').select('id,subject,sender,body,received_at,company,attachments(id,name,type,content_base64,document_kind,document_manual)').eq('owner_id',user.id).eq('project_id',id).order('id').range(offset,offset+49)).data||[];
  for(const m of messages){
   const folder=`${base}/${messageCompanyFolder(m.company,m.sender)}`;
   const body=Buffer.from(`제목: ${m.subject}\r\n발신: ${m.sender}\r\n수신일: ${m.received_at}\r\n\r\n${m.body||''}`);
   bytes+=body.length;zip.file(`${folder}/메일 내용/${exportFilename(`${m.subject}.txt`,m.id,body)}`,body);
   for(const a of m.attachments||[]){const data=Buffer.from(a.content_base64||'','base64');bytes+=data.length;if(bytes>100*1024*1024)throw new AppError('자료가 100MB를 초과합니다. 프로젝트를 나누어 저장해 주세요.',413);zip.file(`${folder}/${attachmentFolder(a)}/${exportFilename(a.name,a.id,data)}`,data);}
   if(bytes>100*1024*1024)throw new AppError('자료가 100MB를 초과합니다.',413);
  }if(messages.length<50)break;
 }
 const data=await zip.generateAsync({type:'uint8array'});
 return new Response(new Uint8Array(data).buffer,{headers:{'Content-Type':'application/zip','Content-Disposition':"attachment; filename=Atlasgori-project.zip",'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return errorResponse(e);}}

