import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
export default function Page(){if(process.env.APP_MODE==='demo')redirect('/');return <div className="auth-page"><SignIn routing="path" path="/sign-in" forceRedirectUrl="/"/></div>;}
