// Playwright config for headless smoke testing the built game.
//
// The sandbox already has a Chromium binary at /opt/pw-browsers. We
// point Playwright at that directly rather than downloading a fresh
// one (which the sandbox blocks).
//
// TWO PROJECTS, because the 2D game and the 3D overworld want opposite
// renderer setups:
//
//   '2d'  — the original flags (GPU + software rasterizer both off). Phaser
//           falls back to Canvas2D, which is FAST headless. Every pre-existing
//           spec was written against this speed; the timing-sensitive ones
//           (battle victory overlays, answer loops, scene screenshots) need
//           frames to actually elapse inside their waits.
//   '3d'  — SwiftShader software WebGL. Three.js has no canvas fallback, so
//           the overworld specs need a real GL context. It is ~10x slower,
//           which is fine there because the overworld harness is state-based
//           and frame-rate independent by design (fixed-step sim + frozen
//           poses), but it would break the 2D suite's wall-clock assumptions.

import { defineConfig } from '@playwright/test';

const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-extensions',
];

// Specs that require a real WebGL context (the Three.js overworld). Anything
// added here is BOTH claimed by the '3d' project and excluded from '2d' — the
// two lists are one regex on purpose, because a WebGL spec that leaks into the
// Canvas2D project fails in a way that looks like a game bug.
const OVERWORLD_SPECS = /(overworld-.*|level3d-shots|battle3d-shots)\.spec\.js/;

export default defineConfig({
  testDir: './e2e',
  // Software-rendered headless Chromium (sandbox/CI) is slow; the
  // multi-scene tests legitimately need more than the 30s default.
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://127.0.0.1:4173',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    // Block external requests (Google Fonts etc) — the sandbox can't
    // reach them and they'd hang the test indefinitely on page load.
    // Our game degrades gracefully to system fonts.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: '2d',
      testIgnore: OVERWORLD_SPECS,
      use: {
        launchOptions: {
          executablePath: CHROMIUM,
          args: [...BASE_ARGS, '--disable-gpu', '--disable-software-rasterizer'],
        },
      },
    },
    {
      name: '3d',
      testMatch: OVERWORLD_SPECS,
      use: {
        launchOptions: {
          executablePath: CHROMIUM,
          // Probed in this sandbox: gives full WebGL2 + instancing + float
          // textures via ANGLE/SwiftShader.
          args: [...BASE_ARGS, '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
