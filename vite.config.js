import { defineConfig } from 'vite';

// GitHub Pages serves this repo at https://<user>.github.io/Math-Warriors/
// The base path must match the repo name for asset URLs to resolve correctly.
// For local dev (`npm run dev`), base is auto-overridden to '/'.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Math-Warriors/' : '/',
  build: {
    outDir: 'dist',
    // Source maps disabled in production to keep build memory under control.
    // Enable with `VITE_SOURCEMAP=1 npm run build` if you need to debug a
    // production issue locally.
    sourcemap: process.env.VITE_SOURCEMAP === '1',
    // Phaser is a ~1.4 MB dep on its own; the warning about it is expected.
    chunkSizeWarningLimit: 1600,
    // Split Phaser into its own chunk for better caching across builds.
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          // Three.js only ever loads via dynamic import() from the overworld
          // module — its own chunk keeps it out of the eager boot bundle and
          // lets it cache independently across builds.
          three: ['three']
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
