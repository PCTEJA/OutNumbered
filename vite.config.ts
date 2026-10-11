import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
      '/api': { target: 'http://127.0.0.1:3001', rewrite: p => p.replace(/^\/api/, '') },
    },
  },
  preview: {
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
      '/api': { target: 'http://127.0.0.1:3001', rewrite: p => p.replace(/^\/api/, '') },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { game: 'index.html', characters: 'characters.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
