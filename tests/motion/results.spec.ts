// Ergebnisfenster von Expedition und Orakel (Schritt 5t, ARCHITEKTUR.md 10.6): neu gewürfelte Teile blenden kurz ein,
// am Ereignis statt am Text (auch bei gleichem Ergebnis), nicht beim Öffnen; auch in der Stufe „Aus“.

import { expect, test, type Page } from '@playwright/test';
import { fixRolls, fromMenu, LONGEST, ready } from '../e2e/helpers';

test.beforeEach(async ({ page }) => ready(page));

/** Ab jetzt jede Animation an einem Ergebnis mitschreiben: Nummer des Teils im Fenster und Dauer */
async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { faded: { part: number; duration: number }[] };
    w.faded = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      if (this.matches('[role=dialog] .value')) {
        const part = [...document.querySelectorAll('[role=dialog] .value')].indexOf(this);
        w.faded.push({ part, duration: typeof options === 'number' ? options : Number(options?.duration) });
      }
      return orig.call(this, keyframes, options);
    };
  });
}
const faded = (page: Page) => page.evaluate(() => (window as unknown as { faded: { part: number; duration: number }[] }).faded.splice(0));

/** Klick auf einen Knopf im Fenster und warten, bis das Ereignis im Protokoll steht */
async function rollAndWait(page: Page, button: string, logged: number) {
  await page.getByRole('dialog').getByRole('button', { name: button, exact: true }).click();
  await expect(page.getByRole('list', { name: 'Protokoll' }).locator('li', { hasText: /Expedition:|Orakel:/ })).toHaveCount(logged);
}

test('Expedition: beim Öffnen nichts; eigener Wurf mit gleichem Ergebnis blendet die Zeile ein, „Alles neu“ alle vier', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  await record(page);
  await fixRolls(page, LONGEST);
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Expedition' }).locator('.value')).toHaveCount(4);
  await page.waitForTimeout(300);
  expect(await faded(page)).toEqual([]);
  // Zeile 3 bringt denselben Eintrag: sie blendet trotzdem ein, nur sie, mit --pop
  await fixRolls(page, [LONGEST[2]!]);
  await rollAndWait(page, 'Neu würfeln: Ihr seid hier, weil …', 2);
  await expect.poll(() => faded(page)).toEqual([{ part: 2, duration: 150 }]);
  // alles neu, wieder dieselben Einträge: alle vier
  await fixRolls(page, LONGEST);
  await rollAndWait(page, 'Alles neu', 3);
  await expect.poll(() => faded(page)).toEqual([0, 1, 2, 3].map((part) => ({ part, duration: 150 })));
});

test('Orakel: neu ziehen blendet beide Begriffe ein, auch bei denselben Karten', async ({ page }) => {
  await fromMenu(page, 'Protokoll');
  await record(page);
  // Herz 2 und Pik 3 (Farbe, dann Wert je Begriff)
  await fixRolls(page, [0, 0, 1, 1]);
  await page.getByRole('button', { name: 'Orakel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Orakel' }).locator('.value')).toHaveCount(2);
  await page.waitForTimeout(300);
  expect(await faded(page)).toEqual([]);
  await fixRolls(page, [0, 0, 1, 1]);
  await rollAndWait(page, 'Neu ziehen', 2);
  await expect.poll(() => faded(page)).toEqual([0, 1].map((part) => ({ part, duration: 150 })));
});

test('Stufe „Aus“ (Bewegung reduzieren): das Einblenden bleibt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page, true);
  await fromMenu(page, 'Protokoll');
  await record(page);
  await page.getByRole('button', { name: 'Expedition', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Expedition' }).locator('.value')).toHaveCount(4);
  await rollAndWait(page, 'Neu würfeln: Bekannt für …', 2);
  await expect.poll(() => faded(page)).toContainEqual({ part: 1, duration: 150 });
});
