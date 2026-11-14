import {parseCell, parseRange} from './excelState';
import type {ExcelScene, ExcelStep, ReelSpec, Scene} from './spec';

const FORMAT_LIST = ['vertical', 'horizontal', 'square'];
const MAX_TOTAL_SECONDS = 240;

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function cleanCaption(raw: unknown, duration: number): Scene['caption'] {
  if (typeof raw === 'string') return raw;
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((l) => l && typeof l === 'object')
    .map((l: Record<string, unknown>) => {
      const from = Math.max(0, num(l.from, 0));
      return {text: str(l.text), from, to: Math.min(duration, Math.max(from + 0.3, num(l.to, duration)))};
    })
    .filter((l) => l.text);
}

function cleanSteps(raw: unknown, scene: {columns: number[]; rows: string[][]}, errors: string[], label: string): ExcelStep[] {
  if (!Array.isArray(raw)) return [];
  const out: ExcelStep[] = [];
  raw.forEach((s: Record<string, unknown>, i) => {
    const where = `${label} الخطوة ${i + 1}`;
    const at = Math.max(0, num(s?.at, 0));
    try {
      switch (s?.do) {
        case 'select': {
          const range = parseRange(str(s.range));
          if (range.c2 >= scene.columns.length || range.r2 >= scene.rows.length) throw new Error('النطاق خارج الجدول');
          out.push({at, do: 'select', range: str(s.range), over: s.over === undefined ? undefined : num(s.over, 0.8)});
          break;
        }
        case 'type': {
          const cell = parseCell(str(s.cell));
          if (cell.c >= scene.columns.length || cell.r >= scene.rows.length) throw new Error('الخلية خارج الجدول');
          out.push({at, do: 'type', cell: str(s.cell), text: str(s.text), result: s.result === undefined ? undefined : str(s.result), over: s.over === undefined ? undefined : num(s.over, 1)});
          break;
        }
        case 'format': {
          const range = parseRange(str(s.range));
          if (range.c2 >= scene.columns.length || range.r2 >= scene.rows.length) throw new Error('النطاق خارج الجدول');
          out.push({at, do: 'format', range: str(s.range), fill: s.fill ? str(s.fill) : undefined, bold: typeof s.bold === 'boolean' ? s.bold : undefined, color: s.color ? str(s.color) : undefined});
          break;
        }
        case 'keys': {
          const keys = Array.isArray(s.keys) ? s.keys.map(str).filter(Boolean) : [];
          if (!keys.length) throw new Error('مفاتيح فاضية');
          out.push({at, do: 'keys', keys, hold: s.hold === undefined ? undefined : num(s.hold, 2.5)});
          break;
        }
        default:
          throw new Error(`نوع خطوة غير معروف "${str(s?.do)}"`);
      }
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
  });
  return out;
}

/** Checks (and gently repairs) a spec coming from Gemini or typed by hand. Never throws. */
export function validateSpec(input: unknown): {spec: ReelSpec | null; errors: string[]} {
  const errors: string[] = [];
  const raw = input as Record<string, unknown> | null;
  if (!raw || !Array.isArray(raw.scenes) || raw.scenes.length === 0) return {spec: null, errors: ['لازم يكون فيه scenes (قائمة مشاهد).']};

  const scenes: Scene[] = [];
  raw.scenes.forEach((s: Record<string, unknown>, i) => {
    const label = `المشهد ${i + 1}`;
    const duration = Math.min(120, Math.max(0.5, num(s?.duration, 4)));
    const caption = cleanCaption(s?.caption, duration);
    switch (s?.type) {
      case 'excel': {
        const columns = Array.isArray(s.columns) ? s.columns.map((w) => Math.min(400, Math.max(60, num(w, 200)))) : [];
        const rows = Array.isArray(s.rows) ? s.rows.map((r) => (Array.isArray(r) ? r.map(str) : [])) : [];
        if (!columns.length || !rows.length) return errors.push(`${label}: الجدول محتاج columns و rows.`);
        const base = {columns, rows};
        const scene: ExcelScene = {type: 'excel', duration, caption, ...base, tableHeader: typeof s.tableHeader === 'boolean' ? s.tableHeader : undefined, rowHeight: s.rowHeight ? num(s.rowHeight, 84) : undefined, steps: cleanSteps(s.steps, base, errors, label)};
        scenes.push(scene);
        break;
      }
      case 'text':
        if (!str(s.title)) return errors.push(`${label}: العنوان مطلوب.`);
        scenes.push({type: 'text', duration, caption, title: str(s.title), subtitle: s.subtitle ? str(s.subtitle) : undefined, theme: ['light', 'dark', 'green'].includes(str(s.theme)) ? (s.theme as 'light') : undefined});
        break;
      case 'image':
        if (!str(s.src)) return errors.push(`${label}: اسم الصورة (src) مطلوب.`);
        scenes.push({type: 'image', duration, caption, src: str(s.src), title: s.title ? str(s.title) : undefined, motion: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'].includes(str(s.motion)) ? (s.motion as 'zoom-in') : undefined});
        break;
      case 'logo':
        scenes.push({type: 'logo', duration, caption, handle: s.handle ? str(s.handle) : undefined, label: s.label ? str(s.label) : undefined});
        break;
      default:
        errors.push(`${label}: نوع غير معروف "${str(s?.type)}" (المسموح: excel, text, image, logo).`);
    }
  });

  if (!scenes.length) return {spec: null, errors};
  const total = scenes.reduce((sum, s) => sum + s.duration, 0);
  if (total > MAX_TOTAL_SECONDS) errors.push(`مجموع المدة ${Math.round(total)} ثانية، أكتر من الحد (${MAX_TOTAL_SECONDS}).`);
  const format = FORMAT_LIST.includes(str(raw.format)) ? (raw.format as ReelSpec['format']) : undefined;
  return {spec: {format, scenes}, errors};
}
