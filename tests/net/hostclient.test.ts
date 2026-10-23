// Schritt 2b: Host und Clients ohne Oberfläche, über eine Verbindung im Speicher.

import { describe, expect, it, vi } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import type { SeatId } from '../../src/engine/types';
import { Client, type ClientOptions } from '../../src/net/client';
import type { CommandResult } from '../../src/net/protocol';
import { Host } from '../../src/net/host';
import { readArchive, writeArchive } from '../../src/net/archive';
import { MemoryBackups, MemoryNetwork, MemoryPhotoBank, MemoryStore } from '../../src/net/memory';
import { sha256Hex, unpackPhoto } from '../../src/net/photos';
import { Presence, type PresenceInfo } from '../../src/net/presence';
import type { KlioState } from '../../src/rules/klio/state';
import { engine, fresh, sheet } from '../helpers';

const BUILD = 'abc1234';

async function setup() {
  const net = new MemoryNetwork();
  const store = new MemoryStore<KlioState>();
  const saveErrors: unknown[] = [];
  const photos = new MemoryPhotoBank();
  const backups = new MemoryBackups<KlioState>();
  const startHost = () =>
    Host.start(engine, net.connect(), store, () => fresh(), {
      build: BUILD, rng: seededRng(2), onSaveError: (e) => saveErrors.push(e), photos, backups,
    });
  const host = await startHost();
  const ids: string[] = [];
  /** Neuer Client; `key` = Browser (Standard: je Wunschplatz ein eigener).
   *  Wie in der App: Beitritt als Zuschauer, dann (bei Wunschplatz) Platz wählen; `claimed` = Antwort darauf. */
  const join = (want: SeatId | 'spectator', opts: Partial<ClientOptions> = {}) => {
    const transport = net.connect();
    const warnings: string[] = [];
    const key = opts.key ?? `key-${want}-${'x'.repeat(16)}`;
    let claimed: Promise<CommandResult> | null = null;
    const client: Client<KlioState> = new Client(engine, transport, {
      build: BUILD, key, name: `Name ${want}`,
      newId: () => ids[ids.push(`cmd-${ids.length + 1}-${'0'.repeat(8)}`) - 1]!, onWarning: (w) => warnings.push(w.kind), ...opts,
      onChange: () => {
        if (want !== 'spectator' && !claimed && client.status === 'ready' && client.role?.role === 'spectator') claimed = client.claim(want, `Name ${want}`);
        opts.onChange?.();
      },
    });
    return { client, transport, warnings, key, claimed: () => claimed };
  };
  return { net, store, host, startHost, join, saveErrors, ids, photos, backups };
}

const isMsg = (msg: unknown, t: string) => (msg as { t?: string }).t === t;

/** Alles zustellen und den Host bis zur Ruhe arbeiten lassen. */
async function settle(net: MemoryNetwork, ...hosts: Host<KlioState>[]) {
  for (let round = 0; round < 1000; round++) {
    const delivered = await net.deliver();
    await Promise.all(hosts.map((h) => h.idle()));
    if (delivered === 0) return;
  }
  throw new Error('Nachrichten kommen nicht zur Ruhe');
}

describe('Beitreten', () => {
  it('Client bekommt den Stand und seinen Platz; der Platz gilt als besetzt', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    await settle(net, host);
    expect(a.client.status).toBe('ready');
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
    expect(a.client.state).toEqual(host.state);
    expect(host.state.seats.seat1).toEqual({ occupied: true, name: 'Name seat1' });
  });

  it('besetzter oder ausgeblendeter Platz wird abgelehnt, Zuschauen geht immer', async () => {
    const { net, host, join } = await setup();
    join('seat1');
    await settle(net, host);
    const b = join('seat1', { key: 'other-browser-xxxxxxxxx' });
    await host.submit({ type: 'table.setPlayers', players: 2 });
    const c = join('seat3', { key: 'third-browser-xxxxxxxxx' });
    const d = join('spectator');
    await settle(net, host);
    // Platzwunsch abgelehnt: bleibt verbunden als Zuschauer, Grund in der Antwort
    expect(b.client.status).toBe('ready');
    expect(b.client.role).toEqual({ role: 'spectator' });
    expect(await b.claimed()).toEqual({ ok: false, reason: { key: 'reject.seatTaken' } });
    expect(await c.claimed()).toEqual({ ok: false, reason: { key: 'reject.hiddenSeat' } });
    expect(d.client.status).toBe('ready');
    expect(d.client.role).toEqual({ role: 'spectator' });
  });

  it('andere Version → „Bitte Seite neu laden“', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1', { build: 'alt0000' });
    await settle(net, host);
    expect(a.client.status).toBe('reload');
    expect(a.client.state).toBeNull();
  });

  it('andere Version: offene Anfragen enden mit einer Absage', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1', { build: 'alt0000' });
    const r = a.client.submit({ type: 'zone.draw', zone: 'deck' }); // vor dem Willkommen: wartet
    await settle(net, host);
    expect(await r).toEqual({ ok: false, reason: { key: 'reject.invalid' } });
  });
});

describe('Befehle', () => {
  it('angenommen: alle bekommen die Ereignisse und haben denselben Stand', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    const b = join('seat2');
    await settle(net, host);
    const r = a.client.submit({ type: 'sheet.setText', seat: 'seat1', field: 'name', value: 'Ida' });
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
    expect(sheet(host.state, 'seat1').name).toBe('Ida');
    expect(a.client.state).toEqual(host.state);
    expect(b.client.state).toEqual(host.state);
  });

  it('Ereignisse nennen die auslösende Befehls-ID (Absender schließt seine Anzeige ab)', async () => {
    const { net, host, join } = await setup();
    const causes: (string | undefined)[] = [];
    const a = join('seat1', { onEvents: (_e, cause) => void causes.push(cause) });
    await settle(net, host);
    causes.length = 0;
    const r = a.client.submit({ type: 'zone.draw', zone: 'deck' }, 'meine-id-123');
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
    expect(causes).toEqual(['meine-id-123']);
  });

  it('abgelehnt: Grund kommt zurück, nichts ändert sich', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const before = host.state;
    const r = a.client.submit({ type: 'sheet.setText', seat: 'seat2', field: 'name', value: 'Ida' });
    await settle(net, host);
    expect(await r).toEqual({ ok: false, reason: { key: 'reject.notAllowed' } });
    expect(host.state).toEqual(before);
  });

  it('doppelt gesendeter Befehl wird nur einmal ausgeführt (kein zweites Ziehen)', async () => {
    const { net, host, join, ids } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const cmd = { type: 'zone.draw', zone: 'deck' };
    const r = a.client.submit(cmd);
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
    // dieselbe Nachricht noch einmal, wie nach einem Verbindungsabbruch
    a.transport.send({ t: 'cmd', id: ids.at(-1), cmd }, host.peerId);
    await settle(net, host);
    expect(host.state.zones['discard']).toHaveLength(1);
    expect(host.state.zones['deck']).toHaveLength(26);
  });

  it('Befehl null wird abgelehnt, nicht verschluckt', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const empty = a.client.submit(null);
    await settle(net, host);
    expect(await empty).toEqual({ ok: false, reason: { key: 'reject.unknownCommand' } });
    // der Host arbeitet danach normal weiter
    const again = a.client.submit({ type: 'zone.draw', zone: 'deck' });
    await settle(net, host);
    expect(await again).toEqual({ ok: true });
  });

  it('zwei greifen gleichzeitig nach derselben Karte: der erste gewinnt, der zweite wird abgelehnt', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    const b = join('seat2');
    await settle(net, host);
    const top = host.state.zones['deck']!.at(-1);
    const ra = a.client.submit({ type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'seat1.notes' } });
    const rb = b.client.submit({ type: 'cards.move', cards: [top], from: { zone: 'deck' }, to: { zone: 'seat2.notes' } });
    await settle(net, host);
    expect(await ra).toEqual({ ok: true });
    expect(await rb).toEqual({ ok: false, reason: { key: 'reject.stale' } });
    expect(host.state.zones['seat1.notes']).toEqual([top]);
    expect(a.client.state).toEqual(host.state);
    expect(b.client.state).toEqual(host.state);
  });

  it('Befehle der Spielleitung im Host-Browser kommen bei allen an', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    await settle(net, host);
    expect(await host.submit({ type: 'gm.oracle' })).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.state!.game.oracle).toEqual(host.state.game.oracle);
  });
});

describe('Verbindung', () => {
  it('Abbruch und Wiederverbinden: derselbe Platz, verpasste Änderungen kommen mit dem Stand', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    await settle(net, host);
    net.disconnect(a.transport.self);
    await host.submit({ type: 'zone.draw', zone: 'deck' });
    await settle(net, host);
    // gleicher Browser (gleicher Schlüssel), neue Verbindung
    const again = join('seat3', { key: a.key });
    await settle(net, host);
    expect(again.client.role).toEqual({ role: 'player', seat: 'seat1' });
    expect(again.client.state).toEqual(host.state);
  });

  it('Antwort ging verloren, Host startet neu: Client schickt erneut, ausgeführt wird nur einmal', async () => {
    const { net, host, join, startHost } = await setup();
    const a = join('seat1');
    await settle(net, host);
    // Antwort des Hosts geht verloren: Client weiß nicht, ob der Befehl ankam
    net.drop = (msg, from) => from === host.peerId && isMsg(msg, 'result');
    const r = a.client.submit({ type: 'zone.draw', zone: 'deck' });
    await settle(net, host);
    net.drop = () => false;
    // Host stürzt nach dem Speichern ab, bevor die Antwort ankam
    net.disconnect(host.peerId);
    await settle(net, host);
    expect(a.client.status).toBe('waiting');
    const host2 = await startHost();
    await settle(net, host2);
    expect(await r).toEqual({ ok: true });
    expect(host2.state.zones['discard']).toHaveLength(1); // nicht zweimal gezogen
    expect(a.client.status).toBe('ready');
    expect(a.client.state).toEqual(host2.state);
  });

  it('Host-Neustart: Stand und Plätze bleiben, Clients finden den neuen Host', async () => {
    const { net, host, join, startHost } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const first = a.client.submit({ type: 'sheet.setText', seat: 'seat1', field: 'name', value: 'Ida' });
    await settle(net, host);
    expect(await first).toEqual({ ok: true });
    net.disconnect(host.peerId);
    await settle(net, host);
    expect(a.client.status).toBe('waiting');
    const host2 = await startHost();
    await settle(net, host2);
    expect(a.client.status).toBe('ready');
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
    expect(sheet(host2.state, 'seat1').name).toBe('Ida');
    const r = a.client.submit({ type: 'sheet.setText', seat: 'seat1', field: 'name', value: 'Ida Weber' });
    await settle(net, host2);
    expect(await r).toEqual({ ok: true });
  });

  it('Lücke in den Ereignissen → Client fordert den Stand neu an', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    await settle(net, host);
    let drops = 1;
    net.drop = (msg) => isMsg(msg, 'events') && drops-- > 0;
    await host.submit({ type: 'zone.draw', zone: 'deck' });
    await host.submit({ type: 'zone.draw', zone: 'deck' });
    await settle(net, host);
    expect(a.client.state).toEqual(host.state);
  });

  it('zweiter Tab mit demselben Schlüssel übernimmt, der alte wird benachrichtigt', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const b = join('seat1');
    await settle(net, host);
    expect(b.client.status).toBe('ready');
    expect(a.client.status).toBe('replaced');
  });

  it('vom zweiten Tab abgelöst: offene Platzwahl und Befehle enden mit einer Absage', async () => {
    const { net, host, join } = await setup();
    const a = join('spectator', { key: 'browser-a-xxxxxxxxxxxx' });
    await settle(net, host);
    net.drop = (msg, from) => from === a.transport.self; // kommt nicht mehr an
    const claim = a.client.claim('seat2', 'Ida');
    const cmd = a.client.submit({ type: 'zone.draw', zone: 'deck' });
    await settle(net, host);
    net.drop = () => false;
    join('spectator', { key: a.key });
    await settle(net, host);
    expect(a.client.status).toBe('replaced');
    expect(await claim).toEqual({ ok: false, reason: { key: 'reject.invalid' } });
    expect(await cmd).toEqual({ ok: false, reason: { key: 'reject.invalid' } });
  });

  it('Nachrichten von anderen Peers als dem Host werden ignoriert', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    const evil = net.connect();
    await settle(net, host);
    const before = a.client.state;
    evil.send({ t: 'state', state: { ...host.state, seq: 999 } }, a.transport.self);
    evil.send({ t: 'welcome', role: { role: 'player', seat: 'seat2' }, state: host.state }, a.transport.self);
    await settle(net, host);
    expect(a.client.state).toEqual(before);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
    expect(a.warnings).toContain('secondHost');
  });

  it('Schlüssel, die wie geerbte Eigenschaften heißen, sind normale Schlüssel', async () => {
    const { net, host, join, store } = await setup();
    const a = join('seat1', { key: 'propertyIsEnumerable' });
    const b = join('seat2', { key: '__defineGetter__' });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
    expect(b.client.role).toEqual({ role: 'player', seat: 'seat2' });
    expect(Object.hasOwn(store.saved!.host.keys, 'propertyIsEnumerable')).toBe(true);
    expect(host.online.map((o) => o.role).sort()).toEqual(['player', 'player']);
    // der erste Befehl merkt sich die Antwort unter diesem Schlüssel
    const r = a.client.submit({ type: 'sheet.setText', seat: 'seat1', field: 'name', value: 'Ida' });
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
    expect(sheet(host.state, 'seat1').name).toBe('Ida');
  });
});

describe('Speichern', () => {
  it('erst speichern, dann verteilen; schlägt Speichern fehl, wird der Befehl verworfen und gewarnt', async () => {
    const { net, host, join, store, saveErrors } = await setup();
    const a = join('seat1');
    await settle(net, host);
    store.failNext = true;
    const before = host.state;
    const r = a.client.submit({ type: 'zone.draw', zone: 'deck' });
    await settle(net, host);
    expect(await r).toEqual({ ok: false, reason: { key: 'reject.saveFailed' } });
    expect(host.state).toEqual(before);
    expect(a.client.state).toEqual(before);
    expect(saveErrors).toHaveLength(1);
    expect(store.saved!.state).toEqual(before);
  });

  it('der gespeicherte Stand ist immer der zuletzt verteilte', async () => {
    const { net, host, join, store } = await setup();
    join('seat1');
    await settle(net, host);
    await host.submit({ type: 'zone.shuffle', zone: 'deck' });
    await settle(net, host);
    expect(store.saved!.state).toEqual(host.state);
  });
});

describe('Platz wählen nach dem Beitritt', () => {
  it('Zuschauer sieht den Tisch und nimmt dann einen freien Platz', async () => {
    const { net, host, join } = await setup();
    const a = join('spectator', { key: 'browser-a-xxxxxxxxxxxx' });
    const events: string[] = [];
    const b = join('spectator', { key: 'browser-b-xxxxxxxxxxxx', onEvents: (e) => void events.push(...e.map((x) => x.type)) });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'spectator' });
    const r = a.client.claim('seat2', 'Ida');
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat2' });
    expect(host.state.seats.seat2).toEqual({ occupied: true, name: 'Ida' });
    expect(b.client.state!.seats.seat2.occupied).toBe(true);
    expect(events).toContain('seatsChanged');
  });

  it('Antwort auf die Platzwahl geht verloren, Host startet neu: Wiederholung bekommt die Zusage', async () => {
    const { net, host, join, startHost, store } = await setup();
    const a = join('spectator', { key: 'browser-a-xxxxxxxxxxxx' });
    await settle(net, host);
    // nach dem Speichern bricht die Verbindung ab: weder Willkommen noch Antwort kommen an
    net.drop = (msg, from) => from === host.peerId;
    const r = a.client.claim('seat2', 'Ida');
    await settle(net, host);
    net.drop = () => false;
    expect(store.saved!.host.keys[a.key]).toEqual({ role: 'player', seat: 'seat2' });
    net.disconnect(host.peerId);
    await settle(net, host);
    const host2 = await startHost();
    await settle(net, host2);
    expect(await r).toEqual({ ok: true });
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat2' });
  });

  it('vergebener Platz: Absage, bleibt Zuschauer und verbunden', async () => {
    const { net, host, join } = await setup();
    join('seat1');
    const a = join('spectator', { key: 'browser-a-xxxxxxxxxxxx' });
    await settle(net, host);
    const r = a.client.claim('seat1', 'Ida');
    await settle(net, host);
    expect(await r).toEqual({ ok: false, reason: { key: 'reject.seatTaken' } });
    expect(a.client.status).toBe('ready');
    expect(a.client.role).toEqual({ role: 'spectator' });
    // auch nach dem Wiederverbinden kein fremder Platz
    net.disconnect(a.transport.self);
    const again = join('spectator', { key: a.key });
    await settle(net, host);
    expect(again.client.role).toEqual({ role: 'spectator' });
  });

  it('Raum wird beim Host gespeichert; Wechsel der Verbindung behält Stand und Plätze', async () => {
    const { net, host, join, store } = await setup();
    await host.setRoom({ room: 'r'.repeat(22), secret: 's'.repeat(22) });
    expect(store.saved!.host.room).toEqual({ room: 'r'.repeat(22), secret: 's'.repeat(22) });
    const a = join('seat1');
    await settle(net, host);
    const before = host.peerId;
    host.attach(net.connect());
    await settle(net, host);
    // neue Peer-ID des Hosts: Client findet ihn von selbst wieder und behält seinen Platz
    expect(host.peerId).not.toBe(before);
    expect(a.client.status).toBe('ready');
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
    const r = a.client.submit({ type: 'zone.draw', zone: 'deck' });
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
  });
});

describe('Plätze freigeben (SL)', () => {
  it('freigegebener Platz: Spieler wird Zuschauer, ein anderer Browser kann ihn nehmen', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    const b = join('spectator', { key: 'browser-b-xxxxxxxxxxxx' });
    await settle(net, host);
    expect(host.online).toContainEqual(expect.objectContaining({ role: 'player', seat: 'seat1' }));
    expect(await host.submit({ type: 'table.setSeat', seat: 'seat1', occupied: false })).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'spectator' });
    expect(a.client.status).toBe('ready');
    expect(host.online).not.toContainEqual(expect.objectContaining({ role: 'player', seat: 'seat1' }));
    const r = b.client.claim('seat1', 'Neues Gerät');
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
    expect(b.client.role).toEqual({ role: 'player', seat: 'seat1' });
    // der alte Browser bekommt den Platz beim Wiederverbinden nicht zurück
    net.disconnect(a.transport.self);
    const again = join('spectator', { key: a.key });
    await settle(net, host);
    expect(again.client.role).toEqual({ role: 'spectator' });
  });
});

describe('Plätze zuweisen und umsetzen (8.7)', () => {
  /** Peer-ID eines Clients beim Host */
  const peerOf = (c: { transport: { self: string } }) => c.transport.self;

  it('SL setzt einen Zuschauer auf einen freien Platz: Willkommen von außen, gespeichert, nach Neuladen derselbe', async () => {
    const { net, host, join } = await setup();
    const a = join('spectator', { name: 'Ida' });
    await settle(net, host);
    expect(host.online).toEqual([{ role: 'spectator', peer: peerOf(a), name: 'Ida' }]);
    expect(await host.assign(peerOf(a), 'seat3')).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat3' });
    expect(a.client.roleBy).toBe('gm');
    expect(host.state.seats.seat3).toEqual({ occupied: true, name: 'Ida' });
    // Neuladen: derselbe Platz, das Willkommen ist kein Eingriff mehr
    net.disconnect(peerOf(a));
    const again = join('spectator', { key: a.key });
    await settle(net, host);
    expect(again.client.role).toEqual({ role: 'player', seat: 'seat3' });
    expect(again.client.roleBy).toBeNull();
  });

  it('eigene Platzwahl bringt ein Willkommen ohne Anlass', async () => {
    const { net, host, join } = await setup();
    const a = join('seat2');
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat2' });
    expect(a.client.roleBy).toBeNull();
  });

  it('Name eines Zuschauers: aus dem Beitritt, geändert per Nachricht, beim Zuweisen übernommen', async () => {
    const { net, host, join } = await setup();
    const a = join('spectator', { name: '' });
    await settle(net, host);
    expect(host.online[0]!.name).toBe('');
    a.client.setName('  Bo ');
    await settle(net, host);
    expect(host.online[0]!.name).toBe('Bo');
    await host.assign(peerOf(a), 'seat1');
    await settle(net, host);
    expect(host.state.seats.seat1).toEqual({ occupied: true, name: 'Bo' });
  });

  it('Zuweisen abgelehnt: Platz besetzt oder ausgeblendet, Zuschauer weg oder schon Spieler', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    const b = join('spectator', { key: 'browser-b-xxxxxxxxxxxx' });
    await settle(net, host);
    expect(await host.assign(peerOf(b), 'seat1')).toEqual({ ok: false, reason: { key: 'reject.seatTaken' } });
    await host.submit({ type: 'table.setPlayers', players: 2 });
    expect(await host.assign(peerOf(b), 'seat3')).toEqual({ ok: false, reason: { key: 'reject.hiddenSeat' } });
    expect(await host.assign(peerOf(a), 'seat2')).toEqual({ ok: false, reason: { key: 'reject.notConnected' } });
    net.disconnect(peerOf(b));
    await settle(net, host);
    expect(await host.assign(peerOf(b), 'seat2')).toEqual({ ok: false, reason: { key: 'reject.notConnected' } });
    await settle(net, host);
    expect(host.state.seats.seat2).toEqual({ occupied: false });
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
  });

  it('umsetzen auf einen freien Platz und tauschen: die Browser folgen den Personen, beide mit Anlass', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    const b = join('seat2');
    await settle(net, host);
    expect(await host.submit({ type: 'table.moveSeat', from: 'seat1', to: 'seat3' })).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat3' });
    expect(a.client.roleBy).toBe('gm');
    expect(host.state.seats.seat1).toEqual({ occupied: false, name: 'Name seat1' });
    expect(await host.submit({ type: 'table.moveSeat', from: 'seat3', to: 'seat2' })).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat2' });
    expect(b.client.role).toEqual({ role: 'player', seat: 'seat3' });
    expect(b.client.roleBy).toBe('gm');
    expect(a.client.state).toEqual(host.state);
  });

  it('umsetzen vom ausgeblendeten auf einen sichtbaren Platz', async () => {
    const { net, host, join } = await setup();
    const a = join('seat4');
    await settle(net, host);
    await host.submit({ type: 'table.setPlayers', players: 2 });
    expect(await host.submit({ type: 'table.moveSeat', from: 'seat4', to: 'seat2' })).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat2' });
  });

  it('nicht verbundener Spieler wird umgesetzt und sitzt beim nächsten Beitritt auf dem neuen Platz, auch nach Host-Neustart', async () => {
    const { net, host, join, startHost } = await setup();
    const a = join('seat1');
    await settle(net, host);
    net.disconnect(peerOf(a));
    await settle(net, host);
    expect(await host.submit({ type: 'table.moveSeat', from: 'seat1', to: 'seat4' })).toEqual({ ok: true });
    net.disconnect(host.peerId); // Host-Neustart
    await settle(net, host);
    const restarted = await startHost();
    const again = join('spectator', { key: a.key });
    await settle(net, restarted);
    expect(again.client.role).toEqual({ role: 'player', seat: 'seat4' });
  });

  it('auch ein Spieler mit freigegebenem Recht setzt um; die Schlüssel folgen trotzdem. Ohne Recht abgelehnt', async () => {
    const { net, host, join } = await setup();
    const a = join('seat1');
    const b = join('seat2');
    await settle(net, host);
    const denied = a.client.submit({ type: 'table.moveSeat', from: 'seat2', to: 'seat3' });
    await settle(net, host);
    expect(await denied).toEqual({ ok: false, reason: { key: 'reject.notAllowed' } });
    await host.submit({ type: 'table.setSettings', permissionOverrides: { player: { 'table.setSeat': 'allow' } } });
    const r = a.client.submit({ type: 'table.moveSeat', from: 'seat2', to: 'seat3' });
    await settle(net, host);
    expect(await r).toEqual({ ok: true });
    expect(b.client.role).toEqual({ role: 'player', seat: 'seat3' });
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
  });
});

describe('Fotos (8.4)', () => {
  const bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4, 5]);

  it('Spieler lädt hoch, ein anderer fragt an und bekommt es', async () => {
    const { net, host, join, photos } = await setup();
    const a = join('seat1');
    const mine = new MemoryPhotoBank();
    const b = join('spectator', { key: 'browser-b-xxxxxxxxxxxx', photos: mine });
    await settle(net, host);
    const hash = await sha256Hex(bytes);
    const up = a.client.uploadPhoto(hash, bytes);
    await settle(net, host);
    expect(await up).toEqual({ ok: true });
    expect(photos.photos.get(hash)).toEqual(bytes);
    b.client.requestPhoto(hash);
    await settle(net, host);
    // der Client prüft die Prüfsumme im Hintergrund, darauf wartet `settle` nicht
    await vi.waitFor(() => expect(mine.photos.get(hash)).toEqual(bytes));
  });

  it('Inhalt passt nicht zum Namen oder Zuschauer lädt hoch: abgelehnt', async () => {
    const { net, host, join, photos } = await setup();
    const a = join('seat1');
    const b = join('spectator', { key: 'browser-b-xxxxxxxxxxxx' });
    await settle(net, host);
    const wrong = a.client.uploadPhoto('0'.repeat(64), bytes);
    const spectator = b.client.uploadPhoto(await sha256Hex(bytes), bytes);
    await settle(net, host);
    expect(await wrong).toEqual({ ok: false, reason: { key: 'reject.invalid' } });
    expect(await spectator).toEqual({ ok: false, reason: { key: 'reject.invalid' } });
    expect(photos.photos.size).toBe(0);
  });

  it('kein gültiges Base64 (Länge): abgelehnt mit Antwort, der Host arbeitet weiter', async () => {
    const { net, host, join, photos } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const results: unknown[] = [];
    a.transport.onMessage((msg) => void (isMsg(msg, 'result') && results.push(msg)));
    a.transport.send({ t: 'photo', id: 'foto-1-xxxxxxxx', hash: '0'.repeat(64), data: 'AAAAA' }, host.peerId);
    await settle(net, host);
    expect(results).toEqual([{ t: 'result', id: 'foto-1-xxxxxxxx', ok: false, reason: { key: 'reject.invalid' } }]);
    expect(photos.photos.size).toBe(0);
    expect(await unpackPhoto('0'.repeat(64), 'AAAAA')).toBeNull();
  });

  it('Anfrage ohne Host wird nach dem Wiederverbinden nachgeholt', async () => {
    const { net, host, join, photos, startHost } = await setup();
    const hash = await sha256Hex(bytes);
    await photos.put(hash, bytes);
    const mine = new MemoryPhotoBank();
    const a = join('seat1', { photos: mine });
    await settle(net, host);
    net.disconnect(host.peerId);
    await settle(net, host);
    a.client.requestPhoto(hash);
    const host2 = await startHost();
    await settle(net, host2);
    await vi.waitFor(() => expect(mine.photos.get(hash)).toEqual(bytes));
  });
});

describe('Mauszeiger (8.3)', () => {
  it('Lage kommt bei den anderen an, gebündelt; wer geht, verschwindet', async () => {
    const net = new MemoryNetwork();
    const ta = net.connect();
    const tb = net.connect();
    let seen: ReadonlyMap<string, PresenceInfo> = new Map();
    const a = new Presence(ta, () => {});
    new Presence(tb, (others) => (seen = new Map(others)));
    const info = (x: number): PresenceInfo => ({ who: 'seat1', name: 'Ida', at: { anchor: 'center', x, y: 0.5 }, drag: [], grab: null, dropped: null, open: null });
    a.set(info(0.1));
    a.set(info(0.2));
    await new Promise((r) => setTimeout(r, 80));
    await net.deliver();
    expect(seen.get(ta.self)).toEqual(info(0.2));
    a.set({ ...info(0.3), drag: ['H2'] });
    await new Promise((r) => setTimeout(r, 80));
    await net.deliver();
    expect(seen.get(ta.self)?.drag).toEqual(['H2']);
    net.disconnect(ta.self);
    await net.deliver();
    expect(seen.has(ta.self)).toBe(false);
  });
});

describe('Sicherung (A34) und Datei (8.2)', () => {
  it('vor dem Zurücksetzen wird gesichert; Wiederherstellen bringt den Stand zu allen zurück', async () => {
    const { net, host, join, backups } = await setup();
    const a = join('seat1');
    await settle(net, host);
    await host.submit({ type: 'sheet.setText', seat: 'seat1', field: 'name', value: 'Ida' });
    await host.submit({ type: 'zone.draw', zone: 'deck' });
    const before = host.state;
    await host.submit({ type: 'table.reset', includeCharacters: true });
    await settle(net, host);
    expect(sheet(a.client.state!, 'seat1').name).toBe('');
    const [b] = await backups.list();
    expect(b!.reason).toBe('table.reset');
    expect(await host.restore(b!.id)).toEqual({ ok: true });
    await settle(net, host);
    expect(host.state).toEqual(before);
    expect(a.client.state).toEqual(before);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat1' });
    // auch das Wiederherstellen selbst lässt sich zurücknehmen
    expect((await backups.list()).map((x) => x.reason)).toEqual(['restore', 'table.reset']);
  });

  it('nur die letzten Sicherungen bleiben; abgelehnte Befehle sichern nicht', async () => {
    const { host, backups } = await setup();
    for (let i = 0; i < 7; i++) await host.submit({ type: 'table.reset', includeCharacters: false });
    await host.submit({ type: 'table.reset', includeCharacters: 'ja' });
    expect(await backups.list()).toHaveLength(5);
  });

  it('Sicherung schlägt fehl: Befehl verworfen mit eigenem Grund, der Client bekommt Antwort, keine Speicherwarnung', async () => {
    const { net, host, join, backups, saveErrors } = await setup();
    const a = join('seat1');
    await settle(net, host);
    await host.submit({ type: 'table.setSettings', permissionOverrides: { player: { 'table.reset': 'allow' } } });
    await host.submit({ type: 'table.reset', includeCharacters: false });
    const [earlier] = await backups.list();
    const before = host.state;
    backups.add = () => Promise.reject(new Error('Kontingent erschöpft'));
    const failed = { ok: false, reason: { key: 'reject.backupFailed' } };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await host.submit({ type: 'table.reset', includeCharacters: true })).toEqual(failed);
    const r = a.client.submit({ type: 'table.reset', includeCharacters: true });
    await settle(net, host);
    expect(await r).toEqual(failed);
    expect(await host.restore(earlier!.id)).toEqual(failed);
    expect(await host.importArchive(await host.exportArchive())).toEqual(failed);
    error.mockRestore();
    expect(host.state).toEqual(before);
    expect(a.client.state).toEqual(before);
    expect(saveErrors).toHaveLength(0);
  });

  it('Sicherung nicht lesbar oder Fotos beim Laden nicht ablegbar: Antwort statt Absturz', async () => {
    const { host, backups, photos, saveErrors } = await setup();
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = await sha256Hex(bytes);
    await photos.put(hash, bytes);
    await host.submit({ type: 'sheet.setPhoto', seat: 'seat2', photo: { hash, type: 'image/jpeg' } });
    const file = await host.exportArchive();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    backups.get = () => Promise.reject(new Error('IndexedDB weg'));
    expect(await host.restore('x')).toEqual({ ok: false, reason: { key: 'reject.invalid' } });
    error.mockRestore();
    photos.put = () => Promise.reject(new Error('voll'));
    expect(await host.importArchive(file)).toEqual({ ok: false, reason: { key: 'reject.saveFailed' } });
    expect(saveErrors).toHaveLength(1);
  });

  it('Datei: Stand, Plätze, Raum und Fotos hin und zurück; Laden ersetzt den Stand bei allen', async () => {
    const { net, host, join, photos } = await setup();
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = await sha256Hex(bytes);
    await photos.put(hash, bytes);
    await photos.put('f'.repeat(64), bytes); // nicht verwendet: gehört nicht in die Datei
    await host.setRoom({ room: 'r'.repeat(22), secret: 's'.repeat(22) });
    await host.submit({ type: 'sheet.setText', seat: 'seat2', field: 'name', value: 'Ida' });
    await host.submit({ type: 'sheet.setPhoto', seat: 'seat2', photo: { hash, type: 'image/jpeg' } });
    const file = await host.exportArchive();
    expect(Object.keys(JSON.parse(file).photos)).toEqual([hash]);

    await host.submit({ type: 'table.reset', includeCharacters: true });
    await host.setRoom({ room: 'n'.repeat(22), secret: 'n'.repeat(22) });
    photos.photos.clear();
    const replaced: string[] = [];
    const a = join('spectator', { key: 'browser-a-xxxxxxxxxxxx', onReplaced: (r) => void replaced.push(r) });
    await settle(net, host);
    expect(await host.importArchive(file)).toEqual({ ok: true });
    await settle(net, host);
    expect(sheet(host.state, 'seat2').name).toBe('Ida');
    expect(host.room).toEqual({ room: 'r'.repeat(22), secret: 's'.repeat(22) });
    expect(photos.photos.get(hash)).toEqual(bytes);
    expect(a.client.state).toEqual(host.state);
    expect(replaced).toEqual(['import']);
    expect(await host.importArchive('kaputt')).toEqual({ ok: false, reason: { key: 'reject.importInvalid' } });
    const newer = JSON.parse(file);
    newer.state.format = 99;
    expect(await host.importArchive(JSON.stringify(newer))).toEqual({ ok: false, reason: { key: 'reject.importNewer' } });
  });

  it('Datei: ein Foto fehlt in der Ablage, die Datei entsteht trotzdem (ohne dieses Foto)', async () => {
    const { host } = await setup();
    await host.submit({ type: 'sheet.setPhoto', seat: 'seat2', photo: { hash: 'a'.repeat(64), type: 'image/jpeg' } });
    const file = JSON.parse(await host.exportArchive());
    expect(file.photos).toEqual({});
    expect(await host.importArchive(JSON.stringify(file))).toEqual({ ok: true });
  });

  it('Datei von einem anderen Gerät: wer verbunden ist und darin fehlt, wird Zuschauer (gespeichert)', async () => {
    const { net, host, join, store } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const file = JSON.parse(await host.exportArchive());
    file.host.keys = {};
    file.state.seats.seat1.occupied = false;
    expect(await host.importArchive(JSON.stringify(file))).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'spectator' });
    expect(a.warnings).toEqual([]);
    expect(host.online).toEqual([expect.objectContaining({ role: 'spectator', peer: a.transport.self })]);
    expect(store.saved!.host.keys[a.key]).toEqual({ role: 'spectator' });
  });

  it('Datei mit Spieler auf freiem Platz: er wird Zuschauer, der Platz ist für andere frei', async () => {
    const { net, host, join, store } = await setup();
    const a = join('seat1');
    await settle(net, host);
    const file = JSON.parse(await host.exportArchive());
    file.state.seats.seat1.occupied = false;
    file.host.keys['offline-key-xxxxxxx'] = { role: 'player', seat: 'seat2' };
    expect(await host.importArchive(JSON.stringify(file))).toEqual({ ok: true });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'spectator' });
    expect(store.saved!.host.keys['offline-key-xxxxxxx']).toEqual({ role: 'spectator' });
    const b = join('seat1', { key: 'browser-b-xxxxxxxxxxxx' });
    await settle(net, host);
    expect(b.client.role).toEqual({ role: 'player', seat: 'seat1' });
  });

  it('Datei: fremde, beschädigte oder unpassende Inhalte werden abgelehnt', async () => {
    const { store } = await setup();
    const ok = JSON.parse(writeArchive(store.saved!, new Map()));
    await expect(readArchive(engine, '{"app":"anders"}')).rejects.toThrow();
    await expect(readArchive(engine, 'kein json')).rejects.toThrow();
    await expect(readArchive(engine, JSON.stringify({ ...ok, state: { ...ok.state, seq: -1 } }))).rejects.toThrow();
    await expect(readArchive(engine, JSON.stringify({ ...ok, photos: { ['0'.repeat(64)]: 'AQID' } }))).rejects.toThrow(/passt nicht/);
  });
});
