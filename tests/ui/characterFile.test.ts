import { describe, expect, it } from 'vitest';
import { FORMAT } from '../../src/engine/setup';
import { sha256Hex } from '../../src/net/photos';
import { characterFileName, readCharacter, writeCharacter } from '../../src/ui/characterFile';
import { emptySheet, type KlioSheet } from '../../src/rules/klio/state';

const sheet: KlioSheet = { ...emptySheet(), name: 'Hilda', variant: 'w', trumps: ['schnelle-reflexe', null, null, null], dead: true, photo: { hash: 'b'.repeat(64), type: 'image/jpeg' } };

describe('Charakterdatei (10.1)', () => {
  it('ohne Foto: hin und zurück derselbe Bogen, Fotoverweis leer', async () => {
    const r = await readCharacter(writeCharacter(sheet, null));
    expect(r).toEqual({ ok: true, sheet: { ...sheet, photo: null }, photo: null });
  });

  it('mit Foto: Bytes kommen zurück, der Verweis heißt nach ihrem Inhalt', async () => {
    const bytes = new Uint8Array([255, 216, 1, 2, 3, 250]);
    const r = await readCharacter(writeCharacter(sheet, bytes));
    if (!r.ok) throw new Error('nicht gelesen');
    const hash = await sha256Hex(bytes);
    expect(r.photo).toEqual({ hash, bytes });
    expect(r.sheet).toEqual({ ...sheet, photo: { hash, type: 'image/jpeg' } });
  });

  it('kein Charakter: kaputtes JSON, Spielstand, falsches Format, ungültiger Bogen', async () => {
    const file = JSON.parse(writeCharacter(sheet, null));
    for (const text of ['{', '{"app":"etwas"}', JSON.stringify({ ...file, format: FORMAT - 1 }), JSON.stringify({ ...file, sheet: { ...file.sheet, lamps: [] } }), JSON.stringify({ ...file, photo: '***' })]) {
      expect(await readCharacter(text), text).toEqual({ ok: false, reason: { key: 'plate.importInvalid' } });
    }
  });

  it('neuere Fassung: eigener Hinweis', async () => {
    const file = JSON.parse(writeCharacter(sheet, null));
    expect(await readCharacter(JSON.stringify({ ...file, format: FORMAT + 1 }))).toEqual({ ok: false, reason: { key: 'plate.importNewer' } });
  });

  it('Dateiname nach dem Charakter', () => {
    expect(characterFileName('Hilda Weber')).toBe('Hilda Weber.klio-charakter.json');
    expect(characterFileName('a/b:c?')).toBe('abc.klio-charakter.json');
    expect(characterFileName(' ')).toBe('Charakter.klio-charakter.json');
  });
});
