// Kartenwert am Expeditionsblatt (5zf, ARCHITEKTUR.md 10.13): Eintrag → Wert, Eckzeichen mit und ohne Farbe, Protokolltext.

import { describe, expect, it } from 'vitest';
import { expeditionCards, expeditionIndex, expeditionText } from '../../src/ui/expedition';
import { content } from '../helpers';

const tables = content.expedition.expedition;

describe('Kartenwert am Expeditionsblatt (5zf)', () => {
  it('Eintrag i gehört zum Wert i + 2 (Regelwerk 2.1, S. 16 f.)', () => {
    const cards = expeditionCards([0, 9, 12, 8]);
    expect(cards.map((c) => c.rank)).toEqual(['2', 'J', 'A', '10']);
    expect(cards.map((c) => c.entry)).toEqual([tables[0]!.entries[0], tables[1]!.entries[9], tables[2]!.entries[12], tables[3]!.entries[8]]);
    expect(cards.map((c) => expeditionIndex(c).rank)).toEqual(['2', 'B', 'A', '10']);
    expect(expeditionCards(null)).toEqual([]);
  });

  it('ohne Farbe nur der Wert, mit Farbe darunter das Symbol (für später, Testdaten)', () => {
    expect(expeditionIndex({ entry: 'x', rank: 'Q' })).toEqual({ rank: 'D' });
    expect(expeditionIndex({ entry: 'x', rank: 'Q', suit: 'H' })).toEqual({ rank: 'D', suit: { symbol: '♥', red: true } });
    expect(expeditionIndex({ entry: 'x', rank: '7', suit: 'C' })).toEqual({ rank: '7', suit: { symbol: '♣', red: false } });
  });

  it('Protokolltext: Antwort und Wert, mit Farbe der Name der Karte', () => {
    expect(expeditionText(expeditionCards([0, 11]))).toBe(`${tables[0]!.entries[0]} (2) · ${tables[1]!.entries[11]} (K)`);
    expect(expeditionText([{ entry: 'a', rank: 'Q', suit: 'S' }])).toBe('a (Pik D)');
  });
});
