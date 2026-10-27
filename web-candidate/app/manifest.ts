import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
 return {id:'/',name:'Atlasgori',short_name:'Atlasgori',description:'메일과 AI 프로젝트를 하나의 업무 공간에서',lang:'ko',start_url:'/workspace',scope:'/',display:'standalone',background_color:'#f4f7fc',theme_color:'#081c3b',icons:[{src:'/brand/atlasgori-blue-black-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/brand/atlasgori-blue-black-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]};
}

