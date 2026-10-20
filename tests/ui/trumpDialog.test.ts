import { describe, expect, it } from 'vitest';
import { anySourceOpen, context, finalCommand, nextStep, selectableCount, sourceRows, trumpRows } from '../../src/ui/trumpDialog';
import { content, fresh, sheet, withSheet } from '../helpers';

const sheetWith = (patch: Parameters<typeof withSheet>[2]) => sheet(withSheet(fresh(), 'seat1', patch), 'seat1');

describe('Trumpf-Dialog', () => {
  it('Wege mit Begründung; goldenes Plus nur, wenn einer offen ist', () => {
    const empty = context(content, sheetWith(() => {}));
    expect(sourceRows(content, empty).map((r) => [r.source.id, r.ok])).toEqual([['start', true], ['weakness', false], ['experience', false], ['scar', false]]);
    const one = context(content, sheetWith((b) => (b.trumps[0] = 'anatomie')));
    expect(anySourceOpen(content, one)).toBe(false);
    expect(sourceRows(content, one)[0]!.why).toEqual({ key: 'source.start.why' });
  });

  it('Schwäche überwunden: Streich-Schritt nur mit befüllter Schwäche (A29)', () => {
    const marks = (w: [string, string]) => context(content, sheetWith((b) => { b.trumps[0] = 'anatomie'; b.weaknessMarks = [true, true, true]; b.weaknesses = w; }));
    const row = (ctx: ReturnType<typeof context>) => sourceRows(content, ctx).find((r) => r.source.id === 'weakness')!;
    const withOne = marks(['Kälte', '']);
    expect(nextStep({ kind: 'source', source: row(withOne).source, improveOnly: false }, {}, 0, withOne)).toMatchObject({ at: 'chooseWeaknessToRemove' });
    const none = marks(['', '']);
    expect(nextStep({ kind: 'source', source: row(none).source, improveOnly: false }, {}, 0, none)).toMatchObject({ at: 'categories' });
  });

  it('Erlebnis bei 4 Trümpfen: nach dem Verbessern fertig, ohne Trumpf', () => {
    const ctx = context(content, sheetWith((b) => { b.trumps = ['anatomie', 'stoiker', 'huh', 'prognose']; b.lamps = [true, true, true]; }));
    const r = sourceRows(content, ctx).find((x) => x.source.id === 'experience')!;
    expect(r).toMatchObject({ ok: true, improveOnly: true });
    const path = { kind: 'source' as const, source: r.source, improveOnly: true };
    expect(nextStep(path, {}, 0, ctx)).toMatchObject({ at: 'improveStrength' });
    expect(nextStep(path, { improveStrength: { index: 0, text: '' } }, 1, ctx)).toBeNull();
    expect(finalCommand('seat1', path, { improveStrength: { index: 0, text: '' } }, undefined)).toEqual({ type: 'trump.choose', seat: 'seat1', source: 'experience', improveStrength: { index: 0, text: '' } });
  });

  it('Kategorien zählen wählbare Trümpfe; ausgegraute haben einen Grund', () => {
    const ctx = context(content, sheetWith((b) => (b.attributes = { K: 2, V: 1, P: 1 })));
    const start = { kind: 'source' as const, source: content.trumpSources.trumpSources[0]!, improveOnly: false };
    expect(selectableCount(content, ctx, start, {}, 'K')).toBe(4);
    expect(selectableCount(content, ctx, start, {}, 'V')).toBe(0);
    expect(trumpRows(content, ctx, start, {}, 'K').find((r) => r.trump.id === 'stoiker')!.why).toEqual({ key: 'source.start.levelWhy' });
    expect(selectableCount(content, ctx, { kind: 'free' }, {}, 'V')).toBe(11);
  });
});
