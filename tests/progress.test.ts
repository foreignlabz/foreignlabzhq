import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DemoRepository} from '../lib/demo-repository';
import type {TaskProgress} from '../lib/types';

function storage():Map<string,string> {
  const values=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)},configurable:true});
  return values;
}

test('manager progress stays independent of approval and survives stale owner saves',async()=>{
  storage();const owner=new DemoRepository();const initial=await owner.load();
  const approved=initial.posts.find(p=>p.status==='approved')!;
  assert.ok(approved);
  const manager=new DemoRepository();await manager.switchRole('manager');
  await manager.saveProgress(approved.id,'in_progress');
  await manager.saveProgress(approved.id,'done');
  const progressed=(await manager.load()).posts.find(p=>p.id===approved.id)!;
  assert.equal(progressed.status,'approved');assert.equal(progressed.taskProgress,'done');
  await owner.switchRole('owner');
  const saved=await owner.savePost({...approved,title:'Updated owner title',taskProgress:'not_started'});
  assert.equal(saved.taskProgress,'done');assert.equal(saved.status,'approved');
  assert.equal((await new DemoRepository().load()).posts.find(p=>p.id===approved.id)?.taskProgress,'done');
  await owner.saveProgress(approved.id,'not_started');
  assert.equal((await owner.load()).posts.find(p=>p.id===approved.id)?.taskProgress,'not_started');
});

test('progress rejects unknown values and missing posts without mutating the demo',async()=>{
  storage();const repo=new DemoRepository();const before=await repo.load();
  await assert.rejects(()=>repo.saveProgress(before.posts[0].id,'published' as TaskProgress),/no válido/);
  await assert.rejects(()=>repo.saveProgress('missing','done'),/no existe/);
  assert.deepEqual(await repo.load(),before);
  const created=await repo.savePost({...before.posts[0],id:undefined,status:'draft',taskProgress:'done'});
  assert.equal(created.taskProgress,'not_started');
});

test('read-only members cannot mutate posts, progress, vision, comments, or media',async()=>{
  storage();const repo=new DemoRepository();await repo.switchRole('brand_member');const before=await repo.load();const post=before.posts[0];
  await assert.rejects(()=>repo.savePost({...post,title:'Forbidden'}),/solo lectura/);
  await assert.rejects(()=>repo.saveProgress(post.id,'done'),/solo lectura/);
  await assert.rejects(()=>repo.deletePost(post.id),/solo lectura/);
  await assert.rejects(()=>repo.saveVision('Forbidden'),/Solo el owner/);
  await assert.rejects(()=>repo.addComment(post.id,'Forbidden'),/solo lectura/);
  await assert.rejects(()=>repo.uploadMedia(new File(['test'],'test.png',{type:'image/png'})),/solo lectura/);
  assert.deepEqual(await repo.load(),before);
});

test('HQ3 demo preserves prior-version storage and never simulates Google OAuth',async()=>{
  const values=storage();values.set('4eign-hq-v2-demo-v1','historical demo data');
  const repo=new DemoRepository();const initial=await repo.load();await repo.saveProgress(initial.posts[0].id,'done');
  assert.equal(values.get('4eign-hq-v2-demo-v1'),'historical demo data');assert.ok(values.has('4eign-hq3-demo-v1'));
  await assert.rejects(()=>repo.signInWithGoogle(),/no está disponible en la demo/);
  await assert.rejects(()=>repo.switchRole('unknown' as never),/no está disponible/);
  assert.ok((await repo.load()).member);
});
