import { Fragment, Suspense, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { WIDE, useFitToScreen, useMediaQuery } from '../../hooks/useWideLayout';
import { guideFor, type GuideBlock, type GuideSection } from '../../docs/guide';

/** Guide text without its **bold** marks, lower case, for search */
const plain = (s: string) => s.replace(/\*\*/g, '').toLowerCase();

/** Every bit of text in a block, for search */
const blockText = (b: GuideBlock): string =>
  'p' in b ? b.p : 'ul' in b ? b.ul.join(' ') : 'ol' in b ? b.ol.join(' ') : 'where' in b ? b.where : 'tip' in b ? b.tip : 'h' in b ? b.h
    : 'flow' in b ? b.flow.map((f) => `${f.title} ${f.text}`).join(' ') : b.qa.map((x) => `${x.q} ${x.a.join(' ')}`).join(' ');

const sectionText = (s: GuideSection) => plain(`${s.title} ${s.blocks.map(blockText).join(' ')}`);

const text = { fontSize: 14, lineHeight: 1.55, color: 'var(--warm-text-secondary)', fontWeight: 600, margin: 0 } as const;

/** The search words picked out in yellow */
function marked(s: string, q: string): ReactNode {
  if (!q) return s;
  const low = s.toLowerCase();
  const out: ReactNode[] = [];
  let at = 0;
  for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, at)) {
    if (i > at) out.push(s.slice(at, i));
    out.push(<mark key={i} className="guide-mark">{s.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  out.push(s.slice(at));
  return out;
}

/** Guide text: **x** is bold (a menu path, with →, also in the accent colour); search words are marked */
function Rich({ s, q }: { s: string; q: string }) {
  return <>{s.split(/\*\*(.+?)\*\*/g).map((part, i) => i % 2
    // A label ("…in Settings → Family Members:") stays dark even with a path in it; only a bare path is coloured
    ? <strong key={i} className={part.includes('→') && !/:\s*$/.test(part) ? 'guide-path' : 'guide-bold'}>{marked(part, q)}</strong>
    : <Fragment key={i}>{marked(part, q)}</Fragment>)}</>;
}

/** While searching: only the blocks (and list items) that match, each under its sub-heading. A matching
 *  sub-heading keeps everything under it; a matching section title keeps the whole section. */
function visibleBlocks(s: GuideSection, q: string): Array<{ b: GuideBlock; i: number }> {
  const all = s.blocks.map((b, i) => ({ b, i }));
  if (!q || plain(s.title).includes(q)) return all;
  const hit = (x: string) => plain(x).includes(q);
  const out: Array<{ b: GuideBlock; i: number }> = [];
  let heading: { b: GuideBlock; i: number } | null = null;
  let headingHit = false;
  for (const { b, i } of all) {
    if ('h' in b) { heading = { b, i }; headingHit = hit(b.h); if (headingHit) out.push(heading); continue; }
    if (!headingHit && !hit(blockText(b))) continue;
    if (heading && !out.includes(heading)) out.push(heading);
    out.push({ b, i });
  }
  return out;
}

function Block({ b, query, id }: { b: GuideBlock; query: string; id?: string }) {
  const q = query.trim().toLowerCase();
  // While searching, a list shows only its matching items (numbered lists keep their numbers)
  const items = (list: string[]) => list.map((x, i) => ({ x, i })).filter(({ x }) => !q || plain(x).includes(q) || list.every((y) => !plain(y).includes(q)));
  if ('p' in b) return <p style={text}><Rich s={b.p} q={q} /></p>;
  if ('h' in b) return <h4 id={id} style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 900, color: 'var(--warm-text)', scrollMarginTop: 80 }}>{marked(b.h, q)}</h4>;
  if ('where' in b) {
    return <div style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)', background: 'var(--warm-accent-light)', borderRadius: 99, padding: '4px 10px' }}>📍 {marked(b.where, q)}</div>;
  }
  if ('tip' in b) {
    return <div style={{ ...text, padding: '10px 12px', borderRadius: 12, background: 'var(--warm-bg-subtle)', border: '1.5px dashed var(--warm-border)' }}>💡 <Rich s={b.tip} q={q} /></div>;
  }
  if ('ul' in b) return <ul style={{ ...text, paddingLeft: 20, display: 'grid', gap: 6 }}>{items(b.ul).map(({ x, i }) => <li key={i}><Rich s={x} q={q} /></li>)}</ul>;
  if ('ol' in b) return <ol style={{ ...text, paddingLeft: 22, display: 'grid', gap: 6 }}>{items(b.ol).map(({ x, i }) => <li key={i} value={i + 1}><Rich s={x} q={q} /></li>)}</ol>;
  if ('flow' in b) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        {b.flow.map((f, i) => (
          <div key={i} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
            <div style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 14, border: '1.5px solid var(--warm-accent)', background: 'var(--warm-accent-light)' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--warm-text)' }}>{marked(f.title, q)}</div>
              <div style={{ ...text, fontSize: 13 }}><Rich s={f.text} q={q} /></div>
            </div>
            {i < b.flow.length - 1 && <span aria-hidden="true" style={{ fontSize: 16, color: 'var(--warm-accent)', lineHeight: 1 }}>↓</span>}
          </div>
        ))}
      </div>
    );
  }
  // Troubleshooting: each problem opens to its causes and fixes (all open while searching)
  const shown = q ? b.qa.filter((x) => plain(`${x.q} ${x.a.join(' ')}`).includes(q)) : b.qa;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {shown.map((x) => (
        <details key={x.q} open={!!q} style={{ borderRadius: 12, border: 'var(--shape-border-w) solid var(--warm-border)', background: 'var(--warm-bg-subtle)', padding: '10px 12px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>{marked(x.q, q)}</summary>
          <ul style={{ ...text, fontSize: 13, paddingLeft: 18, margin: '8px 0 0', display: 'grid', gap: 6 }}>{x.a.map((a, i) => <li key={i}><Rich s={a} q={q} /></li>)}</ul>
        </details>
      ))}
    </div>
  );
}

/** The guide (Settings → Guide & help): setup, how it all connects, and troubleshooting. */
export function Guide({ language, onWhatsNew }: { language?: string; onWhatsNew?: () => void }) {
  // English shows straight away; another language loads its guide the first time
  return <Suspense fallback={null}><GuideBody language={language} onWhatsNew={onWhatsNew} /></Suspense>;
}

/** A section's title line: icon, title and the "For parents" tag */
function SectionTitle({ s, forParents }: { s: GuideSection; forParents: string }) {
  return (
    <>
      <span aria-hidden="true">{s.icon}</span> {s.title}
      {s.parents && <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-light)', border: '1px solid var(--warm-border)', borderRadius: 99, padding: '2px 8px' }}>{forParents}</span>}
    </>
  );
}

/** A section's text: its sub-heading jumps (phones; wide screens list them on the left), then the blocks */
function SectionBody({ s, query, contents, chips }: { s: GuideSection; query: string; contents: string; chips: boolean }) {
  const q = query.trim().toLowerCase();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {chips && !q && s.blocks.filter((b) => 'h' in b).length >= 3 && (
        <nav aria-label={contents} className="guide-subnav">
          {s.blocks.map((b, i) => 'h' in b && (
            <button key={i} type="button" onClick={() => scrollToHeading(s.id, i)}>{b.h}</button>
          ))}
        </nav>
      )}
      {visibleBlocks(s, q).map(({ b, i }) => <Block key={i} b={b} query={query} id={`guide-${s.id}-${i}`} />)}
    </div>
  );
}

const scrollToHeading = (sectionId: string, i: number) =>
  document.getElementById(`guide-${sectionId}-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function GuideBody({ language, onWhatsNew }: { language?: string; onWhatsNew?: () => void }) {
  const { t } = useTranslation(language);
  const navigate = useNavigate();
  const location = useLocation();
  const guide = guideFor(language);
  const sections = Array.isArray(guide) ? guide : use(guide);
  const [query, setQuery] = useState('');
  const wide = useMediaQuery(WIDE);
  const asideRef = useRef<HTMLElement>(null);
  useFitToScreen(asideRef, wide);
  const hashId = location.hash.slice(1);
  // Phones: sections start closed; a link like /guide#troubleshooting opens that one
  const [open, setOpen] = useState<Set<string>>(() => new Set(hashId ? [hashId] : []));
  // Wide screens: one topic at a time, the one in the address (#chores), else the first
  const current = sections.find((s) => s.id === hashId) ?? sections[0];
  const q = query.trim().toLowerCase();
  const shown = q ? sections.filter((s) => sectionText(s).includes(q)) : sections;
  const toggle = (id: string, on: boolean) => setOpen((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  const jump = (id: string) => {
    toggle(id, true);
    window.history.replaceState(null, '', `#${id}`);
    window.setTimeout(() => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  // Wide screens: picking a topic shows it on the right, from its top
  const pick = (id: string, heading?: number) => {
    navigate({ hash: `#${id}` }, { replace: true });
    window.setTimeout(() => {
      if (heading !== undefined) scrollToHeading(id, heading);
      else document.getElementById('guide-reading')?.scrollIntoView({ block: 'start' });
    }, 30);
  };
  // Arriving with a hash on a phone (Settings → Troubleshooting): go to that section once it has opened. Things that
  // load late above it (the season strip) push it down, so follow it for a moment unless the reader moves first.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id || window.matchMedia(WIDE).matches) return;
    const go = () => document.getElementById(`guide-${id}`)?.scrollIntoView({ block: 'start' });
    const timer = window.setTimeout(go, 50);
    const follow = new ResizeObserver(go);
    follow.observe(document.body);
    const moves = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const stop = () => { follow.disconnect(); moves.forEach((m) => window.removeEventListener(m, stop)); };
    moves.forEach((m) => window.addEventListener(m, stop, { passive: true }));
    const settle = window.setTimeout(stop, 1500);
    return () => { window.clearTimeout(timer); window.clearTimeout(settle); stop(); };
  }, [location.hash]);

  const top = (
    <div className="tq-card tq-card-padded" style={{ display: 'grid', gap: 10 }}>
      {!wide && <p style={text}>{t('guide.intro')}</p>}
      {onWhatsNew && <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ justifySelf: 'start' }} onClick={onWhatsNew}>📣 {t('whatsNew.replay')}</button>}
      <input className="tq-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('guide.search')} aria-label={t('guide.search')} />
      {!q && !wide && (
        <nav aria-label={t('guide.contents')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sections.map((s) => (
            <button key={s.id} type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => jump(s.id)}>{s.icon} {s.title}</button>
          ))}
        </nav>
      )}
    </div>
  );
  const back = <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ justifySelf: 'start' }} onClick={() => navigate('/settings')}>← {t('nav.settings')}</button>;
  const titleStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 16, fontWeight: 900, color: 'var(--warm-text)' } as const;

  // Wide screens: search and the topics (with the open topic's sub-headings) on the left, one topic on the right.
  // While searching, the right side shows the matching parts of every topic.
  if (wide) {
    return (
      <div className="page-enter guide-wide">
        <aside ref={asideRef} className="guide-aside">
          {back}
          {top}
          <nav aria-label={t('guide.contents')} className="tq-card guide-topics">
            {shown.map((s) => {
              const on = !q && s.id === current.id;
              return (
                <div key={s.id}>
                  <button type="button" className={`guide-topic${on ? ' on' : ''}`} aria-current={on ? 'true' : undefined}
                    onClick={() => (q ? document.getElementById(`guide-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : pick(s.id))}>
                    <span aria-hidden="true">{s.icon}</span> {s.title}
                  </button>
                  {on && s.blocks.some((b) => 'h' in b) && (
                    <div className="guide-topic-subs">
                      {s.blocks.map((b, i) => 'h' in b && <button key={i} type="button" onClick={() => pick(s.id, i)}>{b.h}</button>)}
                    </div>
                  )}
                </div>
              );
            })}
            {shown.length === 0 && <div className="tq-empty-state">{t('guide.noMatch')}</div>}
          </nav>
        </aside>
        <div id="guide-reading" className="guide-reading">
          {(q ? shown : [current]).map((s) => (
            <section key={s.id} id={`guide-${s.id}`} className="tq-card" style={{ padding: '18px 22px', scrollMarginTop: 16 }}>
              <h2 style={{ ...titleStyle, fontSize: 20, margin: 0 }}><SectionTitle s={s} forParents={t('guide.forParents')} /></h2>
              <SectionBody s={s} query={query} contents={t('guide.contents')} chips={false} />
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter tq-page-narrow" style={{ display: 'grid', gap: 14 }}>
      {back}
      {top}
      {shown.map((s) => (
        <details key={s.id} id={`guide-${s.id}`} className="tq-card" open={!!q || open.has(s.id)}
          onToggle={(e) => { if (!q) toggle(s.id, (e.target as HTMLDetailsElement).open); }} style={{ padding: '14px 16px', scrollMarginTop: 80 }}>
          <summary style={{ ...titleStyle, cursor: 'pointer' }}><SectionTitle s={s} forParents={t('guide.forParents')} /></summary>
          <SectionBody s={s} query={query} contents={t('guide.contents')} chips />
        </details>
      ))}
      {shown.length === 0 && <div className="tq-empty-state">{t('guide.noMatch')}</div>}
    </div>
  );
}
