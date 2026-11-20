// Quest Trail ground (ENH-38): each world's ground gets a fine texture, so the wide stretches between the trail and
// the trees never read as empty: grass blades in spring and summer, ripples and bits of shell on the beach, sparkle
// and wind streaks on snow, fallen leaves in autumn, moss in the mist. It's two small tiles of different sizes, drawn
// once as SVG and repeated as a CSS background (cheap on phones: no filters, a handful of elements): one of fine marks
// and one of a few bigger ones, so the repeat never lines up into a grid. Marks with a light side are lit from the
// top left, like everything else on the map (light.ts).

/** A world's ground (theme `tex`): its texture, its darker and lighter tones (marks, and the soft darker and lighter
 * areas), and the colours of any bits lying on it (petals, leaves, shells) */
export interface GroundTex { kind: string; dark: string; lite: string; bits?: string[] }

type Rnd = () => number;
type Tile = ReturnType<typeof tile>;
const f1 = (v: number) => Math.round(v * 10) / 10;
const P = (x: number, y: number) => f1(x) + ' ' + f1(y);
/** The two tiles' sizes: different, so together they only repeat every 5880 px */
const FINE = 120, COARSE = 196;

function tile(S: number, r: Rnd) {
  const looks = new Map<string, string>(), taken: number[][] = [];
  return {
    /** Where the next mark goes: the best of a few random tries, measured across the wrap, so marks spread evenly */
    spot(): number[] {
      let best = [0, 0], far = -1;
      for (let k = 0; k < 10; k++) {
        const x = r() * S, y = r() * S;
        let near = S;
        for (const [a, b] of taken) { const dx = Math.abs(x - a), dy = Math.abs(y - b); near = Math.min(near, Math.hypot(Math.min(dx, S - dx), Math.min(dy, S - dy))); }
        if (near > far) { far = near; best = [x, y]; }
      }
      taken.push(best);
      return best;
    },
    /** Draws a mark reaching e px from x, y, and again across any edge it overlaps, so the repeat has no seams */
    put(look: string, x: number, y: number, e: number, draw: (x: number, y: number) => string) {
      let d = looks.get(look) ?? '';
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (x + dx + e > 0 && x + dx - e < S && y + dy + e > 0 && y + dy - e < S) d += draw(x + dx, y + dy);
      looks.set(look, d);
    },
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` + [...looks].map(([look, d]) => `<path d="${d}" ${look}/>`).join('') + '</svg>',
  };
}

const line = (c: string, o: number, w: number) => `fill="none" stroke="${c}" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const fill = (c: string, o: number) => `fill="${c}" fill-opacity="${o}"`;
/** A blade of grass growing up from x, y: h tall, its tip leaning `lean` px to the side */
const blade = (x: number, y: number, h: number, lean: number) => `M${P(x, y)}q${P(lean * 0.2, -h * 0.55)} ${P(lean, -h)}`;
/** n blades fanning out of one spot, the middle one tallest */
const tuft = (x: number, y: number, h: number, lean: number, n = 3) => {
  let d = '';
  for (let k = 0; k < n; k++) { const s = k / (n - 1) - 0.5; d += blade(x + s * 2.6, y, h * (1 - Math.abs(s) * 0.5), lean + s * h * 0.9); }
  return d;
};
const dot = (x: number, y: number, a: number) => `M${P(x - a, y)}a${f1(a)} ${f1(a)} 0 1 0 ${f1(2 * a)} 0a${f1(a)} ${f1(a)} 0 1 0 ${f1(-2 * a)} 0Z`;
const star = (x: number, y: number, s: number) => { const q = s * 0.22; return 'M' + [[0, -s], [q, -q], [s, 0], [q, q], [0, s], [-q, q], [-s, 0], [-q, -q]].map(([a, b]) => P(x + a, y + b)).join('L') + 'Z'; };
/** A leaf or petal, pointed at both ends: s long, w wide, turned by `ang` */
const leaf = (x: number, y: number, s: number, w: number, ang: number) => {
  const cx = Math.cos(ang) * s / 2, cy = Math.sin(ang) * s / 2, nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
  return `M${P(x - cx, y - cy)}Q${P(x + nx, y + ny)} ${P(x + cx, y + cy)}Q${P(x - nx, y - ny)} ${P(x - cx, y - cy)}Z`;
};
/** A low arc l long that bows up h/2: a wind streak in snow, a ripple in sand */
const arc = (x: number, y: number, l: number, h: number) => `M${P(x - l / 2, y)}q${P(l / 2, -h)} ${P(l, 0)}`;
/** A wobbly line from x, y by the given steps (relative), e.g. a crack in ice or a twig */
const walk = (x: number, y: number, steps: number[][]) => `M${P(x, y)}` + steps.map(([a, b]) => `l${P(a, b)}`).join('');

/** n marks, each on its own spot */
const each = (t: Tile, n: number, make: (x: number, y: number) => void) => { for (let i = 0; i < n; i++) { const [x, y] = t.spot(); make(x, y); } };
const pick = (r: Rnd, a: string[]) => a[Math.floor(r() * a.length)];

/** Grass: tufts of two to four blades in the darker tone, some leaning with the wind (`lean`) */
function grass(t: Tile, G: GroundTex, r: Rnd, n: number, h: number, o: number, lean = 0, w = 1.2) {
  each(t, n, (x, y) => { const hh = h * (0.7 + r() * 0.6), l = (lean + (r() - 0.5) * 0.5) * hh, k = 2 + Math.floor(r() * 3); t.put(line(G.dark, o, w), x, y, hh + 3, (X, Y) => tuft(X, Y, hh, l, k)); });
}
/** Clumps of grass: a few tufts close together, so the grass isn't spread like wallpaper */
function clumps(t: Tile, G: GroundTex, r: Rnd, n: number, h: number, o: number, lean = 0, w = 1.2) {
  each(t, n, (x, y) => {
    const ts = [0, 1, 2, 3, 4].slice(0, 3 + Math.floor(r() * 3)).map(() => { const hh = h * (0.6 + r() * 0.6); return [(r() - 0.5) * 22, (r() - 0.5) * 12, hh, (lean + (r() - 0.5) * 0.5) * hh, 2 + Math.floor(r() * 3)]; });
    t.put(line(G.dark, o, w), x, y, 14 + h, (X, Y) => ts.map(([a, b, hh, l, k]) => tuft(X + a, Y + b, hh, l, k)).join(''));
  });
}
/** Single blades catching the light */
function blades(t: Tile, G: GroundTex, r: Rnd, n: number, h: number, o: number, lean = 0) {
  each(t, n, (x, y) => { const hh = h * (0.7 + r() * 0.6), l = (lean + (r() - 0.5) * 0.6) * hh; t.put(line(G.lite, o, 1.1), x, y, hh + 2, (X, Y) => blade(X, Y, hh, l)); });
}
/** Little things lying on the ground (petals, leaves): s long, in the world's bit colours */
function bits(t: Tile, G: GroundTex, r: Rnd, n: number, s: number, o: number, round = 0.42) {
  each(t, n, (x, y) => { const ss = s * (0.75 + r() * 0.5), a = r() * Math.PI, c = pick(r, G.bits || [G.dark]); t.put(fill(c, o), x, y, ss, (X, Y) => leaf(X, Y, ss, ss * round, a)); });
}
function specks(t: Tile, c: string, r: Rnd, n: number, a: number, o: number) {
  each(t, n, (x, y) => { const aa = a * (0.7 + r() * 0.6); t.put(fill(c, o), x, y, aa, (X, Y) => dot(X, Y, aa)); });
}
function sparkles(t: Tile, c: string, r: Rnd, n: number, s: number, o: number) {
  each(t, n, (x, y) => { const ss = s * (0.75 + r() * 0.5); t.put(fill(c, o), x, y, ss, (X, Y) => star(X, Y, ss)); });
}
/** Wind streaks (snow) or ripples (sand, `wave`): a shaded line with its lit edge just above and to the left */
function streaks(t: Tile, G: GroundTex, r: Rnd, n: number, l: number, rows: number, o: number, wave = false) {
  each(t, n, (x, y) => {
    const k = 1 + Math.floor(r() * rows), ls = [0, 1, 2].map(() => l * (0.6 + r() * 0.6)), h = wave ? 2.4 + r() * 1.2 : 1.6 + r() * 1.4;
    const d = (X: number, Y: number, ll: number) => wave ? `M${P(X - ll / 2, Y)}q${P(ll / 4, -h)} ${P(ll / 2, 0)}t${P(ll / 2, 0)}` : arc(X, Y, ll, h);
    for (let i = 0; i < k; i++) {
      const yy = y + i * 5, ll = ls[i], dx = (i % 2) * 3;
      t.put(line(G.dark, o, 1.3), x + dx, yy, ll / 2 + 3, (X, Y) => d(X, Y, ll));
      t.put(line(G.lite, 0.9, 1.1), x + dx, yy, ll / 2 + 3, (X, Y) => d(X - 0.5, Y - 1.4, ll * 0.85));
    }
  });
}

const KINDS: Record<string, (f: Tile, c: Tile, G: GroundTex, r: Rnd) => void> = {
  // Snow: sparkle and specks, and wind-swept streaks
  snow: (f, c, G, r) => {
    streaks(c, G, r, 5, 40, 2, 0.3);
    sparkles(f, G.lite, r, 4, 2.6, 0.95);
    specks(f, G.lite, r, 6, 0.9, 0.9);
    specks(f, G.dark, r, 4, 0.7, 0.4);
  },
  // Fresh snow in the village: more glitter, fewer streaks
  frost: (f, c, G, r) => {
    streaks(c, G, r, 3, 30, 2, 0.28);
    sparkles(c, pick(r, G.bits || [G.lite]), r, 4, 2.8, 0.95);
    sparkles(f, G.lite, r, 6, 2.4, 0.95);
    specks(f, G.lite, r, 6, 0.9, 0.9);
    specks(f, G.dark, r, 3, 0.7, 0.35);
  },
  // Ice: faint cracks (a lit line with its shaded side below), glints and sparkle
  ice: (f, c, G, r) => {
    each(c, 3, (x, y) => {
      let a = r() * Math.PI * 2;
      const steps = [0, 1, 2, 3].map(() => { a += (r() - 0.5) * 1.2; const l = 7 + r() * 9; return [Math.cos(a) * l, Math.sin(a) * l]; });
      const b = a + (r() < 0.5 ? 1 : -1) * (0.8 + r() * 0.5), fork = [[Math.cos(b) * 7, Math.sin(b) * 7]], bx = steps[0][0] + steps[1][0], by = steps[0][1] + steps[1][1];
      c.put(line(G.dark, 0.3, 1), x, y, 46, (X, Y) => walk(X + 0.6, Y + 0.9, steps) + walk(X + bx + 0.6, Y + by + 0.9, fork));
      c.put(line(G.lite, 0.85, 1.1), x, y, 46, (X, Y) => walk(X, Y, steps) + walk(X + bx, Y + by, fork));
    });
    // Glints: the sun catching the ice, two short strokes slanting up to the right
    each(c, 2, (x, y) => {
      const l = 4 + r() * 2, m = l * 0.55;
      c.put(line(G.lite, 0.95, 1.4), x, y, l + 4, (X, Y) => `M${P(X - l, Y + l)}l${P(2 * l, -2 * l)}M${P(X + 2.5 - m, Y + 2.5 + m)}l${P(2 * m, -2 * m)}`);
    });
    sparkles(f, G.lite, r, 5, 2.6, 0.95);
    specks(f, G.lite, r, 6, 0.9, 0.9);
  },
  // Wet meadow: grass in darker, rain-soaked tufts, and dew catching the light
  wet: (f, c, G, r) => {
    clumps(c, G, r, 4, 11, 0.36, 0, 1.3);
    grass(f, G, r, 6, 7.5, 0.28);
    specks(f, G.lite, r, 7, 0.9, 0.9);
  },
  // Spring grass with a few fallen petals
  spring: (f, c, G, r) => {
    bits(c, G, r, 7, 5.2, 0.85, 0.5);
    clumps(c, G, r, 3, 9, 0.28);
    grass(f, G, r, 6, 7, 0.24);
  },
  // Short meadow grass bending in the breeze, and a few tiny daisies
  meadow: (f, c, G, r) => {
    each(c, 4, (x, y) => {
      const pet = pick(r, G.bits || [G.lite]);
      c.put(fill(pet, 0.95), x, y, 3, (X, Y) => [0, 1, 2, 3, 4].map((k) => dot(X + Math.cos(k * 1.257) * 1.6, Y + Math.sin(k * 1.257) * 1.6, 1.1)).join(''));
      c.put(fill('#F2B33D', 1), x, y, 3, (X, Y) => dot(X, Y, 0.8));
    });
    clumps(c, G, r, 3, 9, 0.3, 0.35);
    grass(f, G, r, 7, 7, 0.26, 0.35);
  },
  // Grass with pine needles dropped from the trees: pairs joined at one end
  pines: (f, c, G, r) => {
    each(c, 10, (x, y) => {
      const a = r() * Math.PI * 2, s = 0.1 + r() * 0.12, l = 6 + r() * 3, col = pick(r, G.bits || [G.dark]);
      c.put(line(col, 0.55, 0.9), x, y, l + 1, (X, Y) => `M${P(X + Math.cos(a - s) * l, Y + Math.sin(a - s) * l)}L${P(X, Y)}L${P(X + Math.cos(a + s) * l, Y + Math.sin(a + s) * l)}`);
    });
    clumps(c, G, r, 2, 9, 0.28);
    grass(f, G, r, 6, 7, 0.24);
  },
  // Sand: rows of ripples, grains, and bits of shell
  sand: (f, c, G, r) => {
    streaks(c, G, r, 5, 26, 3, 0.4, true);
    each(c, 4, (x, y) => {
      const col = pick(r, G.bits || [G.lite]), a = 2.2 + r() * 1;
      c.put(fill(col, 0.95), x, y, a + 1, (X, Y) => `M${P(X - a, Y)}a${f1(a)} ${f1(a)} 0 0 1 ${f1(2 * a)} 0Z`);
      c.put(line(G.dark, 0.5, 0.6), x, y, a + 1, (X, Y) => `M${P(X, Y)}l${P(-a * 0.55, -a * 0.75)}M${P(X, Y)}l0 ${f1(-a)}M${P(X, Y)}l${P(a * 0.55, -a * 0.75)}`);
    });
    specks(f, G.dark, r, 12, 0.7, 0.4);
    specks(f, G.lite, r, 6, 0.8, 0.9);
  },
  // Dry golden grass, long and leaning, with pale straw catching the light
  dry: (f, c, G, r) => {
    clumps(c, G, r, 3, 12, 0.32, 0.4);
    grass(f, G, r, 8, 9, 0.28, 0.4, 1.1);
    blades(f, G, r, 6, 8, 0.85, 0.4);
  },
  // Autumn grass with a few fallen leaves
  autumn: (f, c, G, r) => {
    bits(c, G, r, 6, 6, 0.6);
    clumps(c, G, r, 3, 9, 0.28);
    grass(f, G, r, 6, 7, 0.24);
  },
  // The forest floor: leaf litter and twigs
  litter: (f, c, G, r) => {
    each(c, 3, (x, y) => {
      const a = r() * Math.PI * 2, l = 9 + r() * 6, b = a + (r() < 0.5 ? 0.7 : -0.7), m = 0.45 + r() * 0.2;
      c.put(line('#7A5230', 0.45, 1.1), x, y, l, (X, Y) => walk(X - Math.cos(a) * l / 2, Y - Math.sin(a) * l / 2, [[Math.cos(a) * l, Math.sin(a) * l]]) +
        walk(X - Math.cos(a) * l / 2 + Math.cos(a) * l * m, Y - Math.sin(a) * l / 2 + Math.sin(a) * l * m, [[Math.cos(b) * 4, Math.sin(b) * 4]]));
    });
    bits(c, G, r, 6, 6.4, 0.55);
    bits(f, G, r, 9, 4.6, 0.42);
    grass(f, G, r, 4, 6, 0.24);
  },
  // Damp ground: cushions of moss with a lit top, a few brown leaves, sparse grass
  moss: (f, c, G, r) => {
    each(c, 4, (x, y) => {
      const s = 2.6 + r() * 1.8;
      c.put(fill(G.dark, 0.4), x, y, s * 2.4, (X, Y) => dot(X - s, Y + s * 0.2, s * 0.72) + dot(X, Y - s * 0.2, s) + dot(X + s * 1.05, Y + s * 0.25, s * 0.66));
      c.put(fill(G.lite, 0.5), x, y, s * 2.4, (X, Y) => dot(X - s * 0.3, Y - s * 0.7, s * 0.32));
    });
    bits(c, G, r, 4, 5.4, 0.5);
    clumps(c, G, r, 2, 8, 0.26);
    each(f, 6, (x, y) => {
      const s = 1.6 + r() * 1.2;
      f.put(fill(G.dark, 0.3), x, y, s * 2.4, (X, Y) => dot(X - s * 0.8, Y + s * 0.2, s * 0.7) + dot(X, Y, s) + dot(X + s * 0.85, Y + s * 0.25, s * 0.6));
    });
    grass(f, G, r, 4, 6, 0.22);
  },
};

/** A world's ground texture as CSS (background-image and background-size), drawn from its own random numbers */
export function groundTex(G: GroundTex, r: Rnd): { img: string; size: string } {
  const f = tile(FINE, r), c = tile(COARSE, r);
  KINDS[G.kind]?.(f, c, G, r);
  const url = (t: Tile) => `url('data:image/svg+xml,${encodeURIComponent(t.svg()).replace(/'/g, '%27')}')`;
  return { img: url(c) + ', ' + url(f), size: `${COARSE}px ${COARSE}px, ${FINE}px ${FINE}px` };
}
