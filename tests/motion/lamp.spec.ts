// Laterne anzünden und löschen (Schritt 5n, ARCHITEKTUR.md 11.9), Stufe „Ruhig“: Übergang an den Lichtebenen.

import { expect, test, type Page } from '@playwright/test';
import { dragFromTo, expectCount, holdOver, ready, zoneCenter } from '../e2e/helpers';

test.beforeEach(async ({ page }) => ready(page));

/** Laterne klicken und die danach laufenden Animationen an Licht und Glühen liefern. Der Übergang beginnt erst mit
 *  dem Ereignis, also nach dem Weg des Befehls über den Host (lokal meist etwa 25 ms, unter Last über 150 ms): warten,
 *  bis die erste Ebene läuft, höchstens 2 s; alle vier werden im selben Zug gestartet. */
function clickAndWatch(page: Page) {
  return page.evaluate(async () => {
    const layer = (a: Animation) => ((a.effect as KeyframeEffect).target as HTMLElement).className.split(' ')[0];
    const t0 = performance.now();
    document.querySelector<HTMLElement>('button[data-lamp]')!.click();
    while (!document.getAnimations().some((a) => layer(a) === 'out') && performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 5));
    return document.getAnimations()
      .map((a) => ({ on: layer(a), duration: Number((a.effect as KeyframeEffect).getTiming().duration) }))
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

test('Schatten von der Flamme weg: Deck links unten, Kreuz rechts unten, frei liegende (gedrehte) Karte auch; gelöscht weich nach unten', async ({ page }) => {
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
  // gelöscht (F4): weich nach unten, auch dann nur die oberste Karte eines Stapels
  await page.locator('button[data-lamp]').click();
  await expect.poll(() => screenShadow(page, `[data-card="${clubCard}"] .face.back`).then((s) => s.x)).toBe(0);
  expect((await screenShadow(page, `[data-card="${clubCard}"] .face.back`)).y).toBeGreaterThan(0);
  const under = await page.evaluate((top) => [...document.querySelectorAll<HTMLElement>('.scene > [data-card]')].find((c) => {
    const t = document.querySelector<HTMLElement>(`[data-card="${top}"]`)!;
    return c !== t && c.style.transform === t.style.transform;
  })!.dataset['card'], clubCard);
  expect(await page.locator(`[data-card="${under}"] .face.back`).evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
});

test('Gegriffene Karte wirft einen langen, weichen Schatten von der Flamme weg', async ({ page }) => {
  const z = await zoneCenter(page, 'DECK');
  await holdOver(page, z, { x: z.x + 60, y: z.y + 40 }, 4);
  // erste Lage: der lange Schatten (die zweite ist kürzer und weicher)
  const lifted = await screenShadow(page, '.card.dragging .lift', '::before', true);
  const lying = await screenShadow(page, '.card.dragging .face.back');
  expect(Math.hypot(lifted.x, lifted.y)).toBeGreaterThan(4 * Math.hypot(lying.x, lying.y));
  expect(lifted.x).toBeLessThan(0);
  expect(lifted.y).toBeGreaterThan(0);
  await page.mouse.up();
});

test.describe('Flackern (Voll)', () => {
  test('in „Voll“ mit Schalter flackert das Licht per Inline-Stil, ohne Animationen; gelöscht hört es auf, Glühen und Schein sind aus', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('klio.effects', 'full');
      localStorage.setItem('klio.flicker', '1');
    });
    await ready(page, true);
    const light = page.locator('.light');
    await expect(light).toHaveAttribute('data-flicker', '');
    const scales = new Set<string>();
    for (let i = 0; i < 6; i++) {
      scales.add(await page.locator('.light > .on').evaluate((e) => e.style.scale));
      await page.waitForTimeout(120);
    }
    expect(scales.size, 'das Licht bewegt sich').toBeGreaterThan(1);
    // keine endlose Animation an den Lichtebenen
    expect(await page.evaluate(() => document.getAnimations().filter((a) => ((a.effect as KeyframeEffect).target as HTMLElement).closest('.light')).length)).toBe(0);
    await page.locator('button[data-lamp]').click();
    await expect(light).not.toHaveAttribute('data-flicker');
    expect(await page.locator('.light > .on').evaluate((e) => e.style.scale)).toBe('');
    // nach dem Übergang: alles aus (Fehler 2026-10-22: Glühen und Schein blieben an)
    await page.waitForTimeout(1000);
    const opacity = (sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).opacity);
    expect([await opacity('.ember'), await opacity('.light > .glow'), await opacity('.light > .on')]).toEqual(['0', '0', '0']);
  });

  test('in „Voll“ ohne Schalter (Voreinstellung) ruht das Licht', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('klio.effects', 'full'));
    await ready(page, true);
    await page.waitForTimeout(500);
    await expect(page.locator('.light')).not.toHaveAttribute('data-flicker');
  });

  for (const level of ['calm', 'off'] as const) {
    test(`in „${level === 'calm' ? 'Ruhig' : 'Aus'}“ ruht das Licht, auch mit Schalter`, async ({ page }) => {
      await page.addInitScript((level) => {
        localStorage.setItem('klio.effects', level);
        localStorage.setItem('klio.flicker', '1');
      }, level);
      await ready(page, true);
      await page.waitForTimeout(500);
      await expect(page.locator('.light')).not.toHaveAttribute('data-flicker');
      expect(await page.locator('.light > .on').evaluate((e) => [e.style.scale, e.style.translate])).toEqual(['', '']);
    });
  }
});
