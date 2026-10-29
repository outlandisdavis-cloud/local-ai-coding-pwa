import { db } from '@/db';
import { files, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { safePath, languageFor, jsonError } from '@/lib/server/workspace';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [existing] = await db.select().from(files).where(eq(files.id, id));
    if (!existing) return jsonError('File not found.', 404);
    const body = await request.json();
    const content = body.content === undefined ? existing.content : body.content;
    if (typeof content !== 'string' || Buffer.byteLength(content) > 250_000) return jsonError('File content must be text under 250 KB.');
    const path = body.path === undefined ? existing.path : safePath(body.path);
    if (path !== existing.path && (await db.select().from(files).where(eq(files.projectId, existing.projectId))).some(f => f.path === path)) return jsonError('A file with that path already exists.', 409);
    const [file] = await db.update(files).set({ content, path, language: languageFor(path), updatedAt: new Date() }).where(eq(files.id, id)).returning();
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, existing.projectId));
    return Response.json({ file });
  } catch (error) { return jsonError(error instanceof Error ? error.message : 'Could not save the file.'); }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; await db.delete(files).where(eq(files.id, id)); return Response.json({ ok: true }); }
  catch { return jsonError('Could not delete the file.'); }
}
