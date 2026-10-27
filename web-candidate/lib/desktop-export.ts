import path from 'node:path';
import { admin,checked } from './db';
import { attachmentFolder,exportFilename,safeName,writeOnce,messageCompanyFolder } from './desktop-files';

export function desktopConfig(owner:string) {
  const root=process.env.ATLAS_DESKTOP_ROOT;
  const url=process.env.ATLAS_APP_URL||'';
  if(owner!==process.env.ATLAS_DESKTOP_OWNER || !root || !path.isAbsolute(root) || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url))return null;
  return {root};
}
export type ExportStatus={enabled:boolean;saved:number;skipped:number;conflicts:number;failed:number;updatedAt?:string;busy?:boolean};
const running=new Map<string,Promise<ExportStatus>>();
const statuses=new Map<string,ExportStatus>();
export function desktopStatus(owner:string):ExportStatus {return {...(statuses.get(owner)||{enabled:!!desktopConfig(owner),saved:0,skipped:0,conflicts:0,failed:0}),busy:running.has(owner)};}
export async function exportDesktop(owner:string):Promise<ExportStatus> {
  const config=desktopConfig(owner);
  if(!config)return {enabled:false,saved:0,skipped:0,conflicts:0,failed:0};
  const current=running.get(owner);if(current)return current;
  const work=run(owner,config.root);running.set(owner,work);
  try{return await work;}finally{running.delete(owner);}
}
async function run(owner:string,root:string) {
  const result:ExportStatus={enabled:true,saved:0,skipped:0,conflicts:0,failed:0};
  const put=async(parts:string[],name:string,bytes:Buffer)=>{
    try { const state=await writeOnce(root,parts,name,bytes);if(state==='conflict')result.conflicts++;else result[state]++; }
    catch{result.failed++;}
  };
  try {
    const db=admin();
    const projects=checked(await db.from('projects').select('id,name').eq('owner_id',owner)).data||[];
    const accounts=checked(await db.from('mail_accounts').select('id').eq('owner_id',owner)).data||[];
    for(const project of projects) {
      const folder=`${safeName(project.name,28)}--${project.id}`;
      if(!accounts.length)continue;
      for(let offset=0;;offset+=100) {
        const messages=checked(await db.from('messages').select('id,subject,sender,to,body,received_at,company').eq('owner_id',owner).eq('project_id',project.id).in('account_id',accounts.map(a=>a.id)).order('id').range(offset,offset+99)).data||[];
        for(const m of messages) {
          const company=messageCompanyFolder(m.company,m.sender);
          const text=Buffer.from(`프로젝트: ${project.name}\r\n제목: ${m.subject}\r\n보낸 사람: ${m.sender}\r\n받는 사람: ${(m.to||[]).join(', ')}\r\n수신일: ${m.received_at}\r\n메일 ID: ${m.id}\r\n\r\n${m.body}`,'utf8');
          await put([folder,company,'메일 내용'],exportFilename(`${m.subject}.txt`,m.id,text),text);
          const attachments=checked(await db.from('attachments').select('id,name,type,content_base64,document_kind,document_manual,company_key,company_label').eq('message_id',m.id)).data||[];
          for(const a of attachments) {
            const bytes=Buffer.from(a.content_base64,'base64');
            const category=attachmentFolder(a);
            const parts=[folder,company,category];
            await put(parts,exportFilename(a.name,a.id,bytes),bytes);
          }
        }
        if(messages.length<100)break;
      }
    }
  }catch{result.failed++;}
  result.updatedAt=new Date().toISOString();statuses.set(owner,result);return result;
}
