'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export default function Dialog({ title, eyebrow, children, onClose, wide = false, icon }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean; icon?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement as HTMLElement | null; dialog?.showModal(); return () => { dialog?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className={`forge-dialog ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-title"><div className="dialog-inner"><div className="dialog-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id="dialog-title">{icon}{title}</h2></div><button className="icon-button" onClick={onClose} title="Close dialog" aria-label="Close dialog"><X size={19} /></button></div>{children}</div></dialog>;
}
