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

test('Liegende Karten werfen keinen Schatten, nur einen feinen Umriss: Stapel samt Kanten, Kreuz, frei liegende Karte; auch gelöscht', async ({ page }) => {
  /** oberste Karte an einer Stelle des Bildschirms */
  const cardAt = (p: { x: number; y: number }) => page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).find((e) => e.closest('[data-card]'))!.closest<HTMLElement>('[data-card]')!.dataset['card'], p);
  const faceShadow = (card: string) => page.locator(`[data-card="${card}"] .face.back`).evaluate((e) => getComputedStyle(e).boxShadow);
  const edgeShadows = () => page.locator('.edge').evaluateAll((es) => [...new Set(es.map((e) => getComputedStyle(e).boxShadow))]);
  const OUTLINE = 'rgba(0, 0, 0, 0.6) 0px 0px 1px 0px';
  const deckZone = await zoneCenter(page, 'DECK');
  const deckCard = (await cardAt(deckZone))!;
  const clubCard = (await cardAt(await zoneCenter(page, 'KREUZ')))!;
  expect(await faceShadow(deckCard)).toBe(OUTLINE);
  expect(await faceShadow(clubCard)).toBe(OUTLINE);
  expect(await edgeShadows()).toEqual(['none']);
  // frei abgelegt (gedreht)
  const unit = deckZone.box.width / 80;
  await dragFromTo(page, deckZone, { x: deckZone.x + 120 * unit, y: deckZone.y + 95 * unit });
  await expectCount(page, 'DECK', 26);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  expect(await page.locator('.scene > [data-card][style*="rotate(90deg)"] .face.back').evaluate((e) => getComputedStyle(e).boxShadow)).toBe(OUTLINE);
  // gelöscht (F4): ebenso
  await page.locator('button[data-lamp]').click();
  await expect(page.locator('[data-lamp]')).toHaveAttribute('data-lit', 'false');
  await page.waitForTimeout(900);
  expect(await faceShadow(clubCard)).toBe(OUTLINE);
  expect(await edgeShadows()).toEqual(['none']);
});

test('Überfahren hebt die Karte an: dann wirft sie einen Schatten von der Flamme weg', async ({ page }) => {
  const z = await zoneCenter(page, 'DECK');
  await page.mouse.move(z.x - 30, z.y - 30);
  await page.mouse.move(z.x, z.y, { steps: 4 });
  await expect(page.locator('.card.hover')).toHaveCount(1);
  await expect.poll(() => page.locator('.card.hover .lift').evaluate((e) => Number(getComputedStyle(e, '::before').opacity))).toBeGreaterThan(0.4);
  const lifted = await screenShadow(page, '.card.hover .lift', '::before', true);
  expect(lifted.x).toBeGreaterThan(0);
  expect(lifted.y).toBeGreaterThan(0);
});

test('Gegriffene Karte wirft einen langen, weichen Schatten von der Flamme weg', async ({ page }) => {
  const z = await zoneCenter(page, 'DECK');
  await holdOver(page, z, { x: z.x + 60, y: z.y + 40 }, 4);
  // erste Lage: der lange Schatten (die zweite ist kürzer und weicher)
  const lifted = await screenShadow(page, '.card.dragging .lift', '::before', true);
  const lying = await screenShadow(page, '.card.dragging .face.back');
  expect(Math.hypot(lifted.x, lifted.y)).toBeGreaterThan(4 * Math.hypot(lying.x, lying.y));
  expect(lifted.x).toBeGreaterThan(0);
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
