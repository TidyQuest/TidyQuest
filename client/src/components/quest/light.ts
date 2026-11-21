// One sun for the whole Quest Trail map (ENH-37): the light comes from the top left. Highlights sit on the upper left
// of things, shade on the lower right, and every shadow falls the same way, down and to the right.

/** How far a shadow falls from the thing that casts it, as a share of the thing's size (to the right, and down) */
export const SUN = { dx: 0.16, dy: 0.06 };
/** Shadow colour (r, g, b): a cool dark that reads on grass, sand and snow alike. Use it with an opacity. */
export const SHADE = '28, 36, 58';
/** Highlight colour (r, g, b) for the lit side. Use it with an opacity. */
export const LIT = '255, 255, 255';
export const shade = (a: number) => `rgba(${SHADE}, ${a})`;
export const lit = (a: number) => `rgba(${LIT}, ${a})`;

/** The way the light runs across a thing (down and to the right): round shapes are shaded along it */
const RAY = { x: 0.77, y: 0.64 };
const n1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The side of an ellipse turned away from the sun, as a path: a crescent on its lower right, t thick at most. With
 * toSun it is the side facing the sun instead (upper left), for a highlight. It is the ellipse minus the same ellipse
 * moved t along the light, so no clip path is needed and the shading never spills past the shape.
 */
export function crescent(cx: number, cy: number, rx: number, ry: number, t: number, toSun = false): string {
  const k = toSun ? 1 : -1, dx = (k * t * RAY.x) / rx, dy = (k * t * RAY.y) / ry, D = Math.hypot(dx, dy) || 1e-6;
  const ex = dx / D, ey = dy / D, h = Math.sqrt(Math.max(0, 1 - (D * D) / 4));
  const P = (s: number) => n1(cx + (dx / 2 - s * h * ey) * rx) + ' ' + n1(cy + (dy / 2 + s * h * ex) * ry);
  return `M${P(1)}A${rx} ${ry} 0 1 1 ${P(-1)}A${rx} ${ry} 0 0 0 ${P(1)}Z`;
}

/** A soft shadow is LAYERS stacked ellipses, each smaller and nearer the thing's foot; together they reach CORE there */
export const LAYERS = 8;
const CORE = 0.2;
/** The opacity of each of n layers, so that all n together reach CORE */
export const layerOpacity = (n = LAYERS) => Math.round((1 - Math.pow(1 - CORE, 1 / n)) * 1000) / 1000;

/**
 * The soft shadow of a thing w wide and h tall standing at (x, y), as n stacked ellipses [cx, cy, rx, ry] from the
 * faint outer edge to the core. The edge reaches past the thing to the right and a little down; the core stays by its
 * foot. Big things get more layers (n), so the steps between them don't show.
 */
export function castShadow(x: number, y: number, w: number, h: number, n = LAYERS): number[][] {
  const dx = SUN.dx * h, dy = SUN.dy * h, rx = w / 2 + dx * 0.6, ry = Math.max(2, Math.min(w * 0.13 + h * 0.04, 3.5 + w * 0.04));
  return Array.from({ length: n }, (_, i) => {
    const f = n > 1 ? i / (n - 1) : 0;
    return [x + dx * (0.6 - f * 0.36), y + dy * (0.5 - f * 0.3), rx * (1 - f * 0.48), ry * (1 - f * 0.45)].map(n1);
  });
}

/** castShadow drawn inside a picture (a gate, a finish, a critter standing on a pond), as SVG ellipses */
export const shadowSvg = (x: number, y: number, w: number, h: number, n = LAYERS) => castShadow(x, y, w, h, n)
  .map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgb(${SHADE})" opacity="${layerOpacity(n)}"></ellipse>`).join('');

/** A path in the shade colour or the light colour, for the shading drawn into a picture */
export const shadeD = (d: string, a: number) => `<path d="${d}" fill="${shade(a)}"></path>`;
export const litD = (d: string, a: number) => `<path d="${d}" fill="${lit(a)}"></path>`;
