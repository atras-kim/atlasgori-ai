import {notFound,redirect} from 'next/navigation';
import {requireOperator} from '@/lib/membership';
import {AppError} from '@/lib/security';
import SponsorDemoClient from './client';
export const dynamic='force-dynamic';
export default async function SponsorDemo(){
 if(process.env.ATLAS_SPONSOR_DEMO_ENABLED!=='1')notFound();
 try{await requireOperator();}catch(e){if(e instanceof AppError&&e.status===401)redirect('/login');if(e instanceof AppError&&e.status===403)notFound();throw e;}
 return <SponsorDemoClient/>;
}