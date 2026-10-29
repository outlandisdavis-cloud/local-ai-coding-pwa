import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3000';
let originalSettings, testProject, savedKeySeen = false;
const mock = createServer(async (req, res) => {
  if (req.headers.authorization === 'Bearer temporary-test-key') savedKeySeen = true;
  if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'forge-smoke-model' }] })); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  console.log('MOCK REQUEST', req.url, 'authorization:', req.headers.authorization || '(none)');
  if (req.headers.authorization === 'Bearer temporary-test-key') savedKeySeen = true;
  const user = [...body.messages].reverse().find(m => m.role === 'user')?.content || '';
  const toolResults = body.messages.filter(m => m.role === 'tool');
  let content = '', call;
  if (user.startsWith('Plan:')) {
    assert.equal(body.tools.length, 2);
    if (!toolResults.length) call = { id: 'plan-read', name: 'read_file', arguments: JSON.stringify({ path: 'README.md' }) };
    else content = 'Plan: inspect the timer, then improve accessibility.';
  } else if (!body.tools) content = 'This is a **streamed** response from the compatible API.';
  else if (toolResults.some(m => { try { return JSON.parse(m.content).declined; } catch { return false; } })) content = 'Understood. No changes were made.';
  else if (!toolResults.length) call = { id: 'smoke-write', name: 'write_file', arguments: JSON.stringify({ path: user.includes('declined') ? 'declined.js' : 'agent-test.js', content: 'console.log("Agent tool works");\n' }) };
  else if (toolResults.length === 1 && !user.includes('declined')) call = { id: 'smoke-run', name: 'run_code', arguments: JSON.stringify({ path: 'agent-test.js' }) };
  else content = 'Created and executed the file successfully.';
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (call) {
    send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments.slice(0, 12) } }] } }] });
    send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: call.arguments.slice(12) } }] } }] });
    send({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
  } else {
    for (const part of content.match(/.{1,12}/gs) || []) send({ choices: [{ index: 0, delta: { content: part } }] });
    send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
  }
  res.end('data: [DONE]\n\n');
});
async function request(path, body, method) {
  const response = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}
async function stream(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const events = []; let buffer = '';
  for await (const chunk of response.body) {
    buffer += Buffer.from(chunk).toString(); const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) if (line.startsWith('data: ')) { const event = JSON.parse(line.slice(6)); events.push(event); if (event.type === 'error') throw new Error(event.message); }
  }
  return events;
}
try {
  await new Promise(resolve => mock.listen(18080, '127.0.0.1', resolve));
  assert.equal((await request('/api/health')).ok, true);
  originalSettings = await request('/api/settings');
  assert(!('apiKey' in originalSettings), 'API keys must never be returned to clients');
  const checked = await request('/api/runtime', { endpoint: 'http://127.0.0.1:18080/v1', apiKey: 'temporary-test-key' });
  console.log('MODEL DISCOVERY', JSON.stringify(checked), 'key received:', savedKeySeen);
  assert(checked.connected && checked.models.includes('forge-smoke-model') && savedKeySeen);
  console.log('PASS: health, model discovery, server-side API key handling');
  const workspace = await request('/api/workspace', { name: `forge-smoke-${Date.now()}`, template: 'blank' });
  testProject = workspace.project.id; const projectId = testProject;
  const created = await request('/api/files', { projectId, path: 'hello.py', content: 'print("Python integration works")\n' });
  const js = await request('/api/files', { projectId, path: 'hello.js', content: 'console.log("JavaScript integration works");\n' });
  const python = await request('/api/execute', { projectId, fileId: created.file.id });
  assert.equal(python.exitCode, 0); assert.match(python.stdout, /Python integration works/);
  const javascript = await request('/api/execute', { projectId, fileId: js.file.id });
  assert.equal(javascript.exitCode, 0); assert.match(javascript.stdout, /JavaScript integration works/);
  const shell = await request('/api/execute', { projectId, command: 'printf "Shell integration works"' });
  assert.equal(shell.exitCode, 0); assert.equal(shell.stdout, 'Shell integration works'); assert.equal(shell.command, 'printf "Shell integration works"');
  const unsafe = await fetch(base + '/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, path: '../escape.txt' }) });
  assert.equal(unsafe.status, 400);
  const renamed = await request(`/api/files/${created.file.id}`, { path: 'renamed.py', content: 'print("Renamed and saved")\n' }, 'PATCH');
  assert.equal(renamed.file.path, 'renamed.py');
  await request(`/api/files/${created.file.id}`, undefined, 'DELETE');
  console.log('PASS: project/file CRUD, path validation, Python, JavaScript, shell execution');
  await request('/api/settings', { ...originalSettings, provider: 'llama', endpoint: 'http://127.0.0.1:18080/v1', model: 'forge-smoke-model', autoApprove: false }, 'PUT');
  const first = await stream('/api/chat', { projectId, message: 'Create and run a test file', mode: 'agent', activeFile: 'hello.js' });
  const conversationId = first.find(e => e.type === 'done').conversationId;
  assert.equal(first.find(e => e.type === 'done').status, 'waiting_approval');
  let files = (await request(`/api/workspace?projectId=${projectId}`)).files;
  assert(!files.some(f => f.path === 'agent-test.js'), 'Writes must not execute before approval');
  const second = await stream('/api/chat/approve', { conversationId, callId: 'smoke-write', approved: true });
  assert.equal(second.find(e => e.type === 'done').status, 'waiting_approval');
  files = (await request(`/api/workspace?projectId=${projectId}`)).files;
  assert(files.some(f => f.path === 'agent-test.js'));
  assert(!files.some(f => f.path === 'agent-test.js' && f.content === ''), 'Agent must write exact content');
  const third = await stream('/api/chat/approve', { conversationId, callId: 'smoke-run', approved: true });
  assert.equal(third.find(e => e.type === 'done').status, 'complete');
  assert(third.some(e => e.type === 'tool' && e.call.id === 'smoke-run' && e.result?.includes('Agent tool works')));
  assert(third.filter(e => e.type === 'delta').map(e => e.content).join('').includes('successfully'));
  const history = await request(`/api/conversations/${conversationId}`);
  assert.equal(history.history.filter(m => m.role === 'tool').length, 2);
  console.log('PASS: streamed tool calls, write approval, execution approval, continuation, saved history');
  const declined = await stream('/api/chat', { projectId, message: 'Write a declined test file', mode: 'agent' });
  const declinedId = declined.find(e => e.type === 'done').conversationId;
  const no = await stream('/api/chat/approve', { conversationId: declinedId, callId: 'smoke-write', approved: false });
  assert(no.some(e => e.type === 'delta' && e.content?.includes('No changes')));
  assert(!(await request(`/api/workspace?projectId=${projectId}`)).files.some(f => f.path === 'declined.js'));
  const ask = await stream('/api/chat', { projectId, message: 'Explain this code', mode: 'ask' });
  assert(ask.some(e => e.type === 'delta'));
  const plan = await stream('/api/chat', { projectId, message: 'Plan: improve this project', mode: 'plan' });
  assert(plan.some(e => e.type === 'tool' && e.call.function.name === 'read_file' && e.result));
  assert.equal(plan.find(e => e.type === 'done').status, 'complete');
  console.log('PASS: declined actions, Ask mode, read-only Plan mode');
  const timedOut = await request('/api/execute', { projectId, command: 'sleep 20' });
  assert.notEqual(timedOut.exitCode, 0); assert.match(timedOut.stderr, /15-second time limit/); assert(timedOut.duration < 18000);
  console.log('PASS: execution timeout and process cleanup');
  for (const asset of ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/monaco/vs/loader.js', '/sw.js']) {
    const response = await fetch(base + asset); assert.equal(response.status, 200, asset);
  }
  console.log('PASS: PWA manifest, icons, service worker, locally hosted Monaco');
  console.log('ALL API SMOKE CHECKS PASSED');
} finally {
  if (originalSettings) await request('/api/settings', originalSettings, 'PUT').catch(() => {});
  if (testProject) await request(`/api/projects/${testProject}`, undefined, 'DELETE').catch(() => {});
  await new Promise(resolve => mock.close(resolve));
}
