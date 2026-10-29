import { db } from '@/db';
import { conversations, messages } from '@/db/schema';
import { getProject, getConversation, jsonError } from '@/lib/server/workspace';
import { agentResponse } from '@/lib/server/agent';
import { eq } from 'drizzle-orm';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const body = await request.json(); await getProject(body.projectId);
    const content = String(body.message || '').trim();
    if (!content || content.length > 32000) return jsonError('Enter a message between 1 and 32,000 characters.');
    const mode = ['agent', 'ask', 'plan'].includes(body.mode) ? body.mode : 'agent';
    let conversationId = body.conversationId;
    if (conversationId) {
      const { conversation } = await getConversation(conversationId);
      if (conversation.projectId !== body.projectId) return jsonError('Conversation does not belong to this project.', 403);
      await db.update(conversations).set({ mode }).where(eq(conversations.id, conversationId));
    } else {
      const [conversation] = await db.insert(conversations).values({ projectId: body.projectId, title: content.slice(0, 65), mode }).returning();
      conversationId = conversation.id;
    }
    await db.insert(messages).values({ conversationId, role: 'user', content });
    return agentResponse(conversationId, body.activeFile, undefined, request.signal);
  } catch (error) { return jsonError(error instanceof Error ? error.message : 'Could not start the conversation.'); }
}
