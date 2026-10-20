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
import type { Actor, CardId, Event, FreePos, SeatId, TableState, TextRef } from '../engine/types';
import { Client, type ClientStatus } from '../net/client';
import { Host, type BackupInfo } from '../net/host';
import { localTransport } from '../net/local';
import { Presence, type PresenceInfo } from '../net/presence';
import type { CommandResult, Role } from '../net/protocol';
import { createRoomLink, formatHash, parseHash, randomToken, sameRoom, type RoomLink } from '../net/room-link';
import { TrysteroRoom } from '../net/trystero';
import type { Transport } from '../net/transport';
import { createKlioRuleset } from '../rules/klio/ruleset';
import type { KlioState } from '../rules/klio/state';
import { copyText } from './clipboard';
import { photos } from './photos.svelte';
import { saveFile } from './files';
import { IdbBackups, IdbStore } from './storage';
import { t } from './texts';
import { view } from './view.svelte';

export type KlioTableState = TableState<KlioState>;
/** `own`: ausgelöst von einem Befehl aus diesem Browser */
type Listener = (events: Event[], own: boolean) => void;
type CommandListener = (cmd: { type: string; [key: string]: unknown }) => void;
type ReplacedListener = (reason: string) => void;

const NOT_READY: CommandResult = { ok: false, reason: { key: 'reject.invalid' } };

/** Abgelegte Karten, deren Befehl noch nicht bestätigt ist: bleiben an der Ablegestelle (8.2). */
export type PendingDrop = { cards: CardId[]; dx: number; dy: number };
type Pending = PendingDrop & { id: string };

export type Mode = 'local' | 'host' | 'client';
/** Verbindungszustand (nur für Mitspieler bzw. eine blockierte SL von Bedeutung) */
export type Status = 'starting' | 'otherTab' | ClientStatus;

export const ruleset = createKlioRuleset(content);
const engine = createEngine(ruleset);

const KEY = 'klio.key';
const NAME = 'klio.name';
const HOST_LOCK = 'klio-tisch-host';
const CHANNEL = 'msg';
const PRESENCE = 'presence';

/** Geheimer Wiederverbindungs-Schlüssel dieses Browsers (8.2), einmalig erzeugt. */
function reconnectKey(): string {
  let key = localStorage.getItem(KEY);
  if (!key) localStorage.setItem(KEY, (key = randomToken()));
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

const sameRole = (a: Role | null, b: Role | null) => JSON.stringify(a) === JSON.stringify(b);

class Session {
  mode = $state<Mode>('local');
  status = $state<Status>('starting');
  state = $state.raw<KlioTableState | null>(null);
  role = $state.raw<Role | null>(null);
  /** wer hier bedient: im lokalen Betrieb und als Host die Spielleitung */
  actor = $derived<Actor>(this.mode === 'client' ? (this.role ?? { role: 'spectator' }) : { role: 'gm' });
  /** Host: Rollen der verbundenen Mitspieler und Zuschauer */
  online = $state.raw<Role[]>([]);
  saveError = $state<string | null>(null);
  pending = $state.raw<Pending[]>([]);
  /** Mauszeiger der anderen (8.3) */
  cursors = $state.raw<[string, PresenceInfo][]>([]);
  /** von anderen gerade gezogene Karten → Rolle; ändert sich nur, wenn jemand greift oder loslässt */
  dragged = $state.raw<ReadonlyMap<CardId, PresenceInfo['who']>>(new Map());

  private host: Host<KlioState> | null = null;
  private client: Client<KlioState> | null = null;
  private presence: Presence | null = null;
  private listeners = new Set<Listener>();
  private commandListeners = new Set<CommandListener>();
  private replacedListeners = new Set<ReplacedListener>();
  private nextId = 0;

  /** Text zum Verbindungszustand (Raumleiste, Wartebildschirm) */
  get statusText(): string {
    const key = this.status === 'starting' || this.status === 'ready' ? 'connecting' : this.status;
    return t(`room.${key}`);
  }

  async start(): Promise<void> {
    const link = parseHash(location.hash);
    const store = new IdbStore<KlioState>();
    const saved = await store.load();
    if (link && !sameRoom(saved?.host.room, link)) return this.startClient(link);

    // Spielstand nur einmal laden: Host.start bekommt das schon Gelesene
    this.host = await Host.start(engine, localTransport(), { load: async () => saved, save: (s) => store.save(s) }, () => initialTable(ruleset, cryptoRng()), {
      build: __BUILD_ID__,
      onSaveError: (e) => (this.saveError = String(e)),
      onChange: (state, events, cause, own) => this.changed(state, events.map((e) => e.event), cause, own),
      onOnline: (online) => (this.online = online),
      photos,
      backups: new IdbBackups(),
      onReplaced: (reason) => this.replaced(reason),
    });
    this.state = this.host.state;
    if (link) await this.openRoom(link);
  }

  /** Spielleitung: Mitspieler einladen. Nutzt den gespeicherten Raum der Kampagne oder legt einen an (ehem. O10). */
  async invite(): Promise<void> {
    if (this.host) await this.useRoom(this.host.room ?? createRoomLink());
  }

  /** Neuer Link (neue Raum-ID und neues Passwort): Der alte gilt nicht mehr, die Plätze bleiben (8.2). */
  async renewLink(): Promise<void> {
    if (this.mode === 'host') await this.useRoom(createRoomLink());
  }

  // ---------- Spielstand der SL: Datei und Sicherungen (8.2, A34) ----------

  /** Ganzen Spielstand samt Fotos als Datei speichern. */
  async exportFile(): Promise<void> {
    if (this.host) saveFile(`klio-tisch-${new Date().toISOString().slice(0, 10)}.json`, await this.host.exportArchive());
  }

  /** Datei laden und den Stand ersetzen (vorher wird gesichert); bringt sie einen anderen Raum mit, dorthin wechseln. */
  async importFile(file: File): Promise<CommandResult> {
    if (!this.host) return NOT_READY;
    const before = this.host.room;
    const r = await this.host.importArchive(await file.text());
    const room = this.host.room;
    if (r.ok && room && this.mode === 'host' && !sameRoom(before, room)) await this.useRoom(room);
    return r;
  }

  backups(): Promise<BackupInfo[]> {
    return this.host?.backups() ?? Promise.resolve([]);
  }

  async restore(id: string): Promise<CommandResult> {
    return this.host?.restore(id) ?? NOT_READY;
  }

  /** Einladungslink in die Zwischenablage; Meldung `done` nur bei Erfolg. */
  async copyInvite(done = 'room.copied'): Promise<void> {
    const room = this.host?.room;
    if (room && (await copyText(`${location.origin}${location.pathname}${formatHash(room)}`))) view.say(t(done));
  }

  /** Raum merken, in den Link schreiben und betreten (als Host schon im Raum: nur die Verbindung wechseln). */
  private async useRoom(link: RoomLink): Promise<void> {
    if (!sameRoom(this.host!.room, link)) await this.host!.setRoom(link);
    history.replaceState(null, '', formatHash(link));
    if (this.mode === 'host') this.host!.attach(this.connect(link));
    else await this.openRoom(link);
  }

  /** Host im Raum: eine Sperre je Browser, dann die Verbindung umstellen. */
  private async openRoom(link: RoomLink): Promise<void> {
    if (!(await acquireHostLock())) {
      this.state = null;
      this.status = 'otherTab';
      return;
    }
    this.host!.attach(this.connect(link));
    this.mode = 'host';
  }

  /** Raum betreten: Spielkanal für Host bzw. Client, daneben die Mauszeiger. */
  private connect(link: RoomLink): Transport {
    const room = new TrysteroRoom(link);
    this.presence?.close();
    this.presence = new Presence(room.channel(PRESENCE), (others) => this.othersMoved(others));
    return room.channel(CHANNEL);
  }

  private othersMoved(others: ReadonlyMap<string, PresenceInfo>): void {
    this.cursors = [...others];
    const dragged = new Map([...others.values()].flatMap((p) => p.drag.map((c) => [c, p.who] as const)));
    if (JSON.stringify([...dragged]) !== JSON.stringify([...this.dragged])) this.dragged = dragged;
  }

  /** Wird der eigene Zeiger übertragen? (nur im Raum) */
  get sharesPointer(): boolean {
    return this.presence !== null;
  }

  /** Eigener Mauszeiger und gezogene Karten für die anderen; `at` null = nicht über dem Tisch.
   *  Den Namen eines Spielers kennen alle aus dem Stand; mit geschickt wird er nur für Zuschauer. */
  pointer(at: FreePos | null, drag: CardId[]): void {
    const r = this.actor;
    const who = r.role === 'gm' ? 'gm' : r.role === 'player' ? r.seat : 'spectator';
    this.presence?.set({ who, name: who === 'spectator' ? this.savedName : '', at, drag });
  }

  private startClient(link: RoomLink): void {
    this.mode = 'client';
    const client: Client<KlioState> = new Client(engine, this.connect(link), {
      build: __BUILD_ID__,
      key: reconnectKey(),
      name: this.savedName,
      onChange: () => {
        this.status = client.status;
        if (!sameRole(this.role, client.role)) this.role = client.role;
        if (client.state && client.state !== this.state) this.state = client.state;
      },
      onEvents: (events, cause, own) => this.changed(client.state!, events, cause, own),
      photos,
      onReplaced: (reason) => this.replaced(reason),
      onWarning: (w) => {
        if (w.kind === 'secondHost') view.say(t('room.secondHost'), true);
      },
    });
    this.client = client;
    this.status = client.status;
  }

  /** Foto soll angezeigt werden: aus der eigenen Ablage, sonst (als Client) beim Host anfragen (8.4). */
  async wantPhoto(hash: string): Promise<void> {
    if (!(await photos.load(hash))) this.client?.requestPhoto(hash);
  }

  get savedName(): string {
    return localStorage.getItem(NAME) ?? '';
  }

  /** Als Zuschauer einen freien Platz nehmen; Ergebnis für die Anzeige im Beitrittsfenster. */
  async claim(seat: SeatId, name: string): Promise<TextRef | null> {
    localStorage.setItem(NAME, name);
    const r = await this.client?.claim(seat, name);
    return r && !r.ok ? r.reason : null;
  }

  async submit(cmd: { type: string }, drop?: PendingDrop): Promise<CommandResult> {
    if (!this.host && !this.client) return NOT_READY;
    const id = `ui-${Date.now().toString(36)}-${++this.nextId}`;
    for (const cb of this.commandListeners) cb(cmd as { type: string });
    if (drop) this.pending = [...this.pending, { ...drop, id }];
    const result = await (this.host ? this.host.submit(cmd, id) : this.client!.submit(cmd, id));
    if (drop) this.pending = this.pending.filter((d) => d.id !== id);
    return result;
  }

  /** Foto ablegen und (als Client) zugleich zum Host bringen, bevor ein Befehl es einträgt (8.4). */
  async addPhoto(hash: string, bytes: Uint8Array): Promise<CommandResult> {
    const [, result] = await Promise.all([photos.put(hash, bytes), this.client?.uploadPhoto(hash, bytes) ?? { ok: true as const }]);
    return result;
  }

  /** Darf der aktuelle Nutzer diesen Befehl? Zum Ausblenden von Knöpfen (9.3); verbindlich prüft der Host. */
  can(cmd: { type: string; [key: string]: unknown }): boolean {
    const def = engine.commands[cmd.type];
    if (!def || !this.state) return false;
    if (this.actor.role === 'gm') return true;
    try {
      return can(this.actor, def, cmd, this.state as TableState<unknown>, ruleset.permissions);
    } catch {
      // Angaben für „nur das Eigene“ fehlen noch (z. B. das Ziel beim Greifen): anzeigen, der Host prüft beim Absenden
      return true;
    }
  }

  /** Jeder Befehl aus diesem Browser, beim Absenden (z. B. eigene Eingaben merken). */
  onSubmit(cb: CommandListener): () => void {
    this.commandListeners.add(cb);
    return () => this.commandListeners.delete(cb);
  }

  /** Die SL hat den ganzen Stand ersetzt (Datei, Sicherung); `reason` wie bei der Sicherung. */
  onReplaced(cb: ReplacedListener): () => void {
    this.replacedListeners.add(cb);
    return () => this.replacedListeners.delete(cb);
  }

  private replaced(reason: string): void {
    for (const cb of this.replacedListeners) cb(reason);
  }

  /** Ereignisse für Meldungen und Animationen. */
  onEvents(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Neuer Stand mit Ereignissen; die Ablage des auslösenden Befehls ist damit bestätigt. */
  private changed(state: KlioTableState, events: Event[], cause: string | undefined, own: boolean): void {
    this.state = state;
    if (cause && this.pending.some((d) => d.id === cause)) this.pending = this.pending.filter((d) => d.id !== cause);
    if (events.length > 0) for (const cb of this.listeners) cb(events, own);
  }
}

export const session = new Session();
