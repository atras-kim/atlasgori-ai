import path from 'node:path';
import { mkdir, lstat, realpath, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function safeName(value:string, max=55) {
  let name=value.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').slice(0,max).replace(/[. ]+$/g,'');
  if(!name || /^\.+$/.test(name)) name='이름 없음';
  if(/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name='_'+name;
  return name;
}
export function digest(bytes:Buffer|string) {return createHash('sha256').update(bytes).digest('hex');}
export function companyFolder(label:string,key:string) {return `${safeName(label,24)}--${digest(key).slice(0,10)}`;}
export function messageCompanyFolder(company:string|null|undefined,sender:string) {
  const label=company?.trim();
  const email=(sender.match(/<([^<>]+)>/)?.[1]||sender).trim().toLowerCase();
  return companyFolder(label||email||'회사 확인 필요',label?`company:${label.normalize('NFC').toLowerCase()}`:`sender:${email}`);
}
export function attachmentFolder(a:{name:string;type:string;document_kind?:string;document_manual?:boolean}) {
  if(a.document_manual) return ({quote:'견적서',brochure:'브로셔',contract:'계약서',review:'검토 필요'} as Record<string,string>)[a.document_kind||'']||'검토 필요';
  const kinds=[[/quotation|quote|proforma|견적서|가격표/i,'견적서'],[/brochure|catalog|브로셔|제품소개/i,'브로셔'],[/purchase[ _-]?order|(?:^|[ _-])po(?:[ _.-]|$)|발주서|구매주문서/i,'발주서'],[/contract|agreement|\bnda\b|계약서|비밀유지/i,'계약서']] as const;
  const matches=kinds.filter(([re])=>re.test(a.name));
  if(matches.length>1)return '검토 필요';
  if(matches.length===1)return matches[0][1];
  if(/^image\/(jpeg|png|gif|webp|bmp|tiff)$/i.test(a.type))return '이미지';
  return '검토 필요';
}
export function exportFilename(name:string,id:string,bytes:Buffer) {
  const extension=path.extname(name).toLowerCase();
  const allowed=/^\.(pdf|docx?|xlsx?|pptx?|csv|txt|jpg|jpeg|png|gif|webp|bmp|tiff?|zip)$/i;
  const suffix=allowed.test(extension)?extension:'.download';
  return `${safeName(path.basename(name,extension),40)}--${safeName(id,36)}-${digest(bytes).slice(0,12)}${suffix}`;
}
// Never accept a directory supplied by an HTTP client. Check every ancestor,
// including the configured root, to reject junctions and symbolic links.
export async function safeDirectory(target:string) {
  if(!path.isAbsolute(target))throw new Error('Absolute export directory required');
  const resolved=path.resolve(target), parsed=path.parse(resolved);
  let current=parsed.root;
  for(const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try {await mkdir(current);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
    const info=await lstat(current);
    if(info.isSymbolicLink()||!info.isDirectory())throw new Error('Unsafe export directory');
    if(path.resolve(await realpath(current)).toLowerCase()!==path.resolve(current).toLowerCase())throw new Error('Redirected export directory');
  }
  return resolved;
}
export async function writeOnce(root:string,parts:string[],name:string,bytes:Buffer):Promise<'saved'|'skipped'|'conflict'> {
  if([...parts,name].some(p=>!p||p==='.'||p==='..'||/[\\/:]/.test(p)))throw new Error('Unsafe path component');
  const dir=await safeDirectory(path.join(root,...parts));
  const target=path.join(dir,name);
  let handle;
  try { handle=await open(target,'wx',0o600); }
  catch(e) {
    if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
    const stat=await lstat(target);
    if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink>1)throw new Error('Unsafe existing export');
    if(stat.size!==bytes.length)return 'conflict';
    return digest(await readFile(target))===digest(bytes)?'skipped':'conflict';
  }
  try{await handle.writeFile(bytes);}finally{await handle.close();}
  return 'saved';
}
