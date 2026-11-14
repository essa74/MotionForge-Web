export const brand = {
  green: '#217346',
  greenDark: '#185c37',
  greenSoft: '#e3f1e8',
  ink: '#0f172a',
  inkSoft: '#334155',
  paper: '#ffffff',
  grid: '#d4d8de',
  headerBg: '#f1f3f5',
  accent: '#f5b301',
  danger: '#e5484d',
  select: '#1a73e8',
};

// Latin first (Ctrl, Alt, @EssaXcel), Arabic glyphs fall through to CairoAr.
export const FONT = '"CairoLat", "CairoAr", "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif';

export type Format = 'vertical' | 'horizontal' | 'square';

export const FORMATS: Record<Format, {width: number; height: number}> = {
  vertical: {width: 1080, height: 1920},
  horizontal: {width: 1920, height: 1080},
  square: {width: 1080, height: 1080},
};

/** Blend two #rrggbb colours (t = share of `top`). Opaque on purpose: the in-browser renderer drops rgba() in places. */
export const mix = (top: string, base: string, t: number) => {
  const parse = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [a, b] = [parse(top), parse(base)];
  return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
};

/** Layers of solid circles that fake a soft glow (the in-browser renderer drops CSS gradients). */
export const glowLayers = (accent: string, bg: string, strength: number, steps = 48) =>
  Array.from({length: steps}, (_, i) => ({scale: 1 - i / steps, color: mix(accent, bg, strength * ((i + 1) / steps))}));
