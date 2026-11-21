import type { Built } from './trailBuild';

/**
 * Where the players' pieces stand on the Quest Trail map (TrailMap.tsx), and where the next roll's die faces go.
 * FIX-41: a piece keeps its name tag and token off the map's texts (tags, signs, Start/Finish, banner, key) and off
 * the pieces already placed, by sliding a little sideways or standing a little taller; its pin still points at its
 * space. BUG-63: people on the same space stand side by side above it (every other one a step higher when their
 * names would touch), and each pin is angled so its tip lands on that space.
 */

export interface Box { x1: number; y1: number; x2: number; y2: number }
export interface PieceIn { id: number; pos: number; mine: boolean; label: string; active: boolean }
/** Where a name tag sits: above the token, or beside it when a tag or sign is in the way above */
export type TagSide = 'up' | 'left' | 'right';
/** x: the token's centre; base: the bottom of the token; tip: where the pin points */
export interface PieceAt { id: number; x: number; base: number; tipX: number; tipY: number; raised: boolean; tag: TagSide; boxes: Box[] }

export const tokenSize = (mine: boolean) => (mine ? 34 : 26);
/** The token with its 2 px padding and its ring */
const tokenW = (mine: boolean) => (mine ? 44 : 34);
const tagH = (mine: boolean) => (mine ? 15 : 14);
/** A name tag's width, roughly (Nunito 800 at 10 or 11 px, 6 px padding each side), up to its cap (80 px of text) */
export const tagW = (label: string, mine: boolean) => Math.min(92, label.length * (mine ? 6.8 : 6.2) + 12);
/** How much higher every other piece in a crowd stands, so its tag clears its neighbours' */
const RAISE = 17;
/** How much covering a neighbouring space counts against a spot, next to covering a text (1) */
const SPACE_WEIGHT = 0.35;
/** The pin below a piece standing on its own (as tall as before) */
const PIN = 9;

/** The numbers below the special spaces (plain ones show theirs on the space) */
function numberBoxes(B: Built): { i: number; box: Box }[] {
  return (B.numbers ?? []).map((n: { x: number; top: number; text: string }) => {
    const w = n.text.length * 6 + 8;
    return { i: Number(n.text), box: { x1: n.x - w / 2, y1: n.top, x2: n.x + w / 2, y2: n.top + 13 } };
  });
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

/** The tag, the token and the pin of a piece */
export function pieceBoxes(x: number, base: number, tipX: number, tipY: number, mine: boolean, label: string, tag: TagSide = 'up'): Box[] {
  const s = tokenSize(mine) + 4, w = tagW(label, mine), ring = mine ? 3 : 2, tagBottom = base - s - 3, h = tagH(mine);
  const side = x + (s / 2 + ring + 3) * (tag === 'left' ? -1 : 1), mid = base - s / 2;
  return [
    tag === 'up' ? { x1: x - w / 2, y1: tagBottom - h, x2: x + w / 2, y2: tagBottom }
      : { x1: tag === 'left' ? side - w : side, y1: mid - h / 2, x2: tag === 'left' ? side : side + w, y2: mid + h / 2 },
    { x1: x - s / 2 - ring, y1: base - s - ring, x2: x + s / 2 + ring, y2: base + ring },
    { x1: Math.min(x - 6, tipX), y1: base, x2: Math.max(x + 6, tipX), y2: Math.max(base + 1, tipY) },
  ];
}

/**
 * Lays out every piece. `fixed` is the active piece in mid-jump (drawn on its shortcut's line). Pieces are placed one
 * space at a time, the active player's first, then from the front of the race back; each space tries a few small
 * nudges and keeps the one that covers least.
 */
export function layoutPieces(B: Built, pieces: PieceIn[], fixed?: { id: number; x: number; foot: number } | null): PieceAt[] {
  const MW: number = B.MW, N = B.N, texts: Box[] = B.textRects ?? [];
  const out: PieceAt[] = [], taken: Box[] = [], nums = numberBoxes(B);
  const byId = new Map(pieces.map((p) => [p.id, p]));
  if (fixed && byId.has(fixed.id)) {
    const p = byId.get(fixed.id)!, base = fixed.foot - PIN;
    const boxes = pieceBoxes(fixed.x, base, fixed.x, fixed.foot, p.mine, p.label);
    out.push({ id: p.id, x: fixed.x, base, tipX: fixed.x, tipY: fixed.foot, raised: false, tag: 'up', boxes });
    taken.push(boxes[0], boxes[1]);
  }
  const groups = new Map<number, PieceIn[]>();
  for (const p of pieces) if (!(fixed && p.id === fixed.id)) groups.set(p.pos, [...(groups.get(p.pos) ?? []), p]);
  const order = [...groups.keys()].sort((a, b) => Number(groups.get(b)!.some((p) => p.active)) - Number(groups.get(a)!.some((p) => p.active)) || b - a);

  for (const pos of order) {
    const g = groups.get(pos)!, k = g.length, d = B.discs[Math.min(N, Math.max(0, pos))];
    const roomy = pos <= 0 || pos >= N;
    // Side by side, a little apart (a little overlapping when four or five share a space)
    const gap = k > 3 ? -2 : 4, ws = g.map((p) => tokenW(p.mine));
    const total = ws.reduce((a, w) => a + w, 0) + gap * (k - 1);
    let acc = -total / 2;
    const dx = ws.map((w) => { const c = acc + w / 2; acc += w + gap; return c; });
    // Every other one a step higher when two neighbours' tags would touch
    const stagger = g.some((p, i) => i > 0 && dx[i] - dx[i - 1] < (tagW(p.label, p.mine) + tagW(g[i - 1].label, g[i - 1].mine)) / 2 + 2);
    // A crowd on an ordinary space stands a little higher, so the angled pins have room to reach it
    const lift0 = k > 1 && !roomy ? 8 : 0;
    const tipStep = k > 1 ? Math.min(7, (2 * (d.r - 6)) / (k - 1)) : 0;
    const shifts = roomy ? [0, -17, 17, -34, 34, -51, 51] : [0, -12, 12, -24, 24, -36, 36, -48, 48];
    const lifts = roomy ? [0, 14] : [0, 12, 24];
    // Someone on their own can have their tag beside the token when there's no room above it
    const sides: TagSide[] = k === 1 ? ['up', 'right', 'left'] : ['up'];
    let best: { cost: number; at: PieceAt[] } | null = null;
    // Texts to keep off: the map's, and the numbers of the spaces around (not this space's own)
    const avoid = [...texts, ...nums.filter((n) => n.i !== pos).map((n) => n.box)];
    // ...and, less strongly, the spaces around it, so no piece looks like it stands on a neighbour
    const near: Box[] = [];
    for (let j = Math.max(0, pos - 10); j <= Math.min(N, pos + 10); j++) {
      const o = B.discs[j];
      if (j !== pos) near.push({ x1: o.x - o.r, y1: o.y - o.r, x2: o.x + o.r, y2: o.y + o.r });
    }
    // ...and which of them stand higher: every second one, or the first and every second after it
    for (const odd of stagger ? [1, 0] : [1]) for (const side of sides) for (const ly of lifts) {
      for (const sx0 of shifts) {
        // Keep the whole row (tags too) inside the map
        const half = g.map((p) => Math.max(tagW(p.label, p.mine), tokenW(p.mine)) / 2);
        const lo = Math.min(...dx.map((v, i) => d.x + v + sx0 - half[i])), hi = Math.max(...dx.map((v, i) => d.x + v + sx0 + half[i]));
        const sx = sx0 + (lo < 6 ? 6 - lo : hi > MW - 6 ? MW - 6 - hi : 0);
        const at = g.map((p, i): PieceAt => {
          const raised = stagger && i % 2 === odd, x = d.x + dx[i] + sx;
          const tipX = roomy ? x : d.x + (i - (k - 1) / 2) * tipStep, tipY = d.y - 4;
          const base = tipY - PIN - lift0 - ly - (raised ? RAISE : 0);
          return { id: p.id, x, base, tipX, tipY, raised, tag: side, boxes: pieceBoxes(x, base, tipX, tipY, p.mine, p.label, side) };
        });
        let cost = Math.abs(sx) * 0.4 + ly * 0.6 + (side === 'up' ? 0 : 12);
        for (const a of at) {
          for (const b of [a.boxes[0], a.boxes[1]]) {
            for (const t of avoid) cost += overlap(b, t);
            for (const t of near) cost += overlap(b, t) * SPACE_WEIGHT;
            for (const t of taken) cost += overlap(b, t);
            if (b.y1 < 4) cost += (4 - b.y1) * 20;
            if (b.x1 < 4 || b.x2 > MW - 4) cost += 400;
          }
        }
        if (!best || cost < best.cost - 0.01) best = { cost, at };
      }
      if (best && best.cost < 1) break;
    }
    for (const a of best!.at) { out.push(a); taken.push(a.boxes[0], a.boxes[1]); }
  }
  return out;
}

/**
 * The die face (19 × 19) beside each of the next six spaces: the first spot around the space that covers no text,
 * number, piece, other space or other die, else the one that covers least.
 */
export function placeDice(B: Built, you: number, avoid: Box[]): { left: number; top: number; k: number }[] {
  const N = B.N, dice: { left: number; top: number; k: number }[] = [];
  const nums = numberBoxes(B).map((n) => n.box);
  for (let k = 1; k <= 6 && you + k <= N; k++) {
    const i = you + k, d = B.discs[i];
    const discs: Box[] = [];
    for (let j = Math.max(0, i - 8); j <= Math.min(N, i + 8); j++) {
      if (j === i) continue;
      const o = B.discs[j];
      discs.push({ x1: o.x - o.r, y1: o.y - o.r, x2: o.x + o.r, y2: o.y + o.r });
    }
    const spots = [[d.x + d.r * 0.45, d.y - d.r - 12], [d.x - d.r * 0.45 - 19, d.y - d.r - 12], [d.x + d.r + 2, d.y - 10], [d.x - d.r - 21, d.y - 10],
      [d.x + d.r + 2, d.y + 2], [d.x - d.r - 21, d.y + 2], [d.x - 9.5, d.y - d.r - 21], [d.x + d.r * 0.45, d.y + d.r - 6], [d.x - d.r * 0.45 - 19, d.y + d.r - 6]];
    const obstacles = [...avoid, ...nums, ...discs, ...dice.map((z) => ({ x1: z.left, y1: z.top, x2: z.left + 19, y2: z.top + 19 }))];
    let best = spots[0], bestCost = Infinity;
    for (const [x, y] of spots) {
      const b = { x1: x, y1: y, x2: x + 19, y2: y + 19 };
      let cost = 0;
      for (const o of obstacles) cost += overlap(b, o);
      if (x < 4 || x + 19 > B.MW - 4) cost += 1000;
      if (cost < bestCost - 0.01) { best = [x, y]; bestCost = cost; }
      if (cost === 0) break;
    }
    dice.push({ left: best[0], top: best[1], k });
  }
  return dice;
}
