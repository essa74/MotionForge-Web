import ar400 from '../public/fonts/cairo-arabic-400.woff2';
import ar600 from '../public/fonts/cairo-arabic-600.woff2';
import ar700 from '../public/fonts/cairo-arabic-700.woff2';
import ar800 from '../public/fonts/cairo-arabic-800.woff2';
import la400 from '../public/fonts/cairo-latin-400.woff2';
import la600 from '../public/fonts/cairo-latin-600.woff2';
import la700 from '../public/fonts/cairo-latin-700.woff2';
import la800 from '../public/fonts/cairo-latin-800.woff2';


const toBuffer = (dataUri: string): ArrayBuffer => {
  const bin = atob(dataUri.slice(dataUri.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const add = async (family: string, uri: string, weight: string) => {
  const face = new FontFace(family, toBuffer(uri), {weight});
  await face.load();
  document.fonts.add(face);
};

/** Fonts are decoded straight from inlined data (no fetch, which sandboxed pages block). */
export const loadFonts = () =>
  Promise.all([
    add('CairoAr', ar400, '400'), add('CairoAr', ar600, '600'), add('CairoAr', ar700, '700'), add('CairoAr', ar800, '800'),
    add('CairoLat', la400, '400'), add('CairoLat', la600, '600'), add('CairoLat', la700, '700'), add('CairoLat', la800, '800'),
  ]);
