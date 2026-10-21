// Kartenanimationen (Schritt 5g, ARCHITEKTUR.md 11), Stufe „Ruhig“: Abläufe, wie sie im Browser geplant werden.
// Gemessen wird an den laufenden Animationen (Web Animations API) direkt nach dem Auslösen, nicht an Bildern.

import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dragFromTo, expectCount, openSettings, ready, resetTable, zoneCenter } from '../e2e/helpers';

type Anim = { card: string | null; part: string; props: string[]; delay: number; duration: number; easing: string };

test.beforeEach(async ({ page }) => ready(page));

/** Knopf im offenen Stapelmenü im Browser drücken und die danach laufenden Animationen liefern (ohne Umweg über
 *  Playwright, sonst sind kurze Animationen schon vorbei). */
function pressAndWatch(page: Page, label: string): Promise<{ anims: Anim[]; at: number }> {
  return page.evaluate(async (label) => {
    [...document.querySelectorAll('button')].find((b) => b.textContent === label)!.click();
    const at = performance.now();
    for (let i = 0; i < 100 && !document.getAnimations().length; i++) await new Promise((r) => setTimeout(r, 5));
    const anims = document.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect;
      const el = effect.target as HTMLElement;
      const timing = effect.getTiming();
      return {
        card: el.closest<HTMLElement>('[data-card]')?.dataset['card'] ?? null,
        part: (el.className.toString().split(' ')[0] ?? '') + (effect.pseudoElement ?? ''),
        props: [...new Set(effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)),
        delay: Number(timing.delay ?? 0),
        duration: Number(timing.duration),
        easing: String(timing.easing),
      };
    });
    return { anims, at };
  }, label);
}

async function openMenu(page: Page, zone: string) {
  const z = await zoneCenter(page, zone);
  await page.mouse.click(z.x, z.y);
  await expect(page.getByRole('button', { name: 'Ziehen', exact: true })).toBeVisible();
}

test('Ziehen: verdeckt im Bogen über den anderen, Innehalten, dann Aufdecken; Meldung erst danach', async ({ page }) => {
  await openMenu(page, 'DECK');
  await page.waitForTimeout(300);
  const { anims } = await pressAndWatch(page, 'Ziehen');
  // der Stand ist sofort richtig
  await expectCount(page, 'ABLAGE', 1);
  const fly = anims.find((a) => a.part.startsWith('card') && a.props.includes('transform'))!;
  expect(fly.props).toContain('zIndex');
  const own = anims.filter((a) => a.card === fly.card);
  expect(own.some((a) => a.part.startsWith('card') && a.props.includes('translate'))).toBe(true); // Bogen
  const spin = own.find((a) => a.part.startsWith('inner'))!;
  // erst ankommen (Flug, Aufsetzen), dann innehalten (150 ms), dann umklappen
  expect(spin.delay).toBeGreaterThanOrEqual(fly.duration + 150);
  // Meldung erst, wenn die Karte aufgedeckt ist
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText(/^Aufgedeckt: /);
  expect(await page.locator(`[data-card=${fly.card}] .inner`).evaluate((e) => e.getAnimations().length)).toBe(0);
});

test('Greifen: die Karte hebt sich deutlich und federnd, beim Loslassen senkt sie sich wieder', async ({ page }) => {
  const z = await zoneCenter(page, 'DECK');
  await page.mouse.move(z.x, z.y);
  await page.mouse.down();
  await page.mouse.move(z.x + 60, z.y + 40, { steps: 4 });
  const lift = page.locator('.card.dragging .lift');
  await expect(lift).toHaveCount(1);
  expect(await lift.evaluate((e) => getComputedStyle(e).transitionTimingFunction)).toMatch(/^linear\(/);
  await expect.poll(() => lift.evaluate((e) => [getComputedStyle(e).scale, getComputedStyle(e).translate])).toEqual(['1.1', '0px -6px']);
  const card = await lift.evaluate((e) => e.closest<HTMLElement>('[data-card]')!.dataset['card']!);
  await page.mouse.move(z.x, z.y, { steps: 4 });
  await page.mouse.up();
  const back = page.locator(`[data-card="${card}"] .lift`);
  await expect.poll(() => back.evaluate((e) => [getComputedStyle(e).scale, getComputedStyle(e).translate])).toEqual(['none', 'none']);
});

/** Animationen des Wackelns auf der Karte unter dem Punkt (laufend oder gerade beendet zählt nicht) */
const wiggles = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => a.id === 'wiggle').length);

test('Überfahren: die oberste Karte hebt sich leicht und wackelt einmal, auch nach erneutem Überfahren', async ({ page }) => {
  const z = await zoneCenter(page, 'DECK');
  await page.mouse.move(z.x - 200, z.y);
  await page.mouse.move(z.x, z.y, { steps: 5 });
  const lift = page.locator('.card.hover .lift');
  await expect(lift).toHaveCount(1);
  expect(await wiggles(page)).toBe(1);
  await expect.poll(() => lift.evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a)).toBeCloseTo(1.02, 3);
  // auf derselben Karte bleibt sie ruhig
  await page.waitForTimeout(300);
  await page.mouse.move(z.x + 5, z.y + 5, { steps: 3 });
  expect(await wiggles(page)).toBe(0);
  // verlassen und wieder darauf: wackelt erneut
  await page.mouse.move(z.x - 200, z.y, { steps: 3 });
  await expect(page.locator('.card.hover')).toHaveCount(0);
  await page.mouse.move(z.x, z.y, { steps: 3 });
  expect(await wiggles(page)).toBe(1);
});

test('Überfahren: kein Wackeln direkt nach dem Ablegen, die Karte lag die ganze Zeit unter dem Zeiger', async ({ page }) => {
  const from = await zoneCenter(page, 'DECK');
  const to = await zoneCenter(page, 'ABLAGE');
  await page.mouse.move(from.x, from.y);
  // das Wackeln beim Überfahren des Decks ist vorbei
  await expect.poll(() => wiggles(page)).toBe(0);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expectCount(page, 'ABLAGE', 1);
  let seen = 0;
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(to.x + i, to.y + i);
    seen += await wiggles(page);
  }
  expect(seen).toBe(0);
});

test('Greifen im Flug: der Zug beginnt an der gezeigten Lage, die Karte springt nicht', async ({ page }) => {
  await openMenu(page, 'DECK');
  const card = await page.evaluate(async () => {
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Ziehen')!.click();
    for (let i = 0; i < 100; i++) {
      const a = document.getAnimations().find((x) => x.id === 'move' && (x.effect as KeyframeEffect).getKeyframes().some((k) => 'transform' in k));
      if (a) return ((a.effect as KeyframeEffect).target as HTMLElement).dataset['card']!;
      await new Promise((r) => setTimeout(r, 5));
    }
    return '';
  });
  const moved = await page.evaluate(async (card) => {
    const el = document.querySelector<HTMLElement>(`.board > [data-card="${card}"]`)!;
    await new Promise((r) => setTimeout(r, 60));
    const before = el.getBoundingClientRect();
    const at = (dx: number, dy: number) => ({ bubbles: true, clientX: before.x + 20 + dx, clientY: before.y + 20 + dy, pointerType: 'mouse', button: 0, isPrimary: true, pointerId: 1 });
    el.dispatchEvent(new PointerEvent('pointerdown', at(0, 0)));
    window.dispatchEvent(new PointerEvent('pointermove', at(12, 12)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = el.getBoundingClientRect();
    window.dispatchEvent(new PointerEvent('pointerup', at(12, 12)));
    return { dx: after.x - before.x, dy: after.y - before.y };
  }, card);
  expect(moved.dx).toBeCloseTo(12, 0);
  expect(moved.dy).toBeCloseTo(12, 0);
});

test('Mischen: Karten der Ablage fliegen gestaffelt ein, danach heben sich die oberen Karten ab', async ({ page }) => {
  await openMenu(page, 'DECK');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await expectCount(page, 'ABLAGE', 3);
  await page.waitForTimeout(1500);
  const { anims } = await pressAndWatch(page, 'Mischen');
  const flights = anims.filter((a) => a.part.startsWith('card') && a.props.includes('translate') && !a.props.includes('zIndex'));
  expect(flights.map((a) => a.delay).sort((a, b) => a - b)).toEqual([0, 50, 100]);
  const cuts = anims.filter((a) => a.props.includes('translate') && a.props.includes('zIndex'));
  expect(cuts).toHaveLength(6);
  for (const c of cuts) expect(c.delay).toBeGreaterThan(100);
  await expectCount(page, 'ABLAGE', 0);
});

/** Stand mit festgelegter Reihenfolge im Deck laden (oberste Karte zuletzt) */
async function loadDeckTop(page: Page, top: string[]) {
  const dialog = await openSettings(page, 'Spielstand');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Als Datei speichern' }).click()]);
  const archive = JSON.parse(await readFile((await download.path())!, 'utf-8'));
  // den Stand im Archiv suchen: das Objekt mit `zones.deck`
  const find = (o: unknown): { zones: Record<string, string[]> } | null => {
    if (!o || typeof o !== 'object') return null;
    const z = (o as { zones?: Record<string, unknown> }).zones;
    if (z && Array.isArray(z['deck'])) return o as { zones: Record<string, string[]> };
    for (const v of Object.values(o)) { const f = find(v); if (f) return f; }
    return null;
  };
  const state = find(archive)!;
  for (const id of Object.keys(state.zones)) state.zones[id] = state.zones[id]!.filter((c) => !top.includes(c));
  state.zones['deck']!.push(...top);
  await dialog.locator('input[type=file]').setInputFiles({ name: 'stand.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
  await expect(page.getByRole('status')).toHaveText(/geladen/);
  await page.keyboard.press('Escape');
}

test('Schaden: die Karten der Schadenszone stoßen und schimmern rot', async ({ page }) => {
  // erst Herz König, dann die niedrigere Herz 2 auf das Schadensfeld: Treffer
  await loadDeckTop(page, ['H2', 'HK']);
  const deck = await zoneCenter(page, 'DECK');
  const damage = await zoneCenter(page, 'SCHADEN');
  await dragFromTo(page, deck, damage);
  await page.waitForTimeout(800);
  // beobachten schon vor dem Ablegen: der Stoß ist nach gut einer halben Sekunde vorbei
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { strikes: Set<string> }).strikes = seen;
    const watch = setInterval(() => {
      for (const a of document.getAnimations()) {
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        // genau der Stoß (0 → 8 px nach unten) auf einer Karte; nicht etwa das Anheben beim Greifen (`translate` auf `.lift`)
        const card = ((a.effect as KeyframeEffect).target as HTMLElement).dataset['card'];
        if (card && frames.some((k) => /^0(px)? 8px$/.test(String(k['translate'] ?? '')))) seen.add(card);
      }
    }, 10);
    setTimeout(() => clearInterval(watch), 5000);
  });
  await dragFromTo(page, deck, damage);
  await expect(page.getByRole('status')).toHaveText(/Narbe markiert/);
  await expect.poll(() => page.evaluate(() => [...(window as unknown as { strikes: Set<string> }).strikes].sort())).toEqual(['H2', 'HK']);
});

test('Ansichtswechsel: Karten so schnell und mit derselben Kurve wie Bögen und Zonen', async ({ page }) => {
  await page.keyboard.press('1');
  const seen = await page.evaluate(() =>
    document.getAnimations()
      .filter((a) => ((a.effect as KeyframeEffect).target as HTMLElement).dataset?.['card'])
      .map((a) => `${(a.effect as KeyframeEffect).getTiming().duration} ${(a.effect as KeyframeEffect).getTiming().easing}`));
  expect(seen.length).toBeGreaterThan(0);
  expect(new Set(seen)).toEqual(new Set(['350 ease']));
});

/** Beschriftungen, deren Zahl gerade springt (beobachtet ab jetzt, 2 s lang) */
function watchCounts(page: Page) {
  return page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { pops: Set<string> }).pops = seen;
    const watch = setInterval(() => {
      for (const a of document.getAnimations()) {
        const el = (a.effect as KeyframeEffect).target as HTMLElement;
        if (el.classList.contains('n')) seen.add(el.parentElement!.firstChild!.textContent!.trim());
      }
    }, 10);
    setTimeout(() => clearInterval(watch), 2000);
  });
}
const pops = (page: Page) => page.evaluate(() => [...(window as unknown as { pops: Set<string> }).pops].sort());

test('Zahl am Stapel: springt beim Ziehen an Deck und Ablage, nicht beim Zurücksetzen', async ({ page }) => {
  await watchCounts(page);
  await openMenu(page, 'DECK');
  await page.getByRole('button', { name: 'Ziehen', exact: true }).click();
  await expect.poll(() => pops(page)).toEqual(['ABLAGE', 'DECK']);
  await page.waitForTimeout(1500);
  await watchCounts(page);
  await resetTable(page);
  await expectCount(page, 'ABLAGE', 0);
  await page.waitForTimeout(600);
  expect(await pops(page)).toEqual([]);
});

/** Namen der CSS-Animationen, die gerade laufen */
const cssAnimations = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => 'animationName' in a).map((a) => (a as CSSAnimation).animationName));

test('Fenster, Stapelmenü und Meldungen erscheinen weich; Knöpfe geben beim Drücken nach', async ({ page }) => {
  const z = await zoneCenter(page, 'DECK');
  await page.mouse.click(z.x, z.y);
  expect(await cssAnimations(page)).toContain('pop-in');
  const draw = page.getByRole('button', { name: 'Ziehen', exact: true });
  const box = (await draw.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => draw.evaluate((e) => getComputedStyle(e).scale)).toBe('0.97');
  await page.mouse.up();
  await expect(page.getByRole('status')).toHaveText(/^Aufgedeckt: /);
  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  expect(await cssAnimations(page)).toEqual(expect.arrayContaining(['fade-in', 'pop-in']));
});
