import type {Format} from '../lib/theme';

/** Caption shown during a scene; times are seconds from the start of that scene. */
export type SceneCaption = {text: string; from: number; to: number};

/** One thing that happens inside an Excel scene. `at` is seconds from the start of the scene. */
export type ExcelStep =
  /** Select a cell or range (e.g. "B2" or "A1:D8"); a range grows over `over` seconds. */
  | {at: number; do: 'select'; range: string; over?: number}
  /** Type text into a cell. With `result`, the cell shows the result while the formula bar keeps the text. */
  | {at: number; do: 'type'; cell: string; text: string; result?: string; over?: number}
  /** Fill / bold / colour a range from this moment on. */
  | {at: number; do: 'format'; range: string; fill?: string; bold?: boolean; color?: string}
  /** Show keyboard keys, e.g. ["Ctrl","A"]; they disappear after `hold` seconds. */
  | {at: number; do: 'keys'; keys: string[]; hold?: number};

type SceneBase = {
  /** Length in seconds. */
  duration: number;
  /** A single line for the whole scene, or timed lines. */
  caption?: string | SceneCaption[];
};

export type ExcelScene = SceneBase & {
  type: 'excel';
  /** Column widths in design pixels (about 150 to 300). */
  columns: number[];
  /** Cell text, row by row. Row 0 is the first sheet row. */
  rows: string[][];
  tableHeader?: boolean;
  rowHeight?: number;
  steps?: ExcelStep[];
};

export type TextScene = SceneBase & {
  type: 'text';
  title: string;
  subtitle?: string;
  theme?: 'light' | 'dark' | 'green';
};

export type ImageScene = SceneBase & {
  type: 'image';
  /** File inside reels/public, or a URL. */
  src: string;
  motion?: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
  /** Optional headline over the image. */
  title?: string;
};

export type LogoScene = SceneBase & {type: 'logo'; handle?: string; label?: string};

export type Scene = ExcelScene | TextScene | ImageScene | LogoScene;

export type ReelSpec = {
  format?: Format;
  scenes: Scene[];
};

export const specSeconds = (spec: ReelSpec) => spec.scenes.reduce((sum, scene) => sum + scene.duration, 0);
