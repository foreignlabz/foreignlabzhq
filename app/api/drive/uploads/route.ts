import {createDriveService, safeError} from '@/lib/drive/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { return await createDriveService().begin(request); } catch (error) { return safeError(error); }
}
