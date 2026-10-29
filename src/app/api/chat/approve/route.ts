import { getConversation, jsonError } from '@/lib/server/workspace';
import { agentResponse, pendingCall } from '@/lib/server/agent';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { conversation } = await getConversation(body.conversationId);
    if (typeof body.callId !== 'string' || !await pendingCall(body.conversationId, body.callId)) return jsonError('This action is no longer awaiting approval.');
    return agentResponse(conversation.id, body.activeFile, { callId: body.callId, approved: body.approved === true }, request.signal);
  } catch (error) { return jsonError(error instanceof Error ? error.message : 'Could not continue the conversation.'); }
}
