import { describe, expect, it } from 'vitest';
import { contextFor } from '../../src/rules/klio/trumps';
import { anySourceOpen, attributeOptions, finalCommand, nextStep, selectableByCategory, sourceRows, trumpRows } from '../../src/ui/trumpDialog';
import { content, fresh, sheet, withSheet } from '../helpers';

const ctxWith = (patch: Parameters<typeof withSheet>[2]) => contextFor(content, sheet(withSheet(fresh(), 'seat1', patch), 'seat1'));
const source = (id: string) => content.trumpSources.trumpSources.find((s) => s.id === id)!;

describe('Trumpf-Dialog', () => {
  it('Wege mit Begründung; goldenes Plus nur, wenn einer offen ist', () => {
    const empty = ctxWith(() => {});
    expect(sourceRows(content, empty).map((r) => [r.source.id, r.ok])).toEqual([['start', true], ['weakness', false], ['experience', false], ['scar', false]]);
    const one = ctxWith((b) => (b.trumps[0] = 'anatomie'));
    expect(anySourceOpen(content, one)).toBe(false);
    expect(sourceRows(content, one)[0]!.why).toEqual({ key: 'source.start.why' });
  });

  it('Schritt entfällt, wenn es nichts zu wählen gibt: Schwäche streichen bei zwei leeren (A29)', () => {
    const marks = (w: [string, string]) => ctxWith((b) => { b.trumps[0] = 'anatomie'; b.weaknessMarks = [true, true, true]; b.weaknesses = w; });
    const path = { kind: 'source' as const, source: source('weakness'), improveOnly: false };
    expect(nextStep(path, {}, 0, marks(['Kälte', '']))).toMatchObject({ at: 'step', name: 'chooseWeaknessToRemove', required: true });
    expect(nextStep(path, {}, 0, marks(['', '']))).toMatchObject({ at: 'categories' });
  });

  it('Erlebnis bei 4 Trümpfen: Verbessern ist Pflicht, danach fertig ohne Trumpf', () => {
    const ctx = ctxWith((b) => { b.trumps = ['anatomie', 'stoiker', 'huh', 'prognose']; b.lamps = [true, true, true]; });
    const r = sourceRows(content, ctx).find((x) => x.source.id === 'experience')!;
    expect(r).toMatchObject({ ok: true, improveOnly: true });
    const path = { kind: 'source' as const, source: r.source, improveOnly: true };
    expect(nextStep(path, {}, 0, ctx)).toMatchObject({ at: 'step', name: 'improveStrength', required: true });
    expect(nextStep(path, { improveStrength: { index: 0, text: '' } }, 1, ctx)).toBeNull();
    expect(finalCommand('seat1', path, { improveStrength: { index: 0, text: '' } }, undefined)).toEqual({ type: 'trump.choose', seat: 'seat1', source: 'experience', improveStrength: { index: 0, text: '' } });
  });

  it('Kategorien zählen wählbare Trümpfe; ausgegraute haben einen Grund', () => {
    const ctx = ctxWith((b) => (b.attributes = { K: 2, V: 1, P: 1 }));
    const start = { kind: 'source' as const, source: source('start'), improveOnly: false };
    const rows = trumpRows(content, ctx, start, {});
    expect(selectableByCategory(rows)).toMatchObject({ K: 4, V: 0 });
    expect(rows.find((r) => r.trump.id === 'stoiker')!.why).toEqual({ key: 'source.start.levelWhy' });
    expect(selectableByCategory(trumpRows(content, ctx, { kind: 'free' }, {})).V).toBe(11);
  });

  it('Attribut-Knöpfe aus den gültigen Möglichkeiten: 0 nicht verringern, nicht auf dasselbe erhöhen', () => {
    const ctx = ctxWith((b) => (b.attributes = { K: 2, V: 0, P: 1 }));
    expect(attributeOptions(ctx, undefined).map((o) => [o.attr, o.canLower, o.canRaise])).toEqual([['K', true, false], ['V', false, false], ['P', true, false]]);
    expect(attributeOptions(ctx, 'K').map((o) => o.canRaise)).toEqual([false, true, true]);
  });
});
