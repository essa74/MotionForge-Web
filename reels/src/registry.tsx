import type React from 'react';
import type {Format} from './lib/theme';
import type {ReelProps} from './lib/types';
import {TemplateDemo} from './reels/TemplateDemo';

export type ReelDef = {
  /** Composition id used by `npm run render -- <id>`. */
  id: string;
  component: React.FC<ReelProps>;
  /** Default format; a run can override it with --format. */
  format: Format;
  fps: number;
  /** Length when no voice-over is supplied. */
  seconds: number;
  /** Extra seconds kept after the voice-over ends (for the logo screen). */
  tailSeconds?: number;
};

/** Add one entry per reel. */
export const reels: ReelDef[] = [
  {id: 'TemplateDemo', component: TemplateDemo, format: 'vertical', fps: 30, seconds: 9, tailSeconds: 2},
];
