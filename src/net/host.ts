// Host (ARCHITEKTUR.md 8.2): hält den maßgeblichen Stand, prüft Befehle, speichert, verteilt Ereignisse.
// Befehle werden strikt nacheinander bearbeitet: ausführen → speichern → bestätigen und verteilen.

import { isRejection } from '../engine/commands';
import type { Engine } from '../engine/dispatch';
import { NewerFormatError } from '../engine/migrate';
import { cryptoRng } from '../engine/rng';
import type { Actor, Rng, SequencedEvent, TableState } from '../engine/types';
import { unpackPhoto, toBase64, type PhotoBank } from './photos';
import { readArchive, writeArchive, type Photos } from './archive';
import type { RoomLink } from './room-link';
import { INVALID, ToHost, type CommandResult, type Role, type ToClient } from './protocol';
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

/** Automatische Sicherung des Stands (A34): vor dem Zurücksetzen, vor einem Import, vor dem Wiederherstellen. */
export type Backup<G> = { id: string; at: number; reason: string; state: TableState<G> };
export type BackupInfo = Omit<Backup<unknown>, 'state'>;
/** so viele Sicherungen bleiben */
export const KEEP_BACKUPS = 5;
export const backupInfo = ({ id, at, reason }: BackupInfo): BackupInfo => ({ id, at, reason });

/** Ablage der Sicherungen; sie hebt nur die letzten auf. */
export interface BackupStore<G> {
  add(backup: Backup<G>): Promise<void>;
  /** neueste zuerst */
  list(): Promise<BackupInfo[]>;
  get(id: string): Promise<Backup<G> | null>;
}

export type HostOptions<G> = {
  build: string;
  rng?: Rng;
  /** Speichern fehlgeschlagen: Befehl verworfen, SL bekommt eine deutliche Warnung (8.2) */
  onSaveError?: (error: unknown) => void;
  /** nach jedem angenommenen Befehl; `cause` = Befehls-ID, falls bekannt; `own` = per `submit` aus diesem Browser */
  onChange?: (state: TableState<G>, events: SequencedEvent[], cause: string | undefined, own: boolean) => void;
  /** wer verbunden ist, hat sich geändert (Beitritt, Abbruch, neue Rolle) */
  onOnline?: (online: Role[]) => void;
  /** Fotos (8.4); fehlt: Fotos werden weder angenommen noch verteilt */
  photos?: PhotoBank;
  /** Sicherungen (A34), vor Befehlen mit `backup` und vor dem Ersetzen des Stands; fehlt: keine */
  backups?: BackupStore<G>;
  /** Stand wurde ersetzt (Datei geladen, Sicherung wiederhergestellt); `reason` wie bei der Sicherung */
  onReplaced?: (reason: string) => void;
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
      this.onlineChanged();
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
    this.onlineChanged();
  }

  /** Sicherungsdatei: Stand, Plätze, Raum und die Fotos, auf die der Stand verweist (8.2). */
  async exportArchive(): Promise<string> {
    const saved = this.saved;
    const hashes = [...new Set(this.engine.ruleset.photosOf?.(saved.state.game))];
    const found = await Promise.all(hashes.map(async (hash) => [hash, await this.options.photos?.get(hash)] as const));
    const photos: Photos = new Map(found.filter((e): e is [string, Uint8Array] => e[1] !== undefined));
    return writeArchive(saved, photos);
  }

  /** Sicherungsdatei laden: ersetzt den Stand (vorher wird gesichert); ohne Raum in der Datei bleibt der bisherige. */
  importArchive(text: string): Promise<CommandResult> {
    return this.enqueue(async () => {
      const read = await readArchive(this.engine, text).catch((e: unknown) => (e instanceof NewerFormatError ? 'reject.importNewer' : 'reject.importInvalid'));
      if (typeof read === 'string') return { ok: false, reason: { key: read } };
      await Promise.all([...read.photos].map(([hash, bytes]) => this.options.photos?.put(hash, bytes)));
      const { state, host } = read.saved;
      return this.swap({ state, host: host.room || !this.room ? host : { ...host, room: this.room } }, 'import');
    });
  }

  /** Sicherung wiederherstellen: nur der Stand, Plätze und Raum bleiben (wer keinen Platz mehr hat, wird Zuschauer). */
  restore(id: string): Promise<CommandResult> {
    return this.enqueue(async () => {
      const backup = await this.options.backups?.get(id);
      if (!backup) return INVALID;
      const state = this.engine.parseState(backup.state);
      return this.swap({ state, host: followSeats(this.saved.host, state) }, 'restore');
    });
  }

  /** vorhandene Sicherungen, neueste zuerst */
  backups(): Promise<BackupInfo[]> {
    return this.options.backups?.list() ?? Promise.resolve([]);
  }

  /** Ganzen Stand ersetzen; alle bekommen ihn samt Anlass (für das Protokoll). */
  private async swap(next: Saved<G>, reason: string): Promise<CommandResult> {
    await this.backup(reason);
    const saved = await this.persist(next);
    if (!saved.ok) return saved;
    this.broadcast({ t: 'state', state: this.state, reason });
    this.options.onChange?.(this.state, [], undefined, true);
    this.options.onReplaced?.(reason);
    return saved;
  }

  private async backup(reason: string): Promise<void> {
    await this.options.backups?.add({ id: crypto.randomUUID(), at: Date.now(), reason, state: this.state });
  }

  /** Befehl der Spielleitung (im Browser des Hosts); `id` kommt in onChange als Auslöser zurück. */
  submit(cmd: unknown, id?: string): Promise<CommandResult> {
    return this.enqueue(() => this.execute(cmd, { role: 'gm' }, undefined, id, true));
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

  private onlineChanged(): void {
    this.options.onOnline?.(this.online);
  }

  private send(msg: ToClient, to: PeerId): void {
    this.transport.send(msg, to);
  }

  /** an alle, die beigetreten sind */
  private broadcast(msg: ToClient): void {
    for (const peer of this.peers.keys()) this.send(msg, peer);
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
    this.onlineChanged();
  }

  /** Zuschauer nimmt einen freien Platz (über den Engine-Befehl, als SL); die neue Rolle kommt per Willkommen. */
  private async claim(key: string, msg: Extract<ToHost, { t: 'claim' }>, from: PeerId): Promise<void> {
    const role: Role = { role: 'player', seat: msg.seat };
    const result: CommandResult = this.saved.host.keys[key]?.role !== 'spectator'
      ? INVALID
      : await this.execute({ type: 'table.setSeat', seat: msg.seat, occupied: true, ...(msg.name ? { name: msg.name } : {}) }, { role: 'gm' }, (h, r) => (r.ok ? withRole(h, key, role) : h), msg.id);
    this.send({ t: 'result', id: msg.id, ...result }, from);
  }

  /** Foto der SL bzw. eines Spielers annehmen (Zuschauer haben keinen Bogen); geprüft am Namen. */
  private async putPhoto(key: string, hash: string, data: string): Promise<CommandResult> {
    const photos = this.options.photos;
    const bytes = await unpackPhoto(hash, data);
    if (!photos || !bytes || this.saved.host.keys[key]?.role !== 'player') return INVALID;
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
  private async execute(cmd: unknown, actor: Actor, updateHost?: (host: HostData, result: CommandResult) => HostData, cause?: string, own = false): Promise<CommandResult> {
    const r = this.engine.dispatch(this.state, cmd, actor, this.rng);
    const result: CommandResult = isRejection(r) ? { ok: false, reason: r.reason } : { ok: true };
    // Bei Ablehnung ohne etwas zu merken ändert sich nichts, also auch nichts zu speichern
    if (isRejection(r) && !updateHost) return result;
    const type = (cmd as { type: string }).type;
    if (!isRejection(r) && this.engine.commands[type]?.backup) await this.backup(type);

    const state = isRejection(r) ? this.state : r.state;
    const host = followSeats(updateHost ? updateHost(this.saved.host, result) : this.saved.host, state);
    const saved = await this.persist({ state, host });
    if (!saved.ok) return saved;
    if (isRejection(r)) return result;

    this.broadcast({ t: 'events', events: r.events, ...(cause ? { cause } : {}) });
    this.options.onChange?.(this.state, r.events, cause, own);
    return result;
  }

  /** Einzige Stelle, an der Stand und Host-Daten wechseln. Neue Rolle eines Verbundenen
   *  (Platz genommen oder von der SL freigegeben): neues Willkommen. */
  private async persist(next: Saved<G>): Promise<CommandResult> {
    try {
      await this.store.save(next);
      const before = this.saved.host.keys;
      this.saved = next;
      const changed = [...this.peers].filter(([, key]) => next.host.keys[key] !== before[key]);
      for (const [peer, key] of changed) this.send({ t: 'welcome', role: next.host.keys[key]!, state: next.state }, peer);
      if (changed.length > 0) this.onlineChanged();
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
  return freed.reduce((h, [key]) => withRole(h, key, { role: 'spectator' }), host);
}

/** Antwort merken; ändert nur die Liste dieses Schlüssels (die übrigen Teile werden geteilt). */
function remember(host: HostData, key: string, id: string, result: CommandResult): HostData {
  const list: [string, CommandResult][] = [...(host.answered[key] ?? []), [id, result]];
  return { ...host, answered: { ...host.answered, [key]: list.slice(-REMEMBERED_COMMANDS) } };
}
