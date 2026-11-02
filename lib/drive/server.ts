import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {publicSupabaseConfig} from '../public-config';
import {assertFileScope, assertGoogleUploadURL, CHUNK_BYTES, DRIVE_FOLDER, DriveError, nextOffset, openTicket, sealTicket, validateChunk, validateUpload, type UploadMetadata} from './protocol';

type Context = {userId: string; workspaceId: string; role: string; client: SupabaseClient; admin: SupabaseClient};
type Environment = Record<string, string | undefined>;
type Dependencies = {env?: Environment; fetcher?: typeof fetch; authenticate?: (request: Request) => Promise<Context>};
const JSON_HEADERS = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
const editors = new Set(['owner', 'manager', 'collaborator']);
export function json(data: unknown, status = 200) { return Response.json(data, {status, headers: JSON_HEADERS}); }
export function safeError(error: unknown): Response {
  return json({error: error instanceof DriveError ? error.message : 'The media operation could not be completed. Please retry.'}, error instanceof DriveError ? error.status : 500);
}
function must(result: {error: unknown}) { if (result.error) throw new DriveError(503, 'Drive metadata is unavailable. Verify the reviewed schema and server configuration.'); }
function validId(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new DriveError(400, 'Invalid media identifier.'); }
export async function smallJSON(request: Request) {
  const body = await limitedBody(request, 8192);
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new DriveError(400, 'Invalid request body.'); }
}
async function limitedBody(request: Request, max: number): Promise<Uint8Array> {
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const {done, value} = await reader.read(); if (done) break; length += value.length; if (length > max) { await reader.cancel(); throw new DriveError(413, 'Request exceeds the permitted chunk size.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
}

export function createDriveService(deps: Dependencies = {}) {
  const env = deps.env ?? process.env; const fetcher = deps.fetcher ?? fetch;
  function enabled() { if (env.HQ_STAGING_DEMO === 'true' || env.HQ_DRIVE_ENABLED !== 'true') throw new DriveError(503, 'Google Drive is not connected. Local preview files stay in this browser session.'); }
  function configuration() {
    enabled();
    for (const key of ['HQ_GOOGLE_CLIENT_ID', 'HQ_GOOGLE_CLIENT_SECRET', 'HQ_GOOGLE_REFRESH_TOKEN', 'HQ_UPLOAD_ENCRYPTION_KEY', 'HQ_SUPABASE_SERVICE_ROLE_KEY']) if (!env[key]) throw new DriveError(503, 'Drive server configuration is incomplete.');
    if (Buffer.from(env.HQ_UPLOAD_ENCRYPTION_KEY!, 'base64').length !== 32) throw new DriveError(503, 'Drive upload encryption is not configured.');
  }
  async function authorize(request: Request, write = false): Promise<Context> {
    enabled();
    let context: Context;
    if (deps.authenticate) context = await deps.authenticate(request);
    else {
      const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
      if (!bearer) throw new DriveError(401, 'Sign in to access private media.');
      configuration();
      const {url, publishableKey} = publicSupabaseConfig(); if (!url || !publishableKey) throw new DriveError(503, 'Workspace authentication is not configured.');
      const client = createClient(url, publishableKey, {global: {headers: {Authorization: `Bearer ${bearer}`}}, auth: {persistSession: false, autoRefreshToken: false}});
      const {data: {user}, error} = await client.auth.getUser(bearer);
      if (error || !user || !user.email_confirmed_at) throw new DriveError(401, 'A verified session is required.');
      const memberships = await client.from('workspace_members').select('workspace_id,role').eq('user_id', user.id);
      if (memberships.error || memberships.data?.length !== 1) throw new DriveError(403, 'Workspace membership is required.');
      const row = memberships.data[0];
      if (!['owner', 'manager', 'collaborator', 'brand_member'].includes(row.role)) throw new DriveError(403, 'Workspace access denied.');
      const admin = createClient(url, env.HQ_SUPABASE_SERVICE_ROLE_KEY!, {auth: {persistSession: false, autoRefreshToken: false}});
      context = {userId: user.id, workspaceId: row.workspace_id, role: row.role, client, admin};
    }
    if (write && !editors.has(context.role)) throw new DriveError(403, 'Your role has read-only media access.');
    return context;
  }
  async function token() {
    configuration();
    const response = await fetcher('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'refresh_token', client_id: env.HQ_GOOGLE_CLIENT_ID!, client_secret: env.HQ_GOOGLE_CLIENT_SECRET!, refresh_token: env.HQ_GOOGLE_REFRESH_TOKEN!}), redirect: 'error', cache: 'no-store'});
    if (!response.ok) throw new DriveError(503, 'Google Drive authorization is unavailable.');
    const body = await response.json(); if (typeof body.access_token !== 'string') throw new DriveError(503, 'Google Drive authorization is unavailable.'); return body.access_token as string;
  }
  async function asset(context: Context, id: string) {
    validId(id); const result = await context.admin.from('hq_drive_assets').select('*').eq('id', id).eq('workspace_id', context.workspaceId).single();
    if (result.error || !result.data) throw new DriveError(404, 'Media was not found in this workspace.'); return result.data;
  }
  async function inspectFile(fileId: string, accessToken: string, expected?: UploadMetadata) {
    if (!/^[\w-]+$/.test(fileId)) throw new DriveError(502, 'Invalid Drive file identifier.');
    const response = await fetcher(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,parents,trashed&supportsAllDrives=true`, {headers: {Authorization: `Bearer ${accessToken}`}, redirect: 'error', cache: 'no-store'});
    if (!response.ok) throw new DriveError(502, 'Unable to verify the private original.');
    const file = await response.json(); assertFileScope(file, expected); return file;
  }
  return {
    async list(request: Request) {
      const context = await authorize(request);
      const result = await context.admin.from('hq_drive_assets').select('id,name,mime_type,size_bytes,created_at').eq('workspace_id', context.workspaceId).eq('state', 'complete').order('created_at', {ascending: false}); must(result);
      const associations = await context.admin.from('hq_drive_post_media').select('asset_id,post_id').eq('workspace_id', context.workspaceId); must(associations);
      return json({assets: result.data, associations: associations.data});
    },
    async begin(request: Request) {
      const context = await authorize(request, true); const metadata = validateUpload(await smallJSON(request)); const accessToken = await token();
      const response = await fetcher('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id', {method: 'POST', headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': metadata.mimeType, 'X-Upload-Content-Length': String(metadata.size)}, body: JSON.stringify({name: metadata.name, parents: [DRIVE_FOLDER]}), redirect: 'error', cache: 'no-store'});
      if (!response.ok) throw new DriveError(502, 'Could not start the Drive upload.');
      const url = assertGoogleUploadURL(response.headers.get('location') ?? ''); const id = crypto.randomUUID();
      const result = await context.admin.from('hq_drive_assets').insert({id, workspace_id: context.workspaceId, uploaded_by: context.userId, name: metadata.name, mime_type: metadata.mimeType, size_bytes: metadata.size, state: 'pending'}); must(result);
      const ticket = sealTicket({url, uploadId: id, userId: context.userId, workspaceId: context.workspaceId, total: metadata.size, expires: Date.now() + 24 * 60 * 60 * 1000}, env.HQ_UPLOAD_ENCRYPTION_KEY!);
      return json({id, ticket, chunkBytes: CHUNK_BYTES}, 201);
    },
    async chunk(request: Request, id: string) {
      const context = await authorize(request, true); const row = await asset(context, id);
      const ticket = openTicket(request.headers.get('x-hq-upload-token') ?? '', env.HQ_UPLOAD_ENCRYPTION_KEY ?? '', context.userId, context.workspaceId, id);
      if (row.uploaded_by !== context.userId || ticket.total !== Number(row.size_bytes)) throw new DriveError(403, 'This upload belongs to another session.');
      if (row.state === 'complete') return json({complete: true, id, offset: Number(row.size_bytes)});
      const statusOnly = request.headers.get('x-hq-upload-status') === '1';
      const bytes = statusOnly ? new Uint8Array() : await limitedBody(request, CHUNK_BYTES);
      if (!statusOnly) validateChunk(request.headers.get('content-range'), ticket.total, bytes.byteLength);
      const accessToken = await token();
      const response = await fetcher(ticket.url, {method: 'PUT', headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': row.mime_type, 'Content-Length': String(bytes.byteLength), 'Content-Range': statusOnly ? `bytes */${ticket.total}` : request.headers.get('content-range')!}, body: Buffer.from(bytes), redirect: 'manual', cache: 'no-store'});
      if (response.status === 308) return json({complete: false, id, offset: nextOffset(response.headers.get('range'))});
      if (!response.ok) throw new DriveError(response.status === 404 ? 410 : 502, 'Upload interrupted. Resume to check the saved position, or start again if expired.');
      const final = await response.json();
      if (typeof final.id !== 'string') throw new DriveError(502, 'Drive did not confirm the uploaded file.');
      await inspectFile(final.id, accessToken, {name: row.name, mimeType: row.mime_type, size: Number(row.size_bytes)});
      const update = await context.admin.from('hq_drive_assets').update({drive_file_id: final.id, state: 'complete'}).eq('id', id).eq('workspace_id', context.workspaceId); must(update);
      return json({complete: true, id, offset: ticket.total});
    },
    async download(request: Request, id: string) {
      const context = await authorize(request); const row = await asset(context, id);
      if (row.state !== 'complete' || !row.drive_file_id) throw new DriveError(409, 'This upload is not complete.');
      const accessToken = await token(); await inspectFile(row.drive_file_id, accessToken);
      const headers: Record<string, string> = {Authorization: `Bearer ${accessToken}`}; const range = request.headers.get('range');
      if (range) { if (!/^bytes=\d*-\d*$/.test(range) || range === 'bytes=-') throw new DriveError(416, 'Use one valid byte range.'); headers.Range = range; }
      const response = await fetcher(`https://www.googleapis.com/drive/v3/files/${row.drive_file_id}?alt=media&supportsAllDrives=true`, {headers, redirect: 'error', cache: 'no-store'});
      if (!response.ok) throw new DriveError(response.status === 416 ? 416 : 502, 'The private original could not be downloaded.');
      const output = new Headers(JSON_HEADERS); output.set('Content-Type', row.mime_type); output.set('Content-Disposition', `${new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(row.name)}`);
      for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) if (response.headers.has(name)) output.set(name, response.headers.get(name)!);
      return new Response(response.body, {status: response.status, headers: output});
    },
    async associate(request: Request, remove = false) {
      const context = await authorize(request, true); const body = await smallJSON(request); validId(body.assetId); validId(body.postId);
      const row = await asset(context, body.assetId); if (row.state !== 'complete') throw new DriveError(409, 'Finish uploading before attaching the file.');
      const post = await context.client.from('content_posts').select('id,status').eq('id', body.postId).eq('workspace_id', context.workspaceId).single();
      if (post.error || !post.data) throw new DriveError(404, 'Post was not found in this workspace.');
      if (context.role !== 'owner' && ['approved', 'published'].includes(post.data.status)) throw new DriveError(403, 'Only an owner can change approved content.');
      const relation = {workspace_id: context.workspaceId, post_id: body.postId, asset_id: body.assetId};
      const result = remove ? await context.admin.from('hq_drive_post_media').delete().match(relation) : await context.admin.from('hq_drive_post_media').upsert(relation, {onConflict: 'post_id,asset_id'}); must(result);
      return json({ok: true, originalPreserved: true});
    }
  };
}
