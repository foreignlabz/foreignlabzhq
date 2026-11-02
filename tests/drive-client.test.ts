import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchPrivateDriveAsset, loadPostDriveAssets} from '../lib/drive/client';
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

test('demo post details never contact Drive or request an auth token', async () => {
  let called = false;
  assert.deepEqual(await loadPostDriveAssets('post', {mode: 'demo', getAccessToken: async () => { called = true; return 'token'; }, fetcher: async () => { called = true; return Response.json({}); }}), []);
  assert.equal(called, false);
  await assert.rejects(fetchPrivateDriveAsset(first, {mode: 'demo'}), /unavailable in the demo/);
});
test('only media associated with the selected post is exposed in details', async () => {
  const result = await loadPostDriveAssets('selected-post', {mode: 'production', getAccessToken: async () => 'session', fetcher: async (url, init) => {
    assert.equal(url, '/api/drive/'); assert.equal(init?.cache, 'no-store');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer session');
    return Response.json({assets: [{id: first, name: 'Private original.jpg', mime_type: 'image/jpeg', size_bytes: 100}, {id: second, name: 'Other post.jpg', mime_type: 'image/jpeg', size_bytes: 200}], associations: [{asset_id: first, post_id: 'selected-post'}, {asset_id: second, post_id: 'other-post'}]});
  }});
  assert.deepEqual(result, [{id: first, name: 'Private original.jpg', mimeType: 'image/jpeg', size: 100}]);
});
test('private previews use bearer headers and same-origin endpoint, never provider URLs', async () => {
  const blob = await fetchPrivateDriveAsset(first, {mode: 'production', getAccessToken: async () => 'session', fetcher: async (url, init) => {
    assert.equal(url, `/api/drive/files/${first}/`); assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.cache, 'no-store');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer session');
    return new Response(new Uint8Array([1,2,3]), {headers: {'Content-Type': 'image/jpeg'}});
  }});
  assert.equal(blob.type, 'image/jpeg'); assert.equal(blob.size, 3);
});
test('missing session denies private media without making a request', async () => {
  let called = false;
  await assert.rejects(loadPostDriveAssets('post', {mode: 'production', getAccessToken: async () => null, fetcher: async () => { called = true; return new Response(); }}), /verified workspace session/);
  assert.equal(called, false);
});
test('provider-disabled error stays distinct from a post with no attachments', async () => {
  await assert.rejects(loadPostDriveAssets('post', {mode: 'production', getAccessToken: async () => 'session', fetcher: async () => Response.json({error: 'Google Drive is not connected.'}, {status: 503})}), /not connected/);
});
