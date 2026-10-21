// Texte zu Kommen und Gehen (11.7): Protokoll und Meldung, mit und ohne Namen.

import { describe, expect, it } from 'vitest';
import { SEATS, type TableState } from '../../src/engine/types';
import { describe as describeEvent, describeArrival, noticeArrival } from '../../src/ui/eventText';

type Seats = TableState<unknown>['seats'];
const seats = Object.fromEntries(SEATS.map((s) => [s, { occupied: true }])) as Seats;
seats.seat2 = { occupied: true, name: 'Ida' };

describe('Protokoll', () => {
  it('mit Namen der Person, sonst der Platz; „neu“ steht schon mit dem Belegen da', () => {
    expect(describeArrival({ type: 'seated', seat: 'seat2' }, seats)).toBe('Ida sitzt an Platz 2.');
    expect(describeArrival({ type: 'seated', seat: 'seat3' }, seats)).toBe('Platz 3 ist besetzt.');
    expect(describeArrival({ type: 'left', seat: 'seat2' }, seats)).toBe('Ida ist nicht mehr verbunden.');
    expect(describeArrival({ type: 'left', seat: 'seat3' }, seats)).toBe('Platz 3 ist nicht mehr verbunden.');
    expect(describeArrival({ type: 'arrived', seat: 'seat2', how: 'back', peer: 'p', self: false }, seats)).toBe('Ida ist wieder da.');
    expect(describeArrival({ type: 'arrived', seat: 'seat3', how: 'back', peer: 'p', self: false }, seats)).toBe('Platz 3 ist wieder verbunden.');
    expect(describeArrival({ type: 'arrived', seat: 'seat2', how: 'new', peer: 'p', self: false }, seats)).toBeNull();
    expect(describeArrival({ type: 'freed', seat: 'seat2' }, seats)).toBe('Platz 2 ist frei.');
  });
});

describe('Meldung', () => {
  it('bei neu, weg und wieder da; nicht beim Belegen allein, nicht beim Freigeben, nicht bei der Person selbst', () => {
    expect(noticeArrival({ type: 'arrived', seat: 'seat2', how: 'new', peer: 'p', self: false }, seats)).toBe('Ida sitzt an Platz 2.');
    expect(noticeArrival({ type: 'arrived', seat: 'seat2', how: 'new', peer: null, self: true }, seats)).toBeNull();
    expect(noticeArrival({ type: 'left', seat: 'seat2' }, seats)).toBe('Ida ist nicht mehr verbunden.');
    expect(noticeArrival({ type: 'arrived', seat: 'seat2', how: 'back', peer: 'p', self: false }, seats)).toBe('Ida ist wieder da.');
    expect(noticeArrival({ type: 'seated', seat: 'seat2' }, seats)).toBeNull();
    expect(noticeArrival({ type: 'freed', seat: 'seat2' }, seats)).toBeNull();
  });
});

describe('Laterne im Protokoll (5n)', () => {
  it('nennt, wer es war: Spielleitung, Name am Platz, sonst Spieler n', () => {
    expect(describeEvent({ type: 'lampChanged', lit: true, by: 'gm' }, seats)).toEqual({ text: 'Die Spielleitung hat die Laterne angezündet.', level: 'log' });
    expect(describeEvent({ type: 'lampChanged', lit: false, by: 'seat2' }, seats)?.text).toBe('Ida hat die Laterne gelöscht.');
    expect(describeEvent({ type: 'lampChanged', lit: false, by: 'seat3' }, seats)?.text).toBe('Spieler 3 hat die Laterne gelöscht.');
    expect(describeEvent({ type: 'lampChanged', lit: true, by: 'spectator' })?.text).toBe('Ein Zuschauer hat die Laterne angezündet.');
  });
});
