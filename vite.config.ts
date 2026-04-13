import { defineConfig } from 'vite';

// Deployment target matrix:
//   itch.io / Wavedash → relative paths, use base './'
//   GitHub Pages       → served from /theharness/, set VITE_BASE=/theharness/
// Default is relative so the same dist can ship to itch and Wavedash.
export default defineConfig(() => ({
  base: process.env.VITE_BASE ?? './',
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
}));
