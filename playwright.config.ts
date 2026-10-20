// Browser-Tests (ARCHITEKTUR.md 4). Lokal mit dem System-Chromium (CHROMIUM_PATH), in CI mit dem von Playwright.

import { defineConfig } from '@playwright/test';

const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5299/klio_tisch/',
    viewport: { width: 1600, height: 900 },
    // ohne Animationen: Tests warten nicht auf Übergänge
    reducedMotion: 'reduce',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npx vite --port 5299 --strictPort',
    url: 'http://localhost:5299/klio_tisch/',
    reuseExistingServer: !process.env.CI,
  },
});
