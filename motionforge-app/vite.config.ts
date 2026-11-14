import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from /MotionForge-Web/; local dev and StackBlitz use the root.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
