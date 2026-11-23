import { describe, expect, it } from 'vitest';
import { resolveText } from '../../src/rules/klio/content/texts';
import { contextFor } from '../../src/rules/klio/trumps';
import { anySourceOpen, attributeOptions, consequences, finalCommand, intro, nextStep, selectableByCategory, sourceRows, tabRows, trail, trumpRows } from '../../src/ui/trumpDialog';
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

  it('Einstieg (5zu): Einleitung je nach Zahl der Trümpfe', () => {
    expect(intro(content, ctxWith(() => {})).key).toBe('trumpDialog.introNone');
    expect(intro(content, ctxWith((b) => (b.trumps[0] = 'anatomie')))).toEqual({ key: 'trumpDialog.introSome', params: { n: 1, max: 4 } });
    expect(intro(content, ctxWith((b) => (b.trumps = ['anatomie', 'stoiker', 'huh', 'prognose']))).key).toBe('trumpDialog.introFull');
  });

  it('Einstieg (5zu): Stand nur an einer offenen Voraussetzung, sonst der tatsächliche Sperrgrund', () => {
    const row = (id: string, patch: Parameters<typeof withSheet>[2]) => sourceRows(content, ctxWith(patch)).find((r) => r.source.id === id)!;
    // Laterne 2 von 3, Verbessern 1 von 3
    expect(row('experience', (b) => { b.trumps[0] = 'anatomie'; b.lamps = [true, true, false]; })).toMatchObject({
      ok: false, why: { key: 'source.experience.why' }, progress: { key: 'trumpDialog.progress.lamps', params: { n: 2, max: 3 } },
    });
    expect(row('weakness', (b) => (b.weaknessMarks = [true, false, false])).progress).toEqual({ key: 'trumpDialog.progress.weaknessMarks', params: { n: 1, max: 3 } });
    // Voraussetzungen ohne Kästchenliste haben keinen Stand
    expect(row('scar', () => {}).progress).toBeNull();
    expect(row('start', (b) => (b.trumps[0] = 'anatomie')).progress).toBeNull();
    // voller Bogen: Narbe vorhanden, gesperrt ist der Weg wegen der vier Trümpfe
    const full = ['anatomie', 'stoiker', 'huh', 'prognose'];
    expect(row('scar', (b) => { b.trumps = full; b.newScars = 1; })).toMatchObject({ ok: false, why: { key: 'toast.maxTrumps' }, progress: null });
    // voller Bogen, Laterne nicht voll: Grund ist der volle Bogen, kein Stand
    expect(row('weakness', (b) => { b.trumps = full; b.weaknessMarks = [true, false, false]; })).toMatchObject({ why: { key: 'toast.maxTrumps' }, progress: null });
    // voller Bogen, volle Laterne, alle Stärken verbessert: gesperrt wegen des vollen Bogens
    expect(row('experience', (b) => { b.trumps = full; b.lamps = [true, true, true]; for (const s of b.strengths) s.improved = true; })).toMatchObject({ ok: false, why: { key: 'toast.maxTrumps' }, progress: null });
    // voller Bogen, Laterne 2 von 3: die Voraussetzung ist offen, also mit Stand
    expect(row('experience', (b) => { b.trumps = full; b.lamps = [true, true, false]; })).toMatchObject({ why: { key: 'source.experience.why' }, progress: { params: { n: 2 } } });
    for (const key of ['trumpDialog.progress.lamps', 'trumpDialog.progress.weaknessMarks']) expect(resolveText(content, key), key).toBeTypeOf('string');
  });

  it('Wegleiste (5zv, 5zx): Anlass, Schritte mit getroffener Wahl, Trumpf, Bestätigen; übergangene und entfallene Schritte fehlen', () => {
    const show = (items: ReturnType<typeof trail>) => items.map((i) => `${i.state}:${i.id}${i.value === null ? '' : `=${typeof i.value === 'string' ? i.value : i.value.key}`}`);
    const ctx = ctxWith((b) => { b.trumps[0] = 'anatomie'; b.newScars = 1; b.lamps = [true, true, true]; b.strengths[1]!.text = 'Peitsche'; b.weaknessMarks = [true, true, true]; b.weaknesses = ['Kälte', '']; });
    expect(trail({ at: 'sources' }, ctx)).toEqual([]);
    // Narbe: Schritt, dann Trumpf, dann Bestätigen
    const scar = { kind: 'source' as const, source: source('scar'), improveOnly: false };
    expect(show(trail({ at: 'step', name: 'moveAttributePoint', required: true, path: scar, choices: {}, index: 0 }, ctx))).toEqual(['done:source', 'now:moveAttributePoint', 'todo:trump', 'todo:confirm']);
    const moved = { moveAttribute: { lowered: 'K' as const, raised: 'P' as const } };
    expect(show(trail({ at: 'trumps', path: scar, choices: moved }, ctx))).toEqual(['done:source', 'done:moveAttributePoint=Körper −1, Präsenz +1', 'now:trump', 'todo:confirm']);
    expect(trail({ at: 'trumps', path: scar, choices: moved }, ctx)[0]!.label).toBe('Neue Narbe');
    // Erlebnis: neue Formulierung, sonst der alte Text; ohne Verbesserung fehlt das Glied
    const exp = { kind: 'source' as const, source: source('experience'), improveOnly: false };
    expect(show(trail({ at: 'trumps', path: exp, choices: { improveStrength: { index: 1, text: ' gute Peitsche ' } } }, ctx))[1]).toBe('done:improveStrength=gute Peitsche');
    expect(show(trail({ at: 'trumps', path: exp, choices: { improveStrength: { index: 1, text: '' } } }, ctx))[1]).toBe('done:improveStrength=Peitsche');
    expect(show(trail({ at: 'trumps', path: exp, choices: {} }, ctx))).toEqual(['done:source', 'now:trump', 'todo:confirm']);
    // voller Bogen: nach der Stärke ist Schluss
    expect(show(trail({ at: 'step', name: 'improveStrength', required: true, path: { ...exp, improveOnly: true }, choices: {}, index: 0 }, ctx))).toEqual(['done:source', 'now:improveStrength', 'todo:confirm']);
    // Schwäche: gewählte Schwäche mit ihrem Text; sind beide leer, gibt es das Glied nicht
    const weak = { kind: 'source' as const, source: source('weakness'), improveOnly: false };
    expect(show(trail({ at: 'trumps', path: weak, choices: { removeWeakness: 0 } }, ctx))[1]).toBe('done:chooseWeaknessToRemove=Kälte');
    const none = ctxWith((b) => { b.weaknessMarks = [true, true, true]; });
    expect(show(trail({ at: 'trumps', path: weak, choices: {} }, none))).toEqual(['done:source', 'now:trump', 'todo:confirm']);
    // Bestätigen: der Name des Trumpfs steht in der Leiste
    const stoiker = content.trumps.find((t) => t.id === 'stoiker')!;
    expect(show(trail({ at: 'confirm', path: scar, choices: moved, trump: stoiker, shown: '' }, ctx))).toEqual(['done:source', 'done:moveAttributePoint=Körper −1, Präsenz +1', `done:trump=${stoiker.name}`, 'now:confirm']);
    expect(show(trail({ at: 'confirm', path: { ...exp, improveOnly: true }, choices: { improveStrength: { index: 1, text: '' } }, trump: undefined, shown: '' }, ctx))).toEqual(['done:source', 'done:improveStrength=Peitsche', 'now:confirm']);
    // freie Wahl
    expect(show(trail({ at: 'trumps', path: { kind: 'free' }, choices: {} }, ctx))).toEqual(['done:source', 'now:trump', 'todo:confirm']);
    expect(trail({ at: 'trumps', path: { kind: 'free' }, choices: {} }, ctx)[0]!.label).toEqual({ key: 'trumpDialog.free' });
  });

  it('Bestätigen (5zw): Folgen je Weg aus demselben Plan wie der Befehl, am aktuellen Bogen', () => {
    const keys = (r: ReturnType<typeof consequences>) => ('lines' in r ? r.lines.map((l) => l.key.replace('trumpDialog.after.', '')) : r);
    const path = (id: string, improveOnly = false) => ({ kind: 'source' as const, source: source(id), improveOnly });
    // Starttrumpf: nur das Feld
    expect(consequences(content, ctxWith((b) => (b.attributes = { K: 2, V: 1, P: 1 })), path('start'), {}, 'standhaft')).toEqual({ lines: [{ key: 'trumpDialog.after.slot', params: { n: 1 } }] });
    // Schwäche: Text der Schwäche, Kästchen einmal, zweites Feld
    const weak = ctxWith((b) => { b.trumps[0] = 'anatomie'; b.weaknessMarks = [true, true, true]; b.weaknesses = ['Kälte', 'Höhenangst']; });
    const w = consequences(content, weak, path('weakness'), { removeWeakness: 1 }, 'standhaft');
    expect(keys(w)).toEqual(['weakness', 'weaknessMarks', 'slot']);
    expect('lines' in w && w.lines[0]!.params).toEqual({ text: 'Höhenangst' });
    expect('lines' in w && w.lines[2]!.params).toEqual({ n: 2 });
    // derselbe Befehl an einem inzwischen überschriebenen Bogen: die Zeile zeigt den neuen Text
    const overwritten = ctxWith((b) => { b.trumps[0] = 'anatomie'; b.weaknessMarks = [true, true, true]; b.weaknesses = ['Kälte', 'Platzangst']; });
    const w2 = consequences(content, overwritten, path('weakness'), { removeWeakness: 1 }, 'standhaft');
    expect('lines' in w2 && w2.lines[0]!.params).toEqual({ text: 'Platzangst' });
    // ... und an einem geleerten: nicht mehr gültig
    const emptied = ctxWith((b) => { b.trumps[0] = 'anatomie'; b.weaknessMarks = [true, true, true]; b.weaknesses = ['Kälte', '']; });
    expect(consequences(content, emptied, path('weakness'), { removeWeakness: 1 }, 'standhaft')).toEqual({ why: { key: 'reject.invalidChoice' } });
    // Erlebnis: neue Formulierung, unveränderte, leere Stärke; Laterne einmal
    const exp = ctxWith((b) => { b.trumps[0] = 'anatomie'; b.lamps = [true, true, true]; b.strengths[1]!.text = 'Peitsche'; });
    const e1 = consequences(content, exp, path('experience'), { improveStrength: { index: 1, text: 'gute Peitsche' } }, 'stoiker');
    expect(keys(e1)).toEqual(['strengthText', 'lamps', 'slot']);
    expect('lines' in e1 && e1.lines[0]!.params).toEqual({ n: 'II', text: 'gute Peitsche' });
    expect(keys(consequences(content, exp, path('experience'), { improveStrength: { index: 1, text: 'Peitsche' } }, 'stoiker'))).toEqual(['strength', 'lamps', 'slot']);
    expect(keys(consequences(content, exp, path('experience'), { improveStrength: { index: 0, text: '' } }, 'stoiker'))).toEqual(['strengthEmpty', 'lamps', 'slot']);
    expect(keys(consequences(content, exp, path('experience'), {}, 'stoiker'))).toEqual(['lamps', 'slot']);
    // Laterne inzwischen geleert: der Grund des Wegs
    expect(consequences(content, ctxWith((b) => (b.trumps[0] = 'anatomie')), path('experience'), {}, 'stoiker')).toEqual({ why: { key: 'source.experience.why' } });
    // voller Bogen: nur verbessern, kein Feld
    const full = ctxWith((b) => { b.trumps = ['anatomie', 'stoiker', 'huh', 'prognose']; b.lamps = [true, true, true]; });
    expect(keys(consequences(content, full, path('experience', true), { improveStrength: { index: 0, text: 'Seil' } }, undefined))).toEqual(['strengthText', 'lamps']);
    // Narbe: beide Attribute mit altem und neuem Wert, Narbe verbraucht
    const scar = ctxWith((b) => { b.trumps[0] = 'anatomie'; b.newScars = 1; b.attributes = { K: 7, V: 4, P: 5 }; });
    const trump = content.trumps.find((t) => t.attributes.includes('P') && t.id !== 'anatomie')!.id;
    const s1 = consequences(content, scar, path('scar'), { moveAttribute: { lowered: 'K', raised: 'P' } }, trump);
    expect(keys(s1)).toEqual(['attribute', 'attribute', 'newScars', 'slot']);
    expect('lines' in s1 && s1.lines.slice(0, 2).map((l) => l.params)).toEqual([{ attr: 'Körper', from: 7, to: 6 }, { attr: 'Präsenz', from: 5, to: 6 }]);
    // freie Wahl: nur das Feld; doppelt und voll werden abgelehnt wie beim Host
    expect(keys(consequences(content, scar, { kind: 'free' }, {}, 'stoiker'))).toEqual(['slot']);
    expect(consequences(content, scar, { kind: 'free' }, {}, 'anatomie')).toEqual({ why: { key: 'trumpDialog.why.duplicate' } });
    expect(consequences(content, full, { kind: 'free' }, {}, 'kraftakt')).toEqual({ why: { key: 'toast.maxTrumps', params: { max: 4 } } });
    // jede Zeile hat einen Text; keine Änderung fällt in die Auffangzeile
    for (const r of [w, e1, s1]) for (const l of 'lines' in r ? r.lines : []) {
      expect(l.key).not.toBe('trumpDialog.after.other');
      expect(resolveText(content, l.key), l.key).toBeTypeOf('string');
    }
  });

  it('Schritt entfällt, wenn es nichts zu wählen gibt: Schwäche streichen bei zwei leeren (A29)', () => {
    const marks = (w: [string, string]) => ctxWith((b) => { b.trumps[0] = 'anatomie'; b.weaknessMarks = [true, true, true]; b.weaknesses = w; });
    const path = { kind: 'source' as const, source: source('weakness'), improveOnly: false };
    expect(nextStep(path, {}, 0, marks(['Kälte', '']))).toMatchObject({ at: 'step', name: 'chooseWeaknessToRemove', required: true });
    expect(nextStep(path, {}, 0, marks(['', '']))).toMatchObject({ at: 'trumps' });
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

  it('Reiter (5zx) zählen wählbare Trümpfe je Kategorie; gesperrte haben einen Grund', () => {
    const ctx = ctxWith((b) => (b.attributes = { K: 2, V: 1, P: 1 }));
    const start = { kind: 'source' as const, source: source('start'), improveOnly: false };
    const rows = trumpRows(content, ctx, start, {});
    expect(selectableByCategory(rows)).toMatchObject({ K: 4, V: 0 });
    expect(rows.find((r) => r.trump.id === 'stoiker')!.why).toEqual({ key: 'source.start.levelWhy' });
    const inGroup = (c: string) => content.trumps.filter((t) => t.category === c).length;
    expect(selectableByCategory(trumpRows(content, ctx, { kind: 'free' }, {})).V).toBe(inGroup('V'));
    // Reiter (5zx): „alle wählbaren“ ohne gesperrte; eine Gruppe mit den wählbaren zuerst und den gesperrten samt Grund
    const all = tabRows(rows, 'all');
    expect(all.ok.length).toBe(Object.values(selectableByCategory(rows)).reduce((a, b) => a + b));
    expect(all.off).toEqual([]);
    const k = tabRows(rows, 'K');
    expect([k.ok.length, k.off.length]).toEqual([4, inGroup('K') - 4]);
    expect(k.ok.every((r) => r.trump.category === 'K' && !r.why) && k.off.every((r) => r.trump.category === 'K' && r.why)).toBe(true);
    expect(tabRows(rows, 'V')).toMatchObject({ ok: [] });
  });

  it('Attribut-Knöpfe aus den gültigen Möglichkeiten: 0 nicht verringern, nicht auf dasselbe erhöhen', () => {
    const ctx = ctxWith((b) => (b.attributes = { K: 2, V: 0, P: 1 }));
    expect(attributeOptions(ctx, undefined).map((o) => [o.attr, o.canLower, o.canRaise])).toEqual([['K', true, false], ['V', false, false], ['P', true, false]]);
    expect(attributeOptions(ctx, 'K').map((o) => o.canRaise)).toEqual([false, true, true]);
  });
});
