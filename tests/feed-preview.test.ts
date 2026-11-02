import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFeedPreview, findFeedAccount, snapshotFeed} from '../lib/feed-preview';
import type {Account, Post} from '../lib/types';

const account: Account = {id: 'labz', name: 'Labz', handle: '@4eignlabz', color: '#ddd'};
const dragon: Account = {id: 'dragon', name: 'Dragon', handle: '@dragonballhuntpr', color: '#ddd'};
function post(id: string, overrides: Partial<Post> = {}): Post {
  return {id, accountId: account.id, title: id, caption: '', scheduledAt: '2026-11-02T16:00:00Z', responsibleId: 'manager', status: 'draft', media: null, videoUrl: '', createdBy: 'owner', updatedAt: '2026-11-01T16:00:00Z', ...overrides};
}

test('current snapshot preserves all twelve recovered thumbnails in original order', () => {
  const grid = buildFeedPreview([post('future')], account, account.handle, 'current');
  assert.equal(grid.length, 12);
  assert.ok(grid.every(tile => tile.kind === 'snapshot'));
  assert.equal(grid[0].src, '/feed/4eignlabz/01.jpg');
  assert.equal(grid[11].src, '/feed/4eignlabz/12.jpg');
});

test('future feed orders canonical plans before screenshot reference, excluding ideas and published duplicates', () => {
  const posts = [post('early'), post('later', {scheduledAt: '2026-11-04T16:00:00Z'}), post('idea', {status: 'idea'}), post('already-published', {status: 'published'}), post('invalid', {scheduledAt: ''})];
  const grid = buildFeedPreview(posts, account, account.handle, 'future');
  assert.deepEqual(grid.slice(0, 2).map(tile => tile.id), ['later', 'early']);
  assert.equal(grid.length, 14);
  assert.equal(grid[2].kind, 'snapshot');
});

test('collaboration appears once in both account previews while unsupplied dragon snapshot stays empty', () => {
  const collab = post('collab', {accountIds: [account.id, dragon.id, account.id]});
  assert.equal(snapshotFeed(dragon.handle).length, 0);
  const grid = buildFeedPreview([collab, collab], dragon, dragon.handle, 'future');
  assert.deepEqual(grid.map(tile => tile.id), ['collab']);
  assert.equal(grid[0].collaborative, true);
  assert.equal(buildFeedPreview([collab], account, account.handle, 'future').filter(tile => tile.id === 'collab').length, 1);
});

test('unlinked accounts never borrow another account’s schedule or screenshot assets', () => {
  assert.deepEqual(buildFeedPreview([post('private')], undefined, '@dragonballhuntpr', 'future'), []);
  assert.equal(findFeedAccount([account, dragon], ' 4EIGNLABZ '), account);
  assert.equal(findFeedAccount([account], dragon.handle), undefined);
});
