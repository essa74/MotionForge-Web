import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

const weights = [400, 600, 700, 800] as const;

// Called once at module load; Remotion waits for the fonts before rendering.
export const fontsReady = Promise.all(
  weights.flatMap((weight) => [
    loadFont({family: 'CairoAr', url: staticFile(`fonts/cairo-arabic-${weight}.woff2`), weight: String(weight)}),
    loadFont({family: 'CairoLat', url: staticFile(`fonts/cairo-latin-${weight}.woff2`), weight: String(weight)}),
  ]),
);
