import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseRepository} from '../lib/supabase-repository';
import {authIssue,classifyAuthIssue,createAuthStartup,createBoundedAuthFetch,HQAuthFlowError,inspectAuthCallback,sanitizedAuthPath,withAuthDeadline} from '../lib/auth-flow';

test('callback cancellation has safe copy without reflecting arbitrary URL content',()=>{
  const callback=inspectAuthCallback('https://hq.example/auth/callback/?error=access_denied&error_description=UNTRUSTED_SECRET');
  assert.equal(callback.issue?.kind,'cancelled');
  assert.equal(callback.issue?.retry,'google');
  assert.doesNotMatch(callback.issue!.message,/UNTRUSTED_SECRET/);
});
test('auth URL cleanup removes query and hash credentials without following destinations',()=>{
  const path=sanitizedAuthPath('https://hq.example/auth/callback/?code=secret&sb_flow_id=slot&state=secret&next=https%3A%2F%2Fother.example&view=week#access_token=secret&refresh_token=secret&provider_token=secret&error_description=secret');
  assert.equal(path,'/auth/callback/?next=https%3A%2F%2Fother.example&view=week');
  assert.equal(sanitizedAuthPath('https://hq.example/?view=week#calendar'), '/?view=week#calendar');
});
test('PKCE code remains available until initialization exchange settles',async()=>{
  let href='https://hq.example/auth/callback/?code=one-use&sb_flow_id=flow';
  let finish:(result:{error:unknown})=>void=()=>{};let cleaned=false;
  const completion=new Promise<{error:unknown}>(resolve=>{finish=resolve;});
  const startup=createAuthStartup({initialize:()=>completion,readHref:()=>href,replacePath:path=>{cleaned=true;href=new URL(path,'https://hq.example').href;}});
  const waiting=startup.wait();
  await Promise.resolve();
  assert.equal(cleaned,false);assert.match(href,/code=one-use/);
  // Mimic SDK removal only after a successful token exchange.
  href='https://hq.example/auth/callback/?state=transient';finish({error:null});
  await waiting;
  assert.equal(cleaned,true);assert.equal(href,'https://hq.example/auth/callback/');
});
test('callback failures are sticky and cannot silently restore an existing identity',async()=>{
  let href='https://hq.example/auth/callback/#error=access_denied&error_description=not-for-display';let userCalls=0;
  const startup=createAuthStartup({initialize:async()=>({error:{name:'AuthImplicitGrantRedirectError'}}),readHref:()=>href,replacePath:path=>{href=new URL(path,'https://hq.example').href;}});
  const client={auth:{getUser:async()=>{userCalls++;return {data:{user:{id:'previous',email_confirmed_at:'now'}},error:null};}}} as unknown as SupabaseClient;
  const repo=new SupabaseRepository(client,startup);
  await assert.rejects(repo.context(),error=>error instanceof HQAuthFlowError&&error.issue.kind==='cancelled');
  await assert.rejects(repo.context(),error=>error instanceof HQAuthFlowError&&error.issue.kind==='cancelled');
  assert.equal(userCalls,0);assert.equal(href,'https://hq.example/auth/callback/');
});
test('code with missing verifier and empty code fail closed after SDK initialization',async()=>{
  for(const code of ['unused','']){
    let href=`https://hq.example/auth/callback/?code=${code}`;
    const startup=createAuthStartup({initialize:async()=>({error:null}),readHref:()=>href,replacePath:path=>{href=new URL(path,'https://hq.example').href;}});
    await assert.rejects(startup.wait(),error=>error instanceof HQAuthFlowError&&error.issue.kind==='expired');
    assert.equal(href,'https://hq.example/auth/callback/');
  }
});
test('a transient noncallback initialization failure permits a real subsequent session retry',async()=>{
  const startup=createAuthStartup({initialize:async()=>({error:{name:'AuthRetryableFetchError',status:503}}),readHref:()=> 'https://hq.example/'});
  await assert.rejects(startup.wait(),error=>error instanceof HQAuthFlowError&&error.issue.kind==='network');
  await startup.wait(); // Caller must still run getUser and trusted membership checks.
});
test('network failures do not masquerade as an ordinary signed-out state',async()=>{
  const client={auth:{getUser:async()=>({data:{user:null},error:{name:'AuthRetryableFetchError',status:503,message:'internal data'}})}} as unknown as SupabaseClient;
  await assert.rejects(new SupabaseRepository(client).context(),error=>error instanceof HQAuthFlowError&&error.issue.kind==='network');
  assert.equal(classifyAuthIssue({name:'AuthSessionMissingError'}),null);
  assert.equal(classifyAuthIssue({code:'SIGNED_OUT'}),null);
  assert.equal(classifyAuthIssue({code:'FORBIDDEN'})?.retry,'switch_account');
  assert.equal(classifyAuthIssue({code:'FORBIDDEN',reason:'unverified'})?.kind,'unverified');
});
test('bounded auth operations time out instead of leaving an endless loader',async()=>{
  await assert.rejects(withAuthDeadline(new Promise(()=>{}),5),error=>error instanceof HQAuthFlowError&&error.issue.kind==='timeout'&&error.issue.retry==='reload');
  assert.equal(await withAuthDeadline(Promise.resolve('ready'),100),'ready');
});
test('only auth fetches receive a timeout; media fetch behavior is preserved',async()=>{
  let nonAuthSignal:AbortSignal|null|undefined;
  const fetcher:typeof fetch=async(input,init)=>{
    if(String(input).includes('/storage/')){nonAuthSignal=init?.signal;return new Response('ok');}
    return new Promise<Response>((_,reject)=>{
      if(init?.signal?.aborted)reject(init.signal.reason);
      else init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true});
    });
  };
  const bounded=createBoundedAuthFetch(fetcher,5);
  await assert.rejects(bounded('https://project.supabase.co/auth/v1/user'),{name:'TimeoutError'});
  assert.equal(await (await bounded('https://project.supabase.co/storage/v1/object')).text(),'ok');
  assert.equal(nonAuthSignal,undefined);
});
test('sign-out affects the current session only and surfaces remote failure',async()=>{
  let scope:unknown;
  const client={auth:{signOut:async(value:unknown)=>{scope=value;return {error:null};}}} as unknown as SupabaseClient;
  await new SupabaseRepository(client).signOut();
  assert.deepEqual(scope,{scope:'local'});
  const failing={auth:{signOut:async()=>({error:{name:'AuthRetryableFetchError',status:503}})}} as unknown as SupabaseClient;
  await assert.rejects(new SupabaseRepository(failing).signOut(),error=>error instanceof HQAuthFlowError&&error.issue.kind==='network');
  assert.equal(authIssue('expired').retry,'google');
});

test('auth response headers cannot bypass the deadline when the JSON body stalls',async()=>{
  const fetcher:typeof fetch=async(_input,init)=>new Response(new ReadableStream({
    start(controller){init?.signal?.addEventListener('abort',()=>controller.error(init.signal?.reason),{once:true});},
  }),{headers:{'content-type':'application/json'}});
  await assert.rejects(createBoundedAuthFetch(fetcher,5)('https://project.supabase.co/auth/v1/token'),{name:'TimeoutError'});
});
