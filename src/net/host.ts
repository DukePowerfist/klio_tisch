// Host (ARCHITEKTUR.md 8.2): hält den maßgeblichen Stand, prüft Befehle, speichert, verteilt Ereignisse.
// Befehle werden strikt nacheinander bearbeitet: ausführen → speichern → bestätigen und verteilen.

import { isRejection } from '../engine/commands';
import type { Engine } from '../engine/dispatch';
import { cryptoRng } from '../engine/rng';
import type { Actor, Rng, SequencedEvent, TableState } from '../engine/types';
import { unpackPhoto, toBase64, type PhotoBank } from './photos';
import type { RoomLink } from './room-link';
import { ToHost, type CommandResult, type Role, type ToClient } from './protocol';
import type { PeerId, Transport } from './transport';

/** Wie viele beantwortete Befehls-IDs je Schlüssel aufgehoben werden (doppelt gesendete erkennen). */
const REMEMBERED_COMMANDS = 100;

/** Nur beim Host, nie verteilt (8.2, Host-Daten). */
export type HostData = {
  /** Wiederverbindungs-Schlüssel → Rolle */
  keys: Record<string, Role>;
  /** je Schlüssel die zuletzt beantworteten Befehle, älteste zuerst */
  answered: Record<string, [id: string, result: CommandResult][]>;
  /** dauerhafter Raum der Kampagne (ehem. O10); fehlt: noch keiner angelegt */
  room?: RoomLink;
};

export type Saved<G> = { state: TableState<G>; host: HostData };

/** Speicher des Hosts; Stand und Host-Daten werden gemeinsam (in einer Transaktion) gespeichert. */
export interface HostStore<G> {
  load(): Promise<Saved<G> | null>;
  save(saved: Saved<G>): Promise<void>;
}

export type HostOptions<G> = {
  build: string;
  rng?: Rng;
  /** Speichern fehlgeschlagen: Befehl verworfen, SL bekommt eine deutliche Warnung (8.2) */
  onSaveError?: (error: unknown) => void;
  /** nach jedem angenommenen Befehl (auch eigenen); `cause` = Befehls-ID, falls bekannt */
  onChange?: (state: TableState<G>, events: SequencedEvent[], cause?: string) => void;
  /** wer verbunden ist, hat sich geändert (Beitritt, Abbruch, neue Rolle) */
  onOnline?: (online: Role[]) => void;
  /** Fotos (8.4); fehlt: Fotos werden weder angenommen noch verteilt */
  photos?: PhotoBank;
};

type Hello = Extract<ToHost, { t: 'hello' }>;

export class Host<G> {
  private peers = new Map<PeerId, string>(); // Peer → Schlüssel
  private queue: Promise<unknown> = Promise.resolve();
  private rng: Rng;

  private constructor(
    private engine: Engine<G>,
    private transport: Transport,
    private store: HostStore<G>,
    private saved: Saved<G>,
    private options: HostOptions<G>,
  ) {
    this.rng = options.rng ?? cryptoRng();
    this.listen();
  }

  private listen(): void {
    const transport = this.transport;
    transport.onMessage((msg, from) => {
      if (transport !== this.transport) return; // alte Verbindung
      const parsed = ToHost.safeParse(msg);
      if (parsed.success) void this.enqueue(() => this.receive(parsed.data, from));
    });
    transport.onPeers((list) => {
      if (transport !== this.transport) return;
      for (const p of this.peers.keys()) if (!list.includes(p)) this.peers.delete(p);
      this.options.onOnline?.(this.online);
    });
  }

  /** Host starten: gespeicherten Stand laden oder neu anlegen. */
  static async start<G>(engine: Engine<G>, transport: Transport, store: HostStore<G>, initial: () => TableState<G>, options: HostOptions<G>): Promise<Host<G>> {
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

  get room(): RoomLink | undefined {
    return this.saved.host.room;
  }

  /** Rollen der verbundenen Clients (Raumfenster der SL) */
  get online(): Role[] {
    return [...this.peers.values()].map((key) => this.saved.host.keys[key]!);
  }

  /** Raum festlegen bzw. erneuern; ein neuer Link macht den alten wertlos, die Plätze bleiben (8.2). */
  setRoom(room: RoomLink): Promise<CommandResult> {
    return this.enqueue(() => this.persist({ state: this.state, host: { ...this.saved.host, room } }));
  }

  /** Wechselt die Verbindung (z. B. lokal → Raum); Stand und Plätze bleiben. */
  attach(transport: Transport): void {
    this.transport.leave();
    this.transport = transport;
    this.peers.clear();
    this.listen();
    this.options.onOnline?.(this.online);
  }

  /** Befehl der Spielleitung (im Browser des Hosts); `id` kommt in onChange als Auslöser zurück. */
  submit(cmd: unknown, id?: string): Promise<CommandResult> {
    return this.enqueue(() => this.execute(cmd, { role: 'gm' }, undefined, id));
  }

  /** Wartet, bis alle bisher eingegangenen Befehle bearbeitet sind. */
  idle(): Promise<unknown> {
    return this.queue;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
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
    if (msg.t === 'claim') return this.claim(key, msg, from);
    if (msg.t === 'photoGet') return this.sendPhoto(msg.hash, from);
    if (msg.t === 'photo') return this.send({ t: 'result', id: msg.id, ...(await this.putPhoto(key, msg.hash, msg.data)) }, from);

    // Doppelt gesendet (z. B. nach Verbindungsabbruch): nur die Antwort wiederholen (8.2)
    const earlier = this.saved.host.answered[key]?.find(([id]) => id === msg.id);
    if (earlier) return this.send({ t: 'result', id: msg.id, ...earlier[1] }, from);

    const role = this.saved.host.keys[key]!;
    const result = await this.execute(msg.cmd, role, (host, r) => remember(host, key, msg.id, r), msg.id);
    this.send({ t: 'result', id: msg.id, ...result }, from);
  }

  private async hello(msg: Hello, from: PeerId): Promise<void> {
    if (msg.build !== this.options.build) return this.send({ t: 'reload', build: this.options.build }, from);

    // Derselbe Schlüssel in einem zweiten Tab: der neue übernimmt (8.2)
    for (const [peer, key] of this.peers) {
      if (key === msg.key && peer !== from) {
        this.send({ t: 'replaced' }, peer);
        this.peers.delete(peer);
      }
    }

    // Bekannte Schlüssel bekommen ihre Rolle zurück; neue treten als Zuschauer bei und wählen dann (claim)
    let role = this.saved.host.keys[msg.key];
    if (!role) {
      role = { role: 'spectator' };
      const result = await this.persist({ state: this.state, host: withRole(this.saved.host, msg.key, role) });
      if (!result.ok) return this.send({ t: 'denied', reason: result.reason }, from);
    }
    this.peers.set(from, msg.key);
    this.send({ t: 'welcome', role, state: this.state }, from);
    this.options.onOnline?.(this.online);
  }

  /** Zuschauer nimmt einen freien Platz (über den Engine-Befehl, als SL); die neue Rolle kommt per Willkommen. */
  private async claim(key: string, msg: Extract<ToHost, { t: 'claim' }>, from: PeerId): Promise<void> {
    const role: Role = { role: 'player', seat: msg.seat };
    const result: CommandResult = this.saved.host.keys[key]?.role !== 'spectator'
      ? { ok: false, reason: { key: 'reject.invalid' } }
      : await this.execute({ type: 'table.setSeat', seat: msg.seat, occupied: true, ...(msg.name ? { name: msg.name } : {}) }, { role: 'gm' }, (h) => withRole(h, key, role), msg.id);
    this.send({ t: 'result', id: msg.id, ...result }, from);
  }

  /** Foto der SL bzw. eines Spielers annehmen (Zuschauer haben keinen Bogen); geprüft am Namen. */
  private async putPhoto(key: string, hash: string, data: string): Promise<CommandResult> {
    const photos = this.options.photos;
    const bytes = await unpackPhoto(hash, data);
    if (!photos || !bytes || this.saved.host.keys[key]?.role !== 'player') return { ok: false, reason: { key: 'reject.invalid' } };
    await photos.put(hash, bytes);
    return { ok: true };
  }

  private async sendPhoto(hash: string, to: PeerId): Promise<void> {
    const bytes = await this.options.photos?.get(hash);
    if (bytes) this.send({ t: 'photo', hash, data: toBase64(bytes) }, to);
  }

  /**
   * Der einzige Weg für Änderungen: ausführen → Host-Daten nachführen → speichern → verteilen.
   * Gemerkte Antworten werden auch für abgelehnte Befehle gespeichert, damit eine Wiederholung dieselbe Antwort bekommt.
   */
  private async execute(cmd: unknown, actor: Actor, updateHost?: (host: HostData, result: CommandResult) => HostData, cause?: string): Promise<CommandResult> {
    const r = this.engine.dispatch(this.state, cmd, actor, this.rng);
    const result: CommandResult = isRejection(r) ? { ok: false, reason: r.reason } : { ok: true };
    // Bei Ablehnung ohne etwas zu merken ändert sich nichts, also auch nichts zu speichern
    if (isRejection(r) && !updateHost) return result;

    const before = this.saved.host;
    const state = isRejection(r) ? this.state : r.state;
    const host = followSeats(updateHost ? updateHost(before, result) : before, state);
    const saved = await this.persist({ state, host });
    if (!saved.ok) return saved;
    if (isRejection(r)) return result;

    for (const peer of this.peers.keys()) this.send({ t: 'events', events: r.events, ...(cause ? { cause } : {}) }, peer);
    // Neue Rolle (Platz genommen oder von der SL freigegeben): neues Willkommen
    let roles = false;
    for (const [peer, key] of this.peers) {
      if (host.keys[key] === before.keys[key]) continue;
      this.send({ t: 'welcome', role: host.keys[key]!, state: this.state }, peer);
      roles = true;
    }
    this.options.onChange?.(this.state, r.events, cause);
    if (roles) this.options.onOnline?.(this.online);
    return result;
  }

  private async persist(next: Saved<G>): Promise<CommandResult> {
    try {
      await this.store.save(next);
      this.saved = next;
      return { ok: true };
    } catch (error) {
      this.options.onSaveError?.(error);
      return { ok: false, reason: { key: 'reject.saveFailed' } };
    }
  }
}

const withRole = (host: HostData, key: string, role: Role): HostData => ({ ...host, keys: { ...host.keys, [key]: role } });

/** Rollen folgen dem Stand: Wessen Platz frei geworden ist (die SL gibt ihn frei, 8.2), der ist wieder Zuschauer. */
function followSeats<G>(host: HostData, state: TableState<G>): HostData {
  const freed = Object.entries(host.keys).filter(([, r]) => r.role === 'player' && !state.seats[r.seat].occupied);
  if (freed.length === 0) return host;
  return { ...host, keys: { ...host.keys, ...Object.fromEntries(freed.map(([key]) => [key, { role: 'spectator' } as Role])) } };
}

/** Antwort merken; ändert nur die Liste dieses Schlüssels (die übrigen Teile werden geteilt). */
function remember(host: HostData, key: string, id: string, result: CommandResult): HostData {
  const list: [string, CommandResult][] = [...(host.answered[key] ?? []), [id, result]];
  return { ...host, answered: { ...host.answered, [key]: list.slice(-REMEMBERED_COMMANDS) } };
}
