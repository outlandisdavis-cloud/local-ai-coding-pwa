import type { ProjectFile, StreamEvent } from './types';
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}
export async function readStream(response: Response, onEvent: (event: StreamEvent) => void, signal?: AbortSignal) {
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({ error: 'The server could not complete this request.' }));
    throw new Error(data.error || 'The server could not complete this request.');
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  const processLine = (line: string) => { if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)) as StreamEvent); };
  try { while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(processLine); } if (buffer) processLine(buffer); }
  finally { reader.releaseLock(); if (signal?.aborted) await reader.cancel().catch(() => {}); }
}
export function fileColor(path: string) {
  const ext = path.split('.').pop();
  return ({ html: '#e59a72', css: '#83afd9', js: '#e4c276', ts: '#78aee0', py: '#91b8d3', md: '#9ba8b9', json: '#c5b181', sh: '#94ba93' } as Record<string, string>)[ext || ''] || '#9ba8b9';
}
export function downloadFile(content: Blob | string, filename: string, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function makePreview(projectFiles: ProjectFile[], activePath?: string) {
  const file = projectFiles.find(f => f.path === activePath && f.path.endsWith('.html')) || projectFiles.find(f => f.path === 'index.html') || projectFiles.find(f => f.path.endsWith('.html'));
  if (!file) return '';
  let html = file.content;
  const base = new URL(file.path, 'http://forge.local/');
  const resolve = (path: string) => { if (!path || /^(https?:|data:|blob:|#|\/\/)/i.test(path)) return undefined; return projectFiles.find(f => f.path === decodeURIComponent(new URL(path, base).pathname.slice(1))); };
  html = html.replace(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (match, path) => { const local = resolve(path); return local?.language === 'css' ? `<style data-forge-file="${local.path}">${local.content.replace(/<\/style/gi, '<\\/style')}</style>` : match; });
  html = html.replace(/<script\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, path) => { const local = resolve(path); return local ? `<script data-forge-file="${local.path}">${local.content.replace(/<\/script/gi, '<\\/script')}</script>` : match; });
  const capture = `<script>(function(){var send=function(level,args){try{parent.postMessage({source:'forge-preview',level:level,message:Array.from(args).map(function(v){try{return typeof v==='object'?JSON.stringify(v):String(v)}catch(e){return String(v)}}).join(' ')},'*')}catch(e){}};['log','info','warn','error'].forEach(function(level){var original=console[level];console[level]=function(){send(level,arguments);original.apply(console,arguments)}});window.addEventListener('error',function(e){send('error',[e.message+' at line '+e.lineno])});window.addEventListener('unhandledrejection',function(e){send('error',[e.reason])});})();<\/script>`;
  return html.includes('</head>') ? html.replace('</head>', `${capture}</head>`) : capture + html;
}
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); const ok = document.execCommand('copy'); area.remove(); if (!ok) throw new Error('Clipboard is unavailable. Select and copy the text manually.');
}
