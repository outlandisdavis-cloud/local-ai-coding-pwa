import { db } from '@/db';
import { files, messages, projects } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSettings, getFiles, getConversation, safePath, languageFor, apiHeaders } from './workspace';
import { executeCode } from './execution';
import type { AgentMode, Message, ToolCall, StreamEvent } from '@/lib/types';

const tools = [
  { name: 'list_files', description: 'List all file paths in the current project.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'read_file', description: 'Read the current contents of a project file.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative project file path' } }, required: ['path'], additionalProperties: false } },
  { name: 'write_file', description: 'Create or replace a project file with the complete new contents. Requires user approval.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  { name: 'run_code', description: 'Execute a saved JavaScript (.js), Python (.py), or shell (.sh) project file on the host. Requires user approval.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
];
const definitions = tools.map(tool => ({ type: 'function', function: tool }));
const restricted = new Set(['write_file', 'run_code']);

async function executeTool(projectId: string, call: ToolCall, mode: AgentMode, signal?: AbortSignal) {
  const name = call.function.name;
  if (!tools.some(t => t.name === name)) throw new Error(`Unknown tool: ${name}`);
  if (mode !== 'agent' && restricted.has(name)) throw new Error('This tool is only available in Agent mode.');
  const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
  if (name === 'list_files') return JSON.stringify({ files: (await getFiles(projectId)).map(f => f.path) });
  const path = safePath(args.path);
  const projectFiles = await getFiles(projectId);
  const file = projectFiles.find(f => f.path === path);
  if (name === 'read_file') {
    if (!file) return JSON.stringify({ error: 'File not found', path });
    return JSON.stringify({ path, content: file.content.slice(0, 70_000), truncated: file.content.length > 70_000 });
  }
  if (name === 'write_file') {
    if (typeof args.content !== 'string' || Buffer.byteLength(args.content) > 250_000) throw new Error('File content must be a string under 250 KB.');
    if (projectFiles.length >= 150 && !file) throw new Error('This workspace supports up to 150 files per project.');
    const values = { projectId, path, content: args.content, language: languageFor(path), updatedAt: new Date() };
    await db.insert(files).values(values).onConflictDoUpdate({ target: [files.projectId, files.path], set: { content: values.content, language: values.language, updatedAt: values.updatedAt } });
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
    return JSON.stringify({ success: true, path, bytes: Buffer.byteLength(args.content) });
  }
  if (name === 'run_code') {
    if (!file) throw new Error('Save the file before running it.');
    const result = await executeCode(projectId, path, file.content, signal);
    return JSON.stringify(result);
  }
  throw new Error('Unsupported tool.');
}

export function agentResponse(conversationId: string, activeFile?: string, decision?: { callId: string; approved: boolean }, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => { if (!closed) { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { closed = true; } } };
      try {
        const config = await getSettings();
        const { conversation, history } = await getConversation(conversationId);
        const mode = conversation.mode as AgentMode;
        const projectFiles = await getFiles(conversation.projectId);
        const active = projectFiles.find(f => f.path === activeFile);
        const context = `Project files: ${projectFiles.map(f => f.path).join(', ') || 'Empty project'}.${active ? `\nThe user is viewing ${active.path}:\n\`\`\`${active.language}\n${active.content.slice(0, 18_000)}\n\`\`\`` : ''}\nUse tools for current file contents before editing. Never invent execution results. ${mode === 'plan' ? 'Create a plan; do not modify files or execute code.' : ''}`;
        let transcript: Message[] = history.map(m => ({ id: m.id, role: m.role, content: m.content, toolCalls: m.toolCalls as ToolCall[] | null, toolCallId: m.toolCallId }));
        const save = async (message: Omit<Message, 'id'>) => {
          const [row] = await db.insert(messages).values({ conversationId, role: message.role, content: message.content, toolCalls: message.toolCalls || null, toolCallId: message.toolCallId || null }).returning();
          transcript.push({ ...message, id: row.id });
        };
        if (decision) {
          const assistant = [...transcript].reverse().find(m => m.role === 'assistant' && m.toolCalls?.some(c => c.id === decision.callId));
          const call = assistant?.toolCalls?.find(c => c.id === decision.callId);
          if (!call || transcript.some(m => m.role === 'tool' && m.toolCallId === decision.callId)) throw new Error('This tool call has already been handled.');
          emit({ type: 'tool', call, status: decision.approved ? 'running' : 'declined' });
          let result: string;
          if (!decision.approved) result = JSON.stringify({ declined: true, message: 'The user declined this action. Do not repeat it without asking.' });
          else {
            try { result = await executeTool(conversation.projectId, call, mode, signal); }
            catch (error) { result = JSON.stringify({ error: error instanceof Error ? error.message : 'Tool failed.' }); }
          }
          await save({ role: 'tool', content: result, toolCallId: call.id });
          emit({ type: 'tool', call, result, status: 'complete', filesChanged: call.function.name === 'write_file' });
        }
        for (let turn = 0; turn < 8; turn++) {
          if (signal?.aborted) break;
          const lastAssistant = [...transcript].reverse().find(m => m.role === 'assistant');
          const pending = lastAssistant?.toolCalls?.filter(c => !transcript.some(m => m.role === 'tool' && m.toolCallId === c.id)) || [];
          if (pending.length) {
            let paused = false;
            for (const call of pending) {
              if (restricted.has(call.function.name) && !config.autoApprove && mode === 'agent') {
                emit({ type: 'approval', call, conversationId }); paused = true; break;
              }
              emit({ type: 'tool', call, status: 'running' });
              let result: string;
              try { result = await executeTool(conversation.projectId, call, mode, signal); }
              catch (error) { result = JSON.stringify({ error: error instanceof Error ? error.message : 'Tool failed.' }); }
              await save({ role: 'tool', content: result, toolCallId: call.id });
              emit({ type: 'tool', call, result, status: 'complete', filesChanged: call.function.name === 'write_file' });
            }
            if (paused) { emit({ type: 'done', status: 'waiting_approval', conversationId }); return; }
            continue;
          }
          if (config.provider === 'openai' && !config.model) throw new Error('Choose an OpenAI model in Models before sending a message.');
          const apiMessages: unknown[] = [{ role: 'system', content: `${config.systemPrompt}\n\n${context}` }];
          let budget = Math.max(4000, config.contextSize * 3);
          const recent = transcript.slice(-40).reverse();
          const selected: Message[] = [];
          for (const m of recent) { const size = m.content.length + JSON.stringify(m.toolCalls || []).length; if (budget - size < 0 && selected.length) break; budget -= size; selected.unshift(m); }
          // Never begin the request with an orphan tool result.
          while (selected[0]?.role === 'tool') selected.shift();
          for (const m of selected) {
            if (m.role === 'tool') apiMessages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
            else if (m.role === 'assistant' && m.toolCalls?.length) apiMessages.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls });
            else apiMessages.push({ role: m.role, content: m.content });
          }
          const availableTools = mode === 'agent' ? definitions : mode === 'plan' ? definitions.slice(0, 2) : [];
          const response = await fetch(`${config.endpoint}/chat/completions`, {
            method: 'POST', headers: apiHeaders(config), signal,
            body: JSON.stringify({ model: config.model || 'local-model', messages: apiMessages, stream: true, temperature: config.temperature, max_tokens: config.maxTokens, ...(availableTools.length ? { tools: availableTools, tool_choice: 'auto', parallel_tool_calls: false } : {}) }),
          });
          if (!response.ok) {
            const raw = await response.text();
            let detail = raw.slice(0, 450);
            try { const parsed = JSON.parse(raw); detail = parsed.error?.message || parsed.message || detail; } catch { /* Keep plain-text error. */ }
            throw new Error(`Model server returned ${response.status}: ${detail}`);
          }
          if (!response.body) throw new Error('The model server returned an empty stream.');
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '', content = '', finishReason = '';
          const calls = new Map<number, ToolCall>();
          const consume = (line: string) => {
            if (!line.startsWith('data:')) return;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') return;
            let chunk;
            try { chunk = JSON.parse(data); } catch { return; }
            if (chunk.error) throw new Error(chunk.error.message || 'The model stopped unexpectedly.');
            const choice = chunk.choices?.[0];
            if (!choice) return;
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const delta = choice.delta || {};
            if (typeof delta.content === 'string') { content += delta.content; emit({ type: 'delta', content: delta.content }); }
            for (const part of delta.tool_calls || []) {
              const index = part.index ?? 0;
              const existing = calls.get(index) || { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
              existing.id += part.id || '';
              existing.function.name += part.function?.name || '';
              existing.function.arguments += part.function?.arguments || '';
              calls.set(index, existing);
            }
          };
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n'); buffer = lines.pop() || '';
              lines.forEach(line => consume(line.trimEnd()));
            }
            if (buffer.trim()) consume(buffer.trim());
          } finally { reader.releaseLock(); }
          const toolCalls = [...calls.values()].map((c, index) => ({ ...c, id: c.id || `call_${turn}_${index}`, function: { ...c.function, arguments: c.function.arguments || '{}' } })).filter(c => c.function.name);
          if (!content && !toolCalls.length) throw new Error('The server returned no text. Check that the selected model is loaded and supports chat completions.');
          await save({ role: 'assistant', content, toolCalls: toolCalls.length ? toolCalls : null });
          if (!toolCalls.length || finishReason === 'stop' && !calls.size) { emit({ type: 'done', status: 'complete', conversationId }); return; }
        }
        emit({ type: 'done', status: 'complete', message: 'Agent step limit reached. Send a message to continue.', conversationId });
      } catch (error) {
        if (!signal?.aborted) {
          const message = error instanceof Error && error.name !== 'TypeError' ? error.message : 'Cannot reach the model server. Start llama.cpp, then check the API URL in Models.';
          emit({ type: 'error', message: signal?.aborted ? 'Generation stopped.' : message });
        }
      } finally { closed = true; try { controller.close(); } catch { /* Client disconnected. */ } }
    },
  }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}

export async function pendingCall(conversationId: string, callId: string) {
  const { history } = await getConversation(conversationId);
  return history.some(m => m.role === 'assistant' && (m.toolCalls as ToolCall[] | null)?.some(c => c.id === callId)) && !history.some(m => m.role === 'tool' && m.toolCallId === callId);
}
export async function hasProjectFile(projectId: string, fileId: string) {
  return Boolean((await db.select({ id: files.id }).from(files).where(and(eq(files.id, fileId), eq(files.projectId, projectId)))).length);
}
