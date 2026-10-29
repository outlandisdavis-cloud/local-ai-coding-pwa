import { db } from '@/db';
import { projects, files, settings, conversations, messages, executionRuns } from '@/db/schema';
import { eq, asc, desc } from 'drizzle-orm';
import { starterFiles } from '@/lib/starter';
import type { Settings } from '@/lib/types';

export const runtime = 'nodejs';
export function jsonError(message: string, status = 400) { return Response.json({ error: message }, { status }); }
export function safePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 180 || /[\\<>\x00-\x1f]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Use a relative file path without ../ or special characters.');
  return value.trim();
}
export function languageFor(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  return ({ html: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', json: 'json', md: 'markdown', sh: 'shell', txt: 'plaintext' } as Record<string, string>)[ext || ''] || 'plaintext';
}
let initialization: Promise<void> | undefined;
export async function ensureWorkspace() {
  if (!initialization) initialization = (async () => {
    await db.insert(settings).values({ id: 'local' }).onConflictDoNothing();
    const existing = await db.select().from(projects).limit(1);
    if (!existing.length) {
      const [project] = await db.insert(projects).values({ name: 'focus-timer', description: 'A little space to do great things.' }).returning();
      await db.insert(files).values(starterFiles.map(file => ({ ...file, projectId: project.id })));
    }
  })().catch(error => { initialization = undefined; throw error; });
  await initialization;
}
export async function getSettings() {
  await ensureWorkspace();
  const [row] = await db.select().from(settings).where(eq(settings.id, 'local'));
  return row;
}
export function publicSettings(row: Awaited<ReturnType<typeof getSettings>>): Settings {
  const { apiKey: _key, id: _id, ...rest } = row;
  return { ...rest, hasApiKey: Boolean(row.apiKey || process.env.LLAMA_API_KEY || process.env.OPENAI_API_KEY) };
}
export function normalizeEndpoint(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter an HTTP(S) API base URL without credentials or query parameters.');
  return url.href.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';
}
export function apiHeaders(row: Awaited<ReturnType<typeof getSettings>>) {
  const key = row.apiKey || (row.provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.LLAMA_API_KEY) || '';
  return { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };
}
export async function getProject(id: string) {
  await ensureWorkspace();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) throw new Error('Project not found.');
  return project;
}
export async function getFiles(projectId: string) { return db.select().from(files).where(eq(files.projectId, projectId)).orderBy(asc(files.path)); }
export async function getConversation(id: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conversation) throw new Error('Conversation not found.');
  const history = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt), asc(messages.id));
  return { conversation, history };
}
export async function workspaceResponse(projectId?: string | null) {
  await ensureWorkspace();
  const allProjects = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  const project = allProjects.find(p => p.id === projectId) || allProjects[0];
  const [projectFiles, config, chats, runs] = await Promise.all([
    getFiles(project.id), getSettings(),
    db.select().from(conversations).where(eq(conversations.projectId, project.id)).orderBy(desc(conversations.createdAt)),
    db.select().from(executionRuns).where(eq(executionRuns.projectId, project.id)).orderBy(desc(executionRuns.createdAt)).limit(25),
  ]);
  return { projects: allProjects, project, files: projectFiles, settings: publicSettings(config), conversations: chats, runs };
}
