import type {Metadata,Viewport} from 'next';
import PWARegistration from '@/components/pwa-registration';
import './globals.css';
export const metadata:Metadata={title:'4EIGNLABZ — Content HQ 3.0',description:'A private creative workspace. Plan with intention.',robots:{index:false,follow:false},manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'default',title:'4EIGN HQ'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#f8f5fb'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<PWARegistration/></body></html>;}
