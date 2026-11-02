// Normalize preview-host flags to Next.js CLI equivalents. No network tunnels.
import {spawn} from 'node:child_process';
const incoming=process.argv.slice(2);const args=[];
for(let i=0;i<incoming.length;i++){if(incoming[i]==='--strictPort')continue;args.push(incoming[i]==='--host'?'--hostname':incoming[i]);}
const hostIndex=args.findIndex(value=>value==='--hostname'||value==='-H');
if(hostIndex<0)args.push('--hostname','127.0.0.1');
if(process.env.HQ_LOCAL_DEVELOPMENT==='true'&&hostIndex>=0&&!['127.0.0.1','localhost','::1'].includes(args[hostIndex+1]))throw new Error('Local development access must bind to loopback. Configure private preview credentials for shared hosting.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...args],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
