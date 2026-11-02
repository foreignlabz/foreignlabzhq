import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {proxy} from '../proxy';
import {PREVIEW_COOKIE} from '../lib/preview-access';

function withConfig(config:Record<string,string|undefined>,run:()=>void){const previous=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]]));try{for(const [key,value] of Object.entries(config)){if(value===undefined)delete process.env[key];else process.env[key]=value;}run();}finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}}
const closed={HQ_LOCAL_DEVELOPMENT:undefined,HQ_PREVIEW_USERNAME:undefined,HQ_PREVIEW_PASSWORD:undefined};
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
