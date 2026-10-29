'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, ArrowUpRight, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, Code2, Copy, Cpu, FileCode2, History, LoaderCircle, LockKeyhole, MessageSquare, MoreHorizontal, Plus, Route, ShieldCheck, Sparkles, Square, Terminal, Trash2, Wrench, X, CircleAlert, Bug, Lightbulb } from 'lucide-react';
import { api, readStream, copyText } from '@/lib/client';
import type { AgentMode, Conversation, Message, Settings, RuntimeStatus, StreamEvent, ToolCall } from '@/lib/types';

type ChatMessage = Message & { streaming?: boolean };
const toolLabels: Record<string, string> = { read_file: 'Read file', write_file: 'Write file', list_files: 'List project files', run_code: 'Run code' };
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="message-code"><div><span>{language || 'code'}</span><button title="Copy code" onClick={() => copyText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {})}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button></div><pre><code>{code}</code></pre></div>;
}
function Markdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: ({ className, children }) => { const text = String(children ?? ''); const language = /language-(\w+)/.exec(className || '')?.[1]; return language || text.includes('\n') ? <CodeBlock code={text.replace(/\n$/, '')} language={language || ''} /> : <code className="inline-code">{children}</code>; }, a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{content}</ReactMarkdown>;
}
function ToolCard({ call, result, busy, onApprove }: { call: ToolCall; result?: ChatMessage; busy: boolean; onApprove: (call: ToolCall, approved: boolean) => void }) {
  let args: { path?: string; content?: string } = {}; try { args = JSON.parse(call.function.arguments); } catch { /* Show raw arguments below. */ }
  let parsed: { error?: string; declined?: boolean; exitCode?: number } = {}; try { parsed = result ? JSON.parse(result.content) : {}; } catch { /* Plain tool result. */ }
  const needsApproval = !result && ['write_file', 'run_code'].includes(call.function.name);
  const Icon = call.function.name === 'run_code' ? Terminal : call.function.name === 'list_files' ? MoreHorizontal : FileCode2;
  return <div className={`tool-card ${needsApproval && !busy ? 'needs-approval' : ''}`}>
    <details><summary><Icon size={13} /><span>{toolLabels[call.function.name] || call.function.name}</span><code>{args.path || 'project'}</code>{result ? parsed.error || parsed.exitCode ? <CircleAlert size={13} className="text-amber-400" /> : <CheckCircle2 size={13} className="text-emerald-400" /> : busy ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldCheck size={13} className="text-amber-400" />}<ChevronRight size={12} className="tool-chevron" /></summary><div className="tool-details">{args.content !== undefined && <pre>{args.content.slice(0, 12000)}</pre>}{!args.content && !result && <pre>{call.function.arguments}</pre>}{result && <pre>{result.content.slice(0, 12000)}</pre>}</div></details>
    {needsApproval && !busy && <div className="approval-actions"><span>Your approval is required</span><div><button onClick={() => onApprove(call, false)}><X size={12} />Skip</button><button className="approve" onClick={() => onApprove(call, true)}><Check size={12} />Allow once</button></div></div>}
  </div>;
}

type Props = { projectId: string; activeFile?: string; settings: Settings; runtime: RuntimeStatus | null; mode: AgentMode; setMode: (mode: AgentMode) => void; conversationId: string | null; setConversationId: (id: string | null) => void; conversations: Conversation[]; onConversations: () => void; onFilesChanged: () => Promise<void>; onRunResult: (result: string) => void; openModels: () => void; ensureSaved: () => Promise<void>; notify: (message: string) => void };
export default function Assistant(props: Props) {
  const { projectId, activeFile, settings, runtime, mode, setMode, conversationId, setConversationId, conversations, onConversations, onFilesChanged, onRunResult, openModels, ensureSaved, notify } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [includeFile, setIncludeFile] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abortRef.current?.abort(); }; }, []);
  useEffect(() => {
    if (streamingRef.current) return;
    let cancelled = false;
    if (!conversationId) { setMessages([]); return; }
    setLoadingHistory(true);
    api<{ conversation: Conversation; history: ChatMessage[] }>(`/api/conversations/${conversationId}`).then(data => { if (!cancelled) { setMessages(data.history); setMode(data.conversation.mode as AgentMode); } }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [conversationId]);
  useEffect(() => {
    if (messages.length || busy) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    else bottomRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [messages, busy]);
  useEffect(() => { setMessages([]); setError(''); setConversationId(null); setDraft(''); }, [projectId]);

  async function stream(url: string, body: unknown) {
    setError(''); setBusy(true); streamingRef.current = true;
    const abort = new AbortController(); abortRef.current = abort;
    setMessages(previous => [...previous, { id: 'streaming', role: 'assistant', content: '', streaming: true }]);
    let changed = false;
    const onEvent = (event: StreamEvent) => {
      if (event.type === 'conversation' && event.conversationId) setConversationId(event.conversationId);
      if (event.type === 'delta') setMessages(previous => {
        const copy = [...previous]; let index = copy.findLastIndex(m => m.streaming);
        if (index < 0) { copy.push({ id: `assistant-${Date.now()}`, role: 'assistant', content: '', streaming: true }); index = copy.length - 1; }
        copy[index] = { ...copy[index], content: copy[index].content + (event.content || '') }; return copy;
      });
      if ((event.type === 'tool' || event.type === 'approval') && event.call) {
        const call = event.call;
        setMessages(previous => {
          let copy: ChatMessage[] = previous.map(m => ({ ...m, streaming: false }));
          let assistantIndex = copy.findLastIndex(m => m.role === 'assistant');
          if (assistantIndex < 0) { copy.push({ id: `tools-${Date.now()}`, role: 'assistant', content: '' }); assistantIndex = copy.length - 1; }
          const assistant = copy[assistantIndex];
          if (!assistant.toolCalls?.some(c => c.id === call.id)) copy[assistantIndex] = { ...assistant, toolCalls: [...(assistant.toolCalls || []), call] };
          if (event.result !== undefined) {
            const index = copy.findIndex(m => m.role === 'tool' && m.toolCallId === call.id);
            const result: ChatMessage = { id: `result-${call.id}`, role: 'tool', toolCallId: call.id, content: event.result };
            if (index >= 0) copy[index] = result; else copy.push(result);
          }
          return copy;
        });
        if (event.filesChanged) changed = true;
        if (event.result && call.function.name === 'run_code') onRunResult(event.result);
      }
      if (event.type === 'done') { if (event.conversationId) setConversationId(event.conversationId); if (event.message) notify(event.message); }
      if (event.type === 'error') setError(event.message || 'The model could not finish this response.');
    };
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal });
      await readStream(response, onEvent, abort.signal);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'The connection was interrupted.'); else setError('Generation stopped. Your conversation is saved.'); }
    finally { streamingRef.current = false; setBusy(false); abortRef.current = null; setMessages(previous => previous.map(m => ({ ...m, streaming: false }))); onConversations(); if (changed) await onFilesChanged(); }
  }
  async function send() {
    if (!draft.trim() || busy) return;
    const text = draft.trim(); setDraft(''); setHistoryOpen(false);
    try { await ensureSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Save your files before sending.'); setDraft(text); return; }
    setMessages(previous => [...previous, { id: `user-${Date.now()}`, role: 'user', content: text }]);
    await stream('/api/chat', { projectId, conversationId, message: text, mode, activeFile: includeFile ? activeFile : undefined });
  }
  async function approve(call: ToolCall, approved: boolean) {
    if (busy) return;
    try { await ensureSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Save your files first.'); return; }
    await stream('/api/chat/approve', { conversationId, callId: call.id, approved, activeFile });
  }
  function newChat() { abortRef.current?.abort(); streamingRef.current = false; setBusy(false); setConversationId(null); setMessages([]); setError(''); setHistoryOpen(false); textareaRef.current?.focus(); }
  function selectChat(id: string) { abortRef.current?.abort(); streamingRef.current = false; setBusy(false); setConversationId(id); setHistoryOpen(false); setError(''); }
  const connected = runtime?.connected;
  return <aside className="assistant-panel">
    <div className="assistant-heading"><div><Sparkles size={16} /><h2>Assistant</h2><span className="beta-badge">LOCAL AI</span></div><div className="flex items-center gap-1"><button className={`icon-button ${historyOpen ? 'selected' : ''}`} title="Conversation history" aria-label="Conversation history" onClick={() => setHistoryOpen(v => !v)}><History size={16} /></button><button className="icon-button" title="New conversation" aria-label="New conversation" onClick={newChat}><Plus size={17} /></button></div></div>
    <div className="assistant-controls"><div className="mode-switch" role="tablist" aria-label="Assistant mode">{([{ value: 'agent', icon: Bot, label: 'Agent' }, { value: 'ask', icon: MessageSquare, label: 'Ask' }, { value: 'plan', icon: Route, label: 'Plan' }] as const).map(item => <button key={item.value} role="tab" aria-selected={mode === item.value} className={mode === item.value ? 'active' : ''} onClick={() => setMode(item.value)} title={item.value === 'agent' ? 'Build with project tools and approval' : item.value === 'ask' ? 'Chat without changing files' : 'Read your project and create a plan'}><item.icon size={13} />{item.label}</button>)}</div><button className="model-selector" onClick={openModels}><Cpu size={13} /><span>{settings.model || (connected ? 'Select a model' : 'Connect a local model')}</span><span className={`status-dot ${connected ? 'green' : 'amber'}`} /><ChevronDown size={12} /></button></div>
    <div className="assistant-scroll">
      {loadingHistory ? <div className="centered-loading"><LoaderCircle className="animate-spin" size={20} />Loading conversation</div> : messages.length === 0 ? <div className="assistant-welcome">
        <div className="assistant-mark"><Sparkles size={26} strokeWidth={1.5} /><span /></div>
        <span className="eyebrow">A LITTLE HELP. A LOT OF POSSIBILITY.</span>
        <h3>Big ideas.<br />Local intelligence.</h3>
        <p>Your thinking partner, right at home.<br />Ask a question. Build a feature.<br />Make something that matters.</p>
        {!connected && <div className="connect-card"><div className="connect-card-title"><Cpu size={16} /><span>Your machine. Your model.</span></div><p>Connect llama.cpp or any OpenAI-compatible backend to get started.</p><button onClick={openModels}>Connect a model<ArrowUpRight size={14} /></button></div>}
        {connected && <div className="connected-note"><CheckCircle2 size={14} /><span>Model connected. Let’s make something.</span></div>}
        <div className="prompt-suggestions"><span className="eyebrow">A GOOD PLACE TO START</span>{[{ icon: FileCode2, text: 'Explain this file', prompt: 'Explain this file and how the different parts work together.' }, { icon: Bug, text: 'Help me find a bug', prompt: 'Review my current file for bugs and suggest focused fixes.' }, { icon: Lightbulb, text: 'Let’s build something', prompt: 'Suggest a small, useful feature for this project and help me build it.' }].map(item => <button key={item.text} onClick={() => { setDraft(item.prompt); textareaRef.current?.focus(); }}><item.icon size={14} /><span>{item.text}</span><ArrowUpRight size={12} /></button>)}</div>
      </div> : <div className="chat-messages">{messages.map((message, index) => {
        if (message.role === 'tool') return null;
        if (message.role === 'user') return <div className="user-message" key={message.id}><div className="message-label"><span className="user-avatar">Y</span>You</div><div className="user-bubble">{message.content}</div></div>;
        if (!message.content && !message.toolCalls?.length && !message.streaming) return null;
        return <div className="assistant-message" key={message.id || index}><div className="message-label"><Sparkles size={13} /><span>Forge</span><span className="message-model">{settings.provider === 'llama' ? 'LOCAL MODEL' : 'CONNECTED MODEL'}</span></div>{message.content && <div className="markdown"><Markdown content={message.content} /></div>}{message.streaming && !message.content && <div className="thinking"><span /><span /><span /><small>Thinking with {settings.model || 'your model'}…</small></div>}{message.toolCalls?.map(call => <ToolCard key={call.id} call={call} result={messages.find(m => m.role === 'tool' && m.toolCallId === call.id)} busy={busy} onApprove={approve} />)}</div>;
      })}</div>}
      {error && <div className="chat-error" role="alert"><CircleAlert size={15} /><div><p>{error}</p><button onClick={openModels}>Check model connection <ArrowUpRight size={11} /></button></div><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={12} /></button></div>}
      <div ref={bottomRef} />
    </div>
    <div className="composer-area"><div className="composer"><div className="composer-context">{includeFile && activeFile ? <span><Code2 size={12} /><span>{activeFile.split('/').pop()}</span><button title="Remove file context" aria-label="Remove file context" onClick={() => setIncludeFile(false)}><X size={10} /></button></span> : <button className="add-context" onClick={() => setIncludeFile(true)}><Plus size={12} />Add file context</button>}<span className="context-label">CONTEXT</span></div><textarea ref={textareaRef} aria-label="Message your assistant" placeholder={mode === 'plan' ? 'What should we plan?' : mode === 'ask' ? 'What would you like to know?' : 'What would you like to build?'} value={draft} onChange={event => setDraft(event.target.value)} maxLength={32000} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (busy) return; void send(); } }} /><div className="composer-bottom"><button className="icon-button" title={includeFile ? 'Current file is attached' : 'Attach current file'} aria-label="Attach current file" onClick={() => setIncludeFile(v => !v)}><Plus size={17} /></button><span className="composer-hint">{busy ? 'Working on it…' : 'Enter to send'}</span><button className={`send-button ${busy ? 'stop' : ''}`} title={busy ? 'Stop generation' : 'Send message'} aria-label={busy ? 'Stop generation' : 'Send message'} onClick={() => busy ? abortRef.current?.abort() : void send()} disabled={!busy && !draft.trim()}>{busy ? <Square size={12} fill="currentColor" /> : <ArrowUp size={18} />}</button></div></div><div className="assistant-privacy"><ShieldCheck size={11} /><span>{mode === 'agent' ? settings.autoApprove ? 'Auto-approval enabled' : 'You’re in control. Always.' : mode === 'plan' ? 'A clear plan before the first change.' : 'Just a conversation. No file changes.'}</span><button onClick={openModels} title="Agent settings" aria-label="Agent settings"><Wrench size={11} /></button></div><div className="local-privacy"><LockKeyhole size={10} />{settings.endpoint.includes('127.0.0.1') || settings.endpoint.includes('localhost') ? 'Local by default. Private by design.' : 'Requests use your configured endpoint.'}</div></div>
    {historyOpen && <div className="history-panel"><div className="history-heading"><h3>Conversations</h3><button className="icon-button" aria-label="Close history" onClick={() => setHistoryOpen(false)}><X size={16} /></button></div><button className="history-new" onClick={newChat}><Plus size={14} />New conversation</button><div className="history-list">{conversations.length ? conversations.map(chat => <div className={`history-item ${conversationId === chat.id ? 'active' : ''}`} key={chat.id}><button onClick={() => selectChat(chat.id)}><MessageSquare size={14} /><span>{chat.title}<small>{new Date(chat.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {chat.mode}</small></span></button><button className="icon-button" title="Delete conversation" aria-label={`Delete ${chat.title}`} onClick={() => { if (!window.confirm('Delete this conversation? This cannot be undone.')) return; if (chat.id === conversationId) newChat(); api(`/api/conversations/${chat.id}`, { method: 'DELETE' }).then(onConversations).catch(e => notify(e.message)); }}><Trash2 size={13} /></button></div>) : <div className="history-empty"><History size={24} /><p>A fresh start.</p><span>Your conversations will appear here.</span></div>}</div></div>}
  </aside>;
}
