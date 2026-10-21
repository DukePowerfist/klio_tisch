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
    // erst warten, bis nichts mehr läuft: sonst hält der Test etwa das Wackeln der Karte unter der Maus (11.6), das
    // unter Last später beginnt, für die Animation des Knopfs
    for (let i = 0; i < 200 && document.getAnimations().length; i++) await new Promise((r) => setTimeout(r, 5));
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
    const el = document.querySelector<HTMLElement>(`.scene > [data-card="${card}"]`)!;
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

/** Treffer vorbereiten: erst Herz König aufs Schadensfeld, als Nächstes oben im Deck die niedrigere Herz 2.
 *  Liefert den Zug, der trifft. */
async function primeHit(page: Page): Promise<() => Promise<void>> {
  await loadDeckTop(page, ['H2', 'HK']);
  const deck = await zoneCenter(page, 'DECK');
  const damage = await zoneCenter(page, 'SCHADEN');
  await dragFromTo(page, deck, damage);
  await page.waitForTimeout(800);
  return () => dragFromTo(page, deck, damage);
}

/** im Browser je Karte den ersten Zeitpunkt ihres Stoßes merken (`window.strikes`), alle 5 ms für 5 s */
async function watchStrikes(page: Page) {
  await page.evaluate(() => {
    const strikes: Record<string, number> = {};
    (window as unknown as { strikes: Record<string, number> }).strikes = strikes;
    const watch = setInterval(() => {
      for (const a of document.getAnimations()) {
        const frames = (a.effect as KeyframeEffect).getKeyframes();
        // genau der Stoß (0 → 8 px nach unten) auf einer Karte; nicht etwa das Anheben beim Greifen (`translate` auf `.lift`)
        const card = ((a.effect as KeyframeEffect).target as HTMLElement).dataset['card'];
        if (card && strikes[card] === undefined && frames.some((k) => /^0(px)? 8px$/.test(String(k['translate'] ?? '')))) strikes[card] = performance.now();
      }
    }, 5);
    setTimeout(() => clearInterval(watch), 5000);
  });
}
const strikes = (page: Page) => page.evaluate(() => (window as unknown as { strikes: Record<string, number> }).strikes);

test('Schaden: die Karten der Schadenszone stoßen und schimmern rot', async ({ page }) => {
  const hit = await primeHit(page);
  // beobachten schon vor dem Ablegen: der Stoß ist nach gut einer halben Sekunde vorbei
  await watchStrikes(page);
  await hit();
  await expect(page.getByRole('status')).toHaveText(/Narbe markiert/);
  await expect.poll(async () => Object.keys(await strikes(page)).sort()).toEqual(['H2', 'HK']);
});

test('Schaden: erst aufdecken, dann Stoß, dann Narbe und Meldung (5k)', async ({ page }) => {
  const hit = await primeHit(page);
  await watchStrikes(page);
  // Zeitpunkte im Browser: letztes Umklappen der getroffenen Karte, Narbe am Bogen, Meldung
  await page.evaluate(() => {
    const times: Record<string, number> = {};
    (window as unknown as { times: Record<string, number> }).times = times;
    const watch = setInterval(() => {
      const now = performance.now();
      const inner = document.querySelector('[data-card=H2] .inner');
      if (inner?.getAnimations().some((a) => a.playState === 'running')) times['flip'] = now;
      if (times['scar'] === undefined && document.querySelector('[data-check="scars.heart"][aria-pressed=true]')) times['scar'] = now;
      if (times['toast'] === undefined && /Narbe markiert/.test(document.querySelector('[role=status]')?.textContent ?? '')) times['toast'] = now;
    }, 5);
    setTimeout(() => clearInterval(watch), 5000);
  });
  await hit();
  await expect(page.locator('[data-check="scars.heart"][aria-pressed=true]')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText(/Narbe markiert/);
  const times = await page.evaluate(() => (window as unknown as { times: Record<string, number> }).times);
  const first = Math.min(...Object.values(await strikes(page)));
  expect(times['flip'], 'die getroffene Karte klappt um').toBeDefined();
  // Abtastung alle 5 ms: etwas Spiel
  expect(first).toBeGreaterThanOrEqual(times['flip']! - 10);
  expect(times['scar']!).toBeGreaterThan(times['flip']! + 100);
  expect(times['toast']!).toBeGreaterThan(times['flip']! + 100);
});

type Seen = { kind: string; on: string; props: string[]; to: string | null; duration: number };

/** Tasten im Browser drücken bzw. die Spielerzahl wählen (ohne Umweg über Playwright, der Schnitt dauert nur etwa
 *  0,3 s) und 600 ms lang jedes Bild alle laufenden Animationen und CSS-Übergänge sammeln, je einmal. `dock`: Ansicht im
 *  Dock direkt danach. */
function keysAndWatch(page: Page, keys: string[], players?: number): Promise<{ seen: Seen[]; dock: string | null }> {
  return page.evaluate(async ({ keys, players }) => {
    for (const key of keys) document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    if (players) {
      const select = document.querySelector<HTMLSelectElement>('.ctl select')!;
      select.value = String(players);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise((r) => requestAnimationFrame(r));
    const dock = document.querySelector<HTMLElement>('.dock button.on')?.dataset['dock'] ?? 'overview';
    const all = new Set<Animation>();
    const t0 = performance.now();
    while (performance.now() - t0 < 600) {
      for (const a of document.getAnimations()) all.add(a);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const seen = [...all].map((a) => {
      const effect = a.effect as KeyframeEffect;
      const el = effect.target as HTMLElement;
      const frames = effect.getKeyframes();
      return {
        kind: a.constructor.name,
        on: el.dataset['card'] ? 'card' : (el.className.toString().split(' ')[0] ?? ''),
        props: (a as CSSTransition).transitionProperty ? [(a as CSSTransition).transitionProperty] : [...new Set(frames.flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)),
        to: frames.length ? String(frames[frames.length - 1]!['opacity'] ?? '') || null : null,
        duration: Number(effect.getTiming().duration),
      };
    });
    return { seen, dock };
  }, { keys, players });
}
/** gesehene Bewegungen der Lage: Karten (`transform`) und CSS-Übergänge auf Bögen, Zonen, Kanten und Panel */
const shifts = (seen: Seen[]) => seen.filter((s) => (s.on === 'card' && s.props.includes('transform')) || (s.kind === 'CSSTransition' && ['zone', 'edge', 'sheet', 'paper', 'panel', 'ptitle'].includes(s.on)));
/** Abstand der Mitte der obersten Deckkarte zur Mitte der Zone DECK (Endlage stimmt: 0) */
async function deckOffset(page: Page) {
  const zone = (await zoneCenter(page, 'DECK')).box;
  const card = (await page.locator('.scene > [data-card]').evaluateAll((els, z) => {
    const c = (r: DOMRect) => [r.x + r.width / 2, r.y + r.height / 2] as const;
    const [zx, zy] = [z.x + z.width / 2, z.y + z.height / 2];
    return els.map((e) => c(e.getBoundingClientRect())).sort((a, b) => Math.hypot(a[0] - zx, a[1] - zy) - Math.hypot(b[0] - zx, b[1] - zy))[0]!;
  }, zone));
  return Math.hypot(card[0] - zone.x - zone.width / 2, card[1] - zone.y - zone.height / 2);
}

test('Ansichtswechsel als Schnitt (5m, seit 5n der ganze Tisch): nichts gleitet, der Tisch blendet ab und auf; Dock sofort', async ({ page }) => {
  const before = (await zoneCenter(page, 'DECK')).box;
  const { seen, dock } = await keysAndWatch(page, ['2']);
  expect(dock, 'das Dock zeigt die gewählte Ansicht sofort').toBe('seat2');
  expect(shifts(seen)).toEqual([]);
  const fades = seen.filter((s) => s.props.includes('opacity') && s.on === 'board');
  expect(fades.map((f) => [f.to, f.duration])).toEqual([['0', 100], ['1', 180]]);
  // nur eine Blende: der Inhalt allein wäre eine isolierte Gruppe, das Licht (multiply) ohne Hintergrund (11.9)
  expect(seen.filter((s) => s.on === 'scene'), 'der Inhalt blendet nicht eigens').toEqual([]);
  // neue Anordnung, Karten liegen genau auf ihren Zonen
  expect((await zoneCenter(page, 'DECK')).box.x).not.toBeCloseTo(before.x, 0);
  expect(await deckOffset(page)).toBeLessThan(0.5);
});

test('Ansichtswechsel zur selben Ansicht: keine Blende, nur der Zoom gleitet zurück (5m)', async ({ page }) => {
  await page.keyboard.press('2');
  await page.waitForTimeout(500);
  const fit = await page.locator('.board').evaluate((e) => e.getBoundingClientRect().width);
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(500);
  expect(await page.locator('.board').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(fit * 1.1);
  const { seen } = await keysAndWatch(page, ['2']);
  expect(seen.filter((s) => s.on === 'board' || s.on === 'scene')).toEqual([]);
  await expect.poll(() => page.locator('.board').evaluate((e) => e.getBoundingClientRect().width)).toBeCloseTo(fit, 0);
});

test('Ansichtswechsel rasch hintereinander: die zuletzt gewählte Ansicht, genau ein Aufblenden (5m)', async ({ page }) => {
  const before = (await zoneCenter(page, 'DECK')).box;
  const { seen, dock } = await keysAndWatch(page, ['1', '2', '3', '0']);
  expect(dock).toBe('overview');
  expect(seen.filter((s) => s.on === 'board' && s.to === '1')).toHaveLength(1);
  expect(shifts(seen)).toEqual([]);
  expect((await zoneCenter(page, 'DECK')).box).toEqual(before);
});

test('Ansichtswechsel: ein Klick während des Schnitts beginnt keinen Zug (5m)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  // im Browser im selben Moment wie die Taste: greifen und ziehen, dann nachsehen, ob eine Karte gezogen wird
  const dragged = await page.evaluate(async ({ x, y }) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    const card = document.elementFromPoint(x, y)!;
    const opts = { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true };
    card.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: x, clientY: y }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: x + 60, clientY: y + 40 }));
    await new Promise((r) => requestAnimationFrame(r));
    const n = document.querySelectorAll('.card.dragging').length;
    window.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: x + 60, clientY: y + 40 }));
    return n;
  }, deck);
  expect(dragged).toBe(0);
  await page.waitForTimeout(400);
  await expectCount(page, 'DECK', 27);
});

test('Spielerzahl: Sprung an die neue Anordnung, dann Aufblenden, ohne Abblenden (5m)', async ({ page }) => {
  // eine Karte auf dem Bogen von Spieler 1: Bei 2 Spielern werden die Bögen größer, sie wandert mit
  await dragFromTo(page, await zoneCenter(page, 'DECK'), await zoneCenter(page, 'SAMMELN'));
  await expectCount(page, 'DECK', 26);
  await page.waitForTimeout(1500);
  const before = (await zoneCenter(page, 'SAMMELN')).box;
  const { seen } = await keysAndWatch(page, [], 2);
  await expect(page.locator('.dock button.seat')).toHaveCount(2);
  expect((await zoneCenter(page, 'SAMMELN')).box.width, 'die Anordnung ändert sich').toBeGreaterThan(before.width * 1.1);
  expect(shifts(seen)).toEqual([]);
  const fades = seen.filter((s) => s.props.includes('opacity') && s.on === 'board');
  expect(fades.map((f) => f.to)).not.toContain('0');
  expect(fades.filter((f) => f.to === '1').map((f) => f.duration)).toEqual([180]);
});

test('Öffnen eines Stapels wächst weiter mit --shift (Gegenprobe zu 5m)', async ({ page }) => {
  const easy = await zoneCenter(page, 'LEICHT');
  await page.mouse.click(easy.x, easy.y);
  const seen = await page.evaluate(() => document.getAnimations().map((a) =>
    `${a.constructor.name} ${(a as CSSTransition).transitionProperty ?? ''} ${((a.effect as KeyframeEffect).target as HTMLElement).className.toString().split(' ')[0]} ${(a.effect as KeyframeEffect).getTiming().duration}`));
  expect(seen).toContain('CSSTransition width zone 350');
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

test('Schild, Streifen und Dock bei „nicht da“ (5l): blasser in --away, zurück in --back, still ohne Übergang', async ({ page }) => {
  // nur das CSS: Klassen direkt setzen (die Anwesenheit selbst prüfen die Netzwerktests)
  const fade = (sel: string, classes: string[], on: boolean) => page.evaluate(async ({ sel, classes, on }) => {
    const el = document.querySelector<HTMLElement>(sel)!;
    for (const c of classes) el.classList.toggle(c, on);
    await new Promise((r) => requestAnimationFrame(r));
    return el.getAnimations().filter((a) => (a as CSSTransition).transitionProperty === 'opacity').map((a) => Number((a.effect as KeyframeEffect).getTiming().duration));
  }, { sel, classes, on });
  for (const sel of ['[data-plate=seat2]', '[data-dock=seat2]']) {
    expect(await fade(sel, ['away'], true), sel).toEqual([600]);
    await page.waitForTimeout(700);
    expect(await fade(sel, ['away'], false), sel).toEqual([350]);
    await page.waitForTimeout(400);
    expect(await fade(sel, ['still', 'away'], true), sel).toEqual([]);
  }
  await page.keyboard.press('1');
  await page.waitForTimeout(500);
  expect(await fade('[data-strip=seat2]', ['away'], true)).toEqual([600]);
});
