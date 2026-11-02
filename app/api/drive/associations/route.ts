import {createDriveService, safeError} from '@/lib/drive/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try { return await createDriveService().associate(request); } catch (error) { return safeError(error); }
}
export async function DELETE(request: Request) {
  try { return await createDriveService().associate(request, true); } catch (error) { return safeError(error); }
}
