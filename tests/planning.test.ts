import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixtureSnapshot} from '../lib/fixtures';
import {currentFeedPosts,filterPostsByAccounts,futureFeedPosts,moveScheduleToDate,postAccountIds} from '../lib/planning';
import type {Post} from '../lib/types';

function post(id:string,values:Partial<Post>={}):Post {
  return {...fixtureSnapshot().posts[0],id,accountId:'brand',accountIds:undefined,status:'draft',scheduledAt:'2026-11-02T16:00:00.000Z',...values};
}

test('account filters include collaborative posts once and preserve legacy primary accounts',()=>{
  const collaboration=post('collab',{accountIds:['brand','hunt','hunt']});
  const posts=[post('brand'),collaboration,post('hunt',{accountId:'hunt'})];
  assert.deepEqual(postAccountIds(collaboration),['brand','hunt']);
  assert.deepEqual(filterPostsByAccounts(posts,['hunt']).map(p=>p.id),['collab','hunt']);
  assert.deepEqual(filterPostsByAccounts(posts,['brand','hunt']),posts);
  assert.deepEqual(filterPostsByAccounts(posts,[]),posts);
  assert.equal(filterPostsByAccounts(posts,['missing']).length,0);
});

test('rescheduling preserves Puerto Rico wall time across UTC dates, years, and US DST',()=>{
  assert.equal(moveScheduleToDate('2026-11-03T02:15:37.125Z','2026-12-31'),'2027-01-01T02:15:37.125Z');
  assert.equal(moveScheduleToDate('2026-03-07T16:30:00Z','2026-03-09'),'2026-03-09T16:30:00.000Z');
  assert.equal(moveScheduleToDate('2026-11-02T04:00:00Z','2028-02-29'),'2028-02-29T04:00:00.000Z');
  for(const invalid of ['2026-02-30','2026-13-01','02/11/2026',''])assert.throws(()=>moveScheduleToDate('2026-11-02T16:00:00Z',invalid));
  assert.throws(()=>moveScheduleToDate('invalid','2026-11-02'));
});

test('future feed projects planned posts before current feed with deterministic ties and no ideas',()=>{
  const posts=[
    post('published-old',{status:'published',scheduledAt:'2026-10-28T16:00:00Z'}),
    post('idea',{status:'idea'}),
    post('b'),post('a'),
    post('next',{status:'approved',scheduledAt:'2026-11-04T16:00:00Z'}),
    post('unscheduled',{scheduledAt:''}),
    post('published-new',{status:'published',scheduledAt:'2026-11-01T16:00:00Z'}),
    post('other',{accountId:'hunt'}),
  ];
  const before=structuredClone(posts);
  assert.deepEqual(futureFeedPosts(posts,'brand').map(p=>p.id),['next','a','b','published-new','published-old']);
  assert.deepEqual(futureFeedPosts([...posts].reverse(),'brand').map(p=>p.id),['next','a','b','published-new','published-old']);
  assert.deepEqual(currentFeedPosts(posts,'brand').map(p=>p.id),['published-new','published-old']);
  assert.deepEqual(posts,before);
});

test('a collaborative canonical post appears once in each applicable feed',()=>{
  const collaboration=post('collab',{accountIds:['brand','hunt']});
  for(const account of ['brand','hunt'])assert.deepEqual(futureFeedPosts([collaboration,collaboration],account).map(p=>p.id),['collab'],account);
});
