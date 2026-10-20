import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import type { Trump } from '../../src/rules/klio/blocks';
import { planRandom } from '../../src/rules/klio/trumps';
import { content, expectRejected, fresh, run, sheet, withSheet, type K } from '../helpers';

const T = (id: string) => {
  const t = content.trumps.find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
};
const choose = (extra: object) => ({ type: 'trump.choose', seat: 'seat1', ...extra });

/** Bogen mit Attributen K/V/P und Trümpfen vorbereiten. */
function prepared(attrs: [number, number, number], trumps: (string | null)[] = [null, null, null, null], patch?: Parameters<typeof withSheet>[2]): K {
  return withSheet(fresh(), 'seat1', (b) => {
    b.attributes = { K: attrs[0], V: attrs[1], P: attrs[2] };
    b.trumps = trumps;
    patch?.(b);
  });
}

describe('Starttrumpf', () => {
  const s = prepared([2, 1, 1]);

  it('Stufe I, passend zum höchsten Attribut', () => {
    const { state, events } = run(s, choose({ source: 'start', trump: 'schnelle-reflexe' }));
    expect(sheet(state, 'seat1').trumps[0]).toBe('schnelle-reflexe');
    expect(events.at(-1)).toMatchObject({ type: 'trumpChosen', source: 'start', slot: 0 });
  });

  it('falsche Stufe, falsches Attribut, schon ein Trumpf → abgelehnt mit Grund', () => {
    expectRejected(s, choose({ source: 'start', trump: 'stoiker' }), 'source.start.levelWhy');
    expectRejected(s, choose({ source: 'start', trump: 'anatomie' }), 'trumpDialog.why.highest');
    const one = run(s, choose({ source: 'start', trump: 'schnelle-reflexe' })).state;
    expectRejected(one, choose({ source: 'start', trump: 'hinter-mich' }), 'source.start.why');
  });

  it('Mischtrumpf zählt, wenn eines seiner Attribute das höchste ist', () => {
    expect(T('ritualmesser').attributes).toEqual(['K', 'P']);
    run(s, choose({ source: 'start', trump: 'ritualmesser' }));
  });
});

describe('Schwäche überwunden', () => {
  const s = prepared([2, 1, 1], ['schnelle-reflexe', null, null, null], (b) => {
    b.weaknessMarks = [true, true, true];
    b.weaknesses = ['Höhenangst', 'Kälte'];
  });

  it('streicht die gewählte Schwäche, Trumpf Stufe I, Kästchen werden geleert (A1)', () => {
    const b = sheet(run(s, choose({ source: 'weakness', trump: 'anatomie', removeWeakness: 1 })).state, 'seat1');
    expect(b.weaknesses).toEqual(['Höhenangst', '']);
    expect(b.weaknessMarks).toEqual([false, false, false]);
    expect(b.trumps[1]).toBe('anatomie');
  });

  it('Schwäche muss gewählt werden; leere ist nicht wählbar (A29)', () => {
    expectRejected(s, choose({ source: 'weakness', trump: 'anatomie' }), 'reject.missingChoice');
    const one = withSheet(s, 'seat1', (b) => (b.weaknesses = ['', 'Kälte']));
    expectRejected(one, choose({ source: 'weakness', trump: 'anatomie', removeWeakness: 0 }), 'reject.invalidChoice');
  });

  it('beide Schwächen leer: Weg nutzbar, ohne Streich-Schritt (A29)', () => {
    const none = withSheet(s, 'seat1', (b) => (b.weaknesses = ['', '']));
    run(none, choose({ source: 'weakness', trump: 'anatomie' }));
    expectRejected(none, choose({ source: 'weakness', trump: 'anatomie', removeWeakness: 0 }), 'reject.invalidChoice');
  });

  it('nicht alle Kästchen markiert → gesperrt', () => {
    const not = withSheet(s, 'seat1', (b) => (b.weaknessMarks = [true, true, false]));
    expectRejected(not, choose({ source: 'weakness', trump: 'anatomie', removeWeakness: 0 }), 'source.weakness.why');
  });
});

describe('Erlebnis eingetroffen', () => {
  const s = prepared([2, 1, 1], ['schnelle-reflexe', null, null, null], (b) => {
    b.lamps = [true, true, true];
    b.strengths[2]!.text = 'Peitsche';
  });

  it('Stärke verbessern mit neuer Formulierung, Trumpf Stufe I oder II, Lampen werden geleert', () => {
    const b = sheet(run(s, choose({ source: 'experience', trump: 'stoiker', improveStrength: { index: 2, text: 'gute Peitsche' } })).state, 'seat1');
    expect(b.strengths[2]).toEqual({ text: 'gute Peitsche', improved: true });
    expect(b.lamps).toEqual([false, false, false]);
    expect(b.trumps).toContain('stoiker');
    expectRejected(s, choose({ source: 'experience', trump: 'wahrer-held' }), 'source.experience.levelWhy');
  });

  it('leere Formulierung lässt den Text stehen', () => {
    const b = sheet(run(s, choose({ source: 'experience', trump: 'stoiker', improveStrength: { index: 2, text: '  ' } })).state, 'seat1');
    expect(b.strengths[2]).toEqual({ text: 'Peitsche', improved: true });
  });

  it('unter 4 Trümpfen: Verbessern freiwillig, auch wenn alle Stärken verbessert sind (A35)', () => {
    run(s, choose({ source: 'experience', trump: 'stoiker' }));
    const all = withSheet(s, 'seat1', (b) => b.strengths.forEach((x) => (x.improved = true)));
    run(all, choose({ source: 'experience', trump: 'stoiker' }));
    expectRejected(all, choose({ source: 'experience', trump: 'stoiker', improveStrength: { index: 0, text: '' } }), 'reject.invalidChoice');
  });

  describe('bei 4 Trümpfen (15.5)', () => {
    const full = withSheet(s, 'seat1', (b) => (b.trumps = ['schnelle-reflexe', 'hinter-mich', 'standhaft', 'risikobewusst']));

    it('nur verbessern, kein Trumpf; Verbessern ist Pflicht', () => {
      const { state, events } = run(full, choose({ source: 'experience', improveStrength: { index: 2, text: '' } }));
      expect(sheet(state, 'seat1').strengths[2]!.improved).toBe(true);
      expect(sheet(state, 'seat1').lamps).toEqual([false, false, false]);
      expect(events.at(-1)).toMatchObject({ type: 'trumpChosen', trump: null, slot: null });
      expectRejected(full, choose({ source: 'experience' }), 'reject.improveRequired');
      expectRejected(full, choose({ source: 'experience', trump: 'stoiker', improveStrength: { index: 2, text: '' } }), 'toast.maxTrumps');
    });

    it('alle Stärken verbessert → Weg gesperrt; andere Wege gesperrt', () => {
      const done = withSheet(full, 'seat1', (b) => b.strengths.forEach((x) => (x.improved = true)));
      expectRejected(done, choose({ source: 'experience', improveStrength: { index: 0, text: '' } }), 'toast.maxTrumps');
      const marks = withSheet(full, 'seat1', (b) => (b.weaknessMarks = [true, true, true]));
      expectRejected(marks, choose({ source: 'weakness', trump: 'anatomie' }), 'toast.maxTrumps');
    });
  });
});

describe('Neue Narbe', () => {
  const s = prepared([2, 1, 1], ['schnelle-reflexe', null, null, null], (b) => (b.newScars = 1));

  it('Punkt umverteilen, Trumpf braucht das erhöhte Attribut, Stufe I bis III, Zähler −1', () => {
    const b = sheet(run(s, choose({ source: 'scar', trump: 'eine-frage-der-logik', moveAttribute: { lowered: 'K', raised: 'V' } })).state, 'seat1');
    expect(b.attributes).toEqual({ K: 1, V: 2, P: 1 });
    expect(b.newScars).toBe(0);
    expect(b.trumps[1]).toBe('eine-frage-der-logik');
    expectRejected(s, choose({ source: 'scar', trump: 'luegendetektor', moveAttribute: { lowered: 'K', raised: 'V' } }), 'trumpDialog.why.needs');
  });

  it('Attribut 0 kann nicht verringert werden; ohne neue Narbe gesperrt', () => {
    const z = withSheet(s, 'seat1', (b) => (b.attributes = { K: 4, V: 0, P: 0 }));
    expectRejected(z, choose({ source: 'scar', trump: 'kuehler-kopf', moveAttribute: { lowered: 'V', raised: 'K' } }), 'reject.invalidChoice');
    const no = withSheet(s, 'seat1', (b) => (b.newScars = 0));
    expectRejected(no, choose({ source: 'scar', trump: 'anatomie', moveAttribute: { lowered: 'K', raised: 'V' } }), 'source.scar.why');
  });
});

describe('Allgemein', () => {
  const s = prepared([2, 1, 1], ['schnelle-reflexe', null, null, null], (b) => (b.lamps = [true, true, true]));

  it('kein Trumpf doppelt', () => {
    expectRejected(s, choose({ source: 'experience', trump: 'schnelle-reflexe' }), 'trumpDialog.why.duplicate');
  });

  it('veraltete Wahl (Lampen inzwischen leer) wird abgelehnt und ändert nichts', () => {
    const cleared = run(s, { type: 'sheet.toggle', seat: 'seat1', field: 'lamps.0' }).state;
    expectRejected(cleared, choose({ source: 'experience', trump: 'stoiker' }), 'source.experience.why');
  });

  it('Entscheidungen, die der Weg nicht kennt, werden abgelehnt', () => {
    expectRejected(s, choose({ source: 'experience', trump: 'stoiker', moveAttribute: { lowered: 'K', raised: 'V' } }), 'reject.invalidChoice');
  });

  it('Trumpf entfernen leert den Platz', () => {
    const b = sheet(run(s, { type: 'trump.remove', seat: 'seat1', slot: 0 }).state, 'seat1');
    expect(b.trumps[0]).toBeNull();
    expectRejected(s, { type: 'trump.remove', seat: 'seat1', slot: 3 }, 'reject.slotEmpty');
  });

  it('nächster Trumpf kommt in den ersten freien Platz', () => {
    const gap = withSheet(s, 'seat1', (b) => (b.trumps = [null, 'schnelle-reflexe', null, null]));
    expect(sheet(run(gap, choose({ source: 'experience', trump: 'stoiker' })).state, 'seat1').trumps).toEqual(['stoiker', 'schnelle-reflexe', null, null]);
  });
});

describe('Freie Wahl', () => {
  it('jeder Trumpf, nur nicht doppelt und höchstens 4', () => {
    const s = prepared([0, 0, 0], ['schnelle-reflexe', null, null, null]);
    run(s, { type: 'trump.chooseFree', seat: 'seat1', trump: 'historischer-positivismus' });
    expectRejected(s, { type: 'trump.chooseFree', seat: 'seat1', trump: 'schnelle-reflexe' }, 'trumpDialog.why.duplicate');
    const full = withSheet(s, 'seat1', (b) => (b.trumps = ['schnelle-reflexe', 'hinter-mich', 'standhaft', 'risikobewusst']));
    expectRejected(full, { type: 'trump.chooseFree', seat: 'seat1', trump: 'stoiker' }, 'toast.maxTrumps');
  });
});

describe('Zufälliger Trumpf', () => {
  it('ohne erfüllte Voraussetzung: Meldung wie bisher', () => {
    const s = prepared([2, 1, 1], ['schnelle-reflexe', null, null, null]);
    expectRejected(s, { type: 'trump.random', seat: 'seat1' }, 'toast.noSource');
  });

  it('wählt den ersten nutzbaren Weg und einen passenden Trumpf', () => {
    const s = prepared([0, 3, 1]);
    for (let seed = 1; seed <= 30; seed++) {
      const b = sheet(run(s, { type: 'trump.random', seat: 'seat1' }, undefined, seededRng(seed)).state, 'seat1');
      const t = T(b.trumps[0]!);
      expect(t.level).toBe(1);
      expect(t.attributes).toContain('V');
    }
  });

  it('Neue Narbe: nur Attribut-Kombinationen, für die noch ein Trumpf übrig ist (A28)', () => {
    // Mit den echten 44 Trümpfen kann das bei 4 Plätzen nicht eintreten; daher mit verkürzter Liste:
    // Es gibt nur noch einen Verstehen-Trumpf, also muss V erhöht werden.
    const s = prepared([1, 0, 1], ['schnelle-reflexe', null, null, null], (b) => (b.newScars = 1));
    const only = [T('anatomie')] as Trump[];
    const ctx = { sheet: sheet(s, 'seat1'), attrNames: { K: 'Körper', V: 'Verstehen', P: 'Präsenz' } };
    for (let seed = 1; seed <= 50; seed++) {
      const r = planRandom(content.trumpSources, only, ctx, seededRng(seed));
      expect(r).toMatchObject({ source: { id: 'scar' }, trump: 'anatomie', choices: { moveAttribute: { raised: 'V' } } });
    }
    expect(planRandom(content.trumpSources, [], ctx, seededRng(1))).toEqual({ why: { key: 'toast.noTrumpLeft' } });
  });

  it('Neue Narbe ohne verringerbares Attribut: Meldung wie bisher', () => {
    const s = prepared([0, 0, 0], ['schnelle-reflexe', null, null, null], (b) => (b.newScars = 1));
    expectRejected(s, { type: 'trump.random', seat: 'seat1' }, 'toast.noAttributeToLower');
  });

  it('bei 4 Trümpfen über Erlebnis: verbessert eine zufällige Stärke, kein Trumpf', () => {
    const s = prepared([2, 1, 1], ['schnelle-reflexe', 'hinter-mich', 'standhaft', 'risikobewusst'], (b) => {
      b.lamps = [true, true, true];
      b.strengths.forEach((x, i) => (x.improved = i !== 3));
    });
    const b = sheet(run(s, { type: 'trump.random', seat: 'seat1' }).state, 'seat1');
    expect(b.strengths[3]!.improved).toBe(true);
    expect(b.lamps).toEqual([false, false, false]);
  });
});
