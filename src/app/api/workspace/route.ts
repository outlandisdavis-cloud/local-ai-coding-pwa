import { db } from '@/db';
import { projects, files } from '@/db/schema';
import { workspaceResponse, ensureWorkspace, jsonError } from '@/lib/server/workspace';
import { starterFiles } from '@/lib/starter';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return Response.json(await workspaceResponse(new URL(request.url).searchParams.get('projectId'))); }
  catch { return jsonError('Could not open the workspace. Check your database connection.', 500); }
}
export async function POST(request: Request) {
  try {
    await ensureWorkspace();
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name || name.length > 60 || /[\\/\x00-\x1f]/.test(name)) return jsonError('Choose a project name under 60 characters.');
    const [project] = await db.insert(projects).values({ name: name.replace(/\s+/g, '-').toLowerCase(), description: 'A little space for your next big idea.' }).returning();
    const initial = body.template === 'focus' ? starterFiles : [{ path: 'README.md', language: 'markdown', content: `# ${name}\n\nYour next idea starts here.\n` }];
    await db.insert(files).values(initial.map(f => ({ ...f, projectId: project.id })));
    return Response.json(await workspaceResponse(project.id), { status: 201 });
  } catch { return jsonError('Could not create the project.'); }
}
