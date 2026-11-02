import {createDriveService, safeError} from '@/lib/drive/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function PUT(request: Request, context: {params: Promise<{id: string}>}) {
  try { return await createDriveService().chunk(request, (await context.params).id); } catch (error) { return safeError(error); }
}
