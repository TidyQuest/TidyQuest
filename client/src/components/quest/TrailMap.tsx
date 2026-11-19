import React, { memo, useMemo } from 'react';
import { UserAvatar } from '../shared/UserAvatar';
import { buildTrail, circ, ell, f1, monthPlus, pips, rng, THEMES, worldFor, type MapSpace, type MapWords, type WorldKey } from './trailBuild';
import { FINISHES, GATES } from './worldArt';
import { baseHtml, discsHtml, fogHtml, marksHtml, particlesHtml, prizeHtml, reachDiceHtml, reachRingsHtml, topHtml } from './trailArt';
import type { QuestPlayer } from './types';

/**
 * The month's adventure map (Quest Trail, NEW-40), as drawn in the mock-ups: 390 px wide and as tall as the trail
 * needs. The world is built once (trailBuild.ts) and drawn as HTML layers (trailArt.ts); the pieces, footprints,
 * the next-roll glow and the fog are drawn on top from the players' positions.
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
  world: WorldKey;
  /** The trail's month ('2026-12'): its top blends into last month's world and its bottom into next month's */
  month: string;
  length: number;
  spaces: Record<number, MapSpace>;
  players: QuestPlayer[];
  meId: number | null;
  /** Where the viewer's piece is drawn while it walks (defaults to their position) */
  myPos?: number;
  /** A shortcut or slide in progress: the piece travels along its line */
  jump?: { from: number; to: number; t: number } | null;
  /** Ring the six spaces the next roll can reach */
  reach: boolean;
  timeOfDay: 'day' | 'sunset' | 'night';
  fog: boolean;
  texts: MapTexts;
}

const layer: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: MAP_WIDTH, pointerEvents: 'none' };
const Html = memo(function Html({ html, h }: { html: string; h: number }) {
  return <div style={{ ...layer, height: h }} dangerouslySetInnerHTML={{ __html: html }} />;
});

const look = (st: Record<string, unknown>) => {
  const l = (o: unknown) => {
    const v = (o ?? {}) as { c?: string; w?: number; o?: number; d?: string; a?: string };
    return { c: v.c || '#000000', w: v.w || 0, o: v.o != null ? v.o : 1, d: v.d || 'none', a: v.a || '0;0' };
  };
  return { halo: l(st.halo), base: l(st.base), top: l(st.top), deco: st.decoC || 'none', art: st.artC || 'none', art2: st.art2C || 'none', arrow: st.arrow };
};

function TrailMapImpl({ world, month, length, spaces, players, meId, myPos, jump, reach, timeOfDay, fog: fogOn, texts }: Props) {
  const B = useMemo(() => buildTrail(world, length, spaces, texts.words, true, { prev: worldFor(monthPlus(month, -1)), next: worldFor(monthPlus(month, 1)) }),
    [world, month, length, spaces, texts.words]);
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
      T, H: B.H, patches: B.patches,
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
      gateSvg: GATES[world] ?? '', finSvg: FINISHES[world] ?? '', trailDefs: B.blend.defs, overlays: B.blend.overlays,
      extra: (B.lookBack ? `<div style="position: absolute; left: ${B.lookBack.left}px; top: ${B.lookBack.top}px; width: 68px; height: 64px; opacity: .62; pointer-events: none">` +
        `<div style="width: 170px; height: 160px; transform: scale(.4); transform-origin: 0 0">${FINISHES[B.lookBack.key as WorldKey] ?? ''}</div></div>` : '') +
        (B.onward ? `<div style="position: absolute; left: ${B.onward.left}px; top: ${B.onward.top}px; width: ${B.onward.w}px; height: 64px; display: flex; flex-direction: column; align-items: center; pointer-events: none">` +
        `<span style="height: 28px; box-sizing: border-box; display: flex; align-items: center; gap: 5px; padding: 0 11px; border-radius: 7px; background: #A0703F; border: 2px solid #6B4423; box-shadow: 0 2px 0 #6B4423; color: #FFF4DE; font-size: 13px; font-weight: 800; white-space: nowrap">${B.onward.text}` +
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M5 13l7 7 7-7"></path></svg></span>` +
        `<span style="width: 6px; height: 32px; margin-top: 2px; border-radius: 0 0 3px 3px; background: #6B4423"></span></div>` : ''),
    };
    return {
      T,
      base: baseHtml(V), discs: discsHtml(V), marks: marksHtml(V), top: topHtml(V), particles: particlesHtml(V),
      prize: texts.prize ? prizeHtml(V) : '',
    };
  }, [B, T0, world, timeOfDay, texts]);

  const me = players.find((p) => p.userId === meId) ?? null;
  const you = Math.max(0, Math.min(B.N, myPos ?? me?.position ?? 0));
  const jumping = !!jump && jump.t > 0 && jump.t < 1;

  // Footprints over the last ten spaces you walked
  const steps = useMemo(() => {
    if (!me || you <= 0) return '';
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
  }, [B, me, you]);

  // The six spaces the next roll can reach, each with its die face
  const reachLayers = useMemo(() => {
    if (!reach || jumping || !me) return null;
    const rings = [], dice = [];
    for (let k = 1; k <= 6 && you + k <= B.N; k++) {
      const d = B.discs[you + k], size = d.size + 18;
      rings.push({ left: f1(d.x - size / 2), top: f1(d.y - size / 2), size, c: size / 2, rr: d.r + 6, begin: '-' + (k * 0.2).toFixed(1) + 's' });
      dice.push({ left: f1(d.x + d.r * 0.45), top: f1(d.y - d.r - 12), pips: pips(k) });
    }
    return { rings: reachRingsHtml({ reachRings: rings }), dice: reachDiceHtml({ reachDice: dice }) };
  }, [B, reach, jumping, me, you]);

  // Fog over the trail past whoever is furthest ahead, lifting above the finish; special spaces show through
  const lead = Math.max(you + 6, ...players.map((p) => p.position)) + 3;
  const fogHtmlStr = useMemo(() => {
    if (!fogOn || lead >= B.N - 6) return '';
    const top = B.discs[lead].y - 30, bottom = B.Y1 - 230;
    if (bottom - top <= 260) return '';
    const c = T0.fogC, rnd = rng(T0.seed + 7);
    const puffs = [];
    for (let x = -10; x <= 400; x += 34) { const s = 56 + rnd() * 40; puffs.push({ left: f1(x - s / 2), top: f1(top + 50 + rnd() * 36 - s / 2), s: f1(s) }); }
    const peek = B.discs.filter((d: { y: number }, i: number) => spaces[i] && d.y > top + 60 && d.y < bottom - 30 && (d.y < top + 118 || d.y > top + 230));
    return fogHtml({
      T: statics.T,
      fog: {
        on: true, top: f1(top), h: f1(bottom - top), c: `rgb(${c})`, puffs, textTop: f1(top + 150), peek, title: texts.fogTitle, sub: texts.fogSub,
        bg: `linear-gradient(to bottom, rgba(${c},0) 0px, rgba(${c},.96) 110px, rgba(${c},.96) calc(100% - 110px), rgba(${c},0) 100%)`,
      },
    });
  }, [B, T0, fogOn, lead, spaces, statics.T, texts.fogTitle, texts.fogSub]);

  // People on the same space stand side by side
  const placed = players.map((p) => ({ p, pos: p.userId === meId ? you : p.position }));
  const groups = new Map<number, number[]>();
  placed.forEach(({ p, pos }) => groups.set(pos, [...(groups.get(pos) ?? []), p.userId]));
  const shift = (id: number, pos: number) => {
    const g = groups.get(pos) ?? [id];
    return (g.indexOf(id) - (g.length - 1) / 2) * 34;
  };

  return (
    <div role="img" aria-label={texts.aria}
      style={{ position: 'relative', width: MAP_WIDTH, height: B.H, overflow: 'hidden', background: B.blend.ground, fontFamily: 'Nunito, system-ui, sans-serif', color: T0.ink }}>
      <Html html={statics.base} h={B.H} />
      {steps && (
        <svg width={MAP_WIDTH} height={B.H} style={{ ...layer, height: B.H }} aria-hidden="true">
          <path d={steps} fill="#1971C2" fillOpacity=".5" />
        </svg>
      )}
      {statics.prize && <Html html={statics.prize} h={B.H} />}
      {reachLayers && <Html html={reachLayers.rings} h={B.H} />}
      <Html html={statics.discs} h={B.H} />
      {reachLayers && <Html html={reachLayers.dice} h={B.H} />}
      <Html html={statics.marks} h={B.H} />
      {fogHtmlStr && <Html html={fogHtmlStr} h={B.H} />}
      {placed.map(({ p, pos }) => {
        const mine = p.userId === meId;
        const d = B.discs[Math.min(B.N, pos)];
        let x = d.x + shift(p.userId, pos), foot = d.y - 4;
        if (mine && jumping && jump) {
          const R = B.routes.find((q) => q.from === jump.from && q.to === jump.to);
          if (R) {
            const t = jump.t, u = 1 - t, a1 = u * u * u, a2 = 3 * u * u * t, a3 = 3 * u * t * t, a4 = t * t * t;
            x = a1 * R.A.x + a2 * R.C1.x + a3 * R.C2.x + a4 * R.Z.x;
            foot = a1 * R.A.y + a2 * R.C1.y + a3 * R.C2.y + a4 * R.Z.y;
          }
        }
        return <Piece key={p.userId} player={p} mine={mine} label={mine ? texts.you : p.displayName} x={x} foot={foot} />;
      })}
      <Html html={statics.top} h={B.H} />
      <Html html={statics.particles} h={B.H} />
    </div>
  );
}

/** A round token with the person's own avatar (and any frame they unlocked), standing on its space */
function Piece({ player: p, mine, label, x, foot }: { player: QuestPlayer; mine: boolean; label: string; x: number; foot: number }) {
  const size = mine ? 34 : 26;
  const h = size + 46;
  return (
    <div data-piece={p.userId} style={{
      position: 'absolute', left: f1(x - 40), top: f1(foot - h), width: 80, height: h, display: 'flex', flexDirection: 'column', alignItems: 'center',
      transition: 'left .25s ease-out, top .25s ease-out', zIndex: mine ? 3 : 2, pointerEvents: 'none',
    }}>
      <span style={{
        background: mine ? '#1971C2' : p.avatarColor || '#6B5A4B', color: '#FFFFFF', fontSize: mine ? 11 : 10, fontWeight: 800, lineHeight: mine ? '15px' : '14px',
        borderRadius: 6, padding: '0 6px', marginBottom: 3, whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }}>{label}</span>
      <span style={{ position: 'relative', display: 'flex' }}>
        {mine && <span className="quest-pulse" aria-hidden="true" />}
        <span style={{ position: 'relative', display: 'flex', padding: 2, borderRadius: '50%', background: '#FFFFFF', boxShadow: `0 0 0 ${mine ? 3 : 2}px ${mine ? '#1971C2' : p.avatarColor || '#6B5A4B'}, 0 2px 4px rgba(0,0,0,.3)` }}>
          <UserAvatar userId={p.userId} name={p.displayName} color={p.avatarColor || '#6B5A4B'} size={size}
            avatarType={p.avatarType ?? undefined} avatarPreset={p.avatarPreset} avatarPhotoUrl={p.avatarPhotoUrl} />
        </span>
      </span>
      <span aria-hidden="true" style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid #FFFFFF', marginTop: 1 }} />
      <span aria-hidden="true" style={{ width: 26, height: 6, borderRadius: '50%', background: 'rgba(0,0,0,.22)', marginTop: 'auto' }} />
    </div>
  );
}

export const TrailMap = memo(TrailMapImpl);
export default TrailMap;
