import ar400 from '../../../reels/public/fonts/cairo-arabic-400.woff2?inline'
import ar600 from '../../../reels/public/fonts/cairo-arabic-600.woff2?inline'
import ar700 from '../../../reels/public/fonts/cairo-arabic-700.woff2?inline'
import ar800 from '../../../reels/public/fonts/cairo-arabic-800.woff2?inline'
import la400 from '../../../reels/public/fonts/cairo-latin-400.woff2?inline'
import la600 from '../../../reels/public/fonts/cairo-latin-600.woff2?inline'
import la700 from '../../../reels/public/fonts/cairo-latin-700.woff2?inline'
import la800 from '../../../reels/public/fonts/cairo-latin-800.woff2?inline'

const toBuffer = (dataUri: string): ArrayBuffer => {
  const bin = atob(dataUri.slice(dataUri.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

const add = async (family: string, uri: string, weight: string) => {
  const face = new FontFace(family, toBuffer(uri), { weight })
  await face.load()
  document.fonts.add(face)
}

let loading: Promise<unknown> | null = null

/** Cairo (Arabic + Latin) decoded from inlined data, so no network request is needed. */
export function loadReelFonts() {
  loading ??= Promise.all([
    add('CairoAr', ar400, '400'), add('CairoAr', ar600, '600'), add('CairoAr', ar700, '700'), add('CairoAr', ar800, '800'),
    add('CairoLat', la400, '400'), add('CairoLat', la600, '600'), add('CairoLat', la700, '700'), add('CairoLat', la800, '800'),
  ])
  return loading
}
