'use client';
import { useRef, useEffect } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { LoaderCircle } from 'lucide-react';
import type { ProjectFile } from '@/lib/types';

if (typeof window !== 'undefined') {
  loader.config({ paths: { vs: new URL('/monaco/vs', window.location.origin).href } });
}
export type RevealRequest = { line: number; key: number } | null;
export default function CodeEditor({ file, onChange, onSave, onCursor, reveal, formatKey = 0, fontSize }: { file: ProjectFile; onChange: (value: string) => void; onSave: () => void; onCursor: (line: number, column: number) => void; reveal?: RevealRequest; fontSize: number; formatKey?: number }) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const saveRef = useRef(onSave); saveRef.current = onSave;
  useEffect(() => { if (formatKey > 0) void editorRef.current?.getAction('editor.action.formatDocument')?.run(); }, [formatKey]);
  useEffect(() => { if (reveal && editorRef.current) { editorRef.current.revealLineInCenter(reveal.line); editorRef.current.setPosition({ lineNumber: reveal.line, column: 1 }); editorRef.current.focus(); } }, [reveal]);
  return <Editor
    height="100%" width="100%" path={file.path} language={file.language} value={file.content}
    theme="forge-night"
    loading={<div className="editor-loading"><LoaderCircle className="animate-spin" size={20} /><span>Opening your editor…</span></div>}
    onChange={value => onChange(value ?? '')}
    beforeMount={monaco => {
      monaco.editor.defineTheme('forge-night', { base: 'vs-dark', inherit: true, rules: [
        { token: 'comment', foreground: '758477', fontStyle: 'italic' }, { token: 'tag', foreground: 'E3A17D' }, { token: 'attribute.name', foreground: 'D5BD8D' }, { token: 'attribute.value', foreground: 'A7C4A0' }, { token: 'string', foreground: 'A7C4A0' }, { token: 'keyword', foreground: 'C5A5CF' }, { token: 'number', foreground: 'D9B486' }, { token: 'delimiter', foreground: '929DAB' }, { token: 'type', foreground: '8CBCC8' },
      ], colors: { 'editor.background': '#20262E', 'editor.foreground': '#D4DAE2', 'editorLineNumber.foreground': '#58616E', 'editorLineNumber.activeForeground': '#B6BEC9', 'editor.lineHighlightBackground': '#29303A', 'editor.selectionBackground': '#405267', 'editor.inactiveSelectionBackground': '#313D4B', 'editorCursor.foreground': '#E9A580', 'editorIndentGuide.background1': '#303740', 'editorIndentGuide.activeBackground1': '#4B5561', 'editorWidget.background': '#272E38', 'editorWidget.border': '#424A55', 'editorSuggestWidget.background': '#272E38', 'editorSuggestWidget.selectedBackground': '#3C4653', 'scrollbarSlider.background': '#46505B66', 'scrollbarSlider.hoverBackground': '#65707B88', 'editorBracketMatch.background': '#64766C44', 'editorBracketMatch.border': '#829589', focusBorder: '#00000000' } });
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ allowJs: true, checkJs: false, target: monaco.languages.typescript.ScriptTarget.ES2020 });
    }}
    onMount={(instance, monaco) => {
      editorRef.current = instance;
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.ready.then(() => {
          const urls = [...performance.getEntriesByType('resource').map(entry => entry.name), ...Array.from(document.scripts).map(script => script.src).filter(Boolean)];
          navigator.serviceWorker.controller?.postMessage({ type: 'CACHE_URLS', urls });
        });
      }
      instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
      instance.onDidChangeCursorPosition(event => onCursor(event.position.lineNumber, event.position.column));
      instance.updateOptions({ tabSize: 2 });
    }}
    options={{ fontSize, fontFamily: '"JetBrains Mono", monospace', fontLigatures: true, lineHeight: 23, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, padding: { top: 17, bottom: 24 }, lineNumbersMinChars: 3, glyphMargin: false, folding: true, renderLineHighlight: 'all', smoothScrolling: true, cursorSmoothCaretAnimation: 'on', cursorBlinking: 'smooth', wordWrap: 'off', tabSize: 2, bracketPairColorization: { enabled: true }, scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 }, overviewRulerBorder: false, hideCursorInOverviewRuler: true, contextmenu: true, quickSuggestions: { other: true, comments: false, strings: true }, fixedOverflowWidgets: true }}
  />;
}
