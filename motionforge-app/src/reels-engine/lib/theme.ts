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
