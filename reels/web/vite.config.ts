import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

// Builds one self-contained HTML file (fonts inlined) so it can be opened from anywhere.
export default defineConfig({
  root: __dirname,
  plugins: [react(), viteSingleFile()],
  build: {outDir: '../out-web', emptyOutDir: true, assetsInlineLimit: 100_000_000, target: 'es2022'},
});
