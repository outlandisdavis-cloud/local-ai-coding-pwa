import { db } from '@/db';
import { files, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getProject, getFiles, safePath, languageFor, jsonError } from '@/lib/server/workspace';
export async function POST(request: Request) {
  try {
    const body = await request.json(); await getProject(body.projectId);
    const path = safePath(body.path);
    if ((await getFiles(body.projectId)).length >= 150) return jsonError('This project has reached its 150-file limit.');
    if ((await getFiles(body.projectId)).some(f => f.path === path)) return jsonError('A file with that path already exists.', 409);
    const content = typeof body.content === 'string' ? body.content : '';
    if (Buffer.byteLength(content) > 250_000) return jsonError('Keep files under 250 KB.');
    const [file] = await db.insert(files).values({ projectId: body.projectId, path, content, language: languageFor(path) }).returning();
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, body.projectId));
    return Response.json({ file }, { status: 201 });
  } catch (error) { return jsonError(error instanceof Error ? error.message : 'Could not create the file.'); }
}
