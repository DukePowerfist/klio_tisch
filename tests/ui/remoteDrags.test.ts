// Was die anderen gerade tun (8.3, Schritt 5b): gezogene Karten mit Haltefrist, angewählte Stapel.

import { describe, expect, it } from 'vitest';
import type { CardId, FreePos } from '../../src/engine/types';
import type { PresenceInfo } from '../../src/net/presence';
import { HOLD_MS, RemoteDrags } from '../../src/ui/remoteDrags';

const at = (x: number): FreePos => ({ anchor: 'center', x, y: 0.5 });
const info = (p: Partial<PresenceInfo>): PresenceInfo => ({ who: 'seat1', name: '', at: at(0.1), drag: [], grab: null, dropped: false, open: null, ...p });

/** Lage der Karten im „Stand“: hier einfach eine veränderliche Zeichenkette */
function setup() {
  const where = { now: 'deck' };
  const r = new RemoteDrags(() => where.now);
  const others = new Map<string, PresenceInfo>();
  const send = (peer: string, p: PresenceInfo | null, now: number) => {
    if (p) others.set(peer, p);
    else others.delete(peer);
    r.update(others, now);
  };
  return { r, where, send };
}

describe('Gezogene Karten der anderen', () => {
  it('folgen dem Zeiger: Start bleibt, letzte Lage wandert mit', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'], at: at(0.1) }), 0);
    send('a', info({ drag: ['H2'], at: at(0.3) }), 50);
    expect(r.drags()).toEqual([{ cards: ['H2'], who: 'seat1', start: at(0.1), last: at(0.3) }]);
  });

  it('Start ist der Greifpunkt, auch wenn die erste Meldung erst nach etwas Bewegung kommt', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'], grab: at(0.1), at: at(0.25) }), 0);
    expect(r.drags()[0]).toMatchObject({ start: at(0.1), last: at(0.25) });
  });

  it('mehrere Karten (Umschalt) folgen gemeinsam', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2', 'H3', 'H4'] }), 0);
    expect(r.drags()[0]!.cards).toEqual(['H2', 'H3', 'H4']);
  });

  it('losgelassen ohne Befehl: sofort weg', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'] }), 0);
    send('a', info({ drag: [], dropped: false }), 50);
    expect(r.drags()).toEqual([]);
    expect(r.nextExpiry()).toBeNull();
  });

  it('abgelegt mit Befehl: bleibt an der Ablegestelle, bis sich der Stand ändert', () => {
    const { r, where, send } = setup();
    send('a', info({ drag: ['H2'], at: at(0.1) }), 0);
    send('a', info({ drag: ['H2'], at: at(0.4) }), 50);
    send('a', info({ drag: [], dropped: true, at: at(0.4) }), 100);
    expect(r.drags()).toEqual([{ cards: ['H2'], who: 'seat1', start: at(0.1), last: at(0.4) }]);
    // weitere Zeigerbewegung ändert die gehaltene Karte nicht
    send('a', info({ drag: [], dropped: true, at: at(0.9) }), 150);
    expect(r.drags()[0]!.last).toEqual(at(0.4));
    // ein Stand ohne Bewegung dieser Karte (z. B. jemand anderes zieht) lässt sie liegen
    r.stateChanged();
    expect(r.drags()).toHaveLength(1);
    where.now = 'discard';
    r.stateChanged();
    expect(r.drags()).toEqual([]);
  });

  it('abgelegt, aber kein Ereignis (abgelehnt): nach der Haltefrist zurück', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'] }), 0);
    send('a', info({ drag: [], dropped: true }), 100);
    expect(r.nextExpiry()).toBe(100 + HOLD_MS);
    expect(r.expire(100 + HOLD_MS - 1)).toBe(false);
    expect(r.drags()).toHaveLength(1);
    expect(r.expire(100 + HOLD_MS)).toBe(true);
    expect(r.drags()).toEqual([]);
  });

  it('wer während der Haltefrist geht, dessen Karte bleibt bis zum Ereignis bzw. zur Frist', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'] }), 0);
    send('a', info({ drag: [], dropped: true }), 100);
    send('a', null, 120);
    expect(r.drags()).toHaveLength(1);
    r.expire(100 + HOLD_MS);
    expect(r.drags()).toEqual([]);
  });

  it('wer beim Ziehen geht, dessen Karte ist sofort weg', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'] }), 0);
    send('a', null, 50);
    expect(r.drags()).toEqual([]);
  });

  it('greifen zwei dieselbe Karte, folgt sie dem, der zuerst gemeldet hat', () => {
    const { r, send } = setup();
    send('a', info({ who: 'seat1', drag: ['H2'] as CardId[] }), 0);
    send('b', info({ who: 'seat2', drag: ['H2'] as CardId[] }), 10);
    expect(r.drags()).toEqual([expect.objectContaining({ who: 'seat1', cards: ['H2'] })]);
    // auch wenn der Zweite weiter meldet
    send('b', info({ who: 'seat2', drag: ['H2'], at: at(0.5) }), 60);
    expect(r.drags()).toEqual([expect.objectContaining({ who: 'seat1' })]);
  });
});

describe('Angewählte Stapel der anderen', () => {
  it('Menü offen → Stapel markiert, auch ohne Zeiger über dem Tisch; geschlossen → weg', () => {
    const { r, send } = setup();
    send('a', info({ open: 'diamonds_hard' }), 0);
    expect(r.openZones()).toEqual(new Map([['diamonds_hard', 'seat1']]));
    send('a', info({ open: 'diamonds_hard', at: null }), 50);
    expect(r.openZones().get('diamonds_hard')).toBe('seat1');
    send('a', info({ open: null }), 100);
    expect(r.openZones().size).toBe(0);
  });

  it('wer geht, dessen Markierung verschwindet', () => {
    const { r, send } = setup();
    send('a', info({ open: 'deck' }), 0);
    send('a', null, 50);
    expect(r.openZones().size).toBe(0);
  });

  it('wählen mehrere denselben Stapel, gilt die zuletzt gemeldete Person', () => {
    const { r, send } = setup();
    send('a', info({ who: 'seat1', open: 'deck' }), 0);
    send('b', info({ who: 'gm', open: 'deck' }), 10);
    expect(r.openZones().get('deck')).toBe('gm');
    // a schickt nur eine neue Zeigerlage: zählt nicht als neues Anwählen
    send('a', info({ who: 'seat1', open: 'deck', at: at(0.7) }), 20);
    expect(r.openZones().get('deck')).toBe('gm');
    send('b', info({ who: 'gm', open: null }), 30);
    expect(r.openZones().get('deck')).toBe('seat1');
  });
});
