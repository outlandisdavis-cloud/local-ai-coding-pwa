import { db } from '@/db';
import { files } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getProject, jsonError } from '@/lib/server/workspace';
import { executeCode, executeTerminal } from '@/lib/server/execution';
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const body = await request.json(); await getProject(body.projectId);
    if (typeof body.command === 'string') return Response.json(await executeTerminal(body.projectId, body.command, request.signal));
    const [file] = await db.select().from(files).where(and(eq(files.id, body.fileId), eq(files.projectId, body.projectId)));
    if (!file) return jsonError('File not found.', 404);
    const code = typeof body.code === 'string' ? body.code : file.content;
    return Response.json(await executeCode(body.projectId, file.path, code, request.signal));
  } catch (error) { return jsonError(error instanceof Error ? error.message : 'Execution failed.'); }
}
