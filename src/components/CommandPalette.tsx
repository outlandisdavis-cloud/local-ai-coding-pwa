'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, CornerDownLeft, FileCode2, Search, type LucideIcon } from 'lucide-react';
import Dialog from './Dialog';
import { fileColor } from '@/lib/client';
import type { ProjectFile } from '@/lib/types';
export type Command = { id: string; label: string; detail: string; icon: LucideIcon; shortcut?: string; action: () => void };
export default function CommandPalette({ files, commands, onFile, onClose }: { files: ProjectFile[]; commands: Command[]; onFile: (file: ProjectFile) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState(0);
  const results = useMemo(() => [
    ...files.filter(f => f.path.toLowerCase().includes(query.toLowerCase())).map(f => ({ id: f.id, label: f.path, detail: f.language, icon: FileCode2, color: fileColor(f.path), action: () => onFile(f) })),
    ...commands.filter(c => `${c.label} ${c.detail}`.toLowerCase().includes(query.toLowerCase())),
  ].slice(0, 14), [files, commands, query, onFile]);
  useEffect(() => setSelected(0), [query]);
  const run = (index: number) => { const result = results[index]; if (result) { onClose(); result.action(); } };
  return <Dialog title="Find your next move." eyebrow="QUICK OPEN" onClose={onClose}><div className="command-search"><Search size={19} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search files and actions…" aria-label="Search files and actions" onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(v => Math.min(v + 1, results.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(v => Math.max(0, v - 1)); } if (e.key === 'Enter') { e.preventDefault(); run(selected); } }} /><kbd>esc</kbd></div><div className="command-results"><span className="eyebrow">{query ? `${results.length} RESULTS` : 'FILES & QUICK ACTIONS'}</span>{results.map((result, index) => <button className={selected === index ? 'selected' : ''} key={result.id} onMouseEnter={() => setSelected(index)} onClick={() => run(index)}><result.icon size={17} style={{ color: 'color' in result ? result.color : undefined }} /><span>{result.label}<small>{result.detail}</small></span>{'shortcut' in result && result.shortcut ? <kbd>{result.shortcut}</kbd> : <ArrowUpRight size={13} />}</button>)}{!results.length && <div className="no-results"><Search size={24} /><p>No matches for “{query}”</p><span>Try a filename, “model”, or “run”.</span></div>}</div><div className="command-footer"><span><ArrowUp size={11} /><ArrowDown size={11} />to navigate</span><span><CornerDownLeft size={12} />to open</span><span>Less searching. More building.</span></div></Dialog>;
}
