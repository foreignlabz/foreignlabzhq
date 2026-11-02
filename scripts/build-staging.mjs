import {spawnSync} from 'node:child_process';

const required=['HQ_PREVIEW_USERNAME','HQ_PREVIEW_PASSWORD'];
const problems=[];
if(process.env.NETLIFY==='true'&&process.env.CONTEXT!=='deploy-preview')problems.push('Only the Netlify deploy-preview build context is permitted.');
if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='preview')problems.push('Only the Vercel Preview environment is permitted.');
if(process.env.VERCEL==='1'&&process.env.VERCEL_ENV!=='preview')problems.push('A verified Preview target is required on Vercel.');
if(process.env.HQ_STAGING_DEMO!=='true')problems.push('Set HQ_STAGING_DEMO=true for build and runtime.');
if(process.env.HQ_DRIVE_ENABLED!=='false')problems.push('Set HQ_DRIVE_ENABLED=false.');
for(const name of required)if(!process.env[name])problems.push(`Configure ${name} securely in Preview environment settings.`);
if(process.env.HQ_PREVIEW_PASSWORD&&process.env.HQ_PREVIEW_PASSWORD.length<24)problems.push('Use a unique preview password of at least 24 characters.');
if(problems.length){console.error('Staging build refused:\n'+problems.join('\n'));process.exit(1);}
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{stdio:'inherit',env:process.env});
if(result.error){console.error('Unable to start the Next.js build.');process.exit(1);}
process.exit(result.status??1);
