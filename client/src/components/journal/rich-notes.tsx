/**
 * Rich notes — a lightweight Markdown editor (toolbar + textarea + preview) and
 * a safe renderer, for trade reviews and daily journal notes.
 *
 * Idea and templates from LuxAlgo Trade Journal (apps/web/src/components/
 * rich-editor.tsx), https://github.com/LuxAlgo/trade-journal — MIT License,
 * Copyright (c) 2026 LuxAlgo Global, LLC (notice:
 * client/src/lib/journal/LICENSE-luxalgo.txt). Rewritten without
 * react-markdown: the renderer below builds React elements from a small
 * Markdown subset (headings, bold, italic, code, lists, task lists, links,
 * quotes), so no HTML string is ever injected.
 */
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Bold, Heading2, Italic, List, ListChecks, Quote } from 'lucide-react';

const TEMPLATES = [
  { id: 'review', name: 'Trade review', body: '## Setup and thesis\n\n## Execution\n\n## What worked\n\n## What I will change\n' },
  { id: 'pre', name: 'Pre-market plan', body: '## Market context\n\n## Setups to watch\n\n## Risk limits\n- [ ] Daily loss limit set\n- [ ] Scheduled events checked\n\n## Intention\n' },
  { id: 'post', name: 'Post-session', body: '## What I did well\n\n## Mistakes\n\n## Tomorrow\n' },
];

/** Inline: **bold**, *italic*, `code`, [text](https://link). */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'));
      out.push(<a key={k} href={m[2]} target="_blank" rel="noreferrer noopener">{label}</a>);
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Markdown subset → React elements (text is always text; nothing is parsed as HTML). */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, `p${blocks.length}-${i}`)}</Fragment>)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list.ordered ? <ol key={`l${blocks.length}`}>{list.items}</ol> : <ul key={`l${blocks.length}`}>{list.items}</ul>);
    list = null;
  };
  lines.forEach((raw, idx) => {
    const l = raw.trimEnd();
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    const task = l.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    const ul = l.match(/^\s*[-*•]\s+(.*)$/);
    const ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
    const q = l.match(/^>\s?(.*)$/);
    if (!l.trim()) { flushPara(); flushList(); return; }
    if (h) { flushPara(); flushList(); const T = (`h${Math.min(6, h[1].length + 2)}`) as 'h3'; blocks.push(<T key={`h${idx}`}>{inline(h[2], `h${idx}`)}</T>); return; }
    if (q) { flushPara(); flushList(); blocks.push(<blockquote key={`q${idx}`}>{inline(q[1], `q${idx}`)}</blockquote>); return; }
    if (task || ul || ol) {
      flushPara();
      const ordered = !!ol && !ul && !task;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      const content = task ? (
        <li key={idx} className="task"><input type="checkbox" checked={task[1].toLowerCase() === 'x'} readOnly disabled aria-label={task[2]} /> {inline(task[2], `t${idx}`)}</li>
      ) : <li key={idx}>{inline((ul ?? ol)![1], `li${idx}`)}</li>;
      (list as { items: ReactNode[] }).items.push(content);
      return;
    }
    flushList();
    para.push(l);
  });
  flushPara(); flushList();
  return <div className="jr-md">{blocks}</div>;
}

export function MarkdownEditor({ id, value, onChange, placeholder, rows = 8, label }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  label: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const wrap = (before: string, after = before, fallback = 'text') => {
    const el = ta.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = value.slice(s, e) || fallback;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const linePrefix = (prefix: string) => {
    const el = ta.current;
    if (!el) return;
    const s = el.selectionStart;
    const start = value.lastIndexOf('\n', s - 1) + 1;
    onChange(value.slice(0, start) + prefix + value.slice(start));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); });
  };
  return (
    <div className="jr-md-editor">
      <div className="jr-md-bar" role="toolbar" aria-label={`${label} formatting`}>
        <div className="jr-seg" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>WRITE</button>
          <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>PREVIEW</button>
        </div>
        {mode === 'edit' && (
          <>
            <button type="button" className="jr-icon-btn" onClick={() => wrap('**')} aria-label="Bold"><Bold className="h-3.5 w-3.5" /></button>
            <button type="button" className="jr-icon-btn" onClick={() => wrap('*')} aria-label="Italic"><Italic className="h-3.5 w-3.5" /></button>
            <button type="button" className="jr-icon-btn" onClick={() => linePrefix('## ')} aria-label="Heading"><Heading2 className="h-3.5 w-3.5" /></button>
            <button type="button" className="jr-icon-btn" onClick={() => linePrefix('- ')} aria-label="Bullet list"><List className="h-3.5 w-3.5" /></button>
            <button type="button" className="jr-icon-btn" onClick={() => linePrefix('- [ ] ')} aria-label="Checklist item"><ListChecks className="h-3.5 w-3.5" /></button>
            <button type="button" className="jr-icon-btn" onClick={() => linePrefix('> ')} aria-label="Quote"><Quote className="h-3.5 w-3.5" /></button>
            {!value.trim() && (
              <select className="jr-select" aria-label="Insert a template" value="" onChange={(e) => { const t = TEMPLATES.find((x) => x.id === e.target.value); if (t) onChange(t.body); }}>
                <option value="">Template…</option>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>
      {mode === 'edit' ? (
        <>
          <label htmlFor={id} className="sr-only">{label}</label>
          <textarea id={id} ref={ta} className="jr-input" rows={rows} value={value} maxLength={40_000} placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); }
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*'); }
            }} />
        </>
      ) : value.trim() ? <div className="jr-md-preview"><Markdown source={value} /></div> : <p className="jr-note" style={{ margin: 0 }}>Nothing written yet.</p>}
    </div>
  );
}
