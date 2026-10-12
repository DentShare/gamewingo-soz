import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: Number(process.env.PORT) || 4181, strictPort: true },
  build: {
    minify: 'terser',
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
});
