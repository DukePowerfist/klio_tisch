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

test('Stapel werfen Schatten von der Flamme weg, nur die unterste Kante nicht; einzelne Karten liegen flach; gelöscht weich nach unten', async ({ page }) => {
  /** oberste Karte an einer Stelle des Bildschirms */
  const cardAt = (p: { x: number; y: number }) => page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).find((e) => e.closest('[data-card]'))!.closest<HTMLElement>('[data-card]')!.dataset['card'], p);
  /** Schatten der Kanten eines Stapels, von der untersten (DOM zuerst) bis zur obersten */
  const edgeShadows = (label: string) => page.locator('.zone').filter({ hasText: new RegExp(`^${label}`) }).first().locator('.edge').evaluateAll((es) => es.map((e) => getComputedStyle(e).boxShadow));
  const OUTLINE = 'rgba(0, 0, 0, 0.6) 0px 0px 1px 0px';
  // Deck und Kreuz liegen rechts unter der Laterne
  const deckZone = await zoneCenter(page, 'DECK');
  const deck = await screenShadow(page, `[data-card="${await cardAt(deckZone)}"] .face.back`);
  expect(deck.x).toBeGreaterThan(0);
  expect(deck.y).toBeGreaterThan(0);
  const [bottom, ...above] = await edgeShadows('DECK');
  expect(bottom).toBe('none');
  expect(above.length).toBeGreaterThan(0);
  for (const s of above) expect(s).not.toBe('none');
  const clubCard = (await cardAt(await zoneCenter(page, 'KREUZ')))!;
  const right = await screenShadow(page, `[data-card="${clubCard}"] .face.back`);
  expect(right.x).toBeGreaterThan(0);
  expect(right.y).toBeGreaterThan(0);
  // einzelne Karte frei abgelegt (gedreht): nur der Umriss
  const unit = deckZone.box.width / 80;
  await dragFromTo(page, deckZone, { x: deckZone.x + 120 * unit, y: deckZone.y + 95 * unit });
  await expectCount(page, 'DECK', 26);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  expect(await page.locator('.scene > [data-card][style*="rotate(90deg)"] .face.back').evaluate((e) => getComputedStyle(e).boxShadow)).toBe(OUTLINE);
  // gelöscht (F4): weich nach unten, auch dann nur die oberste Karte eines Stapels und ohne Schatten der untersten Kante
  await page.locator('button[data-lamp]').click();
  await expect.poll(() => screenShadow(page, `[data-card="${clubCard}"] .face.back`).then((s) => s.x)).toBe(0);
  expect((await screenShadow(page, `[data-card="${clubCard}"] .face.back`)).y).toBeGreaterThan(0);
  expect((await edgeShadows('KREUZ'))[0]).toBe('none');
  const under = await page.evaluate((top) => [...document.querySelectorAll<HTMLElement>('.scene > [data-card]')].find((c) => {
    const t = document.querySelector<HTMLElement>(`[data-card="${top}"]`)!;
    return c !== t && c.style.transform === t.style.transform;
  })!.dataset['card'], clubCard);
  expect(await page.locator(`[data-card="${under}"] .face.back`).evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
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

test('Gegenstände geben beim Drücken nicht nach wie Knöpfe; die Laterne wackelt beim Klick nur ganz leicht', async ({ page }) => {
  // Klick auf die Laterne: genau eine kurze Drehung um höchstens gut 1°
  const wiggles = await page.locator('[data-lamp]').evaluate((e) => {
    (e as HTMLElement).click();
    return e.getAnimations().map((a) => {
      const frames = (a.effect as KeyframeEffect).getKeyframes().map((k) => Math.abs(parseFloat(String(k['rotate']))));
      return { duration: Number((a.effect as KeyframeEffect).getTiming().duration), max: Math.max(...frames) };
    });
  });
  expect(wiggles).toEqual([{ duration: 250, max: 1.2 }]);
  await page.waitForTimeout(1600); // Übergang der Laterne abwarten
  for (const sel of ['[data-lamp]', '[data-expedition-sheet]', '[data-oracle-box]']) {
    const el = page.locator(sel);
    const b = (await el.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + Math.min(20, b.height / 2));
    await page.mouse.down();
    await page.waitForTimeout(120);
    expect(await el.evaluate((e) => getComputedStyle(e).scale), sel).toBe('none');
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1600);
  }
});
