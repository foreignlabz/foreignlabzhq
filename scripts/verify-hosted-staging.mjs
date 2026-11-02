// Read-only verification. Never publish, promote, migrate, or print credentials.
const base=new URL(process.env.HQ_STAGING_URL||'https://invalid.example');
if(!/^https:$/.test(base.protocol)||!base.hostname.endsWith('.netlify.app')||!base.hostname.includes('--')||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('Set HQ_STAGING_URL to the exact HTTPS Netlify draft deploy_url with no path or credentials.');
const username=process.env.HQ_PREVIEW_USERNAME,password=process.env.HQ_PREVIEW_PASSWORD;
if(!username||!password)throw new Error('Provide the preview credentials through the local environment.');
const authorization='Basic '+Buffer.from(`${username}:${password}`).toString('base64');
let checks=0;
function check(condition,message){checks++;if(!condition)throw new Error(message);}
async function get(path,authenticated=false){return fetch(new URL(path,base),{headers:authenticated?{authorization}:{},redirect:'manual',signal:AbortSignal.timeout(20000)});}
function privateHeaders(response){
  check(/private.*no-store|no-store.*private/i.test(response.headers.get('cache-control')||''),'Private no-store response required.');
  check(response.headers.get('x-hq-data-mode')==='synthetic-demo','Synthetic staging mode is missing.');
  check((response.headers.get('content-security-policy')||'').includes("connect-src 'self'"),'Same-origin connection policy is missing.');
}
try{
  for(const path of ['/','/preview/','/login-preview/','/feed-preview/','/manifest.webmanifest','/sw.js','/staging-art/01.svg','/feed/4eignlabz/01.jpg','/api/drive/']){
    const response=await get(path);check(response.status===401,`Anonymous access must return401: ${path}`);
  }
  for(const path of ['/.netlify/functions/___netlify-server-handler/','/.netlify/images?url=/feed/4eignlabz/01.jpg','/_next/image/?url=/feed/4eignlabz/01.jpg&w=640&q=75']){
    const response=await get(path);check([401,403,404].includes(response.status),`Internal hosting route must not bypass access: ${path}`);
  }
  let html='';
  for(const path of ['/','/login-preview/','/preview/','/feed-preview/','/auth/callback/']){
    const response=await get(path,true);check(response.status===200,`Protected page failed: ${path}`);privateHeaders(response);
    const body=await response.text();if(path==='/')html=body;
    check(body.includes('HQ 3.0 staging'),'Staging disclosure is missing from a page.');
  }
  check(html.includes('Explore demo workspace'),'Root must show demo login.');
  const cookie=(await get('/',true)).headers.get('set-cookie')||'';
  check(/HttpOnly/i.test(cookie)&&/Secure/i.test(cookie)&&/SameSite=lax/i.test(cookie),'Secure preview session cookie is missing.');
  const script=html.match(/<script[^>]+src="([^"]+)"/i)?.[1];
  check(Boolean(script),'Unable to identify a production JS bundle.');
  const scriptURL=new URL(script,base);check(scriptURL.origin===base.origin,'Unexpected script origin.');
  check((await get(scriptURL.pathname)).status===401,'Production bundle must be password-protected.');
  const art=await get('/feed/4eignlabz/01.jpg',true);check(art.status===200,'Synthetic art is unavailable.');privateHeaders(art);check((await art.text()).includes('SYNTHETIC DEMO'),'An original image was exposed in staging.');
  for(const path of ['/api/drive/','/api/drive/uploads/','/api/drive/associations/'])check((await get(path,true)).status===404,`Live API must stay disabled: ${path}`);
  console.log(JSON.stringify({status:'passed',checks,previewURL:base.origin,scope:'Read-only hosted access/data-isolation checks. Open on iPhone to review visual behavior.'},null,2));
}catch(error){console.error('Hosted staging verification failed: '+String(error.message).split(password).join('[REDACTED]').split(authorization).join('[REDACTED]'));process.exitCode=1;}
