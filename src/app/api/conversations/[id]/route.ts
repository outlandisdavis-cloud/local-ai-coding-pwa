import { db } from '@/db';
import { conversations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getConversation, jsonError } from '@/lib/server/workspace';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; return Response.json(await getConversation(id)); }
  catch { return jsonError('Conversation not found.', 404); }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; await db.delete(conversations).where(eq(conversations.id, id)); return Response.json({ ok: true }); }
  catch { return jsonError('Could not delete the conversation.'); }
}
