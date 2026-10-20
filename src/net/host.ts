// Host (ARCHITEKTUR.md 8.2): hält den maßgeblichen Stand, prüft Befehle, speichert, verteilt Ereignisse.
// Befehle werden strikt nacheinander bearbeitet: ausführen → speichern → bestätigen und verteilen.

import { cryptoRng } from '../engine/rng';
import type { Engine } from '../engine/dispatch';
import { SEATS, type Actor, type EngineEvent, type Rng, type SeatId, type SequencedEvent, type TableState, type TextRef } from '../engine/types';
import { ToHost, type CommandResult, type Role, type ToClient } from './protocol';
import type { PeerId, Transport } from './transport';

/** Wie viele beantwortete Befehls-IDs je Schlüssel aufgehoben werden (doppelt gesendete erkennen). */
export const REMEMBERED_COMMANDS = 100;

/** Nur beim Host, nie verteilt (8.2, Host-Daten). */
export type HostData = {
  /** Wiederverbindungs-Schlüssel → Rolle */
  keys: Record<string, Role>;
  /** je Schlüssel die zuletzt beantworteten Befehle, älteste zuerst */
  answered: Record<string, [id: string, result: CommandResult][]>;
};

export type Saved<G> = { state: TableState<G>; host: HostData };

/** Speicher des Hosts; Stand und Host-Daten werden gemeinsam (in einer Transaktion) gespeichert. */
export interface HostStore<G> {
  load(): Promise<Saved<G> | null>;
  save(saved: Saved<G>): Promise<void>;
}

export type HostOptions = {
  build: string;
  rng?: Rng;
  /** Speichern fehlgeschlagen: Befehl verworfen, SL bekommt eine deutliche Warnung (8.2) */
  onSaveError?: (error: unknown) => void;
  /** nach jedem angenommenen Befehl (auch eigenen) */
  onChange?: (state: TableState<unknown>, events: SequencedEvent[]) => void;
};

export class Host<G> {
  private peers = new Map<PeerId, string>(); // Peer → Schlüssel
  private queue: Promise<unknown> = Promise.resolve();
  private rng: Rng;

  private constructor(
    private engine: Engine<G>,
    private transport: Transport,
    private store: HostStore<G>,
    private saved: Saved<G>,
    private options: HostOptions,
  ) {
    this.rng = options.rng ?? cryptoRng();
    transport.onMessage((msg, from) => {
      const parsed = ToHost.safeParse(msg);
      if (parsed.success) this.enqueue(() => this.receive(parsed.data, from));
    });
    transport.onPeers((list) => {
      for (const p of this.peers.keys()) if (!list.includes(p)) this.peers.delete(p);
    });
  }

  /** Host starten: gespeicherten Stand laden oder neu anlegen. */
  static async start<G>(engine: Engine<G>, transport: Transport, store: HostStore<G>, initial: () => TableState<G>, options: HostOptions): Promise<Host<G>> {
    const loaded = await store.load();
    const saved = loaded
      ? { state: engine.parseState(loaded.state), host: loaded.host }
      : { state: initial(), host: { keys: {}, answered: {} } };
    if (!loaded) await store.save(saved);
    return new Host(engine, transport, store, saved, options);
  }

  get state(): TableState<G> {
    return this.saved.state;
  }

  get peerId(): PeerId {
    return this.transport.self;
  }

  /** Befehl der Spielleitung (im Browser des Hosts). */
  submit(cmd: unknown): Promise<CommandResult> {
    return this.enqueue(() => this.execute(cmd, { role: 'gm' }));
  }

  /** Warten, bis alle eingegangenen Befehle bearbeitet sind (für Tests). */
  idle(): Promise<unknown> {
    return this.queue;
  }

  private enqueue<T>(job: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private send(msg: ToClient, to: PeerId): void {
    this.transport.send(msg, to);
  }

  private async receive(msg: ToHost, from: PeerId): Promise<void> {
    if (msg.t === 'hello') return this.hello(msg, from);
    const key = this.peers.get(from);
    if (!key) return; // erst hello
    if (msg.t === 'resync') return this.send({ t: 'state', state: this.state }, from);

    // Doppelt gesendet (z. B. nach Verbindungsabbruch): nur die Antwort wiederholen (8.2)
    const earlier = this.saved.host.answered[key]?.find(([id]) => id === msg.id);
    if (earlier) return this.send({ t: 'result', id: msg.id, ...earlier[1] }, from);

    const role = this.saved.host.keys[key]!;
    const actor: Actor = role.role === 'player' ? { role: 'player', seat: role.seat } : { role: 'spectator' };
    const result = await this.execute(msg.cmd, actor, [key, msg.id]);
    this.send({ t: 'result', id: msg.id, ...result }, from);
  }

  private hello(msg: Extract<ToHost, { t: 'hello' }>, from: PeerId): Promise<void> | void {
    if (msg.build !== this.options.build) return this.send({ t: 'reload', build: this.options.build }, from);

    // Derselbe Schlüssel in einem zweiten Tab: der neue übernimmt (8.2)
    for (const [peer, key] of this.peers) {
      if (key === msg.key && peer !== from) {
        this.send({ t: 'replaced' }, peer);
        this.peers.delete(peer);
      }
    }

    const known = this.saved.host.keys[msg.key];
    if (known) {
      this.peers.set(from, msg.key);
      return this.send({ t: 'welcome', role: known, state: this.state }, from);
    }
    return this.claim(msg, from);
  }

  /** Neuer Schlüssel: Platz nehmen (nur sichtbare, freie) oder zuschauen. */
  private async claim(msg: Extract<ToHost, { t: 'hello' }>, from: PeerId): Promise<void> {
    const seat = msg.want === 'spectator' || msg.want === null ? null : msg.want;
    if (seat) {
      const why = this.seatProblem(seat);
      if (why) return this.send({ t: 'denied', reason: why }, from);
    }
    const role: Role = seat ? { role: 'player', seat } : { role: 'spectator' };
    const next: Saved<G> = structuredClone(this.saved);
    next.host.keys[msg.key] = role;
    let events: SequencedEvent[] = [];
    if (seat) {
      const seats = { ...next.state.seats, [seat]: { occupied: true, ...(msg.name ? { name: msg.name } : {}) } };
      const event: EngineEvent = { type: 'seatsChanged', seats };
      events = [{ seq: next.state.seq + 1, event }];
      next.state = this.engine.replay(next.state, events);
    }
    if (!(await this.persist(next))) return this.send({ t: 'denied', reason: { key: 'reject.saveFailed' } }, from);
    this.peers.set(from, msg.key);
    this.send({ t: 'welcome', role, state: this.state }, from);
    if (events.length > 0) this.broadcast(events, from);
  }

  private seatProblem(seat: SeatId): TextRef | null {
    if (SEATS.indexOf(seat) >= this.state.settings.players) return { key: 'reject.hiddenSeat' };
    if (this.state.seats[seat].occupied) return { key: 'reject.seatTaken' };
    return null;
  }

  /** Ausführen → speichern → erst dann verteilen. `answer` = [Schlüssel, Befehls-ID] zum Merken. */
  private async execute(cmd: unknown, actor: Actor, answer?: [string, string]): Promise<CommandResult> {
    const r = this.engine.dispatch(this.state, cmd, actor, this.rng);
    const result: CommandResult = 'rejected' in r ? { ok: false, reason: r.reason } : { ok: true };
    const next: Saved<G> = { state: 'rejected' in r ? this.state : r.state, host: structuredClone(this.saved.host) };
    if (answer) remember(next.host, answer[0], answer[1], result);

    if ('rejected' in r) {
      // Abgelehnte Befehle ändern nichts; gemerkt werden sie trotzdem, gespeichert mit dem nächsten Speichern
      this.saved = next;
      return result;
    }
    if (!(await this.persist(next))) return { ok: false, reason: { key: 'reject.saveFailed' } };
    this.broadcast(r.events);
    this.options.onChange?.(this.state as TableState<unknown>, r.events);
    return result;
  }

  private async persist(next: Saved<G>): Promise<boolean> {
    try {
      await this.store.save(next);
      this.saved = next;
      return true;
    } catch (error) {
      this.options.onSaveError?.(error);
      return false;
    }
  }

  private broadcast(events: SequencedEvent[], except?: PeerId): void {
    for (const peer of this.peers.keys()) if (peer !== except) this.send({ t: 'events', events }, peer);
  }
}

function remember(host: HostData, key: string, id: string, result: CommandResult): void {
  const list = (host.answered[key] ??= []);
  list.push([id, result]);
  if (list.length > REMEMBERED_COMMANDS) list.splice(0, list.length - REMEMBERED_COMMANDS);
}

/** Speicher im Arbeitsspeicher (Tests); wahlweise mit Fehlern beim Speichern. */
export class MemoryStore<G> implements HostStore<G> {
  saved: Saved<G> | null = null;
  failNext = false;
  async load() {
    return this.saved ? structuredClone(this.saved) : null;
  }
  async save(saved: Saved<G>) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Speichern fehlgeschlagen');
    }
    this.saved = structuredClone(saved);
  }
}
