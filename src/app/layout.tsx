import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
export const metadata:Metadata={title:'AdOS · Advertising control room',description:'Evidence-led advertising decisions, human approvals, and deterministic execution.'};
export const dynamic='force-dynamic';
export default function RootLayout({children}:{children:React.ReactNode}){
 const content=<html lang="en"><body>{children}</body></html>;
 return process.env.APP_MODE==='live'?<ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>{content}</ClerkProvider>:content;
}
