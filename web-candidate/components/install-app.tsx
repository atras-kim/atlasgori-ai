'use client';
import { useEffect, useState } from 'react';
type InstallPrompt=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function InstallApp(){
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false);
 useEffect(()=>{
  const mode=window.matchMedia('(display-mode: standalone)');
  const check=()=>setInstalled(mode.matches||!!(navigator as Navigator & {standalone?:boolean}).standalone);
  const before=(e:Event)=>{e.preventDefault();setPrompt(e as InstallPrompt);};
  const done=()=>{setInstalled(true);setPrompt(null);setHelp(false);};
  check();mode.addEventListener('change',check);window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',done);
  return()=>{mode.removeEventListener('change',check);window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done);};
 },[]);
 if(installed)return null;
 async function install(){if(!prompt){setHelp(!help);return;}try{await prompt.prompt();await prompt.userChoice;}finally{setPrompt(null);}}
 return <div className="app-install"><button onClick={install} aria-expanded={help}>앱 설치</button>{help&&<section className="install-help" aria-label="앱 설치 안내"><strong>홈 화면에 atlasgori 추가</strong><p>아이폰: Safari에서 공유 → 홈 화면에 추가</p><p>안드로이드: Chrome 메뉴 → 앱 설치 또는 홈 화면에 추가</p><p>PC: Chrome·Edge 주소창의 설치 아이콘을 눌러 주세요.</p><small>인터넷 연결이 필요합니다. 현재 서버 PC가 켜져 있어야 사용할 수 있습니다.</small><button onClick={()=>setHelp(false)}>닫기</button></section>}</div>;
}
