import { defineConfig } from 'vite';

/**
 * Single-file preview build.
 *
 * The normal build code-splits (phaser / three / lazy overworld chunk) and is
 * served from GitHub Pages. A preview that has to travel as ONE file cannot do
 * that: a dynamic import() would try to fetch a sibling URL that does not
 * exist inside a single hosted page. `inlineDynamicImports` folds the whole
 * graph — including the lazily-imported 3D world — into one script, which is
 * exactly the trade we want here (bigger first load, zero runtime fetches).
 *
 * This config is preview-only. It never touches the real deploy path.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-preview',
    sourcemap: false,
    chunkSizeWarningLimit: 8000,
    // Keep the CSS in the JS so the inliner has a single asset to fold in.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});
