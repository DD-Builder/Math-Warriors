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
          three: ['three'],
          // Rapier, same deal but more so. The `-compat` build inlines its
          // WebAssembly as base64 INSIDE the JavaScript, which is what makes it
          // work under Vite with no asset plumbing and also what makes it a
          // ~2.2 MB source file. src/overworld/physics.js is the only module
          // that references it and does so through a lazy `import()`, so this
          // chunk is fetched the first time a player walks into the overworld
          // toybox and never during boot. Naming it here (rather than leaving
          // Rollup to mint an anonymous chunk) keeps it cacheable across builds
          // and keeps it visible in the bundle report, which is the only way a
          // 2 MB dependency stays honest.
          rapier: ['@dimforge/rapier3d-compat']
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
