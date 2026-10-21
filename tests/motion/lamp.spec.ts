// Laterne anzünden und löschen (Schritt 5n, ARCHITEKTUR.md 11.9), Stufe „Ruhig“: Übergang an den Lichtebenen.

import { expect, test, type Page } from '@playwright/test';
import { ready } from '../e2e/helpers';

test.beforeEach(async ({ page }) => ready(page));

/** Laterne klicken und die danach laufenden Animationen an Licht und Glühen liefern */
function clickAndWatch(page: Page) {
  return page.evaluate(async () => {
    document.querySelector<HTMLElement>('button[data-lamp]')!.click();
    await new Promise((r) => setTimeout(r, 50));
    return document.getAnimations()
      .map((a) => ({ on: ((a.effect as KeyframeEffect).target as HTMLElement).className.split(' ')[0], duration: Number((a.effect as KeyframeEffect).getTiming().duration) }))
      .filter((a) => ['out', 'on', 'glow', 'ember'].includes(a.on!))
      .sort((a, b) => a.on!.localeCompare(b.on!));
  });
}

test('Löschen in 0,7 s, Anzünden in 1,4 s, an allen Lichtebenen und am Glühen; danach gilt der Stand', async ({ page }) => {
  expect(await clickAndWatch(page)).toEqual(['ember', 'glow', 'on', 'out'].map((on) => ({ on, duration: 700 })));
  await expect(page.locator('[data-lamp]')).toHaveAttribute('data-lit', 'false');
  // die Animation beginnt mit dem nächsten Bild; danach gilt die Deckkraft aus dem Stand
  await expect.poll(() => page.locator('.light > .on').evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
  expect(await clickAndWatch(page)).toEqual(['ember', 'glow', 'on', 'out'].map((on) => ({ on, duration: 1400 })));
  // während des Übergangs zählt ein weiterer Klick nicht
  await page.locator('button[data-lamp]').click();
  await expect.poll(() => page.locator('.light > .on').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-lamp]')).toHaveAttribute('data-lit', 'true');
});
