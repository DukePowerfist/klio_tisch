// Browser-Tests (ARCHITEKTUR.md 4). Lokal mit dem System-Chromium (CHROMIUM_PATH), in CI mit dem von Playwright.

import { defineConfig } from '@playwright/test';

const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5299/klio_tisch/',
    viewport: { width: 1600, height: 900 },
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    // ohne Animationen (Effektstufe „Aus“): Tests warten nicht auf Übergänge
    { name: 'ohne Bewegung', testDir: 'tests/e2e', use: { reducedMotion: 'reduce' } },
    // Kartenanimationen (Schritt 5g, Stufe „Ruhig“)
    { name: 'mit Bewegung', testDir: 'tests/motion', use: { reducedMotion: 'no-preference' } },
  ],
  // In CI gegen den fertigen Build (genau das, was veröffentlicht wird), lokal gegen den Entwicklungsserver
  webServer: {
    command: process.env.CI ? 'npx vite preview --port 5299 --strictPort' : 'npx vite --port 5299 --strictPort',
    url: 'http://localhost:5299/klio_tisch/',
    reuseExistingServer: !process.env.CI,
  },
});
