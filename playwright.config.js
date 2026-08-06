// Playwright config for headless smoke testing the built game.
//
// The sandbox already has a Chromium binary at /opt/pw-browsers. We
// point Playwright at that directly rather than downloading a fresh
// one (which the sandbox blocks).

import { defineConfig } from '@playwright/test';

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
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    // Block external requests (Google Fonts etc) — the sandbox can't
    // reach them and they'd hang the test indefinitely on page load.
    // Our game degrades gracefully to system fonts.
    serviceWorkers: 'block',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        // Software WebGL via SwiftShader — the 3D overworld needs a real GL
        // context in headless runs (probed: gives full WebGL2 + instancing).
        // Phaser also picks up WebGL under these flags, which is CLOSER to
        // what real devices run than the old canvas2d fallback.
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-extensions',
      ],
    },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
