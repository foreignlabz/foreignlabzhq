import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createDriveService, safeError} from '../lib/drive/server';
import {assertFileScope, assertGoogleUploadURL, CHUNK_BYTES, DRIVE_FOLDER, DriveError, openTicket, sealTicket, validateChunk, validateUpload} from '../lib/drive/protocol';

const key = Buffer.alloc(32, 9).toString('base64');
const env = {HQ_DRIVE_ENABLED: 'true', HQ_GOOGLE_CLIENT_ID: 'test-client', HQ_GOOGLE_CLIENT_SECRET: 'test-only-not-a-credential', HQ_GOOGLE_REFRESH_TOKEN: 'test-only-token', HQ_UPLOAD_ENCRYPTION_KEY: key, HQ_SUPABASE_SERVICE_ROLE_KEY: 'test-only-key'};
const id = '00000000-0000-4000-8000-000000000001';
const session = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test';
type Row = Record<string, unknown>;
function database(rows: Row[], mutations: {table: string; method: string; data?: unknown}[] = [], postStatus = 'draft') {
  return {from(table: string) {
    let filters: [string, unknown][] = []; let action = 'read'; let input: Row | undefined;
    const result = () => {
      if (table === 'content_posts') return {data: {id, status: postStatus}, error: null};
      const found = rows.filter(row => filters.every(([field, value]) => row[field] === value));
      if (action === 'insert' && input) rows.push({...input});
      if (action === 'update' && input) for (const row of found) Object.assign(row, input);
      return {data: found[0] ?? null, error: null};
    };
    const builder = {
      select() { return builder; }, eq(field: string, value: unknown) { filters.push([field, value]); return builder; },
      single: async () => result(),
      insert(data: Row) { action = 'insert'; input = data; mutations.push({table, method: action, data}); return builder; },
      update(data: Row) { action = 'update'; input = data; mutations.push({table, method: action, data}); return builder; },
      upsert(data: Row) { mutations.push({table, method: 'upsert', data}); return builder; },
      delete() { mutations.push({table, method: 'delete'}); return builder; },
      match(data: Row) { filters = Object.entries(data); return builder; },
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); }
    }; return builder;
  }} as unknown as SupabaseClient;
}
function context(rows: Row[], role = 'owner', mutations: {table: string; method: string; data?: unknown}[] = [], postStatus = 'draft') {
  const db = database(rows, mutations, postStatus); return {userId: 'user', workspaceId: 'workspace', role, admin: db, client: db};
}
const row = (overrides: Row = {}) => ({id, workspace_id: 'workspace', uploaded_by: 'user', name: 'original.mp4', mime_type: 'video/mp4', size_bytes: 32 * 1024 * 1024, state: 'pending', ...overrides});

test('Drive is disabled by default and performs no network call', async () => {
  let called = false; const service = createDriveService({env: {}, fetcher: async () => { called = true; throw new Error(); }});
  await assert.rejects(service.begin(new Request('http://localhost/api/drive/uploads', {method: 'POST'})), (e: DriveError) => e.status === 503);
  assert.equal(called, false);
});
test('missing authentication and read-only roles cannot upload', async () => {
  await assert.rejects(createDriveService({env}).begin(new Request('http://localhost', {method: 'POST'})), (e: DriveError) => e.status === 401);
  const service = createDriveService({env, authenticate: async () => context([], 'brand_member')});
  await assert.rejects(service.begin(new Request('http://localhost', {method: 'POST'})), (e: DriveError) => e.status === 403);
});
test('upload metadata accepts originals over 25 MiB and rejects unsafe types and size', () => {
  assert.equal(validateUpload({name: 'original.mp4', mimeType: 'video/mp4', size: 32 * 1024 * 1024}).size, 33554432);
  for (const value of [{name: 'script.svg', mimeType: 'image/svg+xml', size: 50}, {name: 'image.jpg', mimeType: 'image/jpeg', size: -1}, {name: 'image.jpg', mimeType: 'image/jpeg', size: Infinity}, {name: 'bad\r\nname', mimeType: 'image/jpeg', size: 10}]) assert.throws(() => validateUpload(value), DriveError);
});
test('chunk validation enforces total, bounded chunk size, and Google alignment', () => {
  assert.deepEqual(validateChunk('bytes 0-8388607/33554432', 33554432, CHUNK_BYTES), {start: 0, end: 8388607});
  assert.throws(() => validateChunk('bytes 0-4/100', 100, 5));
  assert.throws(() => validateChunk('bytes 0-8388608/33554432', 33554432, CHUNK_BYTES + 1));
  assert.throws(() => validateChunk('bytes 0-3/999', 100, 4));
  assert.deepEqual(validateChunk('bytes 0-4/5', 5, 5), {start: 0, end: 4});
});
test('encrypted upload tickets bind identity, workspace, upload, expiry and destination', () => {
  const ticket = {url: session, uploadId: id, userId: 'user', workspaceId: 'workspace', total: 32, expires: Date.now() + 60000};
  const sealed = sealTicket(ticket, key);
  assert.equal(sealed.includes('googleapis'), false);
  assert.deepEqual(openTicket(sealed, key, 'user', 'workspace', id), ticket);
  assert.throws(() => openTicket(sealed, key, 'outsider', 'workspace', id), DriveError);
  assert.throws(() => openTicket(sealed, key, 'user', 'other-workspace', id), DriveError);
  assert.throws(() => openTicket(sealed.slice(0, -5) + 'AAAAA', key, 'user', 'workspace', id), DriveError);
  assert.throws(() => openTicket(sealTicket({...ticket, expires: Date.now() - 1}, key), key, 'user', 'workspace', id), DriveError);
  for (const url of ['http://www.googleapis.com/upload/drive/v3/files', 'https://www.googleapis.com.evil.test/upload/drive/v3/files', 'https://user@www.googleapis.com/upload/drive/v3/files', 'https://www.googleapis.com/other']) assert.throws(() => assertGoogleUploadURL(url), DriveError);
});
test('Drive file verification rejects folder escape, trashed files and wrong size', () => {
  assert.throws(() => assertFileScope({parents: ['other-folder']}), DriveError);
  assert.throws(() => assertFileScope({parents: [DRIVE_FOLDER], trashed: true}), DriveError);
  assert.throws(() => assertFileScope({parents: [DRIVE_FOLDER], size: '10', mimeType: 'video/mp4'}, {name: 'x', size: 20, mimeType: 'video/mp4'}), DriveError);
});
test('32 MiB upload uses bounded resumable chunks and verifies final file before completion', async () => {
  const rows: Row[] = []; const mutations: {table: string; method: string; data?: unknown}[] = []; const chunkLengths: number[] = []; let received = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com')) return Response.json({access_token: 'test-access'});
    if (init?.method === 'POST') return new Response(null, {status: 200, headers: {location: session}});
    if (init?.method === 'PUT') {
      const bytes = init.body as Buffer; chunkLengths.push(bytes.byteLength); received += bytes.byteLength;
      return received < 33554432 ? new Response(null, {status: 308, headers: {range: `bytes=0-${received - 1}`}}) : Response.json({id: 'verified-file'});
    }
    return Response.json({parents: [DRIVE_FOLDER], size: '33554432', mimeType: 'video/mp4'});
  };
  const service = createDriveService({env, fetcher, authenticate: async () => context(rows, 'manager', mutations)});
  const begun = await (await service.begin(new Request('http://localhost', {method: 'POST', body: JSON.stringify({name: 'original.mp4', mimeType: 'video/mp4', size: 33554432})}))).json();
  for (let offset = 0; offset < 33554432; offset += CHUNK_BYTES) {
    const result = await (await service.chunk(new Request('http://localhost', {method: 'PUT', headers: {'X-HQ-Upload-Token': begun.ticket, 'Content-Range': `bytes ${offset}-${offset + CHUNK_BYTES - 1}/33554432`}, body: Buffer.alloc(CHUNK_BYTES)}), begun.id)).json();
    assert.equal(result.offset, offset + CHUNK_BYTES);
    assert.equal(result.complete, offset + CHUNK_BYTES === 33554432);
  }
  assert.deepEqual(chunkLengths, [CHUNK_BYTES, CHUNK_BYTES, CHUNK_BYTES, CHUNK_BYTES]);
  assert.equal(rows[0].state, 'complete'); assert.equal(rows[0].drive_file_id, 'verified-file');
  const again = await (await service.chunk(new Request('http://localhost', {method: 'PUT', headers: {'X-HQ-Upload-Token': begun.ticket}}), begun.id)).json();
  assert.equal(again.complete, true); assert.equal(chunkLengths.length, 4);
});
test('resume queries Google for the committed offset without sending the original again', async () => {
  const rows = [row()]; let sentRange = '';
  const service = createDriveService({env, authenticate: async () => context(rows), fetcher: async (url, init) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({access_token: 'test-access'});
    sentRange = new Headers(init?.headers).get('content-range')!; assert.equal((init?.body as Buffer).length, 0);
    return new Response(null, {status: 308, headers: {range: 'bytes=0-8388607'}});
  }});
  const ticket = sealTicket({url: session, uploadId: id, userId: 'user', workspaceId: 'workspace', total: 33554432, expires: Date.now() + 60000}, key);
  const result = await (await service.chunk(new Request('http://localhost', {method: 'PUT', headers: {'X-HQ-Upload-Token': ticket, 'X-HQ-Upload-Status': '1'}}), id)).json();
  assert.equal(result.offset, CHUNK_BYTES); assert.equal(sentRange, 'bytes */33554432');
});
test('cross-workspace metadata cannot be downloaded and no provider is contacted', async () => {
  let calls = 0;
  const service = createDriveService({env, authenticate: async () => context([row({workspace_id: 'other'})]), fetcher: async () => { calls++; return new Response(); }});
  await assert.rejects(service.download(new Request('http://localhost'), id), (e: DriveError) => e.status === 404); assert.equal(calls, 0);
});
test('private downloads preserve byte ranges and never enable public caching', async () => {
  const service = createDriveService({env, authenticate: async () => context([row({state: 'complete', drive_file_id: 'original'})], 'brand_member'), fetcher: async (input, init) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com')) return Response.json({access_token: 'test-access'});
    if (url.includes('fields=')) return Response.json({parents: [DRIVE_FOLDER]});
    assert.equal(new Headers(init?.headers).get('range'), 'bytes=0-3');
    return new Response(new Uint8Array([1, 2, 3, 4]), {status: 206, headers: {'Content-Range': 'bytes 0-3/33554432', 'Content-Length': '4', 'Accept-Ranges': 'bytes'}});
  }});
  const response = await service.download(new Request('http://localhost', {headers: {Range: 'bytes=0-3'}}), id);
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 0-3/33554432');
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
});
test('unlink removes only the authorized post association, never the Drive original', async () => {
  const mutations: {table: string; method: string; data?: unknown}[] = []; let calls = 0;
  const service = createDriveService({env, authenticate: async () => context([row({state: 'complete', drive_file_id: 'original'})], 'manager', mutations), fetcher: async () => { calls++; return new Response(); }});
  const result = await (await service.associate(new Request('http://localhost', {method: 'DELETE', body: JSON.stringify({assetId: id, postId: id})}), true)).json();
  assert.equal(result.originalPreserved, true); assert.equal(calls, 0); assert.deepEqual(mutations, [{table: 'hq_drive_post_media', method: 'delete'}]);
});
test('manager cannot change attachments on approved content', async () => {
  const service = createDriveService({env, authenticate: async () => context([row({state: 'complete'})], 'manager', [], 'approved')});
  await assert.rejects(service.associate(new Request('http://localhost', {method: 'POST', body: JSON.stringify({assetId: id, postId: id})})), (e: DriveError) => e.status === 403);
});
test('unexpected errors never return provider messages or secret values', async () => {
  const response = safeError(new Error('secret-provider-token')); assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('secret-provider-token'), false); assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
