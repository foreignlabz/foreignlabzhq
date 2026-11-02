import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {proxy} from '../proxy';
import {PREVIEW_COOKIE} from '../lib/preview-access';

function withConfig(config:Record<string,string|undefined>,run:()=>void){const previous=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]]));try{for(const [key,value] of Object.entries(config)){if(value===undefined)delete process.env[key];else process.env[key]=value;}run();}finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}}
const closed={HQ_LOCAL_DEVELOPMENT:undefined,HQ_PREVIEW_USERNAME:undefined,HQ_PREVIEW_PASSWORD:undefined,HQ_STAGING_DEMO:undefined};
test('unconfigured shared preview fails closed for pages and assets',()=>withConfig(closed,()=>{for(const path of ['/preview/','/feed/4eignlabz/01.jpg','/api/drive/'])assert.equal(proxy(new NextRequest('https://preview.example'+path)).status,503);}));
test('production never honors the development access bypass',()=>withConfig({...closed,NODE_ENV:'production',HQ_LOCAL_DEVELOPMENT:'true'},()=>assert.equal(proxy(new NextRequest('http://127.0.0.1:3000/preview/')).status,503)));
test('development access is limited to explicit loopback mode',()=>withConfig({...closed,NODE_ENV:'development',HQ_LOCAL_DEVELOPMENT:'true'},()=>{assert.equal(proxy(new NextRequest('http://127.0.0.1:3000/preview/')).headers.get('x-middleware-next'),'1');assert.equal(proxy(new NextRequest('https://preview.example/preview/')).status,503);}));
test('configured preview requires credentials and issues a private secure session',()=>withConfig({...closed,NODE_ENV:'production',HQ_PREVIEW_USERNAME:'qa',HQ_PREVIEW_PASSWORD:'fixture-only-private-access'},()=>{
  const denied=proxy(new NextRequest('https://preview.example/preview/'));assert.equal(denied.status,401);assert.match(denied.headers.get('www-authenticate')??'',/Basic/);
  const authorized=proxy(new NextRequest('https://preview.example/preview/',{headers:{authorization:'Basic '+Buffer.from('qa:fixture-only-private-access').toString('base64')}}));
  assert.equal(authorized.headers.get('x-middleware-next'),'1');assert.equal(authorized.headers.get('cache-control'),'private, no-store');
  const cookie=authorized.cookies.get(PREVIEW_COOKIE);assert.ok(cookie?.value);assert.match(authorized.headers.get('set-cookie')??'',/HttpOnly/);assert.match(authorized.headers.get('set-cookie')??'',/Secure/);
  const api=proxy(new NextRequest('https://preview.example/api/drive/',{headers:{authorization:'Bearer fixture-user-token',cookie:`${PREVIEW_COOKIE}=${cookie!.value}`}}));assert.equal(api.headers.get('x-middleware-next'),'1');assert.equal(api.headers.get('cache-control'),'private, no-store');
}));
test('synthetic staging protects every route before exposing demo data',()=>withConfig({...closed,NODE_ENV:'production',HQ_STAGING_DEMO:'true',HQ_PREVIEW_USERNAME:'qa',HQ_PREVIEW_PASSWORD:'fixture-only-private-access'},()=>{
  for(const path of ['/','/preview/','/feed-preview/','/login-preview/','/_next/static/test.js','/staging-art/01.svg','/api/drive/'])assert.equal(proxy(new NextRequest('https://staging.example'+path)).status,401);
}));
test('authorized staging rewrites live entry routes and disables all APIs even with Drive enabled',()=>withConfig({...closed,NODE_ENV:'production',HQ_STAGING_DEMO:'true',HQ_DRIVE_ENABLED:'true',HQ_PREVIEW_USERNAME:'qa',HQ_PREVIEW_PASSWORD:'fixture-only-private-access'},()=>{
  const headers={authorization:'Basic '+Buffer.from('qa:fixture-only-private-access').toString('base64')};
  for(const path of ['/','/auth/callback/?code=never-exchange','/auth/other/']){
    const response=proxy(new NextRequest('https://staging.example'+path,{headers}));
    assert.equal(response.headers.get('x-middleware-rewrite')?.replace(/\/$/,''),'https://staging.example/login-preview');
    assert.equal(response.headers.get('x-hq-data-mode'),'synthetic-demo');
    assert.match(response.headers.get('content-security-policy')??'',/connect-src 'self'/);
  }
  for(const path of ['/api/drive/','/api/drive/uploads/','/api/anything/'])assert.equal(proxy(new NextRequest('https://staging.example'+path,{headers})).status,404);
  const image=proxy(new NextRequest('https://staging.example/feed/4eignlabz/01.jpg',{headers}));
  assert.equal(image.headers.get('x-middleware-rewrite'),'https://staging.example/staging-art/01.svg');
  assert.equal(proxy(new NextRequest('https://staging.example/feed/private.jpg',{headers})).status,404);
  assert.equal(proxy(new NextRequest('https://staging.example/preview/',{headers})).headers.get('x-middleware-next'),'1');
}));
