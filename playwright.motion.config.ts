// Videos der Kartenanimationen (ARCHITEKTUR.md 11, Schritt 5g): mit Bewegung, je Ablauf ein Video in test-results/motion.
// Kein Test im engeren Sinn, sondern Anschauung zur Abnahme; läuft nicht mit `npm run e2e`.

import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: 'tests/motion',
  outputDir: 'test-results/motion',
  use: { ...base.use, reducedMotion: 'no-preference', video: { mode: 'on', size: { width: 1600, height: 900 } } },
});
