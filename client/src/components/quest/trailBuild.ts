/* eslint-disable @typescript-eslint/no-explicit-any */
// Quest Trail (NEW-40): the map's layout, ported from the mock-up's TrailMap (design artifact S9jixBq4Jycm8ZJZwzeigH).
// One world's map for a trail of any length: the winding trail with its spaces, two streams with bridges, the
// shortcuts and slides routed around the trail, place names, landmarks, scenery, and the night and sunset lights.
// Everything is drawn from a seeded random generator, so a world always looks the same. Text arrives escaped.

import { groundTex } from './groundArt';
import { LAYERS, castShadow, crescent } from './light';
import { NEW_THEMES } from './worldThemes';

export type WorldKey = 'summit' | 'frozen' | 'rainy' | 'blossom' | 'kites' | 'camp' | 'shores' | 'prairie' | 'orchard' | 'woods' | 'misty' | 'village';
export type SpaceKind = 'plain' | 'start' | 'finish' | 'coins' | 'card' | 'treat' | 'up' | 'down' | 'high';
/** Each month's world, January to December, as the server picks it (utils/quest.ts WORLDS) */
export const WORLDS: WorldKey[] = ['summit', 'frozen', 'rainy', 'blossom', 'kites', 'camp', 'shores', 'prairie', 'orchard', 'woods', 'misty', 'village'];
export const worldFor = (month: string): WorldKey => WORLDS[Number(month.slice(5, 7)) - 1] ?? 'woods';
/** The month before or after ('2026-12' + 1 = '2027-01') */
export function monthPlus(month: string, k: number): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + k;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}`;
}
/** How far up and down the map the months before and after blend in (about a phone screen) */
export const BLEND = 520;
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** How much of last month's world (top) and next month's (bottom) shows at a height: half at the edge, none past BLEND */
export const blendAt = (y: number, H: number) => ({
  prev: y < BLEND ? 0.5 * (1 - smooth(y / BLEND)) : 0,
  next: y > H - BLEND ? 0.5 * (1 - smooth((H - y) / BLEND)) : 0,
});
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** A colour mixed from this world's, last month's and next month's at a height */
export function mixAt(own: string, prev: string, next: string, y: number, H: number): string {
  const w = blendAt(y, H), a = hexRgb(own), p = hexRgb(prev), n = hexRgb(next);
  const v = a.map((c, i) => Math.round(c * (1 - w.prev - w.next) + p[i] * w.prev + n[i] * w.next));
  return '#' + v.map((c) => c.toString(16).padStart(2, '0')).join('');
}
export interface MapSpace { t: SpaceKind; n?: number; to?: number }

/** The words drawn on the map, in the viewer's language (escaped for HTML) */
export interface MapWords {
  start: string; finish: string; halfway: string; toGo: (n: number) => string;
  go: string; back: string; pill: (kind: 'go' | 'back', to: number) => string;
  regions: string[]; waters: string[];
  /** The sign below the finish: "On to December" */
  onward: string;
  key: { coins: string; coinsWhat: string; card: string; cardWhat: string; treat: string; treatWhat: string; upWhat: string; downWhat: string; high: string; highWhat: string };
}

export const META: Record<SpaceKind, { bg: string; fg: string; dark: string }> = {
  plain: { bg: '#FFFFFF', fg: '#6B5A4B', dark: '#6B5A4B' },
  start: { bg: '#FFEEE2', fg: '#C8430E', dark: '#8F2F09' },
  finish: { bg: '#C8430E', fg: '#FFFFFF', dark: '#8F2F09' },
  coins: { bg: '#FFD43B', fg: '#9A5B00', dark: '#B07A00' },
  up: { bg: '#D3F9D8', fg: '#2B8A3E', dark: '#1E6B2E' },
  down: { bg: '#FFE3E3', fg: '#C92A2A', dark: '#8F1D1D' },
  card: { bg: '#E5DBFF', fg: '#6741D9', dark: '#4A2DA8' },
  treat: { bg: '#FFDEEB', fg: '#C2255C', dark: '#8F1A43' },
  high: { bg: '#E7F1FB', fg: '#1971C2', dark: '#145A9C' },
};
export const ICONS: Record<string, string> = {
  plain: 'M12 9a3 3 0 100 6 3 3 0 100-6z',
  start: 'M5 21V4M5 4h11l-2 4 2 4H5',
  finish: 'M8 4h8v5a4 4 0 01-8 0V4zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8 20h8',
  coins: 'M12 4a8 8 0 100 16 8 8 0 100-16zM12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 100-7z',
  up: 'M5 6l7 6-7 6M12 6l7 6-7 6',
  down: 'M19 6l-7 6 7 6M12 6l-7 6 7 6',
  card: 'M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM9 8h6M9 12h6M9 16h3',
  treat: 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z',
  high: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
};

export const f1 = (v: number) => Math.round(v * 10) / 10;
export function ell(cx: number, cy: number, rx: number, ry: number, ang: number): string {
  const c = Math.cos(ang), s = Math.sin(ang), arc = 'A' + f1(rx) + ',' + f1(ry) + ' ' + f1(ang * 180 / Math.PI) + ' 1 0 ';
  const p1 = f1(cx - rx * c) + ',' + f1(cy - rx * s), p2 = f1(cx + rx * c) + ',' + f1(cy + rx * s);
  return 'M' + p1 + arc + p2 + arc + p1 + 'Z';
}
export const circ = (cx: number, cy: number, rr: number) => ell(cx, cy, rr, rr, 0);
const bar = (x1: number, y1: number, x2: number, y2: number) => 'M' + f1(x1) + ',' + f1(y1) + 'H' + f1(x2) + 'V' + f1(y2) + 'H' + f1(x1) + 'Z';
/** A die face's pips, on a 15×15 tile */
export function pips(n: number): string {
  const L = 4, M = 7.5, R = 11;
  const at: Record<number, number[][]> = { 1: [[M, M]], 2: [[L, L], [R, R]], 3: [[L, L], [M, M], [R, R]], 4: [[L, L], [R, L], [L, R], [R, R]], 5: [[L, L], [R, L], [M, M], [L, R], [R, R]], 6: [[L, L], [L, M], [L, R], [R, L], [R, M], [R, R]] };
  return (at[n] || []).map((p) => circ(p[0], p[1], 1.6)).join('');
}
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pt { x: number; y: number }
interface Curve { A: Pt; C1: Pt; C2: Pt; Z: Pt }
export type Built = Record<string, any> & {
  N: number; H: number; Y1: number; len: number; at: (s: number) => Pt;
  discs: any[]; routes: (Curve & { from: number; to: number })[];
};
const CACHE = new Map<string, Built>();

const FIRST_THEMES: Record<string, any> = {
  woods: {
    seed: 11,
    fogC: '246, 242, 228',
    land: { kind: 'hills', c: ['#CEC27A', 'none', 'none', '#B8AA5B', '#9E9049', 'none', '#D9480F'] },
    surface: { bits: 'leaves', c: ['#E8590C', '#C92A2A', '#F2B33D'] },
    bridgeOn: { plank: '#9C6A3A', line: '#5E3A1C', lineDash: 'none', lineO: 0.55, rail: '#6B4423', railW: 8, railDash: 'none' },
    flock: { kind: 'birds', c: '#6B4A2E' },
    finLights: [[68, 62, 22], [102, 62, 22], [85, 66, 30]],
    lifeKinds: ['reeds', 'fish', 'reeds'],
    bugs: 'fireflies',
    amp: 118, phase: 0.5,
    zig: { m: 2.2, R: 54, wave: [10, 290] },
    ground: '#DDE4BA', ink: '#45311F', muted: '#6B5440', accent: '#D9480F', accentInk: '#A8380B',
    tex: { kind: 'litter', dark: '#8E9A4E', lite: '#F4F7E4', bits: ['#E8590C', '#C92A2A', '#F2B33D', '#B07A3A'] },
    banner: '#FFF7E6', edge: '#B98E5A', edgeDark: '#8C6638', trail: '#ECD3A3', dash: '#C9A672', stone: '#FFF8EA',
    water: '#5FA8C6', waterLight: '#8FCBE0', ripple: '#FFFFFF', flowVals: '0;-46', plank: '#A0703F', rail: '#6B4423',
    density: 0.56,
    kinds: [
      ['round', 44, { c1: ['#E8590C', '#F08C00', '#D9480F', '#F2B33D', '#C92A2A'], c2: '#FFE3A8', c3: '#5C1F06' }],
      ['pine', 18, { c1: '#2F6B3A', c2: '#3F8A4B', o2: 0 }],
      ['bush', 12, { c1: '#7F8F3C', c2: '#A9B962', c3: '#C92A2A' }],
      ['leaves', 12, { c1: '#E8590C', c2: '#F59F00', c3: '#C92A2A' }],
      ['rock', 8, { c1: '#A39B8B', c2: '#C8C1B2' }],
      ['mushroom', 4, {}]
    ],
    regions: [
      { f: 0.06, kind: 'round', n: 4, mark: 'acorn', ms: 40 },
      { f: 0.3, kind: 'mushroom', n: 7, layout: 'ring' },
      { f: 0.48, kind: 'round', n: 4, mark: 'squirrel', ms: 50 },
      { f: 0.69, kind: 'pine', n: 5, mark: 'owl', ms: 50 },
      { f: 0.92, kind: 'bush', n: 4, mark: 'lantern', ms: 46, mn: 2 }
    ],
    waters: [{ f: 0.37, tilt: 0.12, critter: 'duck' }, { f: 0.79, tilt: -0.1 }],
    particle: { type: 'leaf', colors: ['#E8590C', '#F59F00', '#C92A2A', '#F2B33D'] },
    goS: { wave: [2.6, 24], halo: { c: '#FFFFFF', w: 9, o: 0.55 }, base: { c: '#2F7A3A', w: 3.6 }, deco: 'leaves', decoC: '#5DB04F', arrow: '#2F7A3A', as: 9 },
    backS: { halo: { c: '#FFFFFF', w: 15, o: 0.45 }, base: { c: '#7A4A26', w: 10 }, top: { c: '#A8754A', w: 3.5, d: '7 10', a: '0;-34' }, deco: 'splats', decoC: '#5E3518', arrow: '#5E3518', as: 12 }
  },
  summit: {
    seed: 23,
    fogC: '248, 251, 255',
    land: { kind: 'peaks', c: ['#AFC2D6', '#97ADC4', '#FFFFFF', '#A1B6CB', '#8299B2', '#FFFFFF', '#2B5F55'] },
    surface: { tracks: ['#C9D8E6', '#FFFFFF'] },
    bridgeOn: { plank: '#D6EAF8', line: '#FFFFFF', lineDash: 'none', lineO: 0.9, rail: '#9CC4E4', railW: 6, railDash: 'none' },
    flock: { kind: 'birds', c: '#4C6580' },
    finLights: [[56, 109, 26], [114, 109, 26], [85, 128, 28]],
    lifeKinds: [],
    bugs: 'stars',
    amp: 122, phase: -0.7,
    zig: { m: 1.7, R: 40, swing: 0.94, wave: [3, 300] },
    ground: '#E3EBF4', ink: '#24405C', muted: '#4C6580', accent: '#1F6FB2', accentInk: '#1F5F99',
    tex: { kind: 'snow', dark: '#93AED6', lite: '#FFFFFF' },
    banner: '#F8FBFF', edge: '#93AEC9', edgeDark: '#6D8CAB', trail: '#FFFFFF', dash: '#C9D8E6', stone: '#FFFFFF',
    water: '#A9D4EE', waterLight: '#DDF0FB', ripple: '#FFFFFF', flowVals: '0;0', plank: '#8A6A4F', rail: '#5E4632',
    density: 0.55,
    kinds: [
      ['pine', 48, { c1: ['#2B5F55', '#2F6B5E', '#24564C'], c2: '#FFFFFF', o2: 1 }],
      ['drift', 18, {}],
      ['bare', 10, {}],
      ['rock', 12, { c1: '#8C9BAB', c2: '#FFFFFF' }],
      ['bush', 6, { c1: '#3E6E62', c2: '#FFFFFF', c3: '#C92A2A' }],
      ['snowman', 3, {}]
    ],
    regions: [
      { f: 0.06, kind: 'pine', n: 4, mark: 'pinecone', ms: 40 },
      { f: 0.3, kind: 'snowman', n: 3 },
      { f: 0.48, kind: 'bare', n: 4, mark: 'icepond', ms: 60 },
      { f: 0.69, kind: 'pine', n: 5, mark: 'polarbear', ms: 56 },
      { f: 0.92, kind: 'drift', n: 4, mark: 'igloo', ms: 58 }
    ],
    waters: [{ f: 0.37, tilt: -0.1 }, { f: 0.79, tilt: 0.12 }],
    particle: { type: 'snow', colors: ['#FFFFFF'] },
    goS: { base: { c: '#6FA0CB', w: 12 }, top: { c: '#FFFFFF', w: 7.5 }, arrow: '#2D6EA3', as: 12 },
    backS: { halo: { c: '#FFFFFF', w: 5, o: 0.7 }, base: { c: '#34495E', w: 2.2 }, deco: 'chairs', decoC: '#D9480F', arrow: '#34495E', as: 9 }
  },
  blossom: {
    seed: 37,
    fogC: '244, 249, 238',
    land: { kind: 'fields', c: ['#7DBA5C', '#F06595', '#FCC419', '#9775FA', 'none', 'none', 'none'] },
    surface: { bits: 'petals', c: ['#F7A8C4', '#FFFFFF', '#FCC2D7'] },
    bridgeOn: { plank: '#CFC6B4', line: '#A39B8B', lineDash: '5 3', lineO: 0.8, rail: '#B3A994', railW: 8, railDash: 'none' },
    flock: { kind: 'butterflies', c: '#F783AC' },
    finLights: [[85, 62, 32], [45, 110, 20], [125, 110, 20]],
    lifeKinds: ['lilypad', 'reeds', 'fish', 'lilypad'],
    bugs: 'fireflies',
    amp: 116, phase: 2.1,
    zig: { m: 2.3, R: 58, dbl: [0, 0.5], drop: 16, wave: [5, 330] },
    ground: '#CFE8B7', ink: '#2C4A2E', muted: '#4D6B45', accent: '#D6336C', accentInk: '#B02A64',
    tex: { kind: 'spring', dark: '#5C9E3F', lite: '#F0F9E6', bits: ['#F7A8C4', '#FFFFFF', '#F28AB2'] },
    banner: '#FFFDF5', edge: '#C7A77A', edgeDark: '#9C7E52', trail: '#F7ECD5', dash: '#DCC7A0', stone: '#FFFDF6',
    water: '#62B8E0', waterLight: '#9FD6EF', ripple: '#FFFFFF', flowVals: '0;-46', plank: '#C08552', rail: '#8B5E34',
    density: 0.56,
    kinds: [
      ['round', 32, { c1: ['#F7A8C4', '#F28AB2', '#FFFFFF', '#FCC2D7'], c2: '#FFFFFF', c3: '#A61E4D' }],
      ['flowers', 28, { c1: ['#F06595', '#FCC419', '#9775FA', '#FF6B6B'], c2: '#FFF3BF', c3: ['#F783AC', '#FFD43B', '#B197FC'] }],
      ['bush', 14, { c1: '#69A84F', c2: '#8CC56E', c3: '#F06595' }],
      ['tuft', 14, { c1: '#5C9E3F' }],
      ['pine', 8, { c1: '#4D9A55', c2: '#6CB46F', o2: 0 }]
    ],
    regions: [
      { f: 0.06, kind: 'round', n: 4, mark: 'bunny', ms: 44 },
      { f: 0.3, kind: 'flowers', n: 8, mark: 'windmill', ms: 62 },
      { f: 0.48, kind: 'tuft', n: 6, mark: 'clover', ms: 34, mn: 2 },
      { f: 0.69, kind: 'pine', n: 5, mark: 'bluebell', ms: 40, mn: 2 },
      { f: 0.92, kind: 'flowers', n: 7, mark: 'beehive', ms: 50 }
    ],
    waters: [{ f: 0.36, tilt: 0.1 }, { f: 0.8, tilt: -0.12, critter: 'frog' }],
    particle: { type: 'petal', colors: ['#F7A8C4', '#FFFFFF', '#F28AB2'] },
    goS: { halo: { c: '#FFFFFF', w: 7.5, o: 0.9, d: '0.1 10', a: '0;-20' }, base: { c: '#D6336C', w: 3.8, d: '0.1 10', a: '0;-20' }, art: 'butterfly', artC: '#F783AC', art2C: '#862E9C', arrow: '#D6336C', as: 9 },
    backS: { base: { c: '#B0916B', w: 7, o: 0.5 }, deco: 'steps', decoC: '#6B4E31', arrow: '#6B4E31', as: 10 }
  },
  shores: {
    seed: 53,
    fogC: '255, 249, 232',
    land: { kind: 'bays', c: ['#E9C982', '#4FC0D3', '#7FD3E2', '#FFFFFF', '#A0522D', '#FFFFFF', 'none'] },
    surface: { planks: '#E2C38C' },
    bridgeOn: { plank: '#C99A62', line: '#8B5E34', lineDash: 'none', lineO: 0.6, rail: '#EAD9B5', railW: 3.4, railDash: '5 2.5' },
    flock: { kind: 'birds', c: '#56636E' },
    finLights: [[85, 43, 62], [85, 43, 26]],
    lifeKinds: ['fish', 'fish'],
    bugs: 'fireflies',
    amp: 120, phase: 1.2,
    zig: { m: 2.5, R: 74, wave: [10, 380] },
    ground: '#F6E4B5', ink: '#0E4F57', muted: '#5B4A2A', accent: '#0E8A96', accentInk: '#0E7C86',
    tex: { kind: 'sand', dark: '#D2A562', lite: '#FFFBEF', bits: ['#FFFFFF', '#FFC2B3', '#FFE3D6'] },
    banner: '#FFFBEF', edge: '#D2A562', edgeDark: '#A67C3D', trail: '#FFF5DD', dash: '#E4C489', stone: '#FFFDF4',
    water: '#34B3C2', waterLight: '#79D5DE', ripple: '#FFFFFF', flowVals: '0;-46', plank: '#B07A45', rail: '#7A4E26',
    density: 0.5,
    kinds: [
      ['palm', 30, {}],
      ['tuft', 20, { c1: '#8DB255' }],
      ['star', 10, { c1: ['#FF8A65', '#F06595', '#FFA94D'] }],
      ['rock', 12, { c1: '#BFA98A', c2: '#D9C7A8' }],
      ['bush', 12, { c1: '#5DA04A', c2: '#82C26C', c3: '#FF6B6B' }],
      ['umbrella', 5, { c1: ['#FF6B6B', '#4DABF7', '#FCC419'], c2: ['#4DABF7', '#FF8787', '#69DB7C'] }],
      ['flowers', 7, { c1: ['#FF6B6B', '#F783AC'], c2: '#FFF3BF', c3: ['#FF8787', '#FFA94D'] }]
    ],
    regions: [
      { f: 0.06, kind: 'palm', n: 4 },
      { f: 0.3, kind: 'star', n: 6, mark: 'shell', ms: 32, mn: 2 },
      { f: 0.48, kind: 'tuft', n: 6, mark: 'sandcastle', ms: 54 },
      { f: 0.69, kind: 'palm', n: 4 },
      { f: 0.92, kind: 'umbrella', n: 3, mark: 'beachball', ms: 34 }
    ],
    waters: [{ f: 0.38, tilt: -0.12 }, { f: 0.78, tilt: 0.1, critter: 'turtle' }],
    particle: { type: 'sparkle', colors: ['#FFFFFF', '#FFF3BF'] },
    goS: { wave: [3.4, 20], halo: { c: '#D0EBFF', w: 12, o: 0.95 }, base: { c: '#1C7ED6', w: 3.4 }, deco: 'foam', decoC: '#FFFFFF', arrow: '#1864AB', as: 9 },
    backS: { base: { c: '#D9B77E', w: 8, o: 0.6 }, deco: 'tracks', decoC: '#9C4A22', art: 'crab', artC: '#E8590C', art2C: '#2A2017', arrow: '#C92A2A', as: 10 }
  }
};

export const THEMES: Record<WorldKey, any> = { ...FIRST_THEMES, ...NEW_THEMES } as Record<WorldKey, any>;

/**
 * One landscape feature in a pocket beside the trail, into the land layers L.l1–l7. S gets what the sun adds (ENH-37):
 * S.s<k> shade and S.h<k> light, each drawn just after land layer k (0: under all of them).
 */
function drawLand(kind: string, p: { x: number; y: number; R: number }, L: Record<string, string[]>, mid = 195, S: Record<string, string[]> = {}): void {
  const x = p.x, y = p.y, R = p.R, put = (k: string, d: string) => (S[k] ??= []).push(d);
  if (kind === 'hills') {
    const mound = (mx: any, base: any, w: any, h: any) => 'M' + f1(mx - w) + ',' + f1(base) + 'C' + f1(mx - w * 0.55) + ',' + f1(base - h * 1.3) + ' ' + f1(mx + w * 0.55) + ',' + f1(base - h * 1.3) + ' ' + f1(mx + w) + ',' + f1(base) + 'Z';
    const bx = x + R * 0.28, bb = y + R * 0.45, bh = R * 0.85, fx = x - R * 0.18, fb = y + R * 0.6, fh = R * 0.7;
    L.l1.push(mound(bx, bb, R * 0.72, bh));
    L.l4.push(mound(fx, fb, R * 0.86, fh));
    for (let k = 1; k <= 3; k++) {
      const yy = fb - R * 0.17 * k, half = R * 0.86 * (1 - 0.22 * k) * 0.8;
      for (let xx = fx - half; xx <= fx + half; xx += 11) L.l5.push(ell(xx, yy, 3.6, 1.6, 0));
    }
    const top = bb - bh * 0.97;
    [-0.3, 0, 0.3].forEach((t) => L.l7.push(circ(bx + R * t, top + Math.abs(t) * R * 0.3 - 2, 6.5)));
    // The sun: each mound's right flank in shade (the right half of its outline, back to the foot) and a lit rim on
    // its upper left; the trees on top shaded like the ones on the ground
    const sides = (mx: number, base: number, w: number, h: number, k: string) => {
      const P = (dx: number, dy: number) => f1(mx + w * dx) + ',' + f1(base - h * dy), crest = P(0, 0.975);
      put('s' + k, 'M' + crest + 'C' + P(0.3875, 0.975) + ' ' + P(0.775, 0.65) + ' ' + P(1, 0) + 'L' + P(0.45, 0) + 'C' + P(0.5, 0.4) + ' ' + P(0.35, 0.85) + ' ' + crest + 'Z');
      put('h' + k, 'M' + P(-1, 0) + 'C' + P(-0.775, 0.65) + ' ' + P(-0.3875, 0.975) + ' ' + crest + 'C' + P(-0.4, 0.86) + ' ' + P(-0.75, 0.45) + ' ' + P(-0.93, 0) + 'Z');
    };
    sides(bx, bb, R * 0.72, bh, '1');
    sides(fx, fb, R * 0.86, fh, '5');
    [-0.3, 0, 0.3].forEach((t) => {
      const cx = bx + R * t, cy = top + Math.abs(t) * R * 0.3 - 2;
      put('s7', crescent(cx, cy, 6.5, 6.5, 2.8));
      put('h7', crescent(cx, cy, 6.5, 6.5, 1.6, true));
    });
  } else if (kind === 'peaks') {
    const peak = (px: any, base: any, w: any, h: any, A: any, Bs: any, C: any) => {
      A.push('M' + f1(px - w) + ',' + f1(base) + 'L' + f1(px) + ',' + f1(base - h) + 'L' + f1(px + w) + ',' + f1(base) + 'Z');
      put(A === L.l1 ? 'h1' : 'h4', 'M' + f1(px) + ',' + f1(base - h) + 'L' + f1(px - w) + ',' + f1(base) + 'L' + f1(px - w * 0.7) + ',' + f1(base) + 'Z');
      Bs.push('M' + f1(px) + ',' + f1(base - h) + 'L' + f1(px + w) + ',' + f1(base) + 'L' + f1(px + w * 0.15) + ',' + f1(base) + 'Z');
      C.push('M' + f1(px) + ',' + f1(base - h) + 'L' + f1(px + w * 0.36) + ',' + f1(base - h * 0.64) + 'L' + f1(px + w * 0.16) + ',' + f1(base - h * 0.57) +
        'L' + f1(px) + ',' + f1(base - h * 0.68) + 'L' + f1(px - w * 0.18) + ',' + f1(base - h * 0.56) + 'L' + f1(px - w * 0.36) + ',' + f1(base - h * 0.64) + 'Z');
    };
    const base = y + R * 0.62;
    peak(x - R * 0.42, base - R * 0.05, R * 0.5, R * 0.95, L.l1, L.l2, L.l3);
    peak(x + R * 0.45, base - R * 0.04, R * 0.46, R * 0.82, L.l1, L.l2, L.l3);
    peak(x + R * 0.02, base, R * 0.62, R * 1.3, L.l4, L.l5, L.l6);
    for (let k = -2; k <= 2; k++) {
      const tx = x + k * R * 0.3, ty = base + 3 + (k % 2 ? 4 : 0);
      L.l7.push('M' + f1(tx) + ',' + f1(ty - 15) + 'L' + f1(tx + 6) + ',' + f1(ty) + 'L' + f1(tx - 6) + ',' + f1(ty) + 'Z');
      put('s7', 'M' + f1(tx) + ',' + f1(ty - 15) + 'L' + f1(tx + 6) + ',' + f1(ty) + 'L' + f1(tx) + ',' + f1(ty) + 'Z');
    }
  } else if (kind === 'fields') {
    const a = R * 0.95, b = R * 0.62, rows = [L.l2, L.l3, L.l4];
    L.l1.push(ell(x, y, a, b, 0));
    put('s0', ell(x + 2.6, y + 2.8, a, b, 0));
    let k = 0;
    for (let yy = y - b + 7; yy + 6 < y + b - 5; yy += 11, k++) {
      const y2 = yy + 6;
      const w1 = a * Math.sqrt(Math.max(0, 1 - Math.pow((yy - y) / b, 2))) - 8, w2 = a * Math.sqrt(Math.max(0, 1 - Math.pow((y2 - y) / b, 2))) - 8;
      if (w1 < 6 || w2 < 6) continue;
      rows[k % 3].push('M' + f1(x - w1) + ',' + f1(yy) + 'L' + f1(x + w1) + ',' + f1(yy) + 'L' + f1(x + w2) + ',' + f1(y2) + 'L' + f1(x - w2) + ',' + f1(y2) + 'Z');
      put('s1', 'M' + f1(x - w2 + 1.2) + ',' + f1(y2) + 'L' + f1(x + w2) + ',' + f1(y2) + 'L' + f1(x + w2 + 1.2) + ',' + f1(y2 + 1.8) + 'L' + f1(x - w2 + 2.4) + ',' + f1(y2 + 1.8) + 'Z');
    }
  } else if (kind === 'bays') {
    const side = x < mid - 45 ? -1 : (x > mid + 45 ? 1 : 0), cx = x + side * R * 0.4, rx = side ? R * 1.3 : R * 0.95, ry = R * 0.66;
    L.l1.push(ell(cx, y, rx + 8, ry + 7, 0));
    L.l2.push(ell(cx, y, rx, ry, 0));
    L.l3.push(ell(cx + side * rx * 0.15, y + 2, rx * 0.62, ry * 0.55, 0));
    put('s4', crescent(f1(cx), f1(y), f1(rx), f1(ry), Math.min(9, ry * 0.3), true));
    put('h4', crescent(f1(cx), f1(y), f1(rx), f1(ry), Math.min(5, ry * 0.16)));
    for (let k = 0; k < 6; k++) {
      const wx = x + (k - 2.5) * R * 0.26, wy = y - ry * 0.5 + (k % 3) * ry * 0.4;
      if (Math.pow((wx - cx) / rx, 2) + Math.pow((wy - y) / ry, 2) > 0.7) continue;
      L.l4.push('M' + f1(wx - 6) + ',' + f1(wy) + 'Q' + f1(wx) + ',' + f1(wy - 3.6) + ' ' + f1(wx + 6) + ',' + f1(wy) + 'Q' + f1(wx) + ',' + f1(wy - 1.8) + ' ' + f1(wx - 6) + ',' + f1(wy) + 'Z');
    }
    const bx = x + side * R * 0.25, by = y + 6;
    put('s4', ell(bx + 3.5, by + 5.5, 12, 2.4, 0));
    L.l5.push('M' + f1(bx - 11) + ',' + f1(by) + 'L' + f1(bx + 11) + ',' + f1(by) + 'L' + f1(bx + 7) + ',' + f1(by + 5) + 'L' + f1(bx - 7) + ',' + f1(by + 5) + 'Z' + bar(bx - 0.7, by - 17, bx + 0.7, by));
    L.l6.push('M' + f1(bx + 1.2) + ',' + f1(by - 16) + 'L' + f1(bx + 1.2) + ',' + f1(by - 2) + 'L' + f1(bx + 10) + ',' + f1(by - 2) + 'Z' +
      'M' + f1(bx - 1.2) + ',' + f1(by - 12) + 'L' + f1(bx - 1.2) + ',' + f1(by - 2) + 'L' + f1(bx - 7) + ',' + f1(by - 2) + 'Z');
  }
}

/**
 * mapW: the map's width. Phones get 390 px. A wider screen gets a wider map: the trail zigzags across it in long,
 * gently sloping runs, so more of it fits on screen. At 390 everything below works out exactly as it always has.
 */
export function buildTrail(key: WorldKey, N: number, spaces: Record<number, MapSpace>, W: MapWords, landOn = true, around?: { prev: WorldKey; next: WorldKey }, mapW = 390): Built {
  const S: Record<number, MapSpace> = { ...spaces, 0: { t: 'start' }, [N]: { t: 'finish' } };
  const idx = WORLDS.indexOf(key), prevKey = around?.prev ?? WORLDS[(idx + 11) % 12], nextKey = around?.next ?? WORLDS[(idx + 1) % 12];
  const ck = [key, prevKey, nextKey, N, JSON.stringify(spaces), JSON.stringify(W), landOn, mapW].join('|');
  const hit = CACHE.get(ck);
  if (hit) return hit;
  const T0 = THEMES[key];
  const T = { ...T0, regions: T0.regions.map((rg: any, i: number) => ({ ...rg, name: W.regions[i] })), waters: T0.waters.map((w: any, i: number) => ({ ...w, name: W.waters[i] })) };
  const r = rng(T.seed);
  const pick = (v: any) => Array.isArray(v) ? v[Math.floor(r() * v.length)] : v;
  const TP = THEMES[prevKey], TN = THEMES[nextKey];
  const wide = mapW > 390, mid = mapW / 2, kx = mapW / 390;
  // The title banner, the map key and the compass: stacked on a phone, side by side when the map is wide enough
  const row = mapW >= 770;
  // Y0: the start, far enough below the map key that a crowd of pieces on Start stays clear of it
  const Y0 = row ? 310 : 440, K = 2 * Math.PI / 470;
  // A phone's trail winds gently down the middle. A wide map's zigzags between its sides: straight runs sloping
  // gently down, joined by round bends where the trail runs straight down for a moment (where the streams cross).
  let fx = (y: any) => 195 + T.amp * Math.sin(K * (y - Y0) + T.phase) + 9 * Math.sin(2.6 * K * (y - Y0) + T.phase * 1.7);
  const bends: Pt[] = [];
  if (wide) {
    // Each world zigzags its own way (THEMES zig): m how far a run goes sideways for each step down (m2 for the runs
    // to the right, if different), R how round the bends, swing how much of the width the runs cover, wave a gentle
    // sway [size, length], dbl now and then a double bend part way along a run (where along it, run after run; 0 for
    // none) with a short straight drop in the middle
    const Z = { m: 2.2, R: 54, swing: 1, wave: [6, 330], dbl: [0], drop: 0, ...T.zig };
    const half = (mid - 96 - mapW * 0.03) * Z.swing, xL = mid - half, xR = mid + half;
    const slope = (dir: number) => (dir > 0 && Z.m2) || Z.m;
    const sc = (m: number) => [Math.sin(Math.atan(m)), Math.cos(Math.atan(m))];
    // The trail as parts down the map, each giving x for a y: arcs, runs and drops
    const parts: { y0: number; y1: number; x: (y: number) => number }[] = [];
    // From straight down onto a run heading dir (-1 left, 1 right), from a run onto straight down, a run, a drop
    const leave = (x: number, y: number, dir: number, r: number, m: number) => {
      const [sT, cT] = sc(m), cx = x + dir * r;
      parts.push({ y0: y, y1: y + r * sT, x: (v) => cx - dir * Math.sqrt(Math.max(0, r * r - (v - y) ** 2)) });
      return [x + dir * r * (1 - cT), y + r * sT];
    };
    const arrive = (x: number, y: number, dir: number, r: number, m: number) => {
      const [sT, cT] = sc(m), ax = x + dir * r * (1 - cT), ay = y + r * sT, cx = ax - dir * r;
      parts.push({ y0: y, y1: ay, x: (v) => cx + dir * Math.sqrt(Math.max(0, r * r - (v - ay) ** 2)) });
      return [ax, ay];
    };
    const run = (x: number, y: number, dir: number, dx: number, m: number) => {
      parts.push({ y0: y, y1: y + dx / m, x: (v) => x + dir * m * (v - y) });
      return [x + dir * dx, y + dx / m];
    };
    const drop = (x: number, y: number, h: number) => { parts.push({ y0: y, y1: y + h, x: () => x }); return [x, y + h]; };
    // Start at a bend (right or left, by world), heading straight down; then run after run until well past the finish
    let dir = T.phase >= 0 ? 1 : -1, x = dir > 0 ? xL : xR, y = Y0;
    const apexes = [Y0];
    [x, y] = leave(x, y, dir, Z.R, slope(dir));
    for (let k = 0; y < Y0 + 60 * N + 400; k++) {
      const m = slope(dir), end = (dir > 0 ? xR : xL) - dir * Z.R * (1 - sc(m)[1]), at = Z.dbl[k % Z.dbl.length];
      if (at > 0) {
        const r = Z.R * 0.6, span = Math.abs(end - x) - 2 * r * (1 - sc(m)[1]);
        [x, y] = run(x, y, dir, span * at, m);
        [x, y] = arrive(x, y, dir, r, m);
        [x, y] = drop(x, y, Z.drop);
        [x, y] = leave(x, y, dir, r, m);
      }
      [x, y] = run(x, y, dir, Math.abs(end - x), m);
      [x, y] = arrive(x, y, dir, Z.R, m);
      apexes.push(y);
      if (y > Y0 + 60) bends.push({ x, y });
      dir = -dir;
      [x, y] = leave(x, y, dir, Z.R, slope(dir));
    }
    // The sway fades out at the bends, so the trail runs straight down where a stream crosses
    let pi = 0;
    fx = (y: any) => {
      while (pi > 0 && y < parts[pi].y0) pi--;
      while (pi < parts.length - 1 && y >= parts[pi].y1) pi++;
      const fade = smooth(Math.min(...apexes.map((a) => Math.abs(y - a))) / 70);
      return parts[pi].x(y) + fade * Z.wave[0] * Math.sin(2 * Math.PI * (y - Y0) / Z.wave[1] + T.phase * 1.7);
    };
  }
  // Samples down the trail: every 4 px on a phone, every 2 px on a wide map (its runs cover more ground)
  const STEP = wide ? 2 : 4, WIN = wide ? 80 : 24;
  let Y1 = Y0 + Math.round(3364 * N / 80);
  if (wide) {
    // As long as the trail needs to be for about 60 px a space
    let s = 0, y = Y0, x = fx(Y0);
    while (s < 60 * N) { const x2 = fx(y + STEP); s += Math.hypot(x2 - x, STEP); x = x2; y += STEP; }
    Y1 = y;
  }
  const H = Y1 + 300;

  // The trail, with the spaces spread evenly along it
  const pts: any[] = [];
  let len = 0;
  for (let y = Y0; y <= Y1 + 0.001; y += STEP) {
    const p = { x: fx(y), y: y, s: 0 };
    if (pts.length) { const q = pts[pts.length - 1]; len += Math.hypot(p.x - q.x, p.y - q.y); }
    p.s = len;
    pts.push(p);
  }
  const at = (s: any) => {
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].s < s) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const t = Math.max(0, Math.min(1, (s - a.s) / ((b.s - a.s) || 1)));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const sp: any[] = [];
  for (let i = 0; i <= N; i++) sp.push(at(len * i / N));
  const M = META, IC = ICONS;
  const kindOf = (i: any) => (S[i] || { t: 'plain' }).t;
  const rad = sp.map((_p, i) => kindOf(i) === 'plain' ? 15 : (kindOf(i) === 'start' || kindOf(i) === 'finish' ? 23 : 20));
  const dist = (x: any, y: any) => {
    const i = Math.round((y - Y0) / STEP);
    let best = Infinity;
    for (let j = Math.max(0, i - WIN); j <= Math.min(pts.length - 1, i + WIN); j++) {
      const p = pts[j], d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < best) best = d;
    }
    if (best === Infinity) {
      const p = y < Y0 ? pts[0] : pts[pts.length - 1];
      best = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    }
    return Math.sqrt(best);
  };

  // Two streams, each with a bridge where the trail crosses it
  const usedBends: Pt[] = [], streamYs: number[] = [];
  const streams = T.waters.map((w: any, wi: any) => {
    let wy0 = Y0 + w.f * (Y1 - Y0);
    let fy = (x: any) => wy0 + 12 * Math.sin(x / 46 + T.phase + wi * 2.3) + (x - 195) * w.tilt;
    if (wide) {
      // On a wide map: at the bend nearest its place, where the trail runs straight down. A short trail may have too
      // few bends: then as far as can be from the other stream, the start and the finish, its bridge on a run.
      const bend = bends.filter((b) => b.y < Y1 - 110 && !usedBends.includes(b)).sort((a, b) => Math.abs(a.y - wy0) - Math.abs(b.y - wy0))[0];
      if (bend) { usedBends.push(bend); wy0 = bend.y; } else {
        let best = -1;
        for (let y = Y0 + 100; y <= Y1 - 120; y += 10) {
          const room = Math.min(y - Y0, Y1 - y, ...streamYs.map((v) => Math.abs(v - y)));
          if (room > best) { best = room; wy0 = y; }
        }
      }
      streamYs.push(wy0);
      const bx = bend ? bend.x : fx(wy0);
      fy = (x: any) => wy0 + 7 * Math.sin((x - bx) / 52 + T.phase + wi * 2.3) + (x - bx) * w.tilt * 0.3;
    }
    const wp: any[] = [];
    for (let x = -20; x <= mapW + 20; x += 10) wp.push(f1(x) + ',' + f1(fy(x)));
    let bi = 0, bd = Infinity;
    pts.forEach((p, i) => {
      if (Math.abs(p.y - wy0) > (wide ? 110 : 160)) return;
      const d = Math.abs(p.y - fy(p.x));
      if (d < bd) { bd = d; bi = i; }
    });
    const bp = pts[bi], b2 = pts[Math.min(pts.length - 1, bi + 2)], b0 = pts[Math.max(0, bi - 2)];
    const bang = Math.atan2(b2.y - b0.y, b2.x - b0.x) * 180 / Math.PI;
    // A bridge on a slanting run gets longer, to reach across the water
    const cross = Math.abs(Math.sin(Math.atan2(b2.y - b0.y, b2.x - b0.x) - Math.atan2(fy(bp.x + 5) - fy(bp.x - 5), 10)));
    const stretch = wide ? Math.min(2.2, Math.max(1, (36 / Math.max(0.3, cross) + 18) / 62)) : 1;
    return { fy, name: w.name, critter: w.critter, bx: bp.x, d: 'M' + wp.join('L'), bridge: 'translate(' + f1(bp.x) + ' ' + f1(bp.y) + ') rotate(' + f1(bang) + ')' + (stretch > 1.02 ? ' scale(' + stretch.toFixed(2) + ' 1)' : '') };
  });
  const end = pts[pts.length - 1];
  const finX = Math.max(100, Math.min(mapW - 100, end.x));
  // The trail comes in from the top edge (last month's map) and leaves past the finish at the bottom (next month's)
  const p0 = pts[0];
  const trailD = 'M' + mid + ',-30C' + mid + ',' + f1(Y0 - 200) + ' ' + f1(p0.x) + ',' + f1(Y0 - 160) + ' ' + f1(p0.x) + ',' + f1(Y0) + 'L' + pts.filter((_p, i) => i % 2 === 0).map((p) => f1(p.x) + ',' + f1(p.y)).join('L') +
    'L' + f1(end.x) + ',' + f1(end.y) + 'Q' + f1(end.x) + ',' + (Y1 + 70) + ' ' + f1(finX) + ',' + (Y1 + 140) + 'Q' + f1(finX) + ',' + (Y1 + 250) + ' ' + mid + ',' + (H + 30);

  // Everything placed on the map keeps clear of the spaces, the lines and each other
  const rects: any[] = [];
  const linePts: any[] = [];
  const hitRect = (b: any) => rects.some((q) => q.x1 < b.x2 && q.x2 > b.x1 && q.y1 < b.y2 && q.y2 > b.y1);
  const hitDisc = (b: any, m: any) => sp.some((p, i) => p.x + rad[i] + m > b.x1 && p.x - rad[i] - m < b.x2 && p.y + rad[i] + m > b.y1 && p.y - rad[i] - m < b.y2);
  const hitLine = (b: any, m: any) => linePts.some((q) => q.x > b.x1 - m && q.x < b.x2 + m && q.y > b.y1 - m && q.y < b.y2 + m);
  const grid = (b: any, fn: any) => {
    const nx = Math.max(1, Math.ceil((b.x2 - b.x1) / 8)), ny = Math.max(1, Math.ceil((b.y2 - b.y1) / 8));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) if (fn(b.x1 + (b.x2 - b.x1) * i / nx, b.y1 + (b.y2 - b.y1) * j / ny)) return true;
    return false;
  };
  const hitTrail = (b: any, m: any) => grid(b, (x: any, y: any) => dist(x, y) < 23 + m);
  const hitWater = (b: any, m: any) => grid(b, (x: any, y: any) => streams.some((s: any) => Math.abs(y - s.fy(x)) < 18 + m));
  const inMap = (b: any) => b.x1 >= 4 && b.x2 <= mapW - 4 && b.y1 >= 4 && b.y2 <= H - 4;
  const free = (b: any, o: any) => inMap(b) && !hitRect(b) && !hitDisc(b, o.disc) && !(o.trail != null && hitTrail(b, o.trail)) &&
    !(o.line != null && hitLine(b, o.line)) && !(o.water != null && hitWater(b, o.water));
  // Signs (place names, signposts, "On to …") keep about a sign's height apart, so two never read as one double sign.
  // signRoom: the room to the nearest sign, 1 or more when it's enough (14 px beside it, 26 px above or below).
  const signRects: any[] = [];
  const signRoom = (b: any) => signRects.reduce((m, q) => Math.min(m, Math.max(Math.max(q.x1 - b.x2, b.x1 - q.x2) / 14, Math.max(q.y1 - b.y2, b.y1 - q.y2) / 26)), Infinity);

  // The title banner (top left), the compass (top right) and the map key: under the banner on a phone, beside the
  // compass on a wide map. On a phone the page's progress bar runs down the map's right edge, so the banner, compass
  // and key stop short of it there (FIX-40); a wide page has the bar in its own strip beside the map.
  const keyAt = row ? { left: mapW - 96 - 358, top: 22, w: 358, bannerW: 282, compassRight: 18, compassSize: 64 }
    : wide ? { left: 16, top: 146, w: 358, bannerW: 282, compassRight: 18, compassSize: 64 }
      : { left: 16, top: 146, w: 332, bannerW: 276, compassRight: 42, compassSize: 52 };
  rects.push({ x1: 8, y1: 12, x2: 298, y2: 136 });
  rects.push({ x1: mapW - 92, y1: 8, x2: mapW, y2: 122 });
  rects.push(row ? { x1: keyAt.left - 8, y1: 12, x2: keyAt.left + 366, y2: 232 } : { x1: 8, y1: 136, x2: 382, y2: 336 });
  rects.push({ x1: finX - 88, y1: Y1 + 30, x2: finX + 88, y2: Y1 + 206 });
  const prizeLeft = Math.max(14, Math.min(wide ? mapW - 334 : 56, finX - 160));
  rects.push({ x1: prizeLeft - 4, y1: Y1 + 208, x2: prizeLeft + 324, y2: Y1 + 296 });
  const mark = (i: any, text: any, w: any) => {
    // On a wide map the trail can meet Start or the finish from the side: the tag goes on the side away from it
    const p = sp[i], q = sp[i === 0 ? 1 : i - 1], away = wide && Math.abs(q.x - p.x) > rad[i] ? q.x < p.x : p.x < mid;
    const left = away ? p.x + rad[i] + 24 : p.x - rad[i] - 24 - w;
    rects.push({ x1: left - 2, y1: p.y - 15, x2: left + w + 2, y2: p.y + 15 });
    return { text, left: f1(left), top: f1(p.y - 13) };
  };
  const marks = [mark(0, W.start, W.start.length * 8.4 + 16), mark(N, W.finish, W.finish.length * 8.4 + 16)];
  // Room for the start gate and the finish balloons
  const gate = { left: f1(sp[0].x - 50), top: f1(sp[0].y - 58) };
  rects.push({ x1: sp[0].x - 52, y1: sp[0].y - 60, x2: sp[0].x + 52, y2: sp[0].y + 24 });
  // Last month's finish, small and far behind the start; the "On to …" sign beside this month's finish
  let lookBack: any = null, onward: any = null;
  if (prevKey !== key) {
    for (const dx of [-112, 112, -140, 140, -84, 84]) {
      const cx = sp[0].x + dx, top = Math.max(row ? 238 : 340, sp[0].y - 62), b = { x1: cx - 34, y1: top, x2: cx + 34, y2: top + 64 };
      if (inMap(b) && !hitRect(b) && !hitDisc(b, 6) && !hitTrail(b, 2)) { rects.push(b); lookBack = { left: f1(b.x1), top: f1(b.y1), key: prevKey }; break; }
    }
  }
  {
    const w = Math.max(84, W.onward.replace(/&[a-z#0-9]+;/g, 'x').length * 7.2 + 30);
    for (const dy of [120, 150, 90, 170]) {
      const right = [finX + 92 + w / 2, finX + 104 + w / 2], left = [finX - 92 - w / 2, finX - 104 - w / 2];
      for (const cx of finX < mid ? right.concat(left) : left.concat(right)) {
        const b = { x1: cx - w / 2, y1: Y1 + dy - 30, x2: cx + w / 2, y2: Y1 + dy + 34 };
        if (inMap(b) && !hitRect(b) && !hitDisc(b, 4)) { rects.push(b); signRects.push(b); onward = { left: f1(b.x1), top: f1(b.y1), w: f1(w), text: W.onward }; break; }
      }
      if (onward) break;
    }
  }
  const fp = sp[N], pf = at(len - 34), pf2 = at(len - 30);
  const party = {
    lineLeft: f1((pf.x + pf2.x) / 2 - 27), lineTop: f1((pf.y + pf2.y) / 2 - 5),
    lineRot: f1(Math.atan2(pf2.y - pf.y, pf2.x - pf.x) * 180 / Math.PI + 90),
    bx: 0, by: 0, confetti: [] as any[]
  };
  const sides = fp.x < mid ? [-77, -96, 31, 50] : [31, 50, -77, -96];
  let spot = null;
  for (const dy of [-74, -96, -50, -120]) {
    for (const dx of sides) {
      const b = { x1: fp.x + dx - 2, y1: fp.y + dy - 2, x2: fp.x + dx + 46, y2: fp.y + dy + 76 };
      if (inMap(b) && !hitRect(b) && !hitDisc(b, 4)) { spot = b; break; }
    }
    if (spot) break;
  }
  spot = spot || { x1: fp.x + sides[0] - 2, y1: fp.y - 76, x2: fp.x + sides[0] + 46, y2: fp.y + 2 };
  party.bx = f1(spot.x1 + 2);
  party.by = f1(spot.y1 + 2);
  rects.push(spot);

  // Shortcuts and slides: curves routed around the trail so they never cross another space
  // Every line is a cubic curve: a simple bow first, an S-curve when a bow can't get around the trail
  const cp = (R: any, t: any) => {
    const u = 1 - t, a1 = u * u * u, a2 = 3 * u * u * t, a3 = 3 * u * t * t, a4 = t * t * t;
    return { x: a1 * R.A.x + a2 * R.C1.x + a3 * R.C2.x + a4 * R.Z.x, y: a1 * R.A.y + a2 * R.C1.y + a3 * R.C2.y + a4 * R.Z.y };
  };
  const toward = (P: any, C: any, d: any) => { const dx = C.x - P.x, dy = C.y - P.y, L = Math.hypot(dx, dy) || 1; return { x: P.x + dx / L * d, y: P.y + dy / L * d }; };
  const pairs: any[] = [];
  for (let k1 = -320; k1 <= 320; k1 += 16) for (let k2 = -320; k2 <= 320; k2 += 16) pairs.push([k1, k2]);
  pairs.sort((p, q) => (Math.abs(p[0]) + Math.abs(p[1])) - (Math.abs(q[0]) + Math.abs(q[1])));
  const route = (a: any, b: any) => {
    const P = sp[a], Q = sp[b];
    const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2, L = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
    const nx = -(Q.y - P.y) / L, ny = (Q.x - P.x) / L;
    const lo = Math.max(0, Math.min(a, b) - 14), hi = Math.min(N, Math.max(a, b) + 14);
    const make = (k: any) => {
      const C = { x: mx + nx * k, y: my + ny * k }, A = toward(P, C, rad[a] + 2), Z = toward(Q, C, rad[b] + 9);
      return { A, C1: { x: A.x + (C.x - A.x) * 2 / 3, y: A.y + (C.y - A.y) * 2 / 3 }, C2: { x: Z.x + (C.x - Z.x) * 2 / 3, y: Z.y + (C.y - Z.y) * 2 / 3 }, Z };
    };
    const make2 = (k1: any, k2: any) => {
      const C1 = { x: P.x + (Q.x - P.x) / 3 + nx * k1, y: P.y + (Q.y - P.y) / 3 + ny * k1 };
      const C2 = { x: P.x + (Q.x - P.x) * 2 / 3 + nx * k2, y: P.y + (Q.y - P.y) * 2 / 3 + ny * k2 };
      return { A: toward(P, C1, rad[a] + 2), C1, C2, Z: toward(Q, C2, rad[b] + 9) };
    };
    const clear = (q: any) => {
      if (q.x < 16 || q.x > mapW - 16) return false;
      for (let j = lo; j <= hi; j++) {
        if (j === a || j === b) continue;
        const dx = q.x - sp[j].x, dy = q.y - sp[j].y, mm = rad[j] + 12;
        if (dx * dx + dy * dy < mm * mm) return false;
      }
      return true;
    };
    const ok = (R: any, level: any) => {
      for (let i = 1; i < 18; i++) if (!clear(cp(R, i / 18))) return false;
      let s = 0, prev = null;
      const q0: any[] = [];
      for (let i = 0; i <= 72; i++) {
        const q = cp(R, i / 72);
        if (prev) s += Math.hypot(q.x - prev.x, q.y - prev.y);
        q0.push({ x: q.x, y: q.y, s });
        prev = q;
      }
      for (const q of q0) if (!clear(q)) return false;
      if (level < 1) for (const q of q0) if (q.s > 30 && q.s < s - 30 && dist(q.x, q.y) < 34) return false;
      if (level < 2) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const q of q0) { x1 = Math.min(x1, q.x); x2 = Math.max(x2, q.x); y1 = Math.min(y1, q.y); y2 = Math.max(y2, q.y); }
        const nearR = rects.filter((o) => o.x1 < x2 && o.x2 > x1 && o.y1 < y2 && o.y2 > y1);
        const nearL = linePts.filter((o) => o.x > x1 - 18 && o.x < x2 + 18 && o.y > y1 - 18 && o.y < y2 + 18);
        for (const q of q0) {
          if (nearR.some((o) => q.x > o.x1 && q.x < o.x2 && q.y > o.y1 && q.y < o.y2)) return false;
          if (nearL.some((o) => (o.x - q.x) * (o.x - q.x) + (o.y - q.y) * (o.y - q.y) < 324)) return false;
        }
      }
      return true;
    };
    // A bow that keeps off the trail, then a bow or S-curve that may cross the trail between spaces, then anything that misses the spaces
    for (const level of [0, 1, 2]) {
      for (let k = 0; k <= 400; k += 8) {
        for (const sd of [1, -1]) { const R = make(k * sd); if (ok(R, level)) return R; }
      }
      if (level > 0) for (const p of pairs) { const R = make2(p[0], p[1]); if (ok(R, level)) return R; }
    }
    return make(120);
  };
  const links = Object.entries(S).filter(([, s]) => s.t === 'up' || s.t === 'down').map(([k, s]) => [Number(k), s.to as number, s.t === 'up' ? 'go' : 'back'] as const);
  const routes = links.map((l) => {
    const R = route(l[0], l[1]);
    for (let i = 0; i <= 48; i++) linePts.push(cp(R, i / 48));
    return Object.assign(R, { from: l[0], to: l[1], kind: l[2] }) as any;
  });

  // Each world draws its own shortcut and slide: vines, mud, sled runs, ski lifts, butterflies, puddles, waves, crabs
  const dense = (R: any) => {
    const out: any[] = [];
    let s = 0, prev = null;
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, u = 1 - t, q = cp(R, t);
      const dx = 3 * u * u * (R.C1.x - R.A.x) + 6 * u * t * (R.C2.x - R.C1.x) + 3 * t * t * (R.Z.x - R.C2.x);
      const dy = 3 * u * u * (R.C1.y - R.A.y) + 6 * u * t * (R.C2.y - R.C1.y) + 3 * t * t * (R.Z.y - R.C2.y);
      const L = Math.hypot(dx, dy) || 1;
      if (prev) s += Math.hypot(q.x - prev.x, q.y - prev.y);
      out.push({ x: q.x, y: q.y, s, tx: dx / L, ty: dy / L, nx: -dy / L, ny: dx / L, a: Math.atan2(dy, dx) });
      prev = q;
    }
    return out;
  };
  const along = (D: any, s: any) => {
    let i = 1;
    while (i < D.length - 1 && D[i].s < s) i++;
    const a = D[i - 1], b = D[i], t = Math.max(0, Math.min(1, (s - a.s) / ((b.s - a.s) || 1)));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: b.tx, ty: b.ty, nx: b.nx, ny: b.ny, a: b.a };
  };
  const ell = (cx: any, cy: any, rx: any, ry: any, ang: any) => {
    const c = Math.cos(ang), s = Math.sin(ang), arc = 'A' + f1(rx) + ',' + f1(ry) + ' ' + f1(ang * 180 / Math.PI) + ' 1 0 ';
    const p1 = f1(cx - rx * c) + ',' + f1(cy - rx * s), p2 = f1(cx + rx * c) + ',' + f1(cy + rx * s);
    return 'M' + p1 + arc + p2 + arc + p1 + 'Z';
  };
  const circ = (cx: any, cy: any, rr: any) => ell(cx, cy, rr, rr, 0);
  const bar = (x1: any, y1: any, x2: any, y2: any) => 'M' + f1(x1) + ',' + f1(y1) + 'H' + f1(x2) + 'V' + f1(y2) + 'H' + f1(x1) + 'Z';
  const styled = (R: any, st: any) => {
    const D = dense(R), tot = D[D.length - 1].s;
    let line;
    if (st.wave) {
      const amp = st.wave[0], wl = st.wave[1];
      line = 'M' + D.map((p) => {
        const o = amp * Math.min(1, p.s / 10, (tot - p.s) / 10) * Math.sin(2 * Math.PI * p.s / wl);
        return f1(p.x + p.nx * o) + ',' + f1(p.y + p.ny * o);
      }).join('L');
    } else line = 'M' + f1(R.A.x) + ',' + f1(R.A.y) + 'C' + f1(R.C1.x) + ',' + f1(R.C1.y) + ' ' + f1(R.C2.x) + ',' + f1(R.C2.y) + ' ' + f1(R.Z.x) + ',' + f1(R.Z.y);
    const deco: any[] = [];
    const every = (step: any, from: any, fn: any) => { let k = 0; for (let s = from; s < tot - 10; s += step) fn(along(D, s), k++); };
    if (st.deco === 'leaves') every(13, 9, (p: any, k: any) => { const sd = k % 2 ? 1 : -1; deco.push(ell(p.x + p.nx * sd * 4.4, p.y + p.ny * sd * 4.4, 4.4, 2.1, p.a + sd * 0.7)); });
    if (st.deco === 'splats') every(17, 8, (p: any, k: any) => { const sd = k % 2 ? 1 : -1, o = 7.5 + r() * 2.2; deco.push(circ(p.x + p.nx * sd * o, p.y + p.ny * sd * o, 1.3 + r() * 1.2)); });
    if (st.deco === 'chairs') every(26, 14, (p: any) => { deco.push(bar(p.x - 0.6, p.y, p.x + 0.6, p.y + 7) + bar(p.x - 4.6, p.y + 7, p.x + 4.6, p.y + 10) + bar(p.x + 3, p.y + 2.6, p.x + 4.6, p.y + 10)); });
    if (st.deco === 'steps') every(11, 8, (p: any, k: any) => { const sd = k % 2 ? 1 : -1; deco.push(ell(p.x + p.nx * sd * 3.4, p.y + p.ny * sd * 3.4, 3.1, 1.9, p.a)); });
    if (st.deco === 'foam') every(st.wave[1], st.wave[1] / 4, (p: any) => { const o = st.wave[0] + 2.2; deco.push(circ(p.x + p.nx * o, p.y + p.ny * o, 1.7)); });
    if (st.deco === 'tracks') every(9, 6, (p: any, k: any) => {
      const sh = k % 2 ? 1.2 : -1.2;
      deco.push(circ(p.x + p.nx * 4.8 + p.tx * sh, p.y + p.ny * 4.8 + p.ty * sh, 1.1) + circ(p.x - p.nx * 4.8 - p.tx * sh, p.y - p.ny * 4.8 - p.ty * sh, 1.1));
    });
    let art = '', art2 = '', artAt = null;
    if (st.art) {
      const p = along(D, tot * 0.3), x = p.x, y = p.y;
      artAt = { x, y };
      if (st.art === 'butterfly') {
        art = ell(x - 4.8, y - 3, 4.8, 3.6, 0.5) + ell(x + 4.8, y - 3, 4.8, 3.6, -0.5) + ell(x - 3.8, y + 3.2, 3.4, 2.6, -0.5) + ell(x + 3.8, y + 3.2, 3.4, 2.6, 0.5);
        art2 = ell(x, y, 5.6, 1.4, Math.PI / 2) + ell(x - 1.5, y - 6.6, 2.2, 0.5, Math.PI / 2 - 0.45) + ell(x + 1.5, y - 6.6, 2.2, 0.5, Math.PI / 2 + 0.45);
      }
      if (st.art === 'kite') {
        art = 'M' + f1(x) + ',' + f1(y - 9) + 'L' + f1(x + 6.5) + ',' + f1(y) + 'L' + f1(x) + ',' + f1(y + 10) + 'L' + f1(x - 6.5) + ',' + f1(y) + 'Z';
        art2 = 'M' + f1(x - 0.6) + ',' + f1(y - 8) + 'H' + f1(x + 0.6) + 'V' + f1(y + 9) + 'H' + f1(x - 0.6) + 'Z' + circ(x + 2, y + 13, 1.6) + circ(x - 1, y + 17, 1.6);
      }
      if (st.art === 'crab') {
        art = ell(x, y, 7, 4.6, 0) + circ(x - 9.5, y - 4, 2.7) + circ(x + 9.5, y - 4, 2.7) + ell(x - 7.5, y - 2.4, 2.6, 1.2, 0.71) + ell(x + 7.5, y - 2.4, 2.6, 1.2, -0.71) +
          ell(x - 8, y + 2.5, 2.8, 0.9, -0.5) + ell(x - 7.4, y + 4.6, 2.8, 0.9, -0.9) + ell(x + 8, y + 2.5, 2.8, 0.9, 0.5) + ell(x + 7.4, y + 4.6, 2.8, 0.9, 0.9) +
          ell(x - 2.4, y - 5.4, 1.8, 0.8, Math.PI / 2) + ell(x + 2.4, y - 5.4, 1.8, 0.8, Math.PI / 2);
        art2 = circ(x - 2.4, y - 7.2, 1.2) + circ(x + 2.4, y - 7.2, 1.2);
      }
    }
    const as = st.as || 9, ux = R.Z.x - R.C2.x, uy = R.Z.y - R.C2.y, UL = Math.hypot(ux, uy) || 1, dx = ux / UL, dy = uy / UL;
    const bx = R.Z.x - dx * as * 0.75, by = R.Z.y - dy * as * 0.75;
    const arrow = 'M' + f1(R.Z.x + dx * as * 0.55) + ',' + f1(R.Z.y + dy * as * 0.55) + 'L' + f1(bx - dy * as * 0.7) + ',' + f1(by + dx * as * 0.7) +
      'L' + f1(bx + dy * as * 0.7) + ',' + f1(by - dx * as * 0.7) + 'Z';
    return { D, tot, line, deco: deco.join(''), art, art2, artAt, arrow };
  };
  const con = { go: { line: '', deco: '', art: '', art2: '', arrow: '' }, back: { line: '', deco: '', art: '', art2: '', arrow: '' } };
  routes.forEach((R) => {
    const g = styled(R, R.kind === 'go' ? T.goS : T.backS), c = (con as any)[R.kind];
    R.D = g.D;
    R.tot = g.tot;
    c.line += g.line; c.deco += g.deco; c.art += g.art; c.art2 += g.art2; c.arrow += g.arrow;
    if (g.artAt) rects.push({ x1: g.artAt.x - 14, y1: g.artAt.y - 10, x2: g.artAt.x + 14, y2: g.artAt.y + 8 });
  });

  // Name tags for the shortcuts and slides, on their line or close beside it, never over a space, its number or
  // another tag. With no spot clear of everything else as well: the one with the least in the way.
  const numberBoxes: any[] = [];
  for (let i = 1; i < N; i++) if (kindOf(i) !== 'plain') numberBoxes.push({ x1: sp[i].x - 13, y1: sp[i].y + rad[i] + 2, x2: sp[i].x + 13, y2: sp[i].y + rad[i] + 22 });
  const overlaps = (q: any, b: any) => q.x1 < b.x2 && q.x2 > b.x1 && q.y1 < b.y2 && q.y2 > b.y1;
  const discBox = (i: number, m: number) => ({ x1: sp[i].x - rad[i] - m, y1: sp[i].y - rad[i] - m, x2: sp[i].x + rad[i] + m, y2: sp[i].y + rad[i] + m });
  const inTheWay = (b: any) => 3 * sp.filter((_p, i) => overlaps(discBox(i, 5), b)).length + 2 * numberBoxes.filter((q) => overlaps(q, b)).length + rects.filter((q) => overlaps(q, b)).length;
  const pills: any[] = [], pillRects: any[] = [];
  // Points along the line (as a share of it) and distances out from it. A phone tries the middle of the line close
  // by first, as it always has, so only tags that found no room there move.
  const offs = [0, 15, -15, 28, -28, 42, -42, 56, -56, 70, -70, 84, -84, 98, -98, 112, -112, 126, -126, 140, -140], ts = [0.56, 0.48, 0.64, 0.4, 0.72, 0.32, 0.8, 0.24, 0.88];
  const tries = (o: number[], t: number[]) => o.flatMap((off) => t.map((tt) => [off, tt]));
  const tagTries = wide ? tries(offs, ts) : tries(offs.slice(0, 7), ts.slice(0, 7)).concat(tries(offs, ts));
  // Round a very short line with no spot beside it clear of the spaces and tags: the nearest one to its middle.
  // Failing that too, the spot with the least in the way, spaces included.
  const ring: number[][] = [];
  for (let dx = -200; dx <= 200; dx += 10) for (let dy = -160; dy <= 160; dy += 8) ring.push([dx, dy]);
  ring.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  routes.forEach((R) => {
    const text = W.pill(R.kind, R.to);
    const w = text.length * 6.6 + 30, h = 24;
    let spot: any = null, best: any = null, last: any = null;
    const tryAt = (x: number, y: number) => {
      const cx = Math.max(w / 2 + 6, Math.min(mapW - 6 - w / 2, x)), cy = y;
      const b = { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 };
      const onTag = pillRects.some((q) => overlaps(q, b));
      if (onTag || sp.some((_p, i) => overlaps(discBox(i, 5), b)) || numberBoxes.some((q) => overlaps(q, b))) {
        const cost = inTheWay(b) + (onTag ? 8 : 0);
        if (!last || cost < last.cost) last = { cx, cy, b, cost };
        return false;
      }
      const cost = rects.filter((q) => overlaps(q, b)).length;
      if (cost === 0) spot = { cx, cy, b };
      else if (!best || cost < best.cost) best = { cx, cy, b, cost };
      return cost === 0;
    };
    for (const [off, t] of tagTries) { const p = along(R.D, R.tot * t); if (tryAt(p.x + p.nx * off, p.y + p.ny * off)) break; }
    if (!spot && !best) { const m = along(R.D, R.tot / 2); for (const [dx, dy] of ring) if (tryAt(m.x + dx, m.y + dy)) break; }
    spot = spot ?? best ?? last;
    rects.push(spot.b);
    pillRects.push(spot.b);
    pills.push({ left: f1(spot.cx), top: f1(spot.cy), text, fg: R.kind === 'go' ? '#2B7A3A' : '#C92A2A', icon: R.kind === 'go' ? IC.up : IC.down });
  });

  // Place names and stream names, in open ground beside the trail: the first spot with room from the other signs, or
  // with none, the spot with the most
  const labels: any[] = [], spots: any[] = [];
  const placeLabel = (name: any, cands: any) => {
    const w = name.length * 8.4 + 34, h = 34;
    let pick: any = null;
    for (const c of cands) {
      const cx = Math.max(w / 2 + 6, Math.min(mapW - 6 - w / 2, c.x)), cy = c.y;
      const b = { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 + 4 };
      if (!free(b, { disc: 6, trail: 2, line: 7, water: 2 })) continue;
      const room = signRoom(b);
      if (!pick || room > pick.room) pick = { cx, cy, b, room };
      if (room >= 1) break;
    }
    if (!pick) return null;
    rects.push(pick.b);
    signRects.push(pick.b);
    labels.push({ name, left: f1(pick.cx - 90), top: f1(pick.cy - 13) });
    return { x: pick.cx, y: pick.cy };
  };
  T.regions.forEach((rg: any) => {
    const p = at(len * rg.f), side = p.x < mid ? 1 : -1, cands: any[] = [];
    if (wide) {
      const q = at(len * rg.f + 4), L = Math.hypot(q.x - p.x, q.y - p.y) || 1, nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L;
      for (const d of [78, 100, 124, 150]) for (const s of [1, -1]) for (const t of [0, 40, -40, 80, -80]) cands.push({ x: p.x + s * nx * d + (q.x - p.x) / L * t, y: p.y + s * ny * d + (q.y - p.y) / L * t - 12 });
    }
    for (const dy of [0, -26, 26, -52, 52, -78, 78, -104, 104, -130, 130]) for (const s of [side, -side]) for (const d of [128, 104, 152]) cands.push({ x: p.x + s * d, y: p.y - 12 + dy });
    // Then further up and down the trail, for a short, crowded one
    for (const dy of [-156, 156, -182, 182, -208, 208]) for (const s of [side, -side]) for (const d of [128, 104, 152]) cands.push({ x: p.x + s * d, y: p.y - 12 + dy });
    const o = placeLabel(rg.name, cands);
    if (o) spots.push({ rg, x: o.x, y: o.y });
  });
  streams.forEach((s: any) => {
    // Away from the bridge first; then the bridge's side and a little further from the water
    const far = [292, 262, 322, 232, 202], near = [98, 128, 68, 158, 188], cands: any[] = [];
    const xs = (s.bx < mid ? far : near).map((x) => x * kx), xs2 = (s.bx < mid ? near : far).map((x) => x * kx);
    [-46, 46, -60, 60, -74, 74].forEach((dy) => { xs.forEach((x) => { cands.push({ x, y: s.fy(x) + dy }); }); });
    [-46, 46, -60, 60, -74, 74].forEach((dy) => { xs2.forEach((x) => { cands.push({ x, y: s.fy(x) + dy }); }); });
    [-88, 88, -102, 102].forEach((dy) => { xs.concat(xs2).forEach((x) => { cands.push({ x, y: s.fy(x) + dy }); }); });
    placeLabel(s.name, cands);
  });

  // A landmark for each named place, and a critter in some of the streams
  const lms: any[] = [];
  const addArt = (kind: any, b: any) => {
    rects.push(b);
    const is: Record<string, boolean> = {};
    is[kind] = true;
    lms.push({ is, left: f1(b.x1), top: f1(b.y1), size: f1(b.x2 - b.x1) });
  };
  spots.forEach((o) => {
    const rg = o.rg;
    if (!rg.mark) return;
    const size = rg.ms || 48, cands: any[] = [];
    let placed = 0;
    for (const dy of [24 + size, 44 + size, -21, -41, 64 + size]) for (const dx of [0, -48, 48, -88, 88, -124, 124]) cands.push({ x: o.x + dx, y: o.y + dy });
    for (const c of cands) {
      if (placed >= (rg.mn || 1)) break;
      const b = { x1: c.x - size / 2, y1: c.y - size, x2: c.x + size / 2, y2: c.y };
      if (!free(b, { disc: 4, trail: 4, line: 8, water: 2 })) continue;
      addArt(rg.mark, b);
      placed++;
    }
  });
  streams.forEach((s: any) => {
    if (!s.critter) return;
    const size = 40, sink = ({ duck: 8, frog: 12, turtle: 20 } as Record<string, number>)[s.critter] || 10;
    for (const x of [56, 334, 96, 294, 136, 254, 36, 354, 176, 214].map((v) => v * kx)) {
      const y = s.fy(x) + sink, b = { x1: x - size / 2, y1: y - size, x2: x + size / 2, y2: y };
      if (!inMap(b) || hitRect(b) || hitDisc(b, 6) || hitTrail(b, 12) || hitLine(b, 8)) continue;
      addArt(s.critter, b);
      break;
    }
  });
  // Water life: reeds on the banks, lily pads and jumping fish
  streams.forEach((s: any) => {
    const used: any[] = [];
    (T.lifeKinds || []).forEach((kind: any) => {
      for (const x of [30, 360, 70, 320, 110, 280, 150, 240, 190].map((v) => v * kx)) {
        if (used.some((u) => Math.abs(u - x) < 46)) continue;
        const size = kind === 'reeds' ? 34 : 40, sink = kind === 'reeds' ? -12 : (kind === 'lilypad' ? 14 : 10);
        const y = s.fy(x) + sink, b = { x1: x - size / 2, y1: y - size, x2: x + size / 2, y2: y };
        if (!inMap(b) || hitRect(b) || hitDisc(b, 6) || hitTrail(b, 12) || hitLine(b, 6)) continue;
        addArt(kind, b);
        lms[lms.length - 1].life = true;
        used.push(x);
        break;
      }
    });
  });

  // Signposts a quarter, half and three quarters of the way, clear of the spaces and their numbers: the first spot
  // with room from the other signs, or with none, the spot with the most
  const signs: any[] = [];
  [Math.round(N / 4), Math.round(N / 2), Math.round(3 * N / 4)].forEach((target) => {
    let pick: any = null;
    search: for (const i of [target, target + 1, target - 1, target + 2, target - 2]) {
      const p = sp[i], q = sp[Math.min(N, i + 1)], o = sp[Math.max(0, i - 1)];
      const tx = q.x - o.x, ty = q.y - o.y, L = Math.hypot(tx, ty) || 1, nx = -ty / L, ny = tx / L;
      const text = target === Math.round(N / 2) ? W.halfway : W.toGo(N - i);
      for (const d of [54, 70, 88, 106, 124, 142]) {
        for (const s of [1, -1]) {
          for (const dy of [0, -16, 16, -32, 32, -48, 48]) {
            const cx = p.x + nx * s * d, foot = p.y + ny * s * d + 22 + dy;
            const b = { x1: cx - 44, y1: foot - 50, x2: cx + 44, y2: foot };
            if (!free(b, { disc: 4, trail: -4, line: 6, water: 0 }) || numberBoxes.some((q) => overlaps(q, b))) continue;
            const room = signRoom(b);
            if (!pick || room > pick.room) pick = { text, b, room };
            if (room >= 1) break search;
          }
        }
      }
    }
    if (!pick) return;
    rects.push(pick.b);
    signRects.push(pick.b);
    signs.push({ text: pick.text, left: f1(pick.b.x1), top: f1(pick.b.y1) });
  });

  // Big landscape features fill the largest open pockets beside the trail
  const land = { l1: [], l2: [], l3: [], l4: [], l5: [], l6: [], l7: [] }, sunLand: Record<string, string[]> = {};
  if (landOn) {
    const pockets: any[] = [];
    const room = (x: any, y: any) => {
      let R = dist(x, y) - 32;
      for (const b of rects) { const dx = Math.max(b.x1 - x, 0, x - b.x2), dy = Math.max(b.y1 - y, 0, y - b.y2); R = Math.min(R, Math.hypot(dx, dy) - 8); if (R < 50) return R; }
      for (const q of linePts) { if (Math.abs(q.y - y) > R + 12) continue; R = Math.min(R, Math.hypot(q.x - x, q.y - y) - 12); if (R < 50) return R; }
      for (const s of streams) { if (Math.abs(s.fy(x) - y) > R + 60) continue; for (let xx = x - 110; xx <= x + 110; xx += 10) R = Math.min(R, Math.hypot(xx - x, s.fy(xx) - y) - 22); }
      for (const p of pockets) R = Math.min(R, Math.hypot(p.x - x, p.y - y) - p.R - 30);
      return R;
    };
    const cands: any[] = [];
    for (let y = Y0; y < Math.min(Y1 - 40, H - BLEND - 60); y += 18) for (let x = 28; x <= mapW - 28; x += 18) { const R = room(x, y); if (R >= 54) cands.push({ x, y, R }); }
    cands.sort((a, b) => b.R - a.R);
    for (const c of cands) {
      if (pockets.length >= (wide ? Math.round(8 * kx) : 8)) break;
      const R = Math.min(96, room(c.x, c.y));
      if (R >= 54) pockets.push({ x: c.x, y: c.y, R });
    }
    pockets.forEach((p) => {
      drawLand(T.land.kind, p, land, mid, sunLand);
      rects.push({ x1: p.x - p.R * 0.95, y1: p.y - p.R * 0.95, x2: p.x + p.R * 0.95, y2: p.y + p.R * 0.95 });
    });
  }

  // Trees, flowers and the rest of the scenery fill the open ground
  const inBox = (x: any, y: any) => rects.some((b) => x > b.x1 && x < b.x2 && y > b.y1 && y < b.y2);
  const nearLine = (x: any, y: any, m: any) => linePts.some((q) => Math.abs(q.x - x) < m && Math.abs(q.y - y) < m);
  const defsOf = (TT: any) => { const o: Record<string, any> = {}; TT.kinds.forEach((k: any) => { o[k[0]] = k[2]; }); return o; };
  const kindDef = defsOf(T);
  const baseSize: Record<string, number> = {
    round: 46, pine: 46, bush: 30, flowers: 24, rock: 24, mushroom: 22, palm: 54, star: 20, tuft: 20, snowman: 34, leaves: 22, umbrella: 40, bare: 42, drift: 34,
    sunflower: 40, wheat: 28, haybale: 30, apple: 46, tent: 40, ice: 32, puddle: 34, cattail: 30, cottage: 50, lamp: 40, pumpkin: 24, fence: 30, log: 30, budtree: 42
  };
  const items: any[] = [];
  const add = (kind: any, x: any, y: any, size: any, defs = kindDef) => {
    const d = defs[kind] || {};
    const is: Record<string, boolean> = {};
    is[kind] = true;
    items.push({ is, y, left: f1(x - size / 2), top: f1(y - size), size: f1(size), c1: pick(d.c1), c2: pick(d.c2), c3: pick(d.c3), o2: d.o2 == null ? 0 : d.o2 });
  };
  const fits = (x: any, y: any, size: any) => dist(x, y) > 32 && dist(x, y - size * 0.5) > 22 + size * 0.38 &&
    streams.every((s: any) => Math.abs(y - s.fy(x)) > 22 && Math.abs(y - size * 0.5 - s.fy(x)) > 14 + size * 0.3) &&
    !inBox(x, y) && !inBox(x, y - size * 0.5) && !inBox(x - size * 0.4, y - size * 0.5) && !inBox(x + size * 0.4, y - size * 0.5) && !inBox(x, y - size * 0.9) &&
    !nearLine(x, y - size * 0.45, 9 + size * 0.4);
  spots.forEach((o) => {
    const rg = o.rg, n = rg.n || 5, big = baseSize[rg.kind] > 30;
    if (rg.layout === 'ring') {
      for (let j = 0; j < n; j++) {
        const a = j / n * Math.PI * 2;
        const x = o.x + Math.cos(a) * 32, y = o.y + 46 + Math.sin(a) * 14;
        const size = baseSize[rg.kind] * (0.9 + r() * 0.25);
        if (fits(x, y, size)) add(rg.kind, x, y, size);
      }
    } else {
      for (let j = 0, tries = 0; j < n && tries < 50; tries++) {
        const size = baseSize[rg.kind] * (0.85 + r() * 0.35);
        const x = o.x + (r() - 0.5) * 140, y = o.y + (big ? 46 : 24) + r() * 44;
        if (fits(x, y, size)) { add(rg.kind, x, y, size); j++; }
      }
    }
  });
  const pickKind = (TT: any) => {
    let v = r() * TT.kinds.reduce((a: any, k: any) => a + k[1], 0);
    for (let i = 0; i < TT.kinds.length; i++) { v -= TT.kinds[i][1]; if (v <= 0) return TT.kinds[i][0]; }
    return TT.kinds[0][0];
  };
  // Near the top some scenery comes from last month's world, near the bottom from next month's
  const defsPrev = defsOf(TP), defsNext = defsOf(TN);
  const worldAt = (y: number) => { const b = blendAt(y, H), v = r(); return v < b.prev ? 'prev' : v < b.prev + b.next ? 'next' : 'own'; };
  for (let gy = 130; gy < H; gy += 40) {
    for (let gx = 10; gx < mapW + 2; gx += 40) {
      const x = gx + (r() - 0.5) * 26, y = gy + (r() - 0.5) * 26;
      const from = worldAt(y), TT = from === 'prev' ? TP : from === 'next' ? TN : T;
      if (r() > TT.density) continue;
      const kind = pickKind(TT);
      const size = baseSize[kind] * (0.8 + r() * 0.45);
      if (fits(x, y, size)) add(kind, x, y, size, from === 'prev' ? defsPrev : from === 'next' ? defsNext : kindDef);
    }
  }
  items.sort((a, b) => a.y - b.y);

  // Soft lighter and darker areas, so the ground isn't one flat colour: where the old pale ovals were, on the same five
  // random numbers each, but bigger and fading out at the edges
  const patches: any[] = [];
  for (let i = 0, n = wide ? Math.round(28 * kx * 0.8) : 28; i < n; i++) {
    const px = -60 + r() * (mapW + 10), py = 120 + r() * (H - 160), pw = 90 + r() * 120, ph = 50 + r() * 70, u = r();
    const k = u < 0.45 ? 'dark' : 'lite', cx = px + pw / 2, cy = py + ph / 2, w = pw * 2, h = ph * 2;
    const c = hexRgb(mixAt(T.tex[k], TP.tex[k], TN.tex[k], cy, H)).join(', '), a = k === 'dark' ? 0.2 + u * 0.4 : 0.5 + (u - 0.45) * 0.55;
    patches.push({ x: f1(cx - w / 2), y: f1(cy - h / 2), w: f1(w), h: f1(h), bg: `radial-gradient(closest-side, rgba(${c}, ${a.toFixed(2)}), rgba(${c}, ${(a * 0.75).toFixed(2)}) 40%, rgba(${c}, ${(a * 0.35).toFixed(2)}) 70%, rgba(${c}, 0))` });
  }

  const shapes: Record<string, string> = {
    leaf: 'M0 -7C5 -4 5 4 0 7C-5 4 -5 -4 0 -7Z',
    snow: 'M-2.8 0a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0Z',
    petal: 'M0 -5C4 -3 4 3 0 5C-2.5 2 -2.5 -2 0 -5Z',
    sparkle: 'M0 -7L1.6 -1.6L7 0L1.6 1.6L0 7L-1.6 1.6L-7 0L-1.6 -1.6Z',
    rain: 'M0.2 -6L1 -6L-0.2 6L-1 6Z',
    seed: 'M0 -6L0.5 -0.5L6 0L0.5 0.5L0 6L-0.5 0.5L-6 0L-0.5 -0.5Z M-1.4 0a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0Z'
  };
  const particles: any[] = [];
  for (let i = 0, n = wide ? Math.round(60 * kx * 0.8) : 60; i < n; i++) {
    const dx = Math.round((10 + r() * 30) * (r() < 0.5 ? -1 : 1));
    const x = 8 + r() * (mapW - 16), y = 350 + r() * (H - 450), from = worldAt(y);
    const PT = (from === 'prev' ? TP : from === 'next' ? TN : T).particle, type = PT.type, fall = type !== 'sparkle';
    particles.push({
      x: f1(x), y: f1(y), size: Math.round(14 + r() * 8),
      d: shapes[type], c: pick(PT.colors),
      stroke: type === 'snow' ? '#AFC6DD' : (type === 'sparkle' ? '#D9A848' : (type === 'seed' ? '#C9C2A8' : 'none')),
      move: type === 'rain' ? '0 0;-14 ' + Math.round(150 + r() * 40) : type === 'seed' ? '0 0;' + dx * 2 + ' ' + Math.round(-30 - r() * 30) : fall ? '0 0;' + dx + ' ' + Math.round(130 + r() * 60) : '0 0;0 0',
      fade: fall ? '0;0.95;0.95;0' : '0;1;0',
      spin: type === 'snow' || type === 'rain' ? '0;0' : (fall ? '0;' + Math.round(140 + r() * 180) : '0;90'),
      dur: (type === 'rain' ? 1.1 + r() * 0.6 : type === 'seed' ? 9 + r() * 4 : fall ? 6 + r() * 5 : 2.5 + r() * 2.5).toFixed(1) + 's',
      begin: '-' + (r() * 9).toFixed(1) + 's'
    });
  }

  // The spaces: plain ones show their number, coin spaces how many coins
  const discs = sp.map((p, i) => {
    const s = S[i] || { t: 'plain' }, plain = s.t === 'plain', coin = s.t === 'coins';
    const size = rad[i] * 2, m = M[s.t];
    return {
      x: p.x, y: p.y, r: rad[i], size, left: f1(p.x - rad[i]), top: f1(p.y - rad[i]),
      bg: plain ? T.stone : m.bg, fg: plain ? T.edge : m.fg, bw: plain ? 2 : 3, shadow: plain ? T.edgeDark : m.dark,
      hasIcon: !plain && !coin, hasText: plain || coin, icon: IC[s.t] || '', iconSize: size >= 46 ? 24 : 20,
      text: coin ? '+' + s.n : String(i), ink: coin ? '#6E4000' : T.ink, fs: coin ? 15 : 12
    };
  });

  // Round 4 extras. They draw on the random numbers last, so the layout above stays the same with them on or off.
  discs.forEach((d: any) => { d.radius = '50%'; });
  const rr = () => Math.round(42 + r() * 16) + '%';
  const discsStone = discs.map((d, i) => kindOf(i) === 'plain' ? Object.assign({}, d, { radius: rr() + ' ' + rr() + ' ' + rr() + ' ' + rr() + ' / ' + rr() + ' ' + rr() + ' ' + rr() + ' ' + rr() }) : d);
  // The stepping stones' grain: fine specks scattered round each stone, clear of its number. They have their own
  // random numbers, so nothing else on the map moves.
  const gr = rng(T.seed + 140), hex2 = (a: number) => Math.round(a * 255).toString(16).padStart(2, '0');
  discsStone.forEach((d: any, i) => {
    if (kindOf(i) !== 'plain') return;
    const specks: string[] = [];
    for (let k = 0, n = 6 + Math.floor(gr() * 3); k < n; k++) {
      const a = gr() * 2 * Math.PI, q = 28 + gr() * 16;
      specks.push(`radial-gradient(${f1(0.45 + gr() * 0.45)}px at ${Math.round(50 + Math.cos(a) * q)}% ${Math.round(50 + Math.sin(a) * q)}%, ${T.edgeDark}${hex2(0.3 + gr() * 0.3)} 55%, #0000)`);
    }
    d.grain = specks.join(', ');
  });
  const numbers: any[] = [];
  for (let i = 1; i < N; i++) if (kindOf(i) !== 'plain') numbers.push({ x: f1(sp[i].x), top: f1(sp[i].y + rad[i] + 4), text: String(i) });
  // The sun's shadows (ENH-37): everything standing casts one down and to the right, all of them in one soft layer
  // (a path per layer, so a whole map's shadows cost eight elements). Per kind: [footprint width, height, shift right, foot]
  // as shares of the drawing's size. Flat things (flowers, leaves, puddles, drifts) and critters in the water cast none.
  const CAST: Record<string, number[]> = {
    round: [0.6, 1], apple: [0.6, 1], pine: [0.66, 1], bush: [0.88, 0.62], rock: [0.78, 0.48], mushroom: [0.66, 0.7], palm: [0.5, 0.85, 0.03],
    snowman: [0.5, 0.88], umbrella: [0.8, 0.95], bare: [0.42, 1], budtree: [0.42, 1], sunflower: [0.4, 0.75], wheat: [0.44, 0.5], cattail: [0.44, 0.5],
    cottage: [0.88, 0.85], tent: [0.86, 0.72], lamp: [0.22, 1], haybale: [0.78, 0.45], pumpkin: [0.66, 0.42], fence: [0.86, 0.45], log: [0.8, 0.26], ice: [0.6, 0.8],
    acorn: [0.56, 0.92], squirrel: [0.62, 0.8], owl: [0.9, 0.55, 0, 0.94], lantern: [0.3, 1, -0.24], pinecone: [0.56, 0.72, -0.05], polarbear: [0.8, 0.7, 0.08],
    igloo: [0.88, 0.62], bunny: [0.62, 0.74, -0.05], windmill: [0.3, 1], beehive: [0.66, 0.8], shell: [0.36, 0.5, 0, 0.94], sandcastle: [0.84, 0.9],
    beachball: [0.5, 0.6, 0, 0.92], penguin: [0.46, 0.9], seal: [0.86, 0.45], campfire: [0.8, 0.4], scarecrow: [0.42, 1], basket: [0.7, 0.6], crow: [0.24, 1], sled: [0.86, 0.38]
  };
  const soft: string[][] = Array.from({ length: LAYERS }, () => []);
  items.concat(lms).forEach((it) => {
    const c = CAST[Object.keys(it.is)[0]], s = Number(it.size);
    if (c) castShadow(it.left + s * (0.5 + (c[2] || 0)), it.top + s * (c[3] || 1), s * c[0], s * c[1]).forEach((e, k) => soft[k].push(ell(e[0], e[1], e[2], e[3], 0)));
  });
  const shadows = { soft: soft.map((p) => p.join('')), land: Object.fromEntries(Object.entries(sunLand).map(([k, ps]) => [k, ps.join('')])) };
  const SF = T.surface, surfOff = { s1c: 'none', s1w: 0, s1d: 'none', s2c: 'none', s2w: 0, b1: '', b2: '', b3: '', c1: 'none', c2: 'none', c3: 'none', dashW: 3 };
  const surfOn = Object.assign({}, surfOff, { dashW: 0 });
  if (SF.tracks) Object.assign(surfOn, { s1c: SF.tracks[0], s1w: 16, s2c: SF.tracks[1], s2w: 11 });
  if (SF.planks) Object.assign(surfOn, { s1c: SF.planks, s1w: 32, s1d: '2.2 7.8' });
  if (SF.bits) {
    const parts: string[][] = [[], [], []], leaf = SF.bits === 'leaves';
    for (let s = 8; s < len - 8; s += 14) {
      const p = at(s), q = at(s + 2);
      let tx = q.x - p.x, ty = q.y - p.y;
      const L = Math.hypot(tx, ty) || 1;
      tx /= L; ty /= L;
      const o = (r() - 0.5) * 30;
      parts[Math.floor(r() * 3)].push(ell(p.x - ty * o, p.y + tx * o, leaf ? 3.8 : 2.6, leaf ? 1.8 : 1.5, r() * Math.PI));
    }
    Object.assign(surfOn, { b1: parts[0].join(''), b2: parts[1].join(''), b3: parts[2].join(''), c1: SF.c[0], c2: SF.c[1], c3: SF.c[2] });
  }
  const lights: any[] = [];
  T.finLights.forEach((l: any) => lights.push([finX - 85 + l[0], Y1 + 40 + l[1], l[2]]));
  lms.forEach((m) => {
    const k = Object.keys(m.is)[0];
    if (k === 'lantern') lights.push([m.left + m.size * 0.675, m.top + m.size * 0.44, 30]);
    if (k === 'igloo') lights.push([m.left + m.size * 0.5, m.top + m.size * 0.8, 26]);
  });
  const glow = (l: any, a: any, k: any) => ({
    left: f1(l[0] - l[2] * k), top: f1(l[1] - l[2] * k), size: f1(l[2] * k * 2),
    bg: 'radial-gradient(circle, rgba(255,226,150,' + a + ') 0%, rgba(255,200,100,' + (a * 0.45).toFixed(2) + ') 40%, rgba(255,200,100,0) 70%)'
  });
  const glowsNight = lights.map((l) => glow(l, 0.7, 1)), glowsDusk = lights.map((l) => glow(l, 0.35, 0.8));
  const bugs = [], starry = T.bugs === 'stars';
  for (let i = 0, n = wide ? Math.round(44 * kx * 0.8) : 44; i < n; i++) {
    bugs.push({
      x: f1(10 + r() * (mapW - 20)), y: f1(Y0 + r() * (H - Y0 - 120)),
      d: starry ? 'M0 -4.5L1.1 -1.1L4.5 0L1.1 1.1L0 4.5L-1.1 1.1L-4.5 0L-1.1 -1.1Z' : 'M-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0Z',
      c: starry ? '#FFFFFF' : '#FFF29A', glow: starry ? '#CFE3FF' : '#FFE066',
      dur: (1.8 + r() * 2.4).toFixed(1) + 's', begin: '-' + (r() * 4).toFixed(1) + 's'
    });
  }
  const flutter = T.flock.kind === 'butterflies';
  const flocks = [880, 2040, 3180].map((y0) => Math.round(y0 * H / 4064)).map((y, i) => {
    const back = i % 2 === 1;
    return {
      y, birds: !flutter, butterflies: flutter, c: T.flock.c, flip: back ? 'scale(-1 1)' : 'scale(1 1)',
      move: wide
        ? (flutter ? [0, -16, 8, -14, 6, -8].map((dy, k) => Math.round(-60 + ((back ? 5 - k : k) / 5) * (mapW + 120)) + ' ' + dy).join(';') : back ? (mapW + 80) + ' 0;-90 34' : '-90 0;' + (mapW + 80) + ' -34')
        : flutter ? (back ? '450 0;340 -16;240 8;140 -14;40 6;-60 -8' : '-60 0;40 -16;140 8;240 -14;340 6;450 -8') : (back ? '470 0;-90 34' : '-90 0;470 -34'),
      dur: (flutter ? 26 + i * 4 : 20 + i * 5) + 's', begin: '-' + (3 + i * 6) + 's'
    };
  });
  const confetti = ['#FF6B6B', '#4DABF7', '#FCC419', '#69DB7C', '#F783AC', '#9775FA'];
  for (let i = 0; i < 26; i++) {
    party.confetti.push({
      x: f1(finX - 110 + r() * 220), y: f1(Y1 - 150 + r() * 220), c: confetti[i % 6],
      move: '0 0;' + Math.round((r() - 0.5) * 40) + ' ' + Math.round(70 + r() * 50), spin: '0;' + Math.round(180 + r() * 360),
      dur: (2.6 + r() * 2.2).toFixed(1) + 's', begin: '-' + (r() * 4).toFixed(1) + 's'
    });
  }
  const landPaths = { l1: land.l1.join(''), l2: land.l2.join(''), l3: land.l3.join(''), l4: land.l4.join(''), l5: land.l5.join(''), l6: land.l6.join(''), l7: land.l7.join('') };

  const item = (title: string, what: string, m: { bg: string; fg: string; dark: string }, icon: string, text?: string) => ({ title, what, bg: m.bg, fg: m.fg, dark: m.dark, icon: icon || '', hasIcon: !text, hasText: !!text, text: text || '' });
  const mapKey = [
    item(W.key.coins, W.key.coinsWhat, M.coins, '', '+2'),
    item(W.key.card, W.key.cardWhat, M.card, IC.card),
    item(W.key.treat, W.key.treatWhat, M.treat, IC.treat),
    item(W.go, W.key.upWhat, M.up, IC.up),
    item(W.back, W.key.downWhat, M.down, IC.down),
    item(W.key.high, W.key.highWhat, M.high, IC.high)
  ];

  const B = {
    N, H, pts, len, at, discs, pills, marks, labels, lms, signs, patches, particles, scenery: items, trailD, con, mapKey,
    routes: routes.map((R) => ({ from: R.from, to: R.to, A: R.A, C1: R.C1, C2: R.C2, Z: R.Z })),
    water1: streams[0].d, water2: streams[1].d, bridge1: streams[0].bridge, bridge2: streams[1].bridge,
    fin: { left: f1(finX - 85), top: Y1 + 40 },
    prize: { left: f1(prizeLeft), top: Y1 + 214 },
    discsStone, numbers, shadows, surfOn, surfOff, glowsNight, glowsDusk, bugs, flocks, party, gate, land: landPaths,
    lmsNoLife: lms.filter((m) => !m.life), Y1, MW: mapW, keyAt,
    blend: blendLayers(T, TP, TN, H, r, mapW), lookBack, onward, prevKey, nextKey
  };
  CACHE.set(ck, B);
  return B;
}

/**
 * How the map fades into the months on either side: the ground as a gradient (its texture as masked bands), the
 * trail's colours as SVG gradient stops, and any northern lights or fog, each masked to where its world shows.
 */
function blendLayers(T: any, TP: any, TN: any, H: number, r: () => number, mapW = 390) {
  const ys: number[] = [];
  for (let y = 0; y <= BLEND; y += 65) ys.push(y);
  for (let y = H - BLEND; y <= H; y += 65) ys.push(y);
  if (ys[ys.length - 1] !== H) ys.push(H);
  const pc = (y: number) => f1((y / H) * 100) + '%';
  const grad = (k: string) => ys.map((y) => `${pc(y)} ${mixAt(T[k], TP[k], TN[k], y, H)}`);
  const ground = 'linear-gradient(to bottom, ' + ys.map((y) => `${mixAt(T.ground, TP.ground, TN.ground, y, H)} ${f1(y)}px`).join(', ') + ')';
  const stops = (k: string) => grad(k).map((g) => { const [o, c] = g.split(' '); return `<stop offset="${o}" stop-color="${c}"></stop>`; }).join('');
  const defs = `<defs><linearGradient id="tqTrailEdge" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">${stops('edge')}</linearGradient>` +
    `<linearGradient id="tqTrailFill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">${stops('trail')}</linearGradient>` +
    `<linearGradient id="tqTrailDash" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">${stops('dash')}</linearGradient></defs>`;
  // Overlays: this world's everywhere but fading at the edges, a neighbour's only in its blend
  const layers: string[] = [];
  const mask = (which: 'own' | 'prev' | 'next') => 'linear-gradient(to bottom, ' + ys.concat(which === 'own' ? [BLEND + 1, H - BLEND - 1] : []).sort((a, b) => a - b).map((y) => {
    const b = blendAt(y, H), a = which === 'prev' ? b.prev : which === 'next' ? b.next : 1 - b.prev - b.next;
    return `rgba(0,0,0,${a.toFixed(2)}) ${f1(y)}px`;
  }).join(', ') + ')';
  ([['own', T], ['prev', TP], ['next', TN]] as const).forEach(([which, TT]) => {
    if (!TT.overlay || (which !== 'own' && TT.overlay === T.overlay)) return;
    const y0 = which === 'next' ? H - BLEND : 0, y1 = which === 'prev' ? BLEND : H, parts: string[] = [];
    if (TT.overlay === 'aurora') {
      for (let y = y0 + 60; y < y1; y += 340) {
        const rot = f1((r() - 0.5) * 16), hgt = Math.round(60 + r() * 40);
        parts.push(`<div style="position: absolute; left: -60px; top: ${f1(y)}px; width: ${mapW + 120}px; height: ${hgt}px; border-radius: 50%; transform: rotate(${rot}deg); ` +
          `background: linear-gradient(90deg, rgba(99,230,190,0) 0%, rgba(99,230,190,.34) 30%, rgba(151,117,250,.3) 70%, rgba(151,117,250,0) 100%); filter: blur(10px)"></div>`);
      }
    } else if (TT.overlay === 'fog') {
      for (let y = y0 + 40; y < y1; y += 70) {
        for (let k = 0, n = mapW > 390 ? Math.round(mapW / 390) : 1; k < n; k++) {
          const x = -40 + r() * (mapW + 10), w = 160 + r() * 160, hgt = 60 + r() * 50;
          parts.push(`<div style="position: absolute; left: ${f1(x - w / 2)}px; top: ${f1(y)}px; width: ${f1(w)}px; height: ${f1(hgt)}px; border-radius: 50%; ` +
            `background: radial-gradient(closest-side, rgba(250,250,247,.62), rgba(250,250,247,0))"></div>`);
        }
      }
    }
    const m = mask(which);
    layers.push(`<div style="position: absolute; left: 0; top: 0; width: ${mapW}px; height: ${H}px; pointer-events: none; overflow: hidden; -webkit-mask-image: ${m}; mask-image: ${m}">${parts.join('')}</div>`);
  });
  // The ground's texture: this world's all over, last month's fading out down the top band and next month's in up the
  // bottom one. The tiles are set once on the holder (CSS variables); each band lines them up with the map's top.
  const tex = (TT: any) => groundTex(TT.tex, rng(TT.seed + 138));
  const own = tex(T), up = tex(TP), down = tex(TN), bl = (y: number) => blendAt(y, H), mine = (y: number) => 1 - bl(y).prev - bl(y).next;
  const fade = (y0: number, y1: number, a: (y: number) => number) => {
    const st: string[] = [];
    for (let y = y0; ; y = Math.min(y1, y + 65)) { st.push(`rgba(0,0,0,${a(y).toFixed(2)}) ${f1(y - y0)}px`); if (y >= y1) break; }
    return 'linear-gradient(to bottom, ' + st.join(', ') + ')';
  };
  const band = (v: string, y0: number, y1: number, a?: (y: number) => number) => {
    const m = a && fade(y0, y1, a);
    return y1 - y0 < 1 ? '' : `<div style="position: absolute; left: 0; top: ${f1(y0)}px; width: ${mapW}px; height: ${f1(y1 - y0)}px; ` +
      `background-image: var(--tq-${v}); background-size: var(--tq-${v}s); background-position: 0 ${f1(-y0)}px${m ? `; -webkit-mask-image: ${m}; mask-image: ${m}` : ''}"></div>`;
  };
  const ya = Math.min(BLEND, H / 2), yb = Math.max(H - BLEND, H / 2);
  const texture = `<div style="position: absolute; left: 0; top: 0; width: ${mapW}px; height: ${H}px; --tq-g: ${own.img}; --tq-gs: ${own.size}; ` +
    `--tq-p: ${up.img}; --tq-ps: ${up.size}; --tq-n: ${down.img}; --tq-ns: ${down.size}">` +
    band('g', 0, ya, mine) + band('g', ya, yb) + band('g', yb, H, mine) +
    band('p', 0, Math.min(BLEND, H), (y) => bl(y).prev) + band('n', Math.max(0, H - BLEND), H, (y) => bl(y).next) + '</div>';
  return { ground, defs, overlays: layers.join(''), texture };
}
