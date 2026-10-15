import Console from '@/components/console';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
export default async function Page(){if(process.env.APP_MODE==='live'){const {userId,orgId}=await auth();if(!userId)redirect('/sign-in');if(!orgId)redirect('/select-organization');}return <Console/>;}
