import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import { fieldKind } from '../../src/rules/klio/fields';
import { rollAttributes } from '../../src/rules/klio/generators/rollSheet';
import { sheetFieldInstances } from '../../src/rules/klio/content/schema';
import { emptySheet } from '../../src/rules/klio/state';
import { content, expectRejected, fresh, place, player, run, sheet, SPECTATOR, GM, withSheet, type K } from '../helpers';

describe('Felder', () => {
  it('jedes Feld aus sheet.yaml ist erreichbar und hat die richtige Art', () => {
    for (const [name, f] of Object.entries(content.sheet.fields)) {
      if (!['text', 'number', 'check'].includes(f.kind)) continue;
      for (const inst of sheetFieldInstances({ ...content.sheet, fields: { [name]: f } })) expect(fieldKind(inst), inst).toBe(f.kind);
    }
  });
});

describe('Bogen bearbeiten', () => {
  const s = fresh();

  it('Text, Zahl, Kästchen', () => {
    let t = run(s, { type: 'sheet.setText', seat: 'seat2', field: 'strengths.text.3', value: 'Seil' }).state;
    t = run(t, { type: 'sheet.setNumber', seat: 'seat2', field: 'attributes.V', value: 3 }).state;
    t = run(t, { type: 'sheet.toggle', seat: 'seat2', field: 'lamps.1' }).state;
    t = run(t, { type: 'sheet.toggle', seat: 'seat2', field: 'gear.struck.6' }).state;
    const b = sheet(t, 'seat2');
    expect(b.strengths[3]!.text).toBe('Seil');
    expect(b.attributes.V).toBe(3);
    expect(b.lamps).toEqual([false, true, false]);
    expect(b.gear[6]!.struck).toBe(true);
  });

  it('falsche Felder und Werte werden abgelehnt', () => {
    expectRejected(s, { type: 'sheet.setText', seat: 'seat1', field: 'lamps.0', value: 'x' }, 'reject.unknownField');
    expectRejected(s, { type: 'sheet.setText', seat: 'seat1', field: 'strengths.text.5', value: 'x' }, 'reject.unknownField');
    expectRejected(s, { type: 'sheet.toggle', seat: 'seat1', field: 'name' }, 'reject.unknownField');
    expectRejected(s, { type: 'sheet.setNumber', seat: 'seat1', field: 'attributes.K', value: 10 }, 'reject.invalid');
    expectRejected(s, { type: 'sheet.setNumber', seat: 'seat1', field: 'attributes.K', value: 1.5 }, 'reject.invalid');
  });

  it('Narbe von Hand: zählt als neue Narbe, abhaken zieht ab, nicht unter 0 (A4)', () => {
    let t = run(s, { type: 'sheet.toggle', seat: 'seat1', field: 'scars.spade' }).state;
    expect(sheet(t, 'seat1').newScars).toBe(1);
    t = withSheet(t, 'seat1', (b) => (b.newScars = 0));
    t = run(t, { type: 'sheet.toggle', seat: 'seat1', field: 'scars.spade' }).state;
    expect(sheet(t, 'seat1').scars.spade).toBe(false);
    expect(sheet(t, 'seat1').newScars).toBe(0);
  });

  it('ausgeblendeter Bogen ist nicht bearbeitbar', () => {
    const two = run(s, { type: 'table.setPlayers', players: 2 }).state;
    expectRejected(two, { type: 'sheet.setText', seat: 'seat3', field: 'name', value: 'x' }, 'reject.hiddenSeat');
  });
});

describe('Auswürfeln', () => {
  it('Attribute: Summe 4, gleichverteilt über alle 15 Aufteilungen', () => {
    const rng = seededRng(5);
    const counts = new Map<string, number>();
    const N = 30000;
    for (let i = 0; i < N; i++) {
      const a = rollAttributes(4, rng);
      expect(a.K + a.V + a.P).toBe(4);
      const k = `${a.K}${a.V}${a.P}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(15);
    for (const n of counts.values()) expect(Math.abs(n / N - 1 / 15)).toBeLessThan(0.01);
  });

  it('füllt Variante, Name, Stärken, Schwächen, Attribute, Erlebnisse; der Rest bleibt (A30)', () => {
    let s = fresh();
    s = withSheet(s, 'seat1', (b) => {
      b.gear[0]!.text = 'Seil';
      b.lamps[0] = true;
      b.strengths[2]!.improved = true;
      b.trumps[0] = 'anatomie';
      b.scars.heart = true;
    });
    const before = sheet(s, 'seat1');
    for (let seed = 1; seed <= 40; seed++) {
      const b = sheet(run(s, { type: 'sheet.roll', seat: 'seat1' }, undefined, seededRng(seed)).state, 'seat1');
      expect(b.name).toMatch(/^\S+ \S+/);
      expect(b.strengths.every((x) => x.text !== '')).toBe(true);
      expect(new Set(b.weaknesses).size).toBe(2);
      expect(new Set(b.experiences).size).toBe(3);
      expect((b.attributes.K ?? 0) + (b.attributes.V ?? 0) + (b.attributes.P ?? 0)).toBe(4);
      expect(b.gear).toEqual(before.gear);
      expect(b.lamps).toEqual(before.lamps);
      expect(b.strengths.map((x) => x.improved)).toEqual(before.strengths.map((x) => x.improved));
      expect(b.trumps).toEqual(before.trumps);
      expect(b.scars).toEqual(before.scars);
      // er/sie-Form passend zur Variante (Tabelle I hat beide Formen)
      const forms = [...Object.values(content.tables.I!.H), ...Object.values(content.tables.I!.S)];
      const expected = forms.map((f) => (typeof f === 'string' ? f : f[b.variant]));
      expect(expected).toContain(b.strengths[0]!.text);
      // Vorname passend zur Variante
      expect(content.names.first[b.variant]).toContain(b.name.split(' ')[0]);
    }
  });
});

describe('Ganzer Bogen (5j)', () => {
  const photo = { hash: 'a'.repeat(64), type: 'image/jpeg' as const };
  /** Bogen mit Einträgen überall, Person mit Name und Farbe, Karte auf dem Schadensfeld */
  function filled(): K {
    let t = run(fresh(), { type: 'sheet.roll', seat: 'seat2' }).state;
    t = run(t, { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Anna' }).state;
    t = run(t, { type: 'seat.edit', seat: 'seat2', color: 'teal' }).state;
    t = place(t, 'seat2.notes', ['H5'], true);
    return withSheet(t, 'seat2', (b) => {
      b.variant = 'w';
      b.photo = photo;
      b.trumps[0] = 'schnelle-reflexe';
      b.scars.heart = true;
      b.newScars = 1;
      b.lamps[2] = true;
      b.weaknessMarks[0] = true;
      b.gear[1] = { text: 'Seil', struck: true };
      b.strengths[0]!.improved = true;
      b.dead = true;
    });
  }

  it('Zurücksetzen leert den ganzen Bogen; Person, Farbe, Karten und andere Bögen bleiben', () => {
    const before = filled();
    const t = run(before, { type: 'sheet.reset', seat: 'seat2' }).state;
    expect(sheet(t, 'seat2')).toEqual(emptySheet());
    expect(t.seats.seat2).toEqual(before.seats.seat2);
    expect(t.zones['seat2.notes']).toEqual(['H5']);
    expect(sheet(t, 'seat1')).toEqual(sheet(before, 'seat1'));
  });

  it('Import ersetzt den ganzen Bogen, auch mit Foto, Trumpf und Tod', () => {
    const source = sheet(filled(), 'seat2');
    const t = run(fresh(), { type: 'sheet.import', seat: 'seat3', sheet: source }).state;
    expect(sheet(t, 'seat3')).toEqual(source);
    expect(sheet(t, 'seat1')).toEqual(emptySheet());
  });

  it('Import: unbekannter Trumpf, ungültiger Bogen, zu langer Text werden abgelehnt', () => {
    const s = fresh();
    expectRejected(s, { type: 'sheet.import', seat: 'seat1', sheet: { ...emptySheet(), trumps: ['gibt-es-nicht', null, null, null] } }, 'reject.unknownTrump');
    expectRejected(s, { type: 'sheet.import', seat: 'seat1', sheet: { ...emptySheet(), lamps: [true] } }, 'reject.invalid');
    expectRejected(s, { type: 'sheet.import', seat: 'seat1', sheet: { ...emptySheet(), extra: 1 } }, 'reject.invalid');
    expectRejected(s, { type: 'sheet.import', seat: 'seat1', sheet: { ...emptySheet(), name: 'x'.repeat(201) } }, 'reject.invalid');
  });

  it('Rechte: Spieler nur am eigenen Bogen, Zuschauer nie, SL überall', () => {
    const s = filled();
    run(s, { type: 'sheet.reset', seat: 'seat1' }, player('seat1'));
    run(s, { type: 'sheet.import', seat: 'seat1', sheet: emptySheet() }, player('seat1'));
    expectRejected(s, { type: 'sheet.reset', seat: 'seat2' }, 'reject.notAllowed', player('seat1'));
    expectRejected(s, { type: 'sheet.import', seat: 'seat2', sheet: emptySheet() }, 'reject.notAllowed', player('seat1'));
    expectRejected(s, { type: 'sheet.reset', seat: 'seat2' }, 'reject.notAllowed', SPECTATOR);
    run(s, { type: 'sheet.reset', seat: 'seat4' }, GM);
  });

  it('ausgeblendeter Bogen lässt sich weder leeren noch ersetzen', () => {
    const two = run(fresh(), { type: 'table.setPlayers', players: 2 }).state;
    expectRejected(two, { type: 'sheet.reset', seat: 'seat3' }, 'reject.hiddenSeat');
    expectRejected(two, { type: 'sheet.import', seat: 'seat3', sheet: emptySheet() }, 'reject.hiddenSeat');
  });
});
