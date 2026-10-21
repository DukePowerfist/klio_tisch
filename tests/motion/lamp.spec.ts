// Laterne anzünden und löschen (Schritt 5n, ARCHITEKTUR.md 11.9), Stufe „Ruhig“: Übergang an den Lichtebenen.

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, expectCount, ready, zoneCenter } from '../e2e/helpers';

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

/** Versatz eines Schattens eines Elements (`first`: die erste Lage, sonst die letzte), wie er auf dem Bildschirm
 *  erscheint (bei gedrehter Karte zurückgedreht) */
async function screenShadow(page: Page, selector: string, pseudo?: string, first = false) {
  return page.locator(selector).first().evaluate((el, { pseudo, first }) => {
    const shadow = getComputedStyle(el, pseudo).boxShadow;
    const layers = shadow.split(/,(?![^(]*\))/);
    const last = (first ? layers[0] : layers.at(-1))!;
    const [x, y] = [...last.replace(/rgba?\([^)]*\)/, '').matchAll(/-?[\d.]+px/g)].map((m) => parseFloat(m[0]));
    const card = el.closest<HTMLElement>('[data-card]');
    const rotated = !!card && card.style.transform.includes('rotate(90deg)');
    return rotated ? { x: -y!, y: x!, shadow } : { x: x!, y: y!, shadow };
  }, { pseudo, first });
}

test('Schatten von der Flamme weg: Deck links unten, Kreuz rechts unten, frei liegende (gedrehte) Karte auch; gelöscht wie bisher', async ({ page }) => {
  /** oberste Karte an einer Stelle des Bildschirms */
  const cardAt = (p: { x: number; y: number }) => page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).find((e) => e.closest('[data-card]'))!.closest<HTMLElement>('[data-card]')!.dataset['card'], p);
  // oberste Karte im Deck: links unter der Laterne
  const deckZone = await zoneCenter(page, 'DECK');
  const deck = await screenShadow(page, `[data-card="${await cardAt(deckZone)}"] .face.back`);
  expect(deck.x).toBeLessThan(0);
  expect(deck.y).toBeGreaterThan(0);
  // oberste Karte im Kreuz-Stapel: rechts unter der Laterne
  const clubCard = await cardAt(await zoneCenter(page, 'KREUZ'));
  const right = await screenShadow(page, `[data-card="${clubCard}"] .face.back`);
  expect(right.x).toBeGreaterThan(0);
  expect(right.y).toBeGreaterThan(0);
  // frei links unter dem Deck abgelegt (gedreht): auf dem Bildschirm weiter nach links unten
  await dragFromTo(page, deckZone, { x: deckZone.x - 90, y: deckZone.y + 95 });
  await expectCount(page, 'DECK', 26);
  await page.waitForTimeout(800);
  const free = await screenShadow(page, '.scene > [data-card][style*="rotate(90deg)"] .face.back');
  expect(free.x).toBeLessThan(0);
  expect(free.y).toBeGreaterThan(0);
  // gelöscht: wie vor 5n, weich nach unten
  await page.locator('button[data-lamp]').click();
  await expect.poll(() => screenShadow(page, `[data-card="${clubCard}"] .face.back`).then((s) => s.shadow)).toBe('rgba(0, 0, 0, 0.55) 0px 1px 3px 0px');
});

test('Gegriffene Karte wirft einen langen, weichen Schatten von der Flamme weg', async ({ page }) => {
  const z = await zoneCenter(page, 'DECK');
  await page.mouse.move(z.x, z.y);
  await page.mouse.down();
  await page.mouse.move(z.x + 60, z.y + 40, { steps: 4 });
  // erste Lage: der lange Schatten (die zweite ist kürzer und weicher)
  const lifted = await screenShadow(page, '.card.dragging .lift', '::before', true);
  const lying = await screenShadow(page, '.card.dragging .face.back');
  expect(Math.hypot(lifted.x, lifted.y)).toBeGreaterThan(4 * Math.hypot(lying.x, lying.y));
  expect(lifted.x).toBeLessThan(0);
  expect(lifted.y).toBeGreaterThan(0);
  await page.mouse.up();
});
