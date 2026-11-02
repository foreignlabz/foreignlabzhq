import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

export const DRIVE_FOLDER = '1pOnNBSINkaiBiAH3wSovr7V3AO4ziNRn';
export const CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_BYTES = 5 * 1024 * 1024 * 1024;
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
export class DriveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type UploadMetadata = {name: string; mimeType: string; size: number};
export type UploadTicket = {url: string; uploadId: string; userId: string; workspaceId: string; total: number; expires: number};

export function validateUpload(input: unknown): UploadMetadata {
  if (!input || typeof input !== 'object') throw new DriveError(400, 'Provide file metadata.');
  const {name, mimeType, size} = input as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\x00-\x1f]/.test(name)) throw new DriveError(400, 'Use a valid filename.');
  if (typeof mimeType !== 'string' || !MEDIA_TYPES.includes(mimeType)) throw new DriveError(400, 'Use JPG, PNG, WebP, MP4, or WebM.');
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) throw new DriveError(400, 'Choose a file between 1 byte and 5 GiB.');
  return {name: name.trim(), mimeType, size};
}
export function validateChunk(range: string | null, total: number, length: number) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range ?? '');
  if (!match) throw new DriveError(400, 'A valid Content-Range is required.');
  const [start, end, declaredTotal] = match.slice(1).map(Number);
  if (![start, end, declaredTotal].every(Number.isSafeInteger) || start < 0 || end < start || declaredTotal !== total || end >= total || end - start + 1 !== length || length > CHUNK_BYTES || (end + 1 < total && length % (256 * 1024) !== 0)) throw new DriveError(400, 'Invalid upload chunk.');
  return {start, end};
}
export function assertGoogleUploadURL(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new DriveError(502, 'Invalid upload session.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || url.port || url.username || url.password || !url.pathname.startsWith('/upload/drive/')) throw new DriveError(502, 'Invalid upload session destination.');
  return value;
}
function ticketKey(secret: string) {
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) throw new DriveError(503, 'Drive upload encryption is not configured.');
  return key;
}
export function sealTicket(ticket: UploadTicket, secret: string): string {
  assertGoogleUploadURL(ticket.url);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ticketKey(secret), nonce);
  const payload = Buffer.concat([cipher.update(JSON.stringify(ticket), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), payload]).toString('base64url');
}
export function openTicket(value: string, secret: string, userId: string, workspaceId: string, uploadId: string): UploadTicket {
  try {
    if (value.length > 10000) throw new Error();
    const buffer = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', ticketKey(secret), buffer.subarray(0, 12));
    cipher.setAuthTag(buffer.subarray(12, 28));
    const result = JSON.parse(Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString()) as UploadTicket;
    if (result.userId !== userId || result.workspaceId !== workspaceId || result.uploadId !== uploadId || !Number.isSafeInteger(result.total) || result.total <= 0 || result.total > MAX_BYTES || result.expires < Date.now()) throw new Error();
    assertGoogleUploadURL(result.url);
    return result;
  } catch { throw new DriveError(403, 'Upload session expired or invalid. Start a new upload.'); }
}
export function assertFileScope(file: {parents?: string[]; size?: string; mimeType?: string; trashed?: boolean}, expected?: UploadMetadata) {
  if (file.trashed || !file.parents?.includes(DRIVE_FOLDER)) throw new DriveError(403, 'This file is outside the content workspace.');
  if (expected && (Number(file.size) !== expected.size || file.mimeType !== expected.mimeType)) throw new DriveError(502, 'Uploaded file verification failed.');
}
export function nextOffset(range: string | null): number {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  if (!match) throw new DriveError(502, 'Drive returned an invalid upload offset.');
  return Number(match[1]) + 1;
}
