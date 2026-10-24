// Expeditionsblatt am unteren Rand und seine Leselage (Schritt 5zb, Teil 2a, ARCHITEKTUR.md 10.12).

import { expect, test, type Page } from '@playwright/test';
import { readContent } from '../content/read';
import { dragFromTo, expectCount, fixRolls, ready, zoneCenter } from './helpers';

const raw = readContent() as unknown as {
  expedition: { expedition: { prompt: string; entries: string[] }[]; oracle: Record<string, Record<string, string>> };
};
const tables = raw.expedition.expedition;

const sheet = (page: Page) => page.locator('[data-expedition-sheet]');
const reader = (page: Page) => page.getByRole('dialog', { name: 'Expedition' });

/** Würfeln über „Alles neu“ mit festen Ergebnissen (je Tabelle derselbe Eintrag) */
async function rollAll(page: Page, entry: number) {
  await fixRolls(page, [entry, entry, entry, entry]);
  await reader(page).getByRole('button', { name: 'Alles neu' }).click();
  await expect(reader(page).locator('.value').first()).toHaveText(tables[0]!.entries[entry]!);
}

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('Blatt am unteren Rand: ein Knopf, nur der gemalte Kopf; Leselage vor der ersten Expedition ohne Antworten (F4, U4)', async ({ page }) => {
  await expect(sheet(page)).toHaveAccessibleName('Expedition ansehen');
  // in Ruhe kein gesetzter Text
  await expect(sheet(page)).toHaveText('');
  // reicht bis an den unteren Rand des Fensters (Grundansicht 16:9)
  const box = (await sheet(page).boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(890);
  await sheet(page).click();
  await expect(reader(page)).toBeVisible();
  await expect(reader(page).locator('.prompt')).toHaveText(tables.map((t) => t.prompt));
  await expect(reader(page).locator('.value')).toHaveCount(0);
});

test('Leselage: Klick aufs Blatt schließt nicht, Klick daneben schließt und öffnet keinen Stapel, Esc schließt (R3, R4)', async ({ page }) => {
  await sheet(page).click();
  const paper = reader(page).locator('[data-expedition-reader]');
  await paper.click({ position: { x: 200, y: 400 } });
  await expect(reader(page)).toBeVisible();
  // Klick daneben, genau über dem Deck: schließt nur die Leselage
  const deck = await zoneCenter(page, 'DECK');
  const r = (await paper.boundingBox())!;
  const x = deck.x < r.x || deck.x > r.x + r.width ? deck.x : r.x - 20;
  await page.mouse.click(x, deck.y);
  await expect(reader(page)).toHaveCount(0);
  await expect(page.locator('[data-stack-menu]')).toHaveCount(0);
  await sheet(page).click();
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
});

test('Tastatur: Fokus aufs Fenster, Tab bleibt darin, Esc schließt, Fokus zurück am Blatt; offenes Stapelmenü schließt (S4, T6)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  await page.mouse.click(deck.x, deck.y);
  await expect(page.locator('[data-stack-menu]')).toBeVisible();
  await sheet(page).focus();
  await page.keyboard.press('Enter');
  await expect(reader(page)).toBeVisible();
  await expect(page.locator('[data-stack-menu]')).toHaveCount(0);
  await expect(reader(page).locator('[data-expedition-reader]')).toBeFocused();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    expect(await reader(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(reader(page)).toHaveCount(0);
  await expect(sheet(page)).toBeFocused();
});

test('Würfeln: Alles neu und einzelne Zeile; jede Antwort aller Tabellen passt bei 1024 × 600 mit mindestens 13 px (S3, T2)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await sheet(page).click();
  for (let entry = 0; entry < 13; entry++) {
    await rollAll(page, entry);
    const rows = await reader(page).locator('section.row').evaluateAll((els) =>
      els.map((el) => {
        const v = el.querySelector<HTMLElement>('.value')!;
        return { over: el.scrollHeight - el.clientHeight, px: parseFloat(getComputedStyle(v).fontSize), text: v.textContent };
      }),
    );
    rows.forEach((row, i) => {
      expect(row.text, `Tabelle ${i + 1}, Eintrag ${entry}`).toBe(tables[i]!.entries[entry]);
      expect(row.over, `Tabelle ${i + 1}, Eintrag ${entry}`).toBeLessThanOrEqual(0.5);
      expect(row.px, `Tabelle ${i + 1}, Eintrag ${entry}`).toBeGreaterThanOrEqual(13);
    });
  }
  // einzelne Zeile: nur Tabelle III ändert sich
  await fixRolls(page, [5]);
  await reader(page).getByRole('button', { name: `Neu würfeln: ${tables[2]!.prompt}` }).click();
  await expect(reader(page).locator('.value')).toHaveText([tables[0]!.entries[12]!, tables[1]!.entries[12]!, tables[2]!.entries[5]!, tables[3]!.entries[12]!]);
  // ein Wurf öffnet nichts Neues und schließt nichts
  await expect(reader(page)).toHaveCount(1);
});

test('Karte auf das Blatt fallen lassen: landet daneben (F5)', async ({ page }) => {
  const deck = await zoneCenter(page, 'DECK');
  const s = (await sheet(page).boundingBox())!;
  await dragFromTo(page, deck, { x: s.x + s.width / 2, y: s.y + 10 });
  await expectCount(page, 'DECK', 26);
  const free = page.locator('[data-card][style*="rotate(90deg)"]');
  await expect(free).toHaveCount(1);
  await expect.poll(async () => {
    const c = (await free.boundingBox())!;
    return c.y + c.height <= s.y + 1;
  }).toBe(true);
});

// ---------- Ziehen (Teil 2b, T4) ----------

test('Blatt hochziehen öffnet die Leselage, kurzes Ziehen gleitet zurück; ein Ziehen ist kein Klick', async ({ page }) => {
  const s = (await sheet(page).boundingBox())!;
  const at = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
  const start = (await page.locator('[data-expedition-pull]').boundingBox())!.y;
  // kurz: weniger als ein Viertel der Fensterhöhe
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 80, { steps: 6 });
  await page.mouse.up();
  await expect(reader(page)).toHaveCount(0);
  const pulled = page.locator('[data-expedition-pull]');
  await expect.poll(async () => Math.abs((await pulled.boundingBox())!.y - start)).toBeLessThan(1);
  // weit genug: öffnet
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 300, { steps: 10 });
  await page.mouse.up();
  await expect(reader(page)).toBeVisible();
});

test('Leselage am Kopf herunterziehen schließt, kurz gleitet sie zurück; Ziehen auf einem Abschnitt schließt nicht (S5)', async ({ page }) => {
  await sheet(page).click();
  const grip = (await reader(page).locator('[data-expedition-grip]').boundingBox())!;
  const at = { x: grip.x + 30, y: grip.y + grip.height / 2 };
  // auf einem Abschnitt: markiert Text, schließt nicht
  const row = (await reader(page).locator('section.row').nth(1).boundingBox())!;
  await page.mouse.move(row.x + 10, row.y + 10);
  await page.mouse.down();
  await page.mouse.move(row.x + 10, row.y + 400, { steps: 8 });
  await page.mouse.up();
  await expect(reader(page)).toBeVisible();
  // am Kopf kurz: bleibt
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(reader(page)).toBeVisible();
  // am Kopf weit: schließt
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y + 400, { steps: 10 });
  await page.mouse.up();
  await expect(reader(page)).toHaveCount(0);
});

test('in einem hohen Fenster enden Blatt und Schachtel an der Tischkante, darunter ist nichts von ihnen zu sehen', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  // oben klicken: die Mitte des Knopfs liegt im hohen Fenster unter der Tischkante, also abgeschnitten
  await page.locator('[data-oracle-box]').click({ position: { x: 30, y: 30 } });
  await expect(page.locator('[data-oracle-card]')).toHaveCount(2);
  const board = (await page.locator('.board').boundingBox())!;
  const edge = board.y + board.height;
  expect(edge).toBeLessThan(790);
  for (const sel of ['[data-expedition-sheet]', '[data-oracle-box]']) {
    const r = (await page.locator(sel).boundingBox())!;
    const x = r.x + r.width / 2;
    const at = (y: number) => page.evaluate(({ x, y, sel }) => !!document.elementFromPoint(x, y)?.closest(sel), { x, y, sel });
    expect(await at(edge - 4), `${sel} über der Kante`).toBe(true);
    expect(await at(edge + 6), `${sel} unter der Kante`).toBe(false);
  }
});
