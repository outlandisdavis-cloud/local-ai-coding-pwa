'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, Boxes, Check, CheckCheck, ChevronDown, ChevronRight, ChevronsDownUp, CircleAlert, CircleCheck, Clock3, Code2, CodeXml, Columns2, Command, Cpu, Download, Ellipsis, FileCode2, FilePlus2, Files, Folder, FolderOpen, GitBranch, History, Keyboard, LayoutPanelLeft, LoaderCircle, LockKeyhole, Maximize2, Monitor, PanelLeft, PanelRight, Pencil, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, SquareTerminal, Terminal, Trash2, WandSparkles, X } from 'lucide-react';
import Assistant from './Assistant';
import Preview, { type ConsoleMessage } from './Preview';
import SettingsDialog, { InstallContent, type SettingsTab } from './SettingsDialog';
import CommandPalette, { type Command as PaletteCommand } from './CommandPalette';
import Dialog from './Dialog';
import { api, downloadFile, fileColor } from '@/lib/client';
import type { AgentMode, ModalName, ProjectFile, RunResult, RuntimeStatus, Settings, ViewMode, WorkspaceData } from '@/lib/types';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false, loading: () => <div className="editor-loading"><LoaderCircle size={20} className="animate-spin" /><span>Opening your editor…</span></div> });
type TreeNode = { name: string; path: string; children: TreeNode[]; file?: ProjectFile };
function makeTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const order = ['index.html', 'styles.css', 'app.js', 'hello.py', 'README.md'];
  for (const file of [...files].sort((a, b) => { const ai = order.indexOf(a.path), bi = order.indexOf(b.path); return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.path.localeCompare(b.path); })) {
    const parts = file.path.split('/'); let level = root;
    parts.forEach((name, index) => { const path = parts.slice(0, index + 1).join('/'); let node = level.find(n => n.name === name); if (!node) { node = { name, path, children: [] }; level.push(node); } if (index === parts.length - 1) node.file = file; level = node.children; });
  }
  return root;
}
function FileIcon({ path, size = 14 }: { path: string; size?: number }) { const Icon = path.endsWith('.html') ? CodeXml : path.endsWith('.md') ? Files : FileCode2; return <Icon size={size} style={{ color: fileColor(path) }} strokeWidth={1.7} />; }
function FileTree({ nodes, activeId, onOpen, depth = 0, collapsed, toggleFolder }: { nodes: TreeNode[]; activeId?: string; onOpen: (file: ProjectFile) => void; depth?: number; collapsed: Set<string>; toggleFolder: (path: string) => void }) {
  return <>{nodes.map(node => node.file ? <button key={node.path} className={`file-tree-row ${activeId === node.file.id ? 'active' : ''}`} style={{ paddingLeft: 20 + depth * 14 }} onClick={() => onOpen(node.file!)} title={node.path}><FileIcon path={node.path} /><span>{node.name}</span>{activeId === node.file.id && <span className="active-file-dot" />}</button> : <div key={node.path}><button className="file-tree-row folder-row" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggleFolder(node.path)}>{collapsed.has(node.path) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<Folder size={14} /><span>{node.name}</span></button>{!collapsed.has(node.path) && <FileTree nodes={node.children} activeId={activeId} onOpen={onOpen} depth={depth + 1} collapsed={collapsed} toggleFolder={toggleFolder} />}</div>)}</>;
}
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function Workspace({ initialData }: { initialData: WorkspaceData }) {
  const [data, setData] = useState(initialData);
  const [project, setProject] = useState(initialData.project);
  const [files, setFiles] = useState<ProjectFile[]>(initialData.files);
  const [settings, setSettings] = useState(initialData.settings);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [activeId, setActiveId] = useState(initialData.files.find(f => f.path === 'index.html')?.id || initialData.files[0]?.id || '');
  const [openTabs, setOpenTabs] = useState<string[]>(initialData.files.filter(f => ['index.html', 'styles.css', 'app.js'].includes(f.path)).map(f => f.id));
  const [view, setView] = useState<ViewMode>('split');
  const [mode, setMode] = useState<AgentMode>('agent');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [activeNav, setActiveNav] = useState('workspace');
  const [modal, setModal] = useState<ModalName>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('connection');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [projectMenu, setProjectMenu] = useState(false);
  const [fileMenu, setFileMenu] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fileQuery, setFileQuery] = useState('');
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [terminalTab, setTerminalTab] = useState<'terminal' | 'console' | 'history'>('terminal');
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [clearedRuns, setClearedRuns] = useState<Set<string>>(new Set());
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [formatKey, setFormatKey] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [fontSize, setFontSize] = useState(12);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [switching, setSwitching] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const filesRef = useRef(files); filesRef.current = files;
  const projectRef = useRef(project); projectRef.current = project;
  const dirtyRef = useRef(new Set<string>());
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savingRef = useRef(new Map<string, Promise<void>>());
  const executionAbort = useRef<AbortController | null>(null);
  const terminalBottom = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFile = files.find(f => f.id === activeId);
  const tabs = openTabs.map(id => files.find(f => f.id === id)).filter((f): f is ProjectFile => Boolean(f));
  const tree = useMemo(() => makeTree(files.filter(f => f.path.toLowerCase().includes(fileQuery.toLowerCase()))), [files, fileQuery]);
  const notify = useCallback((text: string) => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast({ text, id: Date.now() }); toastTimer.current = setTimeout(() => setToast(null), 4500); }, []);
  const openSettings = useCallback((tab: SettingsTab = 'connection') => { setSettingsTab(tab); setModal('settings'); }, []);
  const checkRuntime = useCallback(async () => { try { setRuntime(await api<RuntimeStatus>('/api/runtime')); } catch { setRuntime({ connected: false, models: [], platform: 'linux', node: '', python: false, error: 'Forge server is unavailable.' }); } }, []);
  useEffect(() => {
    void checkRuntime(); const timer = setInterval(() => void checkRuntime(), 60000);
    if (window.matchMedia('(max-width: 900px)').matches) { setAssistantOpen(false); setView('code'); }
    if (window.matchMedia('(max-width: 600px)').matches) setSidebarOpen(false);
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installedHandler = () => { setInstalled(true); setInstallPrompt(null); notify('Forge is installed. Find it in your application menu.'); };
    window.addEventListener('beforeinstallprompt', install); window.addEventListener('appinstalled', installedHandler);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* Browser may disable service workers. */ });
    return () => { clearInterval(timer); window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', installedHandler); executionAbort.current?.abort(); };
  }, [checkRuntime, notify]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current.size) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  useEffect(() => { terminalBottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [data.runs, terminalTab, terminalCollapsed]);

  const saveFile = useCallback(async (id: string): Promise<void> => {
    const timer = saveTimers.current.get(id); if (timer) clearTimeout(timer);
    const file = filesRef.current.find(f => f.id === id); if (!file) return;
    if (savingRef.current.has(id)) { await savingRef.current.get(id); const latest = filesRef.current.find(f => f.id === id); if (!latest || latest.content === file.content) return; }
    setSaveState('saving');
    const promise = (async () => {
      try {
        const result = await api<{ file: ProjectFile }>(`/api/files/${id}`, { method: 'PATCH', body: JSON.stringify({ content: file.content, path: file.path }) });
        const latest = filesRef.current.find(f => f.id === id);
        if (latest?.content === file.content) { dirtyRef.current.delete(id); setDirty(new Set(dirtyRef.current)); setFiles(previous => previous.map(f => f.id === id ? { ...f, updatedAt: result.file.updatedAt } : f)); }
        setSaveState(dirtyRef.current.size ? 'saving' : 'saved');
      } catch (error) { setSaveState('error'); throw error; }
      finally { savingRef.current.delete(id); }
    })();
    savingRef.current.set(id, promise); return promise;
  }, []);
  const saveAll = useCallback(async () => { await Promise.all([...dirtyRef.current].map(id => saveFile(id))); }, [saveFile]);
  const updateContent = useCallback((value: string) => {
    const id = activeId; const file = filesRef.current.find(f => f.id === id); if (!file || file.content === value) return;
    setFiles(previous => previous.map(f => f.id === id ? { ...f, content: value } : f));
    dirtyRef.current.add(id); setDirty(new Set(dirtyRef.current)); setSaveState('saving');
    const old = saveTimers.current.get(id); if (old) clearTimeout(old);
    saveTimers.current.set(id, setTimeout(() => { void saveFile(id).catch(e => notify(e.message)); }, 700));
  }, [activeId, saveFile, notify]);
  const refreshFiles = useCallback(async () => {
    const next = await api<WorkspaceData>(`/api/workspace?projectId=${projectRef.current.id}`);
    if (next.project.id !== projectRef.current.id) return;
    setFiles(previous => next.files.map(file => dirtyRef.current.has(file.id) ? previous.find(f => f.id === file.id) || file : file));
    setData(previous => ({ ...previous, projects: next.projects, conversations: next.conversations, runs: next.runs }));
  }, []);
  const refreshConversations = useCallback(() => { void refreshFiles().catch(() => {}); }, [refreshFiles]);
  function openFile(file: ProjectFile) { setActiveId(file.id); setOpenTabs(previous => previous.includes(file.id) ? previous : [...previous, file.id]); setCursor({ line: 1, column: 1 }); if (window.innerWidth < 600) setSidebarOpen(false); }
  function closeTab(id: string) { const remaining = openTabs.filter(tab => tab !== id); setOpenTabs(remaining); if (activeId === id) setActiveId(remaining[remaining.length - 1] || ''); }
  async function loadProject(id: string) {
    setSwitching(true); setProjectMenu(false);
    try { await saveAll(); const next = await api<WorkspaceData>(`/api/workspace?projectId=${id}`); setData(next); setProject(next.project); setFiles(next.files); setSettings(next.settings); setActiveId(next.files.find(f => f.path === 'index.html')?.id || next.files[0]?.id || ''); setOpenTabs(next.files.slice(0, 3).map(f => f.id)); setConsoleMessages([]); setClearedRuns(new Set()); dirtyRef.current.clear(); setDirty(new Set()); setSaveState('saved'); setConversationId(null); }
    catch (e) { notify(e instanceof Error ? e.message : 'Could not switch projects.'); }
    finally { setSwitching(false); }
  }
  function showModal(next: ModalName) {
    setFormError(''); setProjectMenu(false); setFileMenu(false);
    if (next === 'new-file') setName('');
    if (next === 'new-project') { setName(''); setTemplate('blank'); }
    if (next === 'rename-file') setName(activeFile?.path || '');
    if (next === 'rename-project') setName(project.name);
    setModal(next);
  }
  async function submitName() {
    if (!name.trim() && !['delete-file', 'delete-project'].includes(modal || '')) return;
    setFormBusy(true); setFormError('');
    try {
      if (modal === 'new-file') {
        await saveAll(); const path = name.trim();
        if (files.some(f => f.path === path)) throw new Error('That file already exists.');
        const result = await api<{ file: ProjectFile }>('/api/files', { method: 'POST', body: JSON.stringify({ projectId: project.id, path, content: path.endsWith('.html') ? '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>New idea</title>\n</head>\n<body>\n  <h1>Hello, possibility.</h1>\n</body>\n</html>\n' : '' }) });
        setFiles(previous => [...previous, result.file]); openFile(result.file); notify(`${path} created.`);
      } else if (modal === 'rename-file' && activeFile) {
        await saveFile(activeFile.id); const result = await api<{ file: ProjectFile }>(`/api/files/${activeFile.id}`, { method: 'PATCH', body: JSON.stringify({ path: name.trim() }) }); setFiles(previous => previous.map(f => f.id === activeFile.id ? result.file : f)); notify('File renamed.');
      } else if (modal === 'delete-file' && activeFile) {
        const timer = saveTimers.current.get(activeFile.id); if (timer) clearTimeout(timer);
        await api(`/api/files/${activeFile.id}`, { method: 'DELETE' }); dirtyRef.current.delete(activeFile.id); setDirty(new Set(dirtyRef.current)); const remaining = files.filter(f => f.id !== activeFile.id); setFiles(remaining); closeTab(activeFile.id); notify('File deleted.');
      } else if (modal === 'new-project') {
        await saveAll(); const next = await api<WorkspaceData>('/api/workspace', { method: 'POST', body: JSON.stringify({ name: name.trim(), template }) }); setData(next); setProject(next.project); setFiles(next.files); setSettings(next.settings); setActiveId(next.files.find(f => f.path === 'index.html')?.id || next.files[0]?.id || ''); setOpenTabs(next.files.slice(0, 3).map(f => f.id)); dirtyRef.current.clear(); setDirty(new Set()); setConsoleMessages([]); setConversationId(null); notify('A fresh workspace. Make it yours.');
      } else if (modal === 'rename-project') { const next = await api<WorkspaceData>(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }); setProject(next.project); setData(next); notify('Project renamed.'); }
      else if (modal === 'delete-project') { await api(`/api/projects/${project.id}`, { method: 'DELETE' }); const next = await api<WorkspaceData>('/api/workspace'); setData(next); setProject(next.project); setFiles(next.files); setActiveId(next.files.find(f => f.path === 'index.html')?.id || next.files[0]?.id || ''); setOpenTabs(next.files.slice(0, 3).map(f => f.id)); dirtyRef.current.clear(); setDirty(new Set()); setConversationId(null); notify('Project deleted.'); }
      setModal(null);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setFormBusy(false); }
  }
  async function exportProject() {
    setProjectMenu(false);
    try { await saveAll(); const { default: JSZip } = await import('jszip'); const zip = new JSZip(); filesRef.current.forEach(file => zip.file(file.path, file.content)); downloadFile(await zip.generateAsync({ type: 'blob' }), `${project.name}.zip`); notify('Project exported. Take your ideas anywhere.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Could not export the project.'); }
  }
  async function runFile(file = activeFile) {
    if (!file || running) return;
    if (file.language === 'html' || file.language === 'css') { setPreviewKey(v => v + 1); if (view === 'code') setView('preview'); notify('Live preview refreshed.'); return; }
    if (!['javascript', 'python', 'shell'].includes(file.language)) { notify('Open an HTML, JavaScript, Python, or shell file to run it.'); return; }
    setTerminalTab('terminal'); setTerminalCollapsed(false); setRunning(true);
    const abort = new AbortController(); executionAbort.current = abort;
    try { await saveFile(file.id); const result = await api<RunResult>('/api/execute', { method: 'POST', body: JSON.stringify({ projectId: project.id, fileId: file.id, code: file.content }), signal: abort.signal }); setData(previous => ({ ...previous, runs: [result, ...previous.runs].slice(0, 25) })); notify(result.exitCode === 0 ? `${file.path} finished in ${result.duration} ms.` : `${file.path} exited with code ${result.exitCode}.`); }
    catch (e) { notify(e instanceof Error ? e.message : 'Execution failed.'); }
    finally { setRunning(false); executionAbort.current = null; }
  }
  async function runCommand(value = command) {
    if (!value.trim() || running) return;
    setCommand(''); setCommandHistory(previous => [value, ...previous.filter(c => c !== value)].slice(0, 50)); setHistoryIndex(-1); setRunning(true); setTerminalTab('terminal'); setTerminalCollapsed(false);
    const abort = new AbortController(); executionAbort.current = abort;
    try { await saveAll(); const result = await api<RunResult>('/api/execute', { method: 'POST', body: JSON.stringify({ projectId: project.id, command: value }), signal: abort.signal }); setData(previous => ({ ...previous, runs: [result, ...previous.runs].slice(0, 25) })); }
    catch (e) { notify(e instanceof Error ? e.message : 'Command failed.'); }
    finally { setRunning(false); executionAbort.current = null; }
  }
  const onConsole = useCallback((entry: ConsoleMessage) => { setConsoleMessages(previous => [...previous, entry].slice(0, 150)); if (entry.level === 'error') { setTerminalTab('console'); setTerminalCollapsed(false); } }, []);
  const onAgentRun = useCallback((raw: string) => { try { const result = JSON.parse(raw) as RunResult; if (result.filename) setData(previous => ({ ...previous, runs: [result, ...previous.runs].slice(0, 25) })); setTerminalTab('terminal'); setTerminalCollapsed(false); } catch { /* Error results stay in the tool card. */ } }, []);
  async function saveSettings(value: Settings) { const saved = await api<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(value) }); setSettings(saved); setModal(null); notify('Settings saved. You’re ready to build.'); void checkRuntime(); }
  async function install() { if (!installPrompt) { setModal('install'); return; } await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') { setInstalled(true); notify('Forge is ready on your desktop.'); } setInstallPrompt(null); }
  const actionsRef = useRef({ runFile, saveAll, exportProject }); actionsRef.current = { runFile, saveAll, exportProject };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(v => !v); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); setPaletteOpen(v => !v); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void actionsRef.current.saveAll().then(() => notify('All changes saved on your machine.')).catch(e => notify(e.message)); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !document.querySelector('dialog[open]')) { event.preventDefault(); void actionsRef.current.runFile(); }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); openSettings('agent'); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [notify, openSettings]);
  const commands: PaletteCommand[] = [
    { id: 'run', label: 'Run current file', detail: 'Execute or refresh the preview', icon: Play, shortcut: 'Ctrl ↵', action: () => void runFile() },
    { id: 'new-file', label: 'Create a new file', detail: 'Make room for another idea', icon: FilePlus2, action: () => showModal('new-file') },
    { id: 'new-project', label: 'Create a new project', detail: 'Start with a clean slate', icon: FolderOpen, action: () => showModal('new-project') },
    { id: 'models', label: 'Connect a model', detail: 'llama.cpp & OpenAI-compatible backends', icon: Cpu, action: () => openSettings('connection') },
    { id: 'settings', label: 'Workspace settings', detail: 'Generation, tools, and permissions', icon: Settings2, shortcut: 'Ctrl ,', action: () => openSettings('agent') },
    { id: 'export', label: 'Export project as ZIP', detail: 'Take your code with you', icon: Download, action: () => void exportProject() },
    { id: 'preview', label: 'Toggle live preview', detail: 'See your work in a browser', icon: Monitor, action: () => setView(v => v === 'preview' ? 'code' : 'preview') },
    { id: 'install', label: 'Install Forge', detail: 'A home on your Linux desktop', icon: ArrowDownToLine, action: () => void install() },
  ];
  const visibleRuns = data.runs.filter(run => !clearedRuns.has(run.id || ''));
  const consoleErrors = consoleMessages.filter(m => m.level === 'error').length;
  const toggleFolder = (path: string) => setCollapsed(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  return <div className={`forge-app ${sidebarOpen ? '' : 'sidebar-hidden'} ${assistantOpen ? '' : 'assistant-hidden'}`}>
    <header className="app-header"><div className="brand"><button className="brand-symbol" title="Toggle explorer" aria-label="Toggle explorer" onClick={() => setSidebarOpen(v => !v)}><CodeXml size={24} strokeWidth={2.2} /></button><span>forge<span className="brand-period">.</span></span><span className="local-badge">LOCAL</span></div><div className="header-divider" /><nav className="main-nav" aria-label="Main navigation"><button className={activeNav === 'workspace' ? 'active' : ''} onClick={() => { setActiveNav('workspace'); setAssistantOpen(false); }}><LayoutPanelLeft size={15} />Workspace</button><button className={activeNav === 'agents' ? 'active' : ''} onClick={() => { setActiveNav('agents'); setAssistantOpen(true); setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(), 100); }}><Bot size={16} />Agents</button><button onClick={() => openSettings('connection')}><Boxes size={15} />Models</button></nav><button className="global-search" onClick={() => setPaletteOpen(true)}><Search size={14} /><span>Search anything…</span><kbd>Ctrl K</kbd></button><div className="header-actions"><span className="local-mode"><ShieldCheck size={13} />Local mode</span><button className="install-button" onClick={() => void install()}>{installed ? <Check size={14} /> : <Download size={14} />}<span>{installed ? 'Installed' : 'Install app'}</span></button><button className="header-settings icon-button" title="Workspace settings" aria-label="Workspace settings" onClick={() => openSettings('agent')}><Settings2 size={18} /></button></div></header>
    <div className="project-bar"><div className="project-breadcrumb"><button className="icon-button explorer-toggle" title="Toggle file explorer" aria-label="Toggle file explorer" onClick={() => setSidebarOpen(v => !v)}><PanelLeft size={16} /></button><FolderOpen size={15} className="muted-icon" /><span className="workspace-label">Personal workspace</span><ChevronRight size={12} className="breadcrumb-chevron" /><div className="project-menu-anchor"><button className="project-selector" onClick={() => setProjectMenu(v => !v)} disabled={switching}>{switching ? <LoaderCircle size={13} className="animate-spin" /> : null}{project.name}<ChevronDown size={12} /></button>{projectMenu && <><button className="popover-dismiss" aria-label="Close project menu" onClick={() => setProjectMenu(false)} /><div className="popover project-popover"><span className="popover-label">YOUR PROJECTS</span>{data.projects.map(p => <button key={p.id} onClick={() => void loadProject(p.id)}><Folder size={14} /><span>{p.name}</span>{p.id === project.id && <Check size={13} />}</button>)}<div className="popover-divider" /><button onClick={() => showModal('new-project')}><Plus size={14} />New project</button><button onClick={() => showModal('rename-project')}><Pencil size={13} />Rename project</button><button onClick={() => void exportProject()}><Download size={13} />Export project</button><button className="danger" onClick={() => showModal('delete-project')}><Trash2 size={13} />Delete project</button></div></>}</div><span className="project-type">Personal</span></div><div className="project-actions"><span className={`save-status ${saveState}`} title={saveState === 'saved' ? 'Files are saved in your local PostgreSQL database' : 'Changes save automatically after you stop typing'}>{saveState === 'saving' ? <LoaderCircle size={12} className="animate-spin" /> : saveState === 'error' ? <CircleAlert size={13} /> : <CheckCheck size={14} />}<span>{saveState === 'saving' ? 'Saving changes…' : saveState === 'error' ? 'Save failed · retry' : 'All changes saved'}</span></span><span className="action-divider" /><button className="button subtle small new-file-button" onClick={() => showModal('new-file')}><FilePlus2 size={14} /><span>New file</span></button><button className="button secondary small export-button" onClick={() => void exportProject()}><Download size={13} /><span>Export ZIP</span></button><button className="button primary run-button" onClick={() => void runFile()} disabled={running || !activeFile} title="Run current file · Ctrl + Enter">{running ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />}<span>{running ? 'Running' : 'Run'}</span><kbd>Ctrl ↵</kbd></button></div></div>
    <main className="workspace-grid">
      {sidebarOpen && <aside className="explorer-panel"><div className="explorer-heading"><span>EXPLORER</span><div><button className="icon-button" title="New file" aria-label="New file" onClick={() => showModal('new-file')}><FilePlus2 size={14} /></button><button className="icon-button" title="Collapse folders" aria-label="Collapse folders" onClick={() => setCollapsed(new Set(files.filter(f => f.path.includes('/')).map(f => f.path.slice(0, f.path.lastIndexOf('/')))))}><ChevronsDownUp size={14} /></button><button className="icon-button" title="Project actions" aria-label="Project actions" onClick={() => setProjectMenu(v => !v)}><Ellipsis size={16} /></button></div></div><div className="file-search"><Search size={12} /><input value={fileQuery} onChange={event => setFileQuery(event.target.value)} placeholder="Search files" aria-label="Search project files" />{fileQuery ? <button aria-label="Clear file search" onClick={() => setFileQuery('')}><X size={11} /></button> : <kbd>Ctrl P</kbd>}</div><button className="project-tree-heading" onClick={() => toggleFolder('__root')}><ChevronDown size={12} className={collapsed.has('__root') ? '-rotate-90' : ''} /><FolderOpen size={14} /><strong>{project.name}</strong><span>{files.length}</span></button><div className="file-tree">{!collapsed.has('__root') && <FileTree nodes={tree} activeId={activeId} onOpen={openFile} collapsed={collapsed} toggleFolder={toggleFolder} />}{fileQuery && !tree.length && <div className="file-search-empty">No files found.<button onClick={() => setFileQuery('')}>Clear search</button></div>}</div><div className="explorer-section toolkit-section"><div className="section-heading"><span>AGENT TOOLKIT</span><button className="icon-button" title="Configure agent tools" aria-label="Configure agent tools" onClick={() => openSettings('agent')}><Settings2 size={12} /></button></div><button className="toolkit-row" onClick={() => openSettings('agent')}><Files size={14} /><span>Project files</span><small>Read & write</small></button><button className="toolkit-row" onClick={() => openSettings('agent')}><SquareTerminal size={14} /><span>Code execution</span><small className="approval-badge"><ShieldCheck size={9} />{settings.autoApprove ? 'Auto' : 'Approve'}</small></button><button className="toolkit-row" onClick={() => setView(v => v === 'preview' ? 'split' : 'preview')}><Monitor size={14} /><span>Browser preview</span><small className="sandbox-badge">Sandboxed</small></button></div><div className="explorer-section project-details"><div className="section-heading"><span>PROJECT DETAILS</span></div><div><span>Files</span><strong>{files.length}</strong></div><div><span>Project size</span><strong>{(files.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0) / 1024).toFixed(1)} KB</strong></div><div><span>Storage</span><strong><span className="status-dot green" />PostgreSQL</strong></div></div><div className="explorer-bottom"><div className="runtime-card"><div className="runtime-card-top"><div className="runtime-icon"><Cpu size={19} /></div><span className={`status-dot ${runtime?.connected ? 'green' : 'amber'}`} /></div><h3>Your local powerhouse.</h3><p>{runtime?.connected ? `${runtime.models.length} model${runtime.models.length === 1 ? '' : 's'} ready. Let’s build something.` : 'All the possibility. None of the cloud.'}</p><div className="runtime-state"><span className={`status-dot ${runtime?.connected ? 'green' : 'amber'}`} />{runtime?.connected ? 'llama.cpp connected' : runtime ? 'llama.cpp not connected' : 'Checking local runtime'}</div><button onClick={() => openSettings('connection')}>{runtime?.connected ? 'Manage models' : 'Set up local model'}<ArrowUpRight size={13} /></button></div><div className="explorer-footer"><button onClick={() => openSettings('agent')}><Settings2 size={14} />Settings</button><button title="Keyboard shortcuts" onClick={() => setModal('shortcuts')}><Keyboard size={15} /><span>Shortcuts</span></button></div></div></aside>}
      <section className="workbench"><div className="editor-tabbar"><div className="editor-tabs" role="tablist" aria-label="Open files">{tabs.map(file => <div key={file.id} className={`editor-tab ${activeId === file.id ? 'active' : ''}`}><button role="tab" aria-selected={activeId === file.id} onClick={() => openFile(file)}><FileIcon path={file.path} size={13} /><span>{file.path.split('/').pop()}</span>{dirty.has(file.id) && <span className="unsaved-dot" />}</button><button className="tab-close" title={`Close ${file.path}`} aria-label={`Close ${file.path}`} onClick={() => closeTab(file.id)}><X size={11} /></button></div>)}<button className="new-tab-button" title="Create a file" aria-label="Create a file" onClick={() => showModal('new-file')}><Plus size={14} /></button></div><div className="view-switch" aria-label="Editor layout">{([{ value: 'code', icon: Code2, label: 'Code editor' }, { value: 'split', icon: Columns2, label: 'Split editor and preview' }, { value: 'preview', icon: PanelRight, label: 'Live preview' }] as const).map(item => <button key={item.value} className={view === item.value ? 'active' : ''} title={item.label} aria-label={item.label} aria-pressed={view === item.value} onClick={() => setView(item.value)}><item.icon size={13} /></button>)}</div></div>
        <div className={`workbench-columns ${view}`}>
          {view !== 'preview' && <div className="code-pane"><div className="editor-breadcrumb"><div>{activeFile ? <><FileIcon path={activeFile.path} size={12} /><span>{activeFile.path.includes('/') ? activeFile.path.slice(0, activeFile.path.lastIndexOf('/') + 1) : ''}<strong>{activeFile.path.split('/').pop()}</strong></span></> : <span>Your next idea starts here</span>}</div><div className="editor-tools"><span className="language-label">{activeFile?.language === 'javascript' ? 'JavaScript' : activeFile?.language.toUpperCase() || 'NO FILE'}</span><button className="icon-button" title="Format document" aria-label="Format document" disabled={!activeFile || ['markdown', 'plaintext'].includes(activeFile.language)} onClick={() => { setFormatKey(v => v + 1); notify('Document formatted.'); }}><WandSparkles size={13} /></button><div className="file-menu-anchor"><button className="icon-button" title="File actions" aria-label="File actions" disabled={!activeFile} onClick={() => setFileMenu(v => !v)}><Ellipsis size={15} /></button>{fileMenu && <><button className="popover-dismiss" aria-label="Close file actions" onClick={() => setFileMenu(false)} /><div className="popover file-popover"><button onClick={() => showModal('rename-file')}><Pencil size={13} />Rename file</button><button onClick={() => { if (activeFile) downloadFile(activeFile.content, activeFile.path.split('/').pop() || 'file.txt'); setFileMenu(false); }}><Download size={13} />Download file</button><button className="danger" onClick={() => showModal('delete-file')}><Trash2 size={13} />Delete file</button></div></>}</div></div></div><div className="monaco-container">{activeFile ? <CodeEditor key={activeFile.id} file={activeFile} onChange={updateContent} onSave={() => { void saveAll().then(() => notify('All changes saved.')).catch(e => notify(e.message)); }} onCursor={(line, column) => setCursor({ line, column })} fontSize={fontSize} formatKey={formatKey} /> : <div className="empty-editor"><div className="empty-editor-logo"><CodeXml size={42} strokeWidth={1.2} /></div><span className="eyebrow">A CLEAN SLATE</span><h2>Room for your next idea.</h2><p>Open a file from the explorer, or make something new.</p><button className="button primary" onClick={() => showModal('new-file')}><Plus size={14} />Create a file</button><button className="text-action" onClick={() => setPaletteOpen(true)}>Find a file <kbd>Ctrl K</kbd></button></div>}</div></div>}
          {view !== 'code' && <Preview files={files} activeFile={activeFile} refreshKey={previewKey} onConsole={onConsole} onRun={() => void runFile()} notify={notify} />}
        </div>
        <div className={`terminal-panel ${terminalCollapsed ? 'collapsed' : ''}`}><div className="terminal-heading"><div className="terminal-tabs" role="tablist" aria-label="Output panels"><button className={terminalTab === 'terminal' ? 'active' : ''} role="tab" aria-selected={terminalTab === 'terminal'} onClick={() => { setTerminalTab('terminal'); setTerminalCollapsed(false); }}><Terminal size={13} />Terminal</button><button className={terminalTab === 'console' ? 'active' : ''} role="tab" aria-selected={terminalTab === 'console'} onClick={() => { setTerminalTab('console'); setTerminalCollapsed(false); }}><Code2 size={13} />Console{consoleMessages.length > 0 && <span className={`count-badge ${consoleErrors ? 'error' : ''}`}>{consoleMessages.length}</span>}</button><button className={terminalTab === 'history' ? 'active' : ''} role="tab" aria-selected={terminalTab === 'history'} onClick={() => { setTerminalTab('history'); setTerminalCollapsed(false); }}><History size={12} />History{data.runs.length > 0 && <span className="count-badge">{data.runs.length}</span>}</button></div><div className="terminal-actions"><span className="terminal-runtime"><span className="status-dot green" />bash</span><button className="icon-button" title="Clear output" aria-label="Clear output" onClick={() => { if (terminalTab === 'console') setConsoleMessages([]); else setClearedRuns(new Set(data.runs.map(r => r.id || ''))); }}><Trash2 size={12} /></button><button className="icon-button" title={terminalCollapsed ? 'Expand terminal' : 'Collapse terminal'} aria-label={terminalCollapsed ? 'Expand terminal' : 'Collapse terminal'} onClick={() => setTerminalCollapsed(v => !v)}><ChevronDown size={14} className={terminalCollapsed ? 'rotate-180' : ''} /></button></div></div>
        {!terminalCollapsed && <><div className="terminal-content">{terminalTab === 'terminal' && <>{visibleRuns.length === 0 ? <div className="terminal-welcome"><div><span className="terminal-forge">forge</span><span className="terminal-version">local terminal</span><span className="ready-badge"><span className="status-dot green" />Ready</span></div><p>A little command line. A lot of possibility.</p><span><Check size={11} />Workspace loaded · {files.length} files · {runtime?.python ? 'Python 3 available' : 'Node.js runtime'}</span><small>Run a file with <kbd>Ctrl ↵</kbd> or type a command below.</small></div> : visibleRuns.slice(0, 6).reverse().map((run, index) => <div className="terminal-run" key={run.id || index}><div className="terminal-command"><span>❯</span>{run.command || `${run.language === 'python' ? 'python3' : run.language === 'shell' ? 'bash' : 'node'} ${run.filename}`}<small>{run.duration} ms</small></div>{run.stdout && <pre>{run.stdout}</pre>}{run.stderr && <pre className="stderr">{run.stderr}</pre>}<div className={run.exitCode === 0 ? 'run-success' : 'run-failure'}>{run.exitCode === 0 ? <Check size={10} /> : <CircleAlert size={10} />}Process exited with code {run.exitCode ?? 'unknown'}</div></div>)}{running && <div className="terminal-running"><LoaderCircle size={12} className="animate-spin" />Running on your machine…<button onClick={() => executionAbort.current?.abort()}>Stop</button></div>}</>}{terminalTab === 'console' && <>{!consoleMessages.length ? <div className="terminal-empty"><Code2 size={20} /><span>Quiet is a good thing.</span><p>Console output and errors from your live preview appear here.</p></div> : consoleMessages.map(entry => <div className={`console-entry ${entry.level}`} key={entry.id}><span>{entry.time}</span><ChevronRight size={11} /><pre>{entry.message}</pre></div>)}</>}{terminalTab === 'history' && <>{!data.runs.length ? <div className="terminal-empty"><History size={20} /><span>Your next run starts the story.</span><p>Executed files and commands are saved here.</p></div> : data.runs.map(run => <div className="run-history-row" key={run.id}><span className={`status-dot ${run.exitCode === 0 ? 'green' : 'red'}`} /><code>{run.command || run.filename}</code><span>{run.duration} ms</span><small>{run.createdAt ? new Date(run.createdAt).toLocaleTimeString('en-GB') : ''}</small><button title="Run again" onClick={() => { if (run.command) void runCommand(run.command); else { const file = files.find(f => f.path === run.filename); if (file) void runFile(file); else notify('This file is no longer in the project.'); } }} disabled={running}><Play size={10} />Run again</button></div>)}</>}<div ref={terminalBottom} /></div><form className="terminal-input" onSubmit={event => { event.preventDefault(); void runCommand(); }}><span>~/ {project.name}</span><ChevronRight size={12} /><input aria-label="Terminal command" value={command} onChange={event => setCommand(event.target.value)} placeholder="Type a command…" spellCheck={false} autoComplete="off" onKeyDown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); const next = Math.min(historyIndex + 1, commandHistory.length - 1); if (next >= 0) { setHistoryIndex(next); setCommand(commandHistory[next]); } } if (event.key === 'ArrowDown') { event.preventDefault(); const next = Math.max(historyIndex - 1, -1); setHistoryIndex(next); setCommand(next < 0 ? '' : commandHistory[next]); } }} /><button type="submit" disabled={running || !command.trim()} title="Run command" aria-label="Run command"><ArrowRight size={13} /></button></form></>}
        </div>
      </section>
      {assistantOpen && <Assistant projectId={project.id} activeFile={activeFile?.path} settings={settings} runtime={runtime} mode={mode} setMode={setMode} conversationId={conversationId} setConversationId={setConversationId} conversations={data.conversations} onConversations={refreshConversations} onFilesChanged={refreshFiles} onRunResult={onAgentRun} openModels={() => openSettings('connection')} ensureSaved={saveAll} notify={notify} />}
    </main>
    <footer className="status-bar"><div><span className="status-ready"><span className="status-dot green" />{running ? 'Execution in progress' : saveState === 'saving' ? 'Saving your changes' : 'Workspace ready'}</span><span className="status-separator" /><span><LockKeyhole size={10} />{files.length} files · Local storage</span></div><span className="status-tagline">A little less friction. A little more flow.</span><div><button onClick={() => openSettings('connection')}><span className={`status-dot ${runtime?.connected ? 'green' : 'amber'}`} />{runtime?.connected ? 'Model connected' : 'llama.cpp offline'}</button><span className="status-separator" /><span className="cursor-status">Ln {cursor.line}, Col {cursor.column}</span><span>UTF-8</span><button className="font-size-status" title="Change editor font size" onClick={() => setFontSize(v => v >= 15 ? 11 : v + 1)}>{fontSize}px</button><button title="Keyboard shortcuts" aria-label="Keyboard shortcuts" onClick={() => setModal('shortcuts')}><Keyboard size={12} /></button></div></footer>
    {toast && <div key={toast.id} className="toast" role="status"><CircleCheck size={17} /><span>{toast.text}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={13} /></button></div>}
    {paletteOpen && <CommandPalette files={files} commands={commands} onFile={openFile} onClose={() => setPaletteOpen(false)} />}
    {(modal === 'settings' || modal === 'models') && <SettingsDialog kind={modal} initialTab={settingsTab} settings={settings} runtime={runtime} onSave={saveSettings} onRuntime={setRuntime} onClose={() => setModal(null)} notify={notify} />}
    {modal === 'install' && <InstallContent canInstall={Boolean(installPrompt)} onInstall={() => void install()} onClose={() => setModal(null)} />}
    {modal === 'shortcuts' && <Dialog title="Stay in your flow." eyebrow="KEYBOARD SHORTCUTS" onClose={() => setModal(null)}><div className="shortcut-list">{[['Quick open files & actions', 'Ctrl K / Ctrl P'], ['Save all changes', 'Ctrl S'], ['Run the current file', 'Ctrl Enter'], ['Workspace settings', 'Ctrl ,'], ['Send a message', 'Enter'], ['New line in chat', 'Shift Enter'], ['Terminal command history', '↑ / ↓'], ['Close a dialog', 'Esc']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><div className="info-note"><Command size={16} /><p>On Linux Mint, use Ctrl in place of ⌘. Editor shortcuts, including find and undo, work just like VS Code.</p></div></Dialog>}
    {modal && ['new-file', 'new-project', 'rename-file', 'rename-project', 'delete-file', 'delete-project'].includes(modal) && <Dialog title={modal === 'new-file' ? 'Make room for an idea.' : modal === 'new-project' ? 'Start something good.' : modal === 'rename-file' ? 'A new name. Same idea.' : modal === 'rename-project' ? 'Rename your project.' : 'Delete this ' + (modal === 'delete-file' ? 'file?' : 'project?')} eyebrow={modal.includes('delete') ? 'A MOMENT TO DOUBLE-CHECK' : 'YOUR NEXT CHAPTER'} onClose={() => { if (!formBusy) setModal(null); }}><form className="name-form" onSubmit={event => { event.preventDefault(); void submitName(); }}>{modal.includes('delete') ? <div className="delete-warning"><Trash2 size={23} /><p><strong>{modal === 'delete-file' ? activeFile?.path : project.name}</strong> and {modal === 'delete-project' ? 'its files and conversations' : 'its contents'} will be permanently deleted. This can’t be undone.</p></div> : <><label className="field-label" htmlFor="item-name">{modal.includes('project') ? 'Project name' : 'File path'}</label><input id="item-name" className="text-input" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder={modal.includes('project') ? 'my-next-big-idea' : 'components/idea.js'} maxLength={modal.includes('project') ? 60 : 180} required /><p className="field-hint">{modal.includes('project') ? 'A little name for your next big thing.' : 'Use / to create folders automatically. HTML, CSS, JavaScript, Python, and more.'}</p></>}{modal === 'new-project' && <><label className="field-label" htmlFor="project-template">Start with</label><select id="project-template" className="text-input" value={template} onChange={event => setTemplate(event.target.value)}><option value="blank">Blank project · A clean slate</option><option value="focus">Focus timer · A working HTML starter</option></select></>}{formError && <div className="form-error" role="alert"><CircleAlert size={14} />{formError}</div>}<div className="name-form-actions"><button type="button" className="button secondary" onClick={() => setModal(null)} disabled={formBusy}>Cancel</button><button className={`button ${modal.includes('delete') ? 'danger-button' : 'primary'}`} type="submit" disabled={formBusy || !modal.includes('delete') && !name.trim()}>{formBusy ? <LoaderCircle size={14} className="animate-spin" /> : modal.includes('delete') ? <Trash2 size={14} /> : <Plus size={14} />}{formBusy ? 'Working…' : modal.includes('delete') ? 'Delete permanently' : modal.startsWith('rename') ? 'Save name' : 'Create ' + (modal === 'new-file' ? 'file' : 'project')}</button></div></form></Dialog>}
  </div>;
}
