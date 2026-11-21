import React, { memo, useMemo } from 'react';
import { UserAvatar } from '../shared/UserAvatar';
import { buildTrail, circ, ell, f1, monthPlus, pips, rng, THEMES, worldFor, type MapSpace, type MapWords, type WorldKey } from './trailBuild';
import { FINISHES, GATES } from './worldArt';
import { balloonsHtml, baseHtml, discsHtml, fogHtml, marksHtml, particlesHtml, prizeHtml, reachDiceHtml, reachRingsHtml, topHtml } from './trailArt';
import { layoutPieces, placeDice, tokenSize, type Box, type PieceAt } from './pieceLayout';
import type { QuestPlayer } from './types';

/**
 * The month's adventure map (Quest Trail, NEW-40), as drawn in the mock-ups: 390 px wide on a phone (wider on a
 * bigger screen, `width`) and as tall as the trail needs. The world is built once (trailBuild.ts) and drawn as HTML layers (trailArt.ts); the pieces, footprints,
 * the next-roll glow and the fog are drawn on top from the players' positions (pieceLayout.ts keeps the pieces and die
 * faces off the texts and each other). Falling leaves and snow go just above the ground, below every space, sign and piece.
 */

export const MAP_WIDTH = 390;

export interface MapTexts {
  words: MapWords;
  kicker: string;
  title: string;
  sub: string;
  keyTitle: string;
  fogTitle: string;
  fogSub: string;
  prize: { label: string; text: string } | null;
  you: string;
  aria: string;
}

interface Props {
  /** The map's width: MAP_WIDTH on a phone, the page's width on a bigger screen (the trail zigzags across it) */
  width: number;
  world: WorldKey;
  /** The trail's month ('2026-12'): its top blends into last month's world and its bottom into next month's */
  month: string;
  length: number;
  spaces: Record<number, MapSpace>;
  players: QuestPlayer[];
  /** The viewer: their piece says "You" and pulses */
  meId: number | null;
  /** Whose turn it is (the viewer's, or someone a parent is rolling for): their piece walks and gets the next-roll glow */
  activeId?: number | null;
  /** Where the active piece is drawn while it walks (defaults to its position) */
  activePos?: number;
  /** A shortcut or slide in progress: the active piece travels along its line */
  jump?: { from: number; to: number; t: number } | null;
  /** Ring the six spaces the next roll can reach */
  reach: boolean;
  timeOfDay: 'day' | 'sunset' | 'night';
  fog: boolean;
  texts: MapTexts;
}

const layer = (w: number, h: number): React.CSSProperties => ({ position: 'absolute', left: 0, top: 0, width: w, height: h, pointerEvents: 'none' });
const Html = memo(function Html({ html, w, h }: { html: string; w: number; h: number }) {
  return <div style={layer(w, h)} dangerouslySetInnerHTML={{ __html: html }} />;
});

const look = (st: Record<string, unknown>) => {
  const l = (o: unknown) => {
    const v = (o ?? {}) as { c?: string; w?: number; o?: number; d?: string; a?: string };
    return { c: v.c || '#000000', w: v.w || 0, o: v.o != null ? v.o : 1, d: v.d || 'none', a: v.a || '0;0' };
  };
  return { halo: l(st.halo), base: l(st.base), top: l(st.top), deco: st.decoC || 'none', art: st.artC || 'none', art2: st.art2C || 'none', arrow: st.arrow };
};

function TrailMapImpl({ width, world, month, length, spaces, players, meId, activeId: activeProp, activePos, jump, reach, timeOfDay, fog: fogOn, texts }: Props) {
  const B = useMemo(() => buildTrail(world, length, spaces, texts.words, true, { prev: worldFor(monthPlus(month, -1)), next: worldFor(monthPlus(month, 1)) }, width),
    [world, month, length, spaces, texts.words, width]);
  const MW: number = B.MW;
  const T0 = THEMES[world];

  // The parts that never move: drawn once per world, length, language and time of day
  const statics = useMemo(() => {
    const g = T0.ground;
    const T = {
      ...T0,
      halo: `0 0 2px ${g}, 0 0 5px ${g}, 0 0 9px ${g}`, goS: look(T0.goS), backS: look(T0.backS),
      kicker: texts.kicker, title: texts.title, sub: texts.sub, keyTitle: texts.keyTitle,
      // The banner is 250 px wide inside: long world names (and other languages) get a smaller size
      titleSize: texts.title.length > 26 ? 15 : texts.title.length > 21 ? 17 : texts.title.length > 16 ? 20 : 24,
    };
    const L = T0.land.c;
    const V = {
      T, H: B.H, MW: B.MW, keyAt: B.keyAt, patches: B.patches,
      svg: { water1: B.water1, water2: B.water2, trail: B.trailD, bridge1: B.bridge1, bridge2: B.bridge2 },
      con: B.con, scenery: B.scenery, lms: B.lms, labels: B.labels, pills: B.pills, fin: B.fin, party: B.party, gate: B.gate,
      land: B.land, landC: { l1: L[0], l2: L[1], l3: L[2], l4: L[3], l5: L[4], l6: L[5], l7: L[6] },
      surf: B.surfOn, br: T0.bridgeOn, shadows: B.shadows, flocks: B.flocks,
      show: { gate: true, party: true, clouds: true, flyers: true, frame: true, numbers: true, shadows: true },
      place: { text: false, signs: true, ribbons: false },
      dusk: { on: timeOfDay !== 'day', tint: timeOfDay === 'night' ? '#6A78B0' : '#FFC8A0', pathO: timeOfDay === 'night' ? 0.16 : 0 },
      glows: timeOfDay === 'night' ? B.glowsNight : timeOfDay === 'sunset' ? B.glowsDusk : [],
      bugs: timeOfDay === 'night' ? B.bugs : [],
      discs: B.discsStone, numbers: B.numbers, marks: B.marks, signs: B.signs, mapKey: B.mapKey, particles: B.particles,
      prize: { ...B.prize, ...(texts.prize ?? {}) },
      gateSvg: GATES[world] ?? '', finSvg: FINISHES[world] ?? '', trailDefs: B.blend.defs, overlays: B.blend.overlays, texture: B.blend.texture,
      extra: (B.lookBack ? `<div style="position: absolute; left: ${B.lookBack.left}px; top: ${B.lookBack.top}px; width: 68px; height: 64px; opacity: .62; pointer-events: none">` +
        `<div style="width: 170px; height: 160px; transform: scale(.4); transform-origin: 0 0">${FINISHES[B.lookBack.key as WorldKey] ?? ''}</div></div>` : '') +
        (B.onward ? `<div style="position: absolute; left: ${B.onward.left}px; top: ${B.onward.top}px; width: ${B.onward.w}px; height: 64px; display: flex; flex-direction: column; align-items: center; pointer-events: none">` +
        `<span style="height: 28px; box-sizing: border-box; display: flex; align-items: center; gap: 5px; padding: 0 11px; border-radius: 7px; background: #A0703F; border: 2px solid #6B4423; box-shadow: 0 2px 0 #6B4423; color: #FFF4DE; font-size: 13px; font-weight: 800; white-space: nowrap">${B.onward.text}` +
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M5 13l7 7 7-7"></path></svg></span>` +
        `<span style="width: 6px; height: 32px; margin-top: 2px; border-radius: 0 0 3px 3px; background: #6B4423"></span></div>` : ''),
    };
    return {
      T,
      base: baseHtml(V), discs: discsHtml(V), marks: marksHtml(V), balloons: balloonsHtml(V), top: topHtml(V),
      // The particles without the frame (they fall below the spaces, signs and pieces, ENH-45), and the frame alone on top
      particles: particlesHtml({ ...V, show: { ...V.show, frame: false } }), frame: particlesHtml({ ...V, particles: [] }),
      prize: texts.prize ? prizeHtml(V) : '',
    };
  }, [B, T0, world, timeOfDay, texts]);

  const activeId = activeProp === undefined ? meId : activeProp;
  const active = players.find((p) => p.userId === activeId) ?? null;
  const you = Math.max(0, Math.min(B.N, activePos ?? active?.position ?? 0));
  const jumping = !!jump && jump.t > 0 && jump.t < 1;

  // Footprints over the last ten spaces the active piece walked
  const steps = useMemo(() => {
    if (!active || you <= 0) return '';
    const parts: string[] = [], sYou = (B.len * you) / B.N;
    let k = 0;
    for (let s = Math.max(10, sYou - (B.len / B.N) * 10); s < sYou - 16; s += 15, k++) {
      const p = B.at(s), q = B.at(s + 2);
      let tx = q.x - p.x, ty = q.y - p.y;
      const L = Math.hypot(tx, ty) || 1;
      tx /= L; ty /= L;
      const sd = k % 2 ? 4.2 : -4.2, x = p.x - ty * sd, y = p.y + tx * sd;
      parts.push(ell(x, y, 3.3, 2, Math.atan2(ty, tx)) + circ(x - tx * 4.6, y - ty * 4.6, 1.6));
    }
    return parts.join('');
  }, [B, active, you]);

  // Where every piece stands: people on one space side by side with their pins angled onto it, and every piece's tag
  // and token off the map's texts and the other pieces (pieceLayout.ts). The active piece in mid-jump follows its line.
  const pieces = useMemo(() => {
    let fixed: { id: number; x: number; foot: number } | null = null;
    if (active && jumping && jump) {
      const R = B.routes.find((q) => q.from === jump.from && q.to === jump.to);
      if (R) {
        const t = jump.t, u = 1 - t, a1 = u * u * u, a2 = 3 * u * u * t, a3 = 3 * u * t * t, a4 = t * t * t;
        fixed = { id: active.userId, x: a1 * R.A.x + a2 * R.C1.x + a3 * R.C2.x + a4 * R.Z.x, foot: a1 * R.A.y + a2 * R.C1.y + a3 * R.C2.y + a4 * R.Z.y };
      }
    }
    const at = layoutPieces(B, players.map((p) => ({
      id: p.userId, pos: Math.max(0, Math.min(B.N, p.userId === activeId ? you : p.position)), mine: p.userId === meId,
      label: p.userId === meId ? texts.you : p.displayName, active: p.userId === activeId,
    })), fixed);
    return new Map(at.map((a) => [a.id, a]));
  }, [B, players, activeId, meId, you, jumping, jump, active, texts.you]);

  // The six spaces the next roll can reach, each with its die face beside the space, clear of the texts, numbers,
  // pieces and the finish balloons
  const reachLayers = useMemo(() => {
    if (!reach || jumping || !active) return null;
    const rings = [];
    for (let k = 1; k <= 6 && you + k <= B.N; k++) {
      const d = B.discs[you + k], size = d.size + 18;
      rings.push({ left: f1(d.x - size / 2), top: f1(d.y - size / 2), size, c: size / 2, rr: d.r + 6, begin: '-' + (k * 0.2).toFixed(1) + 's' });
    }
    const avoid: Box[] = [...B.textRects, { x1: Number(B.party.bx), y1: Number(B.party.by), x2: Number(B.party.bx) + 44, y2: Number(B.party.by) + 74 }];
    for (const a of pieces.values()) avoid.push(...a.boxes);
    const dice = placeDice(B, you, avoid).map((z) => ({ left: f1(z.left), top: f1(z.top), pips: pips(z.k) }));
    return { rings: reachRingsHtml({ reachRings: rings }), dice: reachDiceHtml({ reachDice: dice }) };
  }, [B, reach, jumping, active, you, pieces]);

  // Fog over the trail past whoever is furthest ahead, all the way down to the finish line. Special spaces show
  // through, and the finish stays in sight as the goal (its balloons are drawn above the fog).
  const lead = Math.max(you + 6, ...players.map((p) => p.position)) + 3;
  const fogHtmlStr = useMemo(() => {
    if (!fogOn || lead >= B.N - 1) return '';
    const F = B.discs[B.N], top = B.discs[lead].y - 30, h = F.y - 36 - top;
    if (h < 120) return '';
    const c = T0.fogC, rnd = rng(T0.seed + 7);
    const puffs = [];
    for (let x = -10; x <= MW + 10; x += 34) { const s = 56 + rnd() * 40; puffs.push({ left: f1(x - s / 2), top: f1(top + 50 + rnd() * 36 - s / 2), s: f1(s) }); }
    // A lower, softer bank just above the finish: it hides the last spaces but not the finish
    for (let x = -10; x <= MW + 10; x += 30) { const s = 40 + rnd() * 16; puffs.push({ left: f1(x - s / 2), top: f1(F.y - 66 + rnd() * 8 - s / 2), s: f1(s), g: 16 }); }
    // On a wide map the trail can reach the finish from the side: a puff on each last space that's as low as it
    for (let i = Math.max(1, lead); i < B.N; i++) { const d = B.discs[i]; if (d.y > F.y - 56) puffs.push({ left: f1(d.x - 27), top: f1(d.y - 27), s: 54, g: 16 }); }
    // "Unexplored" needs a tall enough stretch of fog; no space shows through behind it
    const text = h >= 340;
    const peek = B.discs.filter((d: { y: number }, i: number) => spaces[i] && i < B.N && d.y > top + 60 && (!text || d.y < top + 118 || d.y > top + 230));
    return fogHtml({
      T: statics.T, MW,
      fog: {
        on: true, top: f1(top), h: f1(h), c: `rgb(${c})`, puffs, textTop: text ? f1(top + 150) : null, peek, title: texts.fogTitle, sub: texts.fogSub,
        bg: `linear-gradient(to bottom, rgba(${c},0) 0px, rgba(${c},.96) ${f1(Math.min(110, h * 0.4))}px, rgba(${c},.96) calc(100% - 34px), rgba(${c},0) 100%)`,
      },
    });
  }, [B, MW, T0, fogOn, lead, spaces, statics.T, texts.fogTitle, texts.fogSub]);

  return (
    <div role="img" aria-label={texts.aria}
      style={{ position: 'relative', width: MW, height: B.H, overflow: 'hidden', background: B.blend.ground, fontFamily: 'Nunito, system-ui, sans-serif', color: T0.ink }}>
      <Html html={statics.base} w={MW} h={B.H} />
      {steps && (
        <svg width={MW} height={B.H} style={layer(MW, B.H)} aria-hidden="true">
          <path d={steps} fill="#1971C2" fillOpacity=".5" />
        </svg>
      )}
      <Html html={statics.particles} w={MW} h={B.H} />
      {statics.prize && <Html html={statics.prize} w={MW} h={B.H} />}
      {reachLayers && <Html html={reachLayers.rings} w={MW} h={B.H} />}
      <Html html={statics.discs} w={MW} h={B.H} />
      {reachLayers && <Html html={reachLayers.dice} w={MW} h={B.H} />}
      <Html html={statics.marks} w={MW} h={B.H} />
      {fogHtmlStr && <Html html={fogHtmlStr} w={MW} h={B.H} />}
      <Html html={statics.balloons} w={MW} h={B.H} />
      {players.map((p) => {
        const mine = p.userId === meId, at = pieces.get(p.userId);
        return at ? <Piece key={p.userId} player={p} mine={mine} label={mine ? texts.you : p.displayName} at={at} /> : null;
      })}
      <Html html={statics.top} w={MW} h={B.H} />
      <Html html={statics.frame} w={MW} h={B.H} />
    </div>
  );
}

/**
 * A round token with the person's own avatar (and any frame they unlocked), its name tag above and a pin from the
 * token to where it points (`at`, pieceLayout.ts): straight down for a piece on its own, angled onto the space when
 * people share one. Its box (80 px wide, from the top of the tag to the end of a straight pin) glides when it moves.
 */
function Piece({ player: p, mine, label, at }: { player: QuestPlayer; mine: boolean; label: string; at: PieceAt }) {
  const size = tokenSize(mine), s = size + 4, th = mine ? 15 : 14, top = th + 3 + s;
  // The pin: a slim white triangle from under the token to its tip, in the piece's own coordinates
  const tx = at.tipX - at.x, ty = Math.max(at.tipY - at.base, 2);
  const pl = Math.min(-6, tx - 2), pr = Math.max(6, tx + 2);
  // The tag above the token, or beside it (pieceLayout.ts moves it there when a sign or tag is in the way above)
  const gap = s / 2 + (mine ? 3 : 2) + 3;
  const tagAt: React.CSSProperties = at.tag === 'up' ? { left: 40, top: 0, transform: 'translateX(-50%)' }
    : { top: th + 3 + s / 2, transform: `translate(${at.tag === 'left' ? '-100%' : '0'}, -50%)`, left: 40 + (at.tag === 'left' ? -gap : gap) };
  return (
    <div data-piece={p.userId} style={{
      position: 'absolute', left: f1(at.x - 40), top: f1(at.base - top), width: 80, height: top + 9,
      transition: 'left .25s ease-out, top .25s ease-out', zIndex: mine ? 4 : at.raised ? 2 : 3, pointerEvents: 'none',
    }}>
      <span style={{
        position: 'absolute', ...tagAt,
        background: mine ? '#1971C2' : p.avatarColor || '#6B5A4B', color: '#FFFFFF', fontSize: mine ? 11 : 10, fontWeight: 800, lineHeight: `${th}px`,
        borderRadius: 6, padding: '0 6px', whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }}>{label}</span>
      <span style={{ position: 'absolute', left: 40 - s / 2, top: th + 3, display: 'flex' }}>
        {mine && <span className="quest-pulse" aria-hidden="true" />}
        <span style={{ position: 'relative', display: 'flex', padding: 2, borderRadius: '50%', background: '#FFFFFF', boxShadow: `0 0 0 ${mine ? 3 : 2}px ${mine ? '#1971C2' : p.avatarColor || '#6B5A4B'}, 0 2px 4px rgba(0,0,0,.3)` }}>
          <UserAvatar userId={p.userId} name={p.displayName} color={p.avatarColor || '#6B5A4B'} size={size}
            avatarType={p.avatarType ?? undefined} avatarPreset={p.avatarPreset} avatarPhotoUrl={p.avatarPhotoUrl} />
        </span>
      </span>
      <svg aria-hidden="true" width={pr - pl} height={ty} viewBox={`${pl} 0 ${pr - pl} ${ty}`}
        style={{ position: 'absolute', left: 40 + pl, top, overflow: 'visible', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }}>
        <path d={`M-6 1L6 1L${f1(tx)} ${f1(ty)}Z`} fill="#FFFFFF" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export const TrailMap = memo(TrailMapImpl);
export default TrailMap;
