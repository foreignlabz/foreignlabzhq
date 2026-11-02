import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Role,PostInput,Snapshot} from '../lib/types';
import {SupabaseRepository,isMissingProgressSchema} from '../lib/supabase-repository';
import {canEditPost,validatePost,validateProgress} from '../lib/validation';

type QueryResult={data:unknown;error:{message:string;code?:string}|null};
type QueryState={table:string;operation:string;value?:unknown};
const post={id:'post',workspace_id:'workspace',account_id:'account',title:'Draft',caption:'Caption',scheduled_at:'2026-11-02T16:00:00Z',responsible_id:'user',status:'draft',created_by:'user',updated_at:'2026-11-02T00:00:00Z'};
function mockClient(role:Role='manager',options:{verified?:boolean;progressError?:QueryResult['error'];writeError?:QueryResult['error']}={}) {
  const calls:QueryState[]=[];
  const member={user_id:'user',workspace_id:'workspace',name:'Test member',role};
  function answer(state:QueryState):QueryResult {
    if(state.operation!=='select')return {data:state.table==='content_posts'?{...post,...state.value as object}:{post_id:'post'},error:options.writeError??null};
    switch(state.table) {
      case 'workspace_members':return {data:[member],error:null};
      case 'workspaces':return {data:{id:'workspace',name:'Test'},error:null};
      case 'accounts':return {data:[{id:'account',name:'Account',handle:'@test',color:'#aaaaaa'}],error:null};
      case 'content_posts':return {data:[post],error:null};
      case 'post_comments':return {data:[],error:null};
      case 'weekly_visions':return {data:null,error:null};
      case 'content_post_progress':return {data:options.progressError?null:[{post_id:'post',progress:'done'}],error:options.progressError??null};
      default:throw new Error(`Unexpected table ${state.table}`);
    }
  }
  const raw={auth:{getUser:async()=>({data:{user:{id:'user',email_confirmed_at:options.verified===false?null:'2026-11-02T00:00:00Z'}},error:null})},from:(table:string)=>{
    const state:QueryState={table,operation:'select'};calls.push(state);
    const chain={
      select:()=>chain,eq:()=>chain,order:()=>chain,single:()=>chain,maybeSingle:()=>chain,
      insert:(value:unknown)=>{state.operation='insert';state.value=value;return chain;},
      update:(value:unknown)=>{state.operation='update';state.value=value;return chain;},
      upsert:(value:unknown)=>{state.operation='upsert';state.value=value;return chain;},
      delete:()=>{state.operation='delete';return chain;},
      then:(resolve:(result:QueryResult)=>unknown,reject:(reason:unknown)=>unknown)=>Promise.resolve(answer(state)).then(resolve,reject),
    };return chain;
  }};
  return {client:raw as unknown as SupabaseClient,calls};
}

test('unverified users are denied before any membership query',async()=>{
  const {client,calls}=mockClient('owner',{verified:false});
  await assert.rejects(new SupabaseRepository(client).context(),{code:'FORBIDDEN'});
  assert.equal(calls.length,0);
});
test('brand member cannot change progress, comment, or upload through repository',async()=>{
  const {client,calls}=mockClient('brand_member');const repo=new SupabaseRepository(client);
  await assert.rejects(repo.saveProgress('post','done'),/solo lectura/);
  await assert.rejects(repo.addComment('post','Read-only write'),/solo lectura/);
  await assert.rejects(repo.uploadMedia(new File(['image'],'test.png',{type:'image/png'})),/solo lectura/);
  assert.ok(calls.every(call=>call.table==='workspace_members'&&call.operation==='select'));
});
test('brand member cannot create, edit, delete, or schedule posts',async()=>{
  const {client,calls}=mockClient('brand_member');const repo=new SupabaseRepository(client);const data=await repo.load();
  assert.equal(canEditPost(data.posts[0],'brand_member'),false);
  assert.throws(()=>validatePost(data.posts[0],data),/solo lectura/);
  await assert.rejects(repo.savePost({...data.posts[0],id:undefined}),/solo lectura/);
  await assert.rejects(repo.deletePost('post'),/permiso/);
  assert.ok(calls.every(call=>call.operation==='select'));
});
test('manager approval restrictions remain while progress is independent',async()=>{
  const {client,calls}=mockClient();const repo=new SupabaseRepository(client);const data=await repo.load();
  assert.throws(()=>validatePost({...data.posts[0],status:'approved'},data),/Solo el owner/);
  await repo.saveProgress('post','in_progress');
  const mutation=calls.find(call=>call.operation==='upsert');
  assert.equal(mutation?.table,'content_post_progress');
  assert.deepEqual(mutation?.value,{workspace_id:'workspace',post_id:'post',progress:'in_progress',updated_by:'user'});
});
test('post save preserves independent progress and writes collaborative metadata',async()=>{
  const {client,calls}=mockClient();const repo=new SupabaseRepository(client);const data=await repo.load();
  const saved=await repo.savePost({...data.posts[0],notes:' Shot notes ',taskProgress:'not_started'});
  const mutation=calls.find(call=>call.table==='content_posts'&&call.operation==='update');
  assert.equal((mutation?.value as Record<string,unknown>).notes,'Shot notes');
  assert.deepEqual((mutation?.value as Record<string,unknown>).account_ids,['account']);
  assert.equal('progress' in (mutation?.value as object),false);
  assert.equal('taskProgress' in (mutation?.value as object),false);
  assert.equal(saved.taskProgress,'done');
  assert.equal(calls.some(call=>call.table==='content_post_progress'&&call.operation!=='select'),false);
});
test('legacy rows get defaults only when the progress table is actually absent',async()=>{
  const {client}=mockClient('manager',{progressError:{code:'PGRST205',message:"Could not find table public.content_post_progress in the schema cache"}});
  const snapshot=await new SupabaseRepository(client).load();
  assert.equal(snapshot.posts[0].taskProgress,'not_started');
  assert.equal(snapshot.posts[0].notes,'');assert.deepEqual(snapshot.posts[0].accountIds,['account']);
  for(const code of ['42501','PGRST301']) {
    const denied=mockClient('manager',{progressError:{code,message:'content_post_progress authorization denied'}});
    await assert.rejects(new SupabaseRepository(denied.client).load(),/authorization denied/);
  }
  assert.equal(isMissingProgressSchema({code:'42P01',message:'relation unrelated_table does not exist'}),false);
});
test('new writes fail clearly if required HQ3 migration is absent',async()=>{
  const progress=mockClient('manager',{writeError:{code:'PGRST205',message:'Missing table content_post_progress'}});
  await assert.rejects(new SupabaseRepository(progress.client).saveProgress('post','done'),/requiere la migración/);
  const content=mockClient('manager',{writeError:{code:'PGRST204',message:"Could not find account_ids column"}});
  const repo=new SupabaseRepository(content.client);const data=await repo.load();
  await assert.rejects(repo.savePost(data.posts[0]),/requiere la migración/);
});
test('collaboration and progress validation reject invalid input',async()=>{
  const {client}=mockClient();const data=await new SupabaseRepository(client).load();
  const input=data.posts[0] as PostInput;
  assert.throws(()=>validatePost({...input,accountIds:['other']},data),/colaboradoras/);
  assert.throws(()=>validatePost({...input,notes:'x'.repeat(10001)},data),/notas/);
  assert.throws(()=>validateProgress('approved' as never),/Progreso/);
  assert.equal(canEditPost({...input,status:'approved'} as Snapshot['posts'][number],'manager'),false);
});
test('Google sign-in uses only the current origin callback and real provider SDK',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'window');let request:unknown;
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://hq-preview.example'}}});
  try {
    const client={auth:{signInWithOAuth:async(value:unknown)=>{request=value;return {error:null};}}} as unknown as SupabaseClient;
    await new SupabaseRepository(client).signInWithGoogle();
    assert.deepEqual(request,{provider:'google',options:{redirectTo:'https://hq-preview.example/auth/callback/',queryParams:{prompt:'select_account'}}});
    await assert.rejects(new SupabaseRepository(client).signIn(),/Google/);
  } finally {if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});
test('Google provider failure is surfaced without fake authentication',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://hq-preview.example'}}});
  try {
    const client={auth:{signInWithOAuth:async()=>({error:{message:'Provider disabled'}})}} as unknown as SupabaseClient;
    await assert.rejects(new SupabaseRepository(client).signInWithGoogle(),/proveedor/);
  } finally {if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});
