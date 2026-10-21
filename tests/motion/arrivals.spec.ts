// Kommen und Gehen mit Bewegung (11.7, Schritt 5l, Stufe „Ruhig“) über echte WebRTC-Verbindungen (Trystero/Nostr).
// Braucht Internet; läuft daher nur mit E2E_NETWORK=1. Gemessen wird an den laufenden Animationen bei der SL.

import { expect, test, type Page } from '@playwright/test';
import { fromMenu, ready } from '../e2e/helpers';

test.skip(!process.env.E2E_NETWORK, 'nur mit E2E_NETWORK=1 (echte Verbindung)');
test.setTimeout(120_000);

/** bei der SL jede neue Animation an Bogen, Schild, Dock-Knopf und Zeigern von Platz 2 sowie am Zähler einmal
 *  festhalten: `Teil:Art:Eigenschaften:Dauer`; `seen` liefert sie und beginnt neu */
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { seen: string[] };
    w.seen = [];
    const done = new Set<Animation>();
    const parts: [string, string][] = [['sheet', '[data-sheet=seat2]'], ['plate', '[data-plate=seat2]'], ['dock', '[data-dock=seat2]'], ['count', '.menu .count']];
    setInterval(() => {
      for (const a of document.getAnimations()) {
        if (done.has(a)) continue;
        const el = (a.effect as KeyframeEffect).target as HTMLElement;
        const part = parts.find(([, sel]) => el.matches(sel))?.[0] ?? (el.closest('.cursor') ? (el.classList.contains('ring') ? 'ring' : 'cursor') : null);
        if (!part) continue;
        done.add(a);
        const props = a instanceof CSSTransition ? [a.transitionProperty]
          : [...new Set((a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)).sort();
        w.seen.push(`${part}:${props.join(',')}:${(a.effect as KeyframeEffect).getTiming().duration}`);
      }
    }, 5);
  });
  return () => page.evaluate(() => {
    const w = window as unknown as { seen: string[] };
    const s = [...new Set(w.seen)].sort();
    w.seen = [];
    return s;
  });
}

test('Kommen und Gehen mit Bewegung (5l): Ankommen, Ring einmal, Zeiger blendet aus, Zähler, „nicht da“, wieder da', async ({ browser }) => {
  const gm = await (await browser.newContext()).newPage();
  await ready(gm);
  await fromMenu(gm, 'Mitspieler einladen');
  await expect(gm.locator('[data-health=ok]')).toBeVisible();
  const link = gm.url();
  const seen = await watch(gm);

  // Beitritt als Zuschauer: nur der Zähler springt
  const idas = await browser.newContext();
  const ida = await idas.newPage();
  await ida.goto(link);
  const join = ida.getByRole('dialog', { name: 'Platz wählen' });
  await expect(join).toBeVisible({ timeout: 60_000 });
  await expect.poll(seen).toEqual(['count:scale:250']);

  // Platz nehmen: Bogen hebt sich und leuchtet, Schild blendet ein; Idas Zeiger ist vom Klick schon über dem Tisch,
  // also gleich einmal der Ring
  await join.getByRole('textbox').fill('Ida');
  await join.getByRole('button', { name: /^Spieler 2/ }).click();
  await expect(gm.getByRole('status')).toHaveText('Ida sitzt an Platz 2.', { timeout: 30_000 });
  await gm.waitForTimeout(700);
  expect((await seen()).filter((s) => !s.startsWith('cursor:transform'))).toEqual(['plate:backgroundColor,color:350', 'ring:opacity,scale:500', 'sheet:boxShadow,translate:600']);

  // Zeiger verlassen und zurück: kein zweiter Ring, beim Verlassen blendet er aus
  await ida.mouse.move(620, 420, { steps: 5 });
  await expect(gm.locator('.cursor')).toHaveCount(1);
  await ida.evaluate(() => document.querySelector('.stage')!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })));
  await expect(gm.locator('.cursor')).toHaveCount(0);
  await ida.mouse.move(600, 400, { steps: 3 });
  await expect(gm.locator('.cursor')).toHaveCount(1);
  await gm.waitForTimeout(600);
  const outIn = (await seen()).filter((s) => !s.startsWith('cursor:transform'));
  expect(outIn).toContain('cursor:opacity:200');
  expect(outIn.filter((s) => s.startsWith('ring'))).toEqual([]);

  // Ida geht: Schild und Dock-Knopf blenden in 600 ms ab
  await ida.close();
  await expect(gm.getByRole('status')).toHaveText('Ida ist nicht mehr verbunden.', { timeout: 30_000 });
  await gm.waitForTimeout(700);
  expect((await seen()).filter((s) => !s.startsWith('cursor') && !s.startsWith('count'))).toEqual(['dock:opacity:600', 'plate:opacity:600']);

  // derselbe Browser kommt wieder: nur das Schild blendet ein, voll in 350 ms; der Bogen hebt sich nicht
  const back = await idas.newPage();
  await back.goto(link);
  await expect(gm.getByRole('status')).toHaveText('Ida ist wieder da.', { timeout: 60_000 });
  await gm.waitForTimeout(700);
  expect((await seen()).filter((s) => !s.startsWith('cursor') && !s.startsWith('count'))).toEqual(['dock:opacity:350', 'plate:backgroundColor,color:350', 'plate:opacity:350']);
});
