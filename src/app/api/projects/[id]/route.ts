import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getProject, jsonError, workspaceResponse } from '@/lib/server/workspace';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; await getProject(id);
    const body = await request.json(); const name = String(body.name || '').trim();
    if (!name || name.length > 60 || /[\\/\x00-\x1f]/.test(name)) return jsonError('Enter a valid project name.');
    await db.update(projects).set({ name, updatedAt: new Date() }).where(eq(projects.id, id));
    return Response.json(await workspaceResponse(id));
  } catch { return jsonError('Could not rename this project.'); }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; await getProject(id); await db.delete(projects).where(eq(projects.id, id)); return Response.json({ ok: true }); }
  catch { return jsonError('Could not delete this project.'); }
}
