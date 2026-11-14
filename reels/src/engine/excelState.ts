import type {CSSProperties} from 'react';
import type {ExcelScene, ExcelStep} from './spec';

export type Cell = {r: number; c: number};
export type Range = {r1: number; c1: number; r2: number; c2: number};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const parseCell = (ref: string): Cell => {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) throw new Error(`Bad cell reference "${ref}"`);
  return {c: LETTERS.indexOf(m[1].toUpperCase()), r: Number(m[2]) - 1};
};

export const parseRange = (ref: string): Range => {
  const [a, b] = ref.split(':');
  const p1 = parseCell(a);
  const p2 = parseCell(b ?? a);
  return {r1: Math.min(p1.r, p2.r), c1: Math.min(p1.c, p2.c), r2: Math.max(p1.r, p2.r), c2: Math.max(p1.c, p2.c)};
};

const cellName = (r: number, c: number) => `${LETTERS[c]}${r + 1}`;

export type ExcelState = {
  rows: string[][];
  cellStyle: Record<string, CSSProperties>;
  selection: (Range & {progress: number}) | null;
  nameBox: string;
  formula: string;
  keys: {keys: string[]; since: number; hold: number} | null;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Everything the sheet should show at time `t` (seconds into the scene). Pure, so any frame can be rendered alone. */
export function excelStateAt(scene: ExcelScene, t: number): ExcelState {
  const steps = [...(scene.steps ?? [])].sort((a, b) => a.at - b.at);
  const rows = scene.rows.map((row) => [...row]);
  const cellStyle: Record<string, CSSProperties> = {};
  let selection: ExcelState['selection'] = null;
  let formula = '';
  let keys: ExcelState['keys'] = null;

  const setCell = (r: number, c: number, text: string) => {
    while (rows.length <= r) rows.push([]);
    rows[r][c] = text;
  };

  const select = (range: Range, progress: number) => {
    selection = {...range, progress};
    formula = rows[range.r1]?.[range.c1] ?? '';
  };

  for (const step of steps) {
    if (step.at > t) break;
    const since = t - step.at;
    applyStep(step, since);
  }

  function applyStep(step: ExcelStep, since: number) {
    switch (step.do) {
      case 'select': {
        const range = parseRange(step.range);
        const single = range.r1 === range.r2 && range.c1 === range.c2;
        select(range, single ? 1 : clamp01(since / (step.over ?? 0.8)));
        break;
      }
      case 'type': {
        const {r, c} = parseCell(step.cell);
        const over = step.over ?? Math.max(0.5, step.text.length * 0.07);
        const shown = Math.floor(clamp01(since / over) * step.text.length);
        const done = shown >= step.text.length;
        setCell(r, c, done ? (step.result ?? step.text) : step.text.slice(0, shown));
        selection = {r1: r, c1: c, r2: r, c2: c, progress: 1};
        formula = done ? step.text : step.text.slice(0, shown);
        break;
      }
      case 'format': {
        const range = parseRange(step.range);
        const style: CSSProperties = {};
        if (step.fill) style.background = step.fill;
        if (step.bold !== undefined) style.fontWeight = step.bold ? 700 : 400;
        if (step.color) style.color = step.color;
        for (let r = range.r1; r <= range.r2; r++)
          for (let c = range.c1; c <= range.c2; c++) cellStyle[`${r},${c}`] = {...cellStyle[`${r},${c}`], ...style};
        break;
      }
      case 'keys':
        keys = {keys: step.keys, since, hold: step.hold ?? 2.5};
        break;
    }
  }

  if (keys && (keys as NonNullable<ExcelState['keys']>).since > (keys as NonNullable<ExcelState['keys']>).hold) keys = null;

  const sel = selection as ExcelState['selection'];
  let nameBox = 'A1';
  if (sel) {
    const single = sel.r1 === sel.r2 && sel.c1 === sel.c2;
    const full = sel.progress >= 1 || single;
    nameBox = single
      ? cellName(sel.r1, sel.c1)
      : full
        ? `${cellName(sel.r1, sel.c1)}:${cellName(sel.r2, sel.c2)}`
        : cellName(sel.r1, sel.c1);
  }
  return {rows, cellStyle, selection: sel, nameBox, formula, keys};
}

export const SELECTION_FALLBACK = {r1: 0, c1: 0, r2: 0, c2: 0};
