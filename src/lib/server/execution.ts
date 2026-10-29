import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { db } from '@/db';
import { executionRuns } from '@/db/schema';
import { getFiles, safePath } from './workspace';

export type Execution = { stdout: string; stderr: string; exitCode: number | null; duration: number; filename: string; language: string; command: string };
export async function executeCode(projectId: string, filename: string, code: string, signal?: AbortSignal, displayCommand?: string): Promise<Execution> {
  filename = safePath(filename);
  const ext = extname(filename).toLowerCase();
  const language = ext === '.py' ? 'python' : ['.js', '.mjs', '.cjs'].includes(ext) ? 'javascript' : ext === '.sh' ? 'shell' : '';
  if (!language) throw new Error('This file runs in the browser preview. Server execution supports .js, .mjs, .cjs, .py, and .sh files.');
  if (Buffer.byteLength(code) > 500_000) throw new Error('Keep executable files under 500 KB.');
  const dir = await mkdtemp(join(tmpdir(), 'forge-run-'));
  const started = Date.now();
  let stdout = '', stderr = '', timedOut = false, aborted = false;
  const collect = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(0, 65_536);
  try {
    const projectFiles = await getFiles(projectId);
    if (projectFiles.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0) > 4_000_000) throw new Error('Project exceeds the 4 MB execution limit.');
    await Promise.all(projectFiles.map(async file => {
      const safe = safePath(file.path);
      const target = join(dir, safe);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, safe === filename ? code : file.content);
    }));
    const target = join(dir, filename);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, code);
    const command = language === 'python' ? 'python3' : language === 'shell' ? 'bash' : process.execPath;
    const args = language === 'python' ? ['-I', '-u', target] : language === 'shell' ? [target] : [target];
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn('bash', ['-c', 'ulimit -t 12; ulimit -f 32768; exec "$@"', '--', command, ...args], {
        cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: dir, LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1', NODE_ENV: 'development' },
      });
      const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } } };
      const abort = () => { aborted = true; kill(); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timeout = setTimeout(() => { timedOut = true; kill(); }, 15_000);
      child.stdout.on('data', chunk => { stdout = collect(stdout, chunk); });
      child.stderr.on('data', chunk => { stderr = collect(stderr, chunk); });
      child.on('error', error => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); reject(error); });
      child.on('close', code => {
        clearTimeout(timeout); signal?.removeEventListener('abort', abort);
        if (timedOut) stderr += '\nExecution stopped: 15-second time limit reached.';
        if (aborted) stderr += '\nExecution cancelled.';
        resolve(code);
      });
    });
    const result = { stdout, stderr, exitCode, duration: Date.now() - started, filename, language, command: displayCommand || `${language === 'python' ? 'python3' : language === 'shell' ? 'bash' : 'node'} ${filename}` };
    await db.insert(executionRuns).values({ projectId, ...result });
    return result;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export function executeTerminal(projectId: string, command: string, signal?: AbortSignal) {
  if (!command.trim() || command.length > 10_000) throw new Error('Enter a command under 10,000 characters.');
  return executeCode(projectId, '.forge-terminal.sh', command, signal, command);
}
