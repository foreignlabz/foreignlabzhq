import type {NextConfig} from 'next';
const nextConfig:NextConfig={trailingSlash:true,poweredByHeader:false,devIndicators:false,images:{unoptimized:true},async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Frame-Options',value:'DENY'},{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},{key:'Cache-Control',value:'private, no-store'}]}]}};
export default nextConfig;
