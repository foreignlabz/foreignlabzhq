import {NextRequest,NextResponse} from 'next/server';
import {PREVIEW_COOKIE,previewTicket,validPreviewBasic,validPreviewTicket} from './lib/preview-access';
export function proxy(request:NextRequest){
  const allowed=()=>{const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');return response;};
  const username=process.env.HQ_PREVIEW_USERNAME,password=process.env.HQ_PREVIEW_PASSWORD;
  if(process.env.NODE_ENV==='development'&&process.env.HQ_LOCAL_DEVELOPMENT==='true'&&['127.0.0.1','localhost','[::1]'].includes(request.nextUrl.hostname))return allowed();
  if(!username||!password)return new NextResponse('Private preview access has not been configured.',{status:503,headers:{'Cache-Control':'private, no-store'}});
  if(validPreviewTicket(request.cookies.get(PREVIEW_COOKIE)?.value??'',password))return allowed();
  if(!validPreviewBasic(request.headers.get('authorization')??'',username,password))return new NextResponse('This development preview is private.',{status:401,headers:{'WWW-Authenticate':'Basic realm="4EIGN development preview", charset="UTF-8"','Cache-Control':'private, no-store'}});
  const response=allowed();response.cookies.set(PREVIEW_COOKIE,previewTicket(password,Date.now()+8*60*60*1000),{httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:8*60*60});return response;
}
