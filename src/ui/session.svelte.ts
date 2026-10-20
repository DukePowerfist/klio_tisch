// Sitzung im Browser: verbindet Oberfläche, Spielstand und Verbindung (ARCHITEKTUR.md 8).
// Drei Betriebsarten, bestimmt durch den Link:
//   ohne Raum im Link        → lokal (allein bzw. Bildschirmfreigabe wie bisher), man ist Spielleitung
//   Raum im Link, eigener    → Spielleitung als Host über Trystero (Raum steht in den Host-Daten)
//   Raum im Link, fremder    → Mitspieler bzw. Zuschauer als Client

import content from 'virtual:klio-content';
import { createEngine } from '../engine/dispatch';
import { can } from '../engine/permissions';
import { cryptoRng } from '../engine/rng';
import { initialTable } from '../engine/setup';
import type { Actor, CardId, Event, SeatId, TableState, TextRef } from '../engine/types';
import { locate } from '../engine/zones';
import { Client, type ClientStatus } from '../net/client';
import { Host } from '../net/host';
import { localTransport } from '../net/local';
import type { CommandResult, Role } from '../net/protocol';
import { createRoomLink, formatHash, parseHash, type RoomLink } from '../net/room-link';
import { TrysteroRoom } from '../net/trystero';
import { createKlioRuleset } from '../rules/klio/ruleset';
import type { KlioState } from '../rules/klio/state';
import { IdbStore, PhotoStore } from './storage';

export type KlioTableState = TableState<KlioState>;
type Listener = (events: Event[]) => void;

/** Abgelegte Karten, deren Befehl noch nicht bestätigt ist: bleiben an der Ablegestelle (8.2). */
export type PendingDrop = { cards: CardId[]; dx: number; dy: number };
type Pending = PendingDrop & { where: string };

export type Mode = 'local' | 'host' | 'client';
/** Verbindungszustand für die Anzeige */
export type Status = 'starting' | 'local' | 'hosting' | 'otherTab' | ClientStatus;

const ruleset = createKlioRuleset(content);
const engine = createEngine(ruleset);
export const photos = new PhotoStore();

const KEY = 'klio.key';
const NAME = 'klio.name';
const HOST_LOCK = 'klio-tisch-host';

/** Geheimer Wiederverbindungs-Schlüssel dieses Browsers (8.2), einmalig erzeugt. */
function reconnectKey(): string {
  let key = localStorage.getItem(KEY);
  if (!key) {
    key = createRoomLink().secret + createRoomLink().secret;
    localStorage.setItem(KEY, key);
  }
  return key;
}

/** Nur ein Host je Browser (8.2): Sperre für die Lebensdauer der Seite. */
function acquireHostLock(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void navigator.locks.request(HOST_LOCK, { ifAvailable: true }, (lock) => {
      resolve(!!lock);
      return lock ? new Promise<void>(() => {}) : undefined;
    });
  });
}

/** Wo liegen die Karten gerade? (für unbestätigte Ablagen) */
const whereOf = (state: KlioTableState | null, cards: CardId[]) => JSON.stringify(cards.map((c) => (state ? locate(state, c) : null)));

class Session {
  mode = $state<Mode>('local');
  status = $state<Status>('starting');
  state = $state.raw<KlioTableState | null>(null);
  role = $state<Role | null>(null);
  /** wer hier bedient: im lokalen Betrieb und als Host die Spielleitung */
  actor = $derived<Actor>(this.mode === 'client' ? (this.role ?? { role: 'spectator' }) : { role: 'gm' });
  /** andere Teilnehmer im Raum */
  peers = $state(0);
  room = $state<RoomLink | null>(null);
  saveError = $state<string | null>(null);
  /** Hinweis des Hosts, z. B. warum ein Platz nicht frei war */
  notice = $state<TextRef | null>(null);
  warning = $state<'secondHost' | null>(null);
  pending = $state.raw<Pending[]>([]);

  private host: Host<KlioState> | null = null;
  private client: Client<KlioState> | null = null;
  private trystero: TrysteroRoom | null = null;
  private listeners = new Set<Listener>();

  async start(): Promise<void> {
    const link = parseHash(location.hash);
    const store = new IdbStore<KlioState>();
    const saved = link ? await store.load() : null;
    const ownRoom = link && saved?.host.room && saved.host.room.room === link.room && saved.host.room.secret === link.secret;
    if (link && !ownRoom) return this.startClient(link);
    if (ownRoom && !(await acquireHostLock())) {
      this.status = 'otherTab';
      return;
    }
    this.host = await Host.start(engine, localTransport(), store, () => initialTable(ruleset, cryptoRng()), {
      build: __BUILD_ID__,
      onSaveError: (e) => (this.saveError = String(e)),
      onChange: (state, events) => this.changed(state, events.map((e) => e.event)),
    });
    this.state = this.host.state;
    this.room = this.host.room ?? null;
    this.status = 'local';
    if (ownRoom) this.openRoom(link);
  }

  /** Spielleitung: Mitspieler einladen. Nutzt den gespeicherten Raum der Kampagne oder legt einen an (ehem. O10). */
  async invite(): Promise<RoomLink | null> {
    if (!this.host) return null;
    if (!(await acquireHostLock())) {
      this.status = 'otherTab';
      return null;
    }
    const link = this.host.room ?? createRoomLink();
    if (!this.host.room) await this.host.setRoom(link);
    this.room = link;
    history.replaceState(null, '', formatHash(link));
    this.openRoom(link);
    return link;
  }

  /** Einladungslink zum Kopieren */
  inviteUrl(): string | null {
    return this.room ? `${location.origin}${location.pathname}${formatHash(this.room)}` : null;
  }

  private openRoom(link: RoomLink): void {
    this.trystero?.leave();
    this.trystero = new TrysteroRoom(link);
    const channel = this.trystero.channel('msg');
    channel.onPeers((p) => (this.peers = p.length));
    this.host!.attach(channel);
    this.mode = 'host';
    this.status = 'hosting';
  }

  private startClient(link: RoomLink): void {
    this.mode = 'client';
    this.room = link;
    this.trystero = new TrysteroRoom(link);
    const channel = this.trystero.channel('msg');
    channel.onPeers((p) => (this.peers = p.length));
    const client: Client<KlioState> = new Client(engine, channel, {
      build: __BUILD_ID__,
      key: reconnectKey(),
      name: localStorage.getItem(NAME) ?? '',
      want: null,
      onChange: () => {
        this.status = client.status;
        this.role = client.role;
        this.notice = client.denied;
        if (client.state !== this.state) this.changed(client.state!, []);
      },
      onEvents: (events) => this.emit(events),
      onWarning: (w) => {
        if (w.kind === 'secondHost') this.warning = 'secondHost';
      },
    });
    this.client = client;
    this.status = client.status;
  }

  /** Als Zuschauer einen freien Platz nehmen. */
  claim(seat: SeatId, name: string): void {
    localStorage.setItem(NAME, name);
    this.client?.claim(seat, name);
  }

  get savedName(): string {
    return localStorage.getItem(NAME) ?? '';
  }

  async submit(cmd: object, drop?: PendingDrop): Promise<CommandResult> {
    const target = this.host ?? this.client;
    if (!target) return { ok: false, reason: { key: 'reject.invalid' } };
    const entry = drop && { ...drop, where: whereOf(this.state, drop.cards) };
    if (entry) this.pending = [...this.pending, entry];
    const result = await target.submit(cmd);
    if (entry) this.pending = this.pending.filter((d) => d !== entry);
    return result;
  }

  /** Darf der aktuelle Nutzer diesen Befehl? Zum Ausblenden von Knöpfen (9.3); verbindlich prüft der Host. */
  can(cmd: { type: string }): boolean {
    const def = engine.commands[cmd.type];
    if (!def || !this.state) return false;
    try {
      return can(this.actor, def, cmd, this.state as TableState<unknown>, ruleset.permissions);
    } catch {
      return true; // unvollständige Angaben (z. B. noch kein Ziel): anzeigen, der Host prüft beim Absenden
    }
  }

  /** Ereignisse für Meldungen und Animationen. */
  onEvents(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(state: KlioTableState, events: Event[]): void {
    this.state = state;
    // Unbestätigte Ablage endet, sobald die Karten woanders liegen (der Befehl ist angewendet)
    this.pending = this.pending.filter((d) => whereOf(state, d.cards) === d.where);
    this.emit(events);
  }

  private emit(events: Event[]): void {
    if (events.length === 0) return;
    for (const cb of this.listeners) cb(events);
  }
}

export const session = new Session();
