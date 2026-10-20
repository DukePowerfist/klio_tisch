// Schritt 2b: Host und Clients ohne Oberfläche, über eine Verbindung im Speicher.

import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/engine/rng';
import type { SeatId } from '../../src/engine/types';
import { Client, type ClientOptions } from '../../src/net/client';
import { Host } from '../../src/net/host';
import { MemoryNetwork, MemoryStore } from '../../src/net/memory';
import type { KlioState } from '../../src/rules/klio/state';
import { engine, fresh, sheet } from '../helpers';

const BUILD = 'abc1234';

async function setup() {
  const net = new MemoryNetwork();
  const store = new MemoryStore<KlioState>();
  const saveErrors: unknown[] = [];
  const startHost = () =>
    Host.start(engine, net.connect(), store, () => fresh(), { build: BUILD, rng: seededRng(2), onSaveError: (e) => saveErrors.push(e) });
  const host = await startHost();
  const ids: string[] = [];
  /** Neuer Client; `key` = Browser (Standard: je Wunschplatz ein eigener). */
  const join = (want: SeatId | 'spectator', opts: Partial<ClientOptions> = {}) => {
    const transport = net.connect();
    const warnings: string[] = [];
    const key = opts.key ?? `key-${want}-${'x'.repeat(16)}`;
    const client = new Client(engine, transport, {
      build: BUILD, key, name: `Name ${want}`, want,
      newId: () => ids[ids.push(`cmd-${ids.length + 1}-${'0'.repeat(8)}`) - 1]!, onWarning: (w) => warnings.push(w.kind), ...opts,
    });
    return { client, transport, warnings, key };
  };
  return { net, store, host, startHost, join, saveErrors, ids };
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

  it('besetzter oder ausgeblendeter Platz wird verweigert, Zuschauen geht immer', async () => {
    const { net, host, join } = await setup();
    join('seat1');
    await settle(net, host);
    const b = join('seat1', { key: 'other-browser-xxxxxxxxx' });
    await host.submit({ type: 'table.setPlayers', players: 2 });
    const c = join('seat3', { key: 'third-browser-xxxxxxxxx' });
    const d = join('spectator');
    await settle(net, host);
    expect(b.client.status).toBe('denied');
    expect(b.client.denied).toEqual({ key: 'reject.seatTaken' });
    expect(c.client.denied).toEqual({ key: 'reject.hiddenSeat' });
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
    const b = join('spectator', { key: 'browser-b-xxxxxxxxxxxx', onEvents: (e) => events.push(...e.map((x) => x.type)) });
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'spectator' });
    a.client.claim('seat2', 'Ida');
    await settle(net, host);
    expect(a.client.role).toEqual({ role: 'player', seat: 'seat2' });
    expect(host.state.seats.seat2).toEqual({ occupied: true, name: 'Ida' });
    expect(b.client.state!.seats.seat2.occupied).toBe(true);
    expect(events).toContain('seatsChanged');
  });

  it('vergebener Platz: Absage, bleibt Zuschauer und verbunden', async () => {
    const { net, host, join } = await setup();
    join('seat1');
    const a = join('spectator', { key: 'browser-a-xxxxxxxxxxxx' });
    await settle(net, host);
    a.client.claim('seat1', 'Ida');
    await settle(net, host);
    expect(a.client.status).toBe('ready');
    expect(a.client.role).toEqual({ role: 'spectator' });
    expect(a.client.denied).toEqual({ key: 'reject.seatTaken' });
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
