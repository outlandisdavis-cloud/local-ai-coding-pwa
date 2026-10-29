import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { getSettings, normalizeEndpoint, jsonError } from '@/lib/server/workspace';
export const dynamic = 'force-dynamic';
async function checkPython() { return new Promise<boolean>(resolve => { const child = spawn('python3', ['--version'], { stdio: 'ignore' }); child.on('error', () => resolve(false)); child.on('close', code => resolve(code === 0)); }); }
async function probe(endpoint: string, key: string) {
  const response = await fetch(`${endpoint}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(4500), cache: 'no-store' });
  if (!response.ok) throw new Error(`The server returned HTTP ${response.status}. ${response.status === 401 ? 'Check your API key.' : 'Make sure a model is loaded.'}`);
  const data = await response.json();
  if (!Array.isArray(data.data)) throw new Error('This URL did not return an OpenAI-compatible model list.');
  return data.data.map((model: { id: string }) => String(model.id)).filter(Boolean);
}
async function status(endpoint: string, key: string) {
  const python = await checkPython();
  try { return { connected: true, models: await probe(endpoint, key), platform: platform(), node: process.version, python }; }
  catch (error) { return { connected: false, models: [], error: error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError' ? error.message : 'No model server found at this address. Start llama-server and try again.', platform: platform(), node: process.version, python }; }
}
export async function GET() {
  try { const config = await getSettings(); return Response.json(await status(config.endpoint, config.apiKey || (config.provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.LLAMA_API_KEY) || '')); }
  catch { return jsonError('Could not check the runtime.', 500); }
}
export async function POST(request: Request) {
  try { const config = await getSettings(); const body = await request.json(); const endpoint = normalizeEndpoint(body.endpoint); const key = body.apiKey || config.apiKey || process.env.LLAMA_API_KEY || process.env.OPENAI_API_KEY || ''; return Response.json(await status(endpoint, key)); }
  catch (error) { return Response.json({ connected: false, models: [], error: error instanceof Error ? error.message : 'Invalid endpoint.' }); }
}
