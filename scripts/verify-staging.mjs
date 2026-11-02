import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';

const username='local-staging-qa';
const password=randomBytes(32).toString('base64url');
const port=Number(process.env.HQ_QA_PORT||3001);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Use a local QA port from 1024 to 65535.');
const base=`http://127.0.0.1:${port}`;
const env={...process.env,HQ_LOCAL_DEVELOPMENT:'false',HQ_STAGING_DEMO:'true',HQ_DRIVE_ENABLED:'false',HQ_PREVIEW_USERNAME:username,HQ_PREVIEW_PASSWORD:password,NEXT_TELEMETRY_DISABLED:'1'};
async function run(command,args,environment){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env:environment,stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Validation command failed with status ${code}.`)));
  });
}
let server;
try{
  // Never reuse an unrelated server or silently validate a previous build.
  try{await fetch(base,{signal:AbortSignal.timeout(1000)});throw new Error('QA port is already in use. Choose HQ_QA_PORT.');}
  catch(error){if(error.message==='QA port is already in use. Choose HQ_QA_PORT.')throw error;}
  await run(process.platform==='win32'?'npm.cmd':'npm',['run','build:staging'],env);
  // Intentional adversarial configuration: staging must disable Drive anyway.
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...env,HQ_DRIVE_ENABLED:'true'},stdio:'inherit'});
  let startupError;server.on('error',error=>{startupError=error;});
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    if(startupError)throw startupError;
    if(server.exitCode!==null)throw new Error('Staging server exited before readiness.');
    try{const response=await fetch(base,{signal:AbortSignal.timeout(1000)});if(response.status===401){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready)throw new Error('Protected staging server did not become ready.');
  await run(process.execPath,['scripts/staging-browser-qa.cjs'],{...env,HQ_QA_BASE_URL:base,HQ_QA_USERNAME:username,HQ_QA_PASSWORD:password});
} catch(error){console.error(error.message);process.exitCode=1;}
finally{if(server&&server.exitCode===null)server.kill('SIGTERM');}
