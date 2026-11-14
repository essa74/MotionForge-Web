import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const reels = fileURLToPath(new URL('../reels/src', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The video engine lives in ../reels/src and is shared with the command-line renderer.
  resolve: { alias: { '@reels': reels }, dedupe: ['react', 'react-dom', 'remotion'] },
  server: { fs: { allow: ['..'] } },
})
