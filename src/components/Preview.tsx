'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe, LockKeyhole, Monitor, Smartphone, RotateCw, Maximize2, Code2, Play, Pause, FileCode2 } from 'lucide-react';
import { makePreview } from '@/lib/client';
import type { ProjectFile } from '@/lib/types';
export type ConsoleMessage = { id: string; level: string; message: string; time: string };
export default function Preview({ files, activeFile, refreshKey, onConsole, onRun, notify }: { files: ProjectFile[]; activeFile?: ProjectFile; refreshKey: number; onConsole: (entry: ConsoleMessage) => void; onRun: () => void; notify: (message: string) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const callback = useRef(onConsole); callback.current = onConsole;
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [auto, setAuto] = useState(true);
  const [renderFiles, setRenderFiles] = useState(files);
  const [revision, setRevision] = useState(0);
  const firstFile = files.find(f => f.path === 'index.html')?.path || files.find(f => f.path.endsWith('.html'))?.path;
  const currentHtml = activeFile?.path.endsWith('.html') ? activeFile.path : firstFile;
  useEffect(() => { if (!auto) return; const timeout = setTimeout(() => setRenderFiles(files), 650); return () => clearTimeout(timeout); }, [files, auto]);
  useEffect(() => { setRenderFiles(files); }, [refreshKey]);
  const html = useMemo(() => makePreview(renderFiles, currentHtml), [renderFiles, currentHtml, revision]);
  const documentKey = useMemo(() => { let hash = 0; for (let index = 0; index < html.length; index++) hash = (Math.imul(31, hash) + html.charCodeAt(index)) | 0; return hash.toString(36); }, [html]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.source !== 'forge-preview') return;
      callback.current({ id: crypto.randomUUID(), level: String(event.data.level || 'log'), message: String(event.data.message), time: new Date().toLocaleTimeString('en-GB') });
    };
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
  }, []);
  const refresh = () => { setRenderFiles(files); setRevision(v => v + 1); };
  const external = () => { const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); const opened = window.open(url, '_blank'); if (!opened) notify('Allow pop-ups to open the preview in a new tab.'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  return <div className="preview-panel" ref={panelRef}>
    <div className="preview-heading"><div className="flex items-center gap-2"><Globe size={14} /><span>Live preview</span><span className={`live-dot ${auto ? '' : 'paused'}`} /></div><div className="flex items-center gap-1"><button className={`icon-button ${device === 'desktop' ? 'selected' : ''}`} title="Desktop preview" aria-label="Desktop preview" onClick={() => setDevice('desktop')}><Monitor size={14} /></button><button className={`icon-button ${device === 'mobile' ? 'selected' : ''}`} title="Mobile preview · 320px" aria-label="Mobile preview" onClick={() => setDevice('mobile')}><Smartphone size={14} /></button><span className="tiny-divider" /><button className="icon-button" title="Refresh preview" aria-label="Refresh preview" onClick={refresh}><RotateCw size={13} /></button><button className="icon-button" title="Expand preview" aria-label="Expand preview" onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => notify('Could not exit full screen.')); else panelRef.current?.requestFullscreen().catch(() => notify('Full screen is unavailable in this browser.')); }}><Maximize2 size={13} /></button></div></div>
    <div className="preview-address"><LockKeyhole size={10} /><span>{currentHtml || 'No HTML file'}</span><button className={`auto-refresh ${auto ? 'enabled' : ''}`} onClick={() => setAuto(v => !v)} title={auto ? 'Pause automatic refresh' : 'Resume automatic refresh'}>{auto ? <Play size={9} fill="currentColor" /> : <Pause size={9} />}<span>Auto-refresh</span></button></div>
    {html ? <div className={`preview-canvas ${device}`}><iframe key={`${revision}-${documentKey}`} ref={iframeRef} title="Live application preview" srcDoc={html} sandbox="allow-scripts allow-forms allow-modals allow-popups" referrerPolicy="no-referrer" /></div> : <div className="empty-preview"><div className="empty-preview-icon"><FileCode2 size={30} strokeWidth={1.3} /></div><h3>{activeFile?.language === 'python' ? 'Made to run locally.' : activeFile?.language === 'markdown' ? 'A place for the big picture.' : 'See your ideas come to life.'}</h3><p>{activeFile?.language === 'python' ? 'Run this Python file to see its output in the terminal below.' : activeFile?.language === 'markdown' ? 'Open an HTML file to see a live preview, or read this project guide in the editor.' : 'Create an index.html file to start a live browser preview.'}</p>{activeFile?.language === 'python' ? <button className="button primary small" onClick={onRun}><Play size={12} />Run Python</button> : <span className="subtle-label"><Code2 size={13} />HTML + CSS + JavaScript</span>}</div>}
    <div className="preview-footer"><span><span className="status-dot green" />{device === 'mobile' ? '320 px · Mobile' : 'Responsive viewport'}</span><button onClick={external} disabled={!html}>Open preview <Maximize2 size={10} /></button></div>
  </div>;
}
