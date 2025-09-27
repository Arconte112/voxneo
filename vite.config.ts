import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'src/renderer/overlay.html'),
        history: path.resolve(__dirname, 'src/renderer/history.html'),
        settings: path.resolve(__dirname, 'src/renderer/settings.html')
      }
    }
  },
  server: {
    port: 5174
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  }
});
