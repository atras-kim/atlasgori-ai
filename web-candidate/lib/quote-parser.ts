import {spawn} from 'node:child_process';
import path from 'node:path';
import {z} from 'zod';
import {AppError} from './security';
export const evidenceSchema=z.object({sources:z.array(z.object({id:z.string().max(160),text:z.string().max(60000)})).min(1).max(150),warnings:z.array(z.string().max(300)).max(20)});
export type QuoteEvidence=z.infer<typeof evidenceSchema>;
let active=0;
export async function parseQuoteFile(name:string,bytes:Buffer):Promise<QuoteEvidence>{
 const ext=path.extname(name).toLowerCase();
 if(!['.pdf','.xlsx'].includes(ext))throw new AppError('텍스트 PDF 또는 Excel .xlsx 파일을 선택해 주세요.');
 if(bytes.length>5*1024*1024)throw new AppError('견적 분석은 파일당 5 MB까지 지원합니다.');
 if(active>=2)throw new AppError('다른 문서 분석이 진행 중입니다. 잠시 후 다시 시도해 주세요.',429);
 active++;
 try{return await new Promise((resolve,reject)=>{
  const worker=path.join(process.cwd(),'scripts','quote-parser.mjs');
  const child=spawn(process.execPath,['--permission',`--allow-fs-read=${worker}`,`--allow-fs-read=${path.join(process.cwd(),'node_modules')}`,'--max-old-space-size=192',worker,ext.slice(1)],{shell:false,windowsHide:true,cwd:path.dirname(worker),env:{NODE_ENV:'production',SystemRoot:process.env.SystemRoot||'',TEMP:process.env.TEMP||'',TMP:process.env.TMP||''},stdio:['pipe','pipe','pipe']});
  let output='',length=0,ended=false;
  const finish=(error?:Error,value?:QuoteEvidence)=>{if(ended)return;ended=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(value!);};
  const timer=setTimeout(()=>finish(new AppError('문서 추출 시간이 초과되었습니다.',422)),20000);
  child.on('error',()=>finish(new AppError('문서 처리기를 실행하지 못했습니다.',503)));
  child.stdin.on('error',()=>{});child.stderr.resume();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',(chunk:string)=>{length+=Buffer.byteLength(chunk);if(length>400000)finish(new AppError('문서 추출 결과가 너무 큽니다.',422));else output+=chunk;});
  child.on('close',code=>{try{const parsed=JSON.parse(output);if(code!==0||parsed.error)throw Error();finish(undefined,evidenceSchema.parse(parsed));}catch{finish(new AppError('텍스트 추출 실패: 스캔·암호 문서, 외부 링크 또는 처리 한도를 확인해 주세요.',422));}});
  child.stdin.end(bytes);
 });}finally{active--;}
}
