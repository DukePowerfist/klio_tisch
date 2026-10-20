// Was die anderen gerade tun (8.3, Schritt 5b): gezogene Karten mit Haltefrist, angewählte Stapel.

import { describe, expect, it } from 'vitest';
import type { CardId, FreePos } from '../../src/engine/types';
import type { PresenceInfo } from '../../src/net/presence';
import { HOLD_MS, RemoteDrags } from '../../src/ui/remoteDrags';

const at = (x: number): FreePos => ({ anchor: 'center', x, y: 0.5 });
const info = (p: Partial<PresenceInfo>): PresenceInfo => ({ who: 'seat1', name: '', at: at(0.1), drag: [], grab: null, dropped: null, open: null, ...p });

function setup() {
  const r = new RemoteDrags();
  const others = new Map<string, PresenceInfo>();
  const send = (peer: string, p: PresenceInfo | null, now: number) => {
    if (p) others.set(peer, p);
    else others.delete(peer);
    r.update(others, now);
  };
  return { r, send };
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
    send('a', info({ drag: [], dropped: null }), 50);
    expect(r.drags()).toEqual([]);
    expect(r.nextExpiry()).toBeNull();
  });

  it('abgelegt mit Befehl: bleibt an der Ablegestelle, bis das Ereignis zu diesem Befehl kommt', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'], at: at(0.1) }), 0);
    send('a', info({ drag: ['H2'], at: at(0.4) }), 50);
    send('a', info({ drag: [], dropped: 'ui-1', at: at(0.4) }), 100);
    expect(r.drags()).toEqual([{ cards: ['H2'], who: 'seat1', start: at(0.1), last: at(0.4) }]);
    // weitere Zeigerbewegung ändert die gehaltene Karte nicht
    send('a', info({ drag: [], dropped: 'ui-1', at: at(0.9) }), 150);
    expect(r.drags()[0]!.last).toEqual(at(0.4));
    // Ereignisse zu anderen Befehlen lassen sie liegen
    r.confirmed('ui-other');
    expect(r.drags()).toHaveLength(1);
    r.confirmed('ui-1');
    expect(r.drags()).toEqual([]);
    expect(r.nextExpiry()).toBeNull();
  });

  it('kam das Ereignis schon vor der Zeigermeldung, wird nicht gewartet', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'] }), 0);
    r.confirmed('ui-1');
    send('a', info({ drag: [], dropped: 'ui-1' }), 100);
    expect(r.drags()).toEqual([]);
  });

  it('abgelegt, aber kein Ereignis (abgelehnt): nach der Haltefrist zurück', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'] }), 0);
    send('a', info({ drag: [], dropped: 'ui-1' }), 100);
    expect(r.nextExpiry()).toBe(100 + HOLD_MS);
    r.expire(100 + HOLD_MS - 1);
    expect(r.drags()).toHaveLength(1);
    r.expire(100 + HOLD_MS);
    expect(r.drags()).toEqual([]);
  });

  it('wer während der Haltefrist geht, dessen Karte bleibt bis zum Ereignis bzw. zur Frist', () => {
    const { r, send } = setup();
    send('a', info({ drag: ['H2'] }), 0);
    send('a', info({ drag: [], dropped: 'ui-1' }), 100);
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

describe('Änderungsmerker', () => {
  it('meldet nur, was sich geändert hat', () => {
    const { r, send } = setup();
    send('a', info({}), 0);
    expect(r.takeChanges()).toEqual({ drags: false, open: false });
    send('a', info({ drag: ['H2'] }), 10);
    expect(r.takeChanges()).toEqual({ drags: true, open: false });
    send('a', info({ drag: ['H2'], open: 'deck' }), 20);
    expect(r.takeChanges()).toEqual({ drags: true, open: true });
    send('a', info({ drag: [], open: 'deck' }), 30);
    expect(r.takeChanges()).toEqual({ drags: true, open: false });
    send('a', info({ open: 'deck', at: at(0.9) }), 40);
    expect(r.takeChanges()).toEqual({ drags: false, open: false });
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
