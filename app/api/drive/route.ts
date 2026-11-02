import {createDriveService, safeError} from '@/lib/drive/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return await createDriveService().list(request); } catch (error) { return safeError(error); }
}
