import { db } from '@/db';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSettings, publicSettings, normalizeEndpoint, jsonError } from '@/lib/server/workspace';
export async function GET() { try { return Response.json(publicSettings(await getSettings())); } catch { return jsonError('Could not load settings.', 500); } }
export async function PUT(request: Request) {
  try {
    const current = await getSettings(); const body = await request.json();
    const endpoint = normalizeEndpoint(String(body.endpoint || current.endpoint));
    const temperature = Number(body.temperature ?? current.temperature);
    const maxTokens = Number(body.maxTokens ?? current.maxTokens);
    const contextSize = Number(body.contextSize ?? current.contextSize);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2 || !Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 32768 || !Number.isInteger(contextSize) || contextSize < 2048 || contextSize > 131072) return jsonError('Check the generation limits: temperature 0–2, output 128–32768, context 2048–131072.');
    const provider = body.provider === 'openai' ? 'openai' : 'llama';
    const values = { endpoint, provider, temperature, maxTokens, contextSize, model: String(body.model ?? current.model).slice(0, 250), systemPrompt: String(body.systemPrompt ?? current.systemPrompt).slice(0, 8000), autoApprove: Boolean(body.autoApprove), ...(body.clearApiKey ? { apiKey: '' } : typeof body.apiKey === 'string' ? { apiKey: body.apiKey.slice(0, 5000) } : {}) };
    const [row] = await db.update(settings).set(values).where(eq(settings.id, 'local')).returning();
    return Response.json(publicSettings(row));
  } catch (error) { return jsonError(error instanceof Error ? error.message : 'Could not save settings.'); }
}
