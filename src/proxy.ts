import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, NextRequest, NextFetchEvent } from 'next/server';
const live=clerkMiddleware();
export default function proxy(req:NextRequest,event:NextFetchEvent){return process.env.APP_MODE==='demo'||req.nextUrl.pathname==='/api/health'?NextResponse.next():live(req,event);}
export const config={matcher:['/((?!_next|.*\\..*).*)','/api/(.*)']};
