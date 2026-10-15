import { OrganizationList,UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
export default async function Page(){if(process.env.APP_MODE==='demo')redirect('/');const {userId,orgId}=await auth();if(!userId)redirect('/sign-in');if(orgId)redirect('/');return <div className="auth-page"><UserButton/><h1>Select your organization</h1><OrganizationList hidePersonal afterSelectOrganizationUrl="/"/></div>;}
