// Sitzung im Browser: verbindet Oberfläche, Spielstand und Verbindung (ARCHITEKTUR.md 8).
// Drei Betriebsarten, bestimmt durch den Link:
//   ohne Raum im Link        → lokal (allein bzw. Bildschirmfreigabe wie bisher), man ist Spielleitung
//   Raum im Link, eigener    → Spielleitung als Host über Trystero (Raum steht in den Host-Daten)
//   Raum im Link, fremder    → Mitspieler bzw. Zuschauer als Client

import content from 'virtual:klio-content';
import { createEngine } from '../engine/dispatch';
import { can, canSome } from '../engine/permissions';
import { cryptoRng, seededRng } from '../engine/rng';
import { seatNo } from '../engine/zones';
import { initialTable } from '../engine/setup';
import { SEATS, type Actor, type CardId, type EngineEvent, type Event, type SeatId, type TableState, type TextRef, type ZoneId } from '../engine/types';
import { Client, type ClientStatus } from '../net/client';
import { Host, type BackupInfo, type Online } from '../net/host';
import { localTransport } from '../net/local';
import { Presence, type PointerPos, type PresenceInfo } from '../net/presence';
import { INVALID, type CommandResult, type Role } from '../net/protocol';
import { createRoomLink, formatHash, parseHash, randomToken, sameRoom, type RoomLink } from '../net/room-link';
import { TrysteroRoom } from '../net/trystero';
import type { Transport } from '../net/transport';
import type { KlioEvent } from '../rules/klio/events';
import { createKlioRuleset } from '../rules/klio/ruleset';
import type { KlioState } from '../rules/klio/state';
import { Arrivals, type ArrivalSignal } from './arrivals';
import { copyText } from './clipboard';
import { photos } from './photos.svelte';
import { movedCards, RemoteDrags, type RemoteDrag, type Who } from './remoteDrags';
import { saveFile } from './files';
import { seatNames } from './seatNames';
import { IdbBackups, IdbStore } from './storage';
import { t } from './texts';
import { view } from './view.svelte';

export type KlioTableState = TableState<KlioState>;
/** `own`: ausgelöst von einem Befehl aus diesem Browser */
/** `prev`: Stand vor den Ereignissen (null beim ersten Stand) */
type Listener = (events: (EngineEvent | KlioEvent)[], own: boolean, prev: KlioTableState | null) => void;
type CommandListener = (cmd: { type: string; [key: string]: unknown }) => void;
type ReplacedListener = (reason: string) => void;
/** Kommen und Gehen (11.7) mit dem Stand, zu dem es gehört */
type ArrivalListener = (signals: ArrivalSignal[], state: KlioTableState) => void;

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
/** zuletzt bekannter Platz je Raum: Umsetzen bemerken, das ohne Verbindung geschah (8.7) */
const SEAT = (room: string) => `klio.seat.${room}`;
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
  /** Host: verbundene Mitspieler und Zuschauer mit Rolle und Namen */
  online = $state.raw<Online[]>([]);
  saveError = $state<string | null>(null);
  pending = $state.raw<Pending[]>([]);
  /** Mauszeiger der anderen (8.3) */
  cursors = $state.raw<[string, PresenceInfo][]>([]);
  /** von anderen gerade gezogene (bzw. abgelegte, noch nicht bestätigte) Karten, folgen deren Zeiger (8.3) */
  remoteDrags = $state.raw<RemoteDrag[]>([]);
  /** von anderen angewählte Stapel → wer */
  openZones = $state.raw<ReadonlyMap<ZoneId, Who>>(new Map());
  /** Plätze, die als „nicht da“ gezeigt werden (11.7); im lokalen Betrieb keine */
  away = $state.raw<ReadonlySet<SeatId>>(new Set());

  private host: Host<KlioState> | null = null;
  private client: Client<KlioState> | null = null;
  private presence: Presence | null = null;
  private room: TrysteroRoom | null = null;
  /** Wer ist da (11.7): erst mit Raum und Stand; zuletzt gemeldete Zeiger der anderen */
  private arrivals: Arrivals | null = null;
  private others: ReadonlyMap<string, PresenceInfo> = new Map();
  private arrivalTimer: ReturnType<typeof setTimeout> | undefined;
  private arrivalListeners = new Set<ArrivalListener>();
  private remote = new RemoteDrags();
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private expiryAt: number | null = null;
  /** eigene flüchtige Lage (8.3); `dropped` bleibt bis zum nächsten Greifen, damit es die Bündelung übersteht */
  private mine: { at: PointerPos | null; drag: CardId[]; grab: PointerPos | null; dropped: string | null; open: ZoneId | null } = { at: null, drag: [], grab: null, dropped: null, open: null };
  private listeners = new Set<Listener>();
  private commandListeners = new Set<CommandListener>();
  private replacedListeners = new Set<ReplacedListener>();
  private nextId = 0;

  /** Text zum Verbindungszustand (Hinweis am Menü, Wartebildschirm) */
  get statusText(): string {
    const key = this.status === 'starting' || this.status === 'ready' ? 'connecting' : this.status;
    return t(`room.${key}`);
  }

  /** Störung: alles außer Starten, Verbinden und Verbunden (Hinweis am Menü, 10) */
  get trouble(): boolean {
    return !['starting', 'connecting', 'ready'].includes(this.status);
  }

  /** Punkt am Menüknopf: lokal grau, verbunden grün, gestört rot; beim Verbinden noch grau (10) */
  get health(): 'local' | 'ok' | 'trouble' {
    if (this.mode === 'local') return 'local';
    if (this.trouble) return 'trouble';
    return this.mode === 'host' || this.status === 'ready' ? 'ok' : 'local';
  }

  /** Mitspieler ohne Platz: darf einen wählen (Platzwahl, Menü) */
  get seatless(): boolean {
    return this.mode === 'client' && this.status === 'ready' && this.role?.role === 'spectator';
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
      onChange: (state, events, cause, own) => this.changed(state, events.map((e) => e.event), cause, own, this.state),
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
    if (!this.host) return INVALID;
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
    return this.host?.restore(id) ?? INVALID;
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
    this.room = room;
    this.presence?.close();
    this.resetArrivals();
    this.presence = new Presence(room.channel(PRESENCE), (others) => this.othersMoved(others));
    return room.channel(CHANNEL);
  }

  /** Raum verlassen (in einem anderen Tab geöffnet): sonst meldete dieser Tab weiter seinen Platz (11.7) */
  private leaveRoom(): void {
    if (!this.room) return;
    this.presence?.close();
    this.presence = null;
    this.room.leave();
    this.room = null;
    this.resetArrivals();
    this.cursors = [];
  }

  // ---------- Wer ist da (11.7) ----------

  /** Kommen und Gehen an den Plätzen; nur im Raum. */
  onArrivals(cb: ArrivalListener): () => void {
    this.arrivalListeners.add(cb);
    return () => this.arrivalListeners.delete(cb);
  }

  private resetArrivals(): void {
    clearTimeout(this.arrivalTimer);
    this.arrivals = null;
    this.away = new Set();
  }

  private get ownSeat(): SeatId | null {
    const r = this.actor;
    return r.role === 'player' ? r.seat : null;
  }

  /** Neues an die Anwesenheit geben. Sie beginnt mit dem ersten Stand im Raum (Anfangszustand, still). */
  private arrive(feed: (a: Arrivals, now: number) => ArrivalSignal[]): void {
    const state = this.state;
    if (!this.presence || !state) return;
    const now = Date.now();
    if (!this.arrivals) {
      this.arrivals = new Arrivals(state.seats, this.ownSeat, now);
      this.arrivals.presence(this.others, now);
    }
    this.announce(feed(this.arrivals, now), state);
  }

  private announce(signals: ArrivalSignal[], state: KlioTableState): void {
    const a = this.arrivals!;
    const away = new Set(SEATS.filter((s) => !a.present(s)));
    if (away.size !== this.away.size || [...away].some((s) => !this.away.has(s))) this.away = away;
    if (signals.length > 0) for (const cb of this.arrivalListeners) cb(signals, state);
    clearTimeout(this.arrivalTimer);
    const next = a.nextDeadline();
    if (next !== null) this.arrivalTimer = setTimeout(() => this.arrive((x, now) => x.tick(now)), Math.max(0, next - Date.now()));
  }

  private othersMoved(others: ReadonlyMap<string, PresenceInfo>): void {
    this.others = new Map(others);
    this.arrive((a, now) => a.presence(this.others, now));
    this.cursors = [...others];
    this.remote.update(others, Date.now());
    this.showRemote();
  }

  /** Geändertes bei gezogenen Karten und angewählten Stapeln der anderen anzeigen; Zeitgeber für die nächste Haltefrist. */
  private showRemote(): void {
    const changes = this.remote.takeChanges();
    if (changes.drags) this.remoteDrags = this.remote.drags();
    if (changes.open) this.openZones = this.remote.openZones();
    const next = this.remote.nextExpiry();
    if (next === this.expiryAt) return;
    clearTimeout(this.expiryTimer);
    this.expiryAt = next;
    if (next !== null) {
      this.expiryTimer = setTimeout(() => {
        this.expiryAt = null;
        this.remote.expire(Date.now());
        this.showRemote();
      }, Math.max(0, next - Date.now()));
    }
  }

  /** Wird der eigene Zeiger übertragen? (nur im Raum) */
  get sharesPointer(): boolean {
    return this.presence !== null;
  }

  /** Eigener Mauszeiger und gezogene Karten für die anderen; `at` null = nicht über dem Tisch.
   *  Den Namen eines Spielers kennen alle aus dem Stand; mit geschickt wird er nur für Zuschauer. */
  pointer(at: PointerPos | null, drag: CardId[], grab: PointerPos | null = null): void {
    this.mine = { ...this.mine, at, drag, grab, dropped: drag.length ? null : this.mine.dropped };
    this.sendMine();
  }

  /** Eigenes offenes Stapelmenü für die anderen (8.3). */
  shareOpen(zone: ZoneId | null): void {
    if (zone === this.mine.open) return;
    this.mine = { ...this.mine, open: zone };
    this.sendMine();
  }

  private sendMine(): void {
    const r = this.actor;
    const who = r.role === 'gm' ? 'gm' : r.role === 'player' ? r.seat : 'spectator';
    this.presence?.set({ who, name: who === 'spectator' ? this.savedName : '', ...this.mine });
  }

  private startClient(link: RoomLink): void {
    this.mode = 'client';
    /** Stand vor den letzten Ereignissen: `onChange` kommt vor `onEvents` und setzt schon den neuen */
    let before: KlioTableState | null = null;
    const client: Client<KlioState> = new Client(engine, this.connect(link), {
      build: __BUILD_ID__,
      key: reconnectKey(),
      name: this.savedName,
      onChange: () => {
        this.status = client.status;
        if (client.status === 'replaced') this.leaveRoom();
        const roleChanged = !sameRole(this.role, client.role);
        const first = this.role === null;
        if (roleChanged) this.role = client.role;
        if (client.state && client.state !== this.state) {
          before = this.state;
          this.state = client.state;
        }
        this.arrive((a, now) => a.seatsChanged(this.state!.seats, now));
        if (roleChanged) this.roleChanged(link.room, first, client.roleBy);
      },
      onEvents: (events, cause, own) => this.changed(client.state!, events, cause, own, before),
      photos,
      onReplaced: (reason) => this.replaced(reason),
      onWarning: (w) => {
        if (w.kind === 'secondHost') view.say(t('room.secondHost'), true);
      },
    });
    this.client = client;
    this.status = client.status;
  }

  /** Neue Rolle (8.7): Zeiger sofort mit der neuen Rolle melden, Trumpfwahl zum alten Platz schließen. Kommt der
   *  Platz von der SL (zugewiesen, umgesetzt, getauscht) oder ist es beim Beitritt ein anderer als zuletzt, sagen,
   *  wohin. Wer selbst wählt oder freigegeben wurde, bekommt keine Meldung. */
  private roleChanged(room: string, first: boolean, by: 'gm' | null): void {
    const r = this.role;
    const before = localStorage.getItem(SEAT(room));
    if (r?.role === 'player') localStorage.setItem(SEAT(room), r.seat);
    else localStorage.removeItem(SEAT(room));
    view.trumpDialog = null;
    this.sendMine();
    this.arrive((a, now) => a.setSelf(this.ownSeat, now));
    if (r?.role !== 'player' || !this.state) return;
    if (by !== 'gm' && !(first && before && before !== r.seat)) return;
    const names = seatNames(this.state, r.seat);
    const n = seatNo(r.seat);
    view.say(names.character !== t('room.player', { n }) ? t('room.movedAs', { n, character: names.character }) : t('room.moved', { n }));
  }

  /** Foto soll angezeigt werden: aus der eigenen Ablage, sonst (als Client) beim Host anfragen (8.4). */
  async wantPhoto(hash: string): Promise<void> {
    if (!(await photos.load(hash))) this.client?.requestPhoto(hash);
  }

  /** gemerkter Name für den nächsten Beitritt (einmal gelesen; der Zeiger sendet ihn bei jeder Bewegung) */
  #savedName = localStorage.getItem(NAME) ?? '';
  get savedName(): string {
    return this.#savedName;
  }
  private rememberName(name: string): void {
    this.#savedName = name;
    localStorage.setItem(NAME, name);
  }

  /** Eigener Name und eigene Farbe (5e): am Platz im Stand, für alle; als Zuschauer nur der Name am Zeiger.
   *  Der Name wird für den nächsten Beitritt gemerkt. */
  async editProfile(name: string, color?: string): Promise<CommandResult> {
    this.rememberName(name);
    const a = this.actor;
    if (a.role !== 'player') {
      this.sendMine();
      this.client?.setName(name);
      return { ok: true };
    }
    const cmd = { type: 'seat.edit', seat: a.seat, name, ...(color ? { color } : {}) };
    return this.submit(cmd);
  }

  /** Nur zuschauen (Beitrittsfenster): der Name geht an die SL, damit sie weiß, wer zuschaut (8.7). */
  watch(name: string): void {
    this.rememberName(name);
    this.client?.setName(name);
    this.sendMine();
  }

  /** SL: verbundenen Zuschauer auf einen freien Platz setzen (8.7). */
  assign(peer: string, seat: SeatId): Promise<CommandResult> {
    return this.host?.assign(peer, seat) ?? Promise.resolve(INVALID);
  }

  /** Als Zuschauer einen freien Platz nehmen; Ergebnis für die Anzeige im Beitrittsfenster. */
  async claim(seat: SeatId, name: string): Promise<TextRef | null> {
    this.rememberName(name);
    const r = await this.client?.claim(seat, name);
    return r && !r.ok ? r.reason : null;
  }

  async submit(cmd: { type: string }, drop?: PendingDrop): Promise<CommandResult> {
    if (!this.host && !this.client) return INVALID;
    const id = `ui-${Date.now().toString(36)}-${++this.nextId}`;
    for (const cb of this.commandListeners) cb(cmd);
    if (drop) {
      this.pending = [...this.pending, { ...drop, id }];
      // losgelassen: die anderen halten die Karte, bis das Ereignis zu dieser ID kommt (8.3)
      this.mine = { ...this.mine, drag: [], grab: null, dropped: id };
      this.sendMine();
    }
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
    return can(this.actor, def, cmd, this.state as TableState<unknown>, ruleset.permissions);
  }

  /** Darf der aktuelle Nutzer diesen Befehl für irgendetwas? Wenn Angaben noch fehlen (z. B. das Ziel beim Greifen). */
  canSome(type: string): boolean {
    const def = engine.commands[type];
    if (!def || !this.state) return false;
    return canSome(this.actor, def, this.state as TableState<unknown>, ruleset.permissions);
  }

  /** Probelauf (Vorschau der Ablegestelle, 11.6): der Stand nach dem Befehl, ohne ihn zu senden; null, wenn er
   *  abgelehnt würde. Gleicher Stand und Befehl wie beim letzten Aufruf: dasselbe Ergebnis, ohne neu zu rechnen. */
  predict(cmd: { type: string; [key: string]: unknown }): KlioTableState | null {
    const state = this.state;
    if (!state) return null;
    const key = JSON.stringify(cmd);
    if (this.#predicted?.state === state && this.#predicted.key === key) return this.#predicted.result;
    // fester Zufall: Ziehen und Mischen sind hier nicht gemeint, Reaktionen (Schaden) brauchen keinen
    const r = engine.dispatch(state, cmd, this.actor, seededRng(0));
    const result = 'state' in r ? (r.state as KlioTableState) : null;
    this.#predicted = { state, key, result };
    return result;
  }
  #predicted: { state: KlioTableState; key: string; result: KlioTableState | null } | null = null;

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

  /** Neuer Stand mit Ereignissen (`prev` = Stand davor); die Ablage des auslösenden Befehls ist damit bestätigt,
   *  fremde Züge mit bewegten Karten enden (8.3). */
  private changed(state: KlioTableState, events: Event[], cause: string | undefined, own: boolean, prev: KlioTableState | null): void {
    this.state = state;
    this.arrive((a, now) => a.seatsChanged(state.seats, now));
    const moved = movedCards(events, prev);
    if (cause || moved.length) {
      this.remote.confirmed(cause, moved);
      this.showRemote();
    }
    if (cause && this.pending.some((d) => d.id === cause)) this.pending = this.pending.filter((d) => d.id !== cause);
    if (events.length > 0) for (const cb of this.listeners) cb(events as (EngineEvent | KlioEvent)[], own, prev);
  }
}

export const session = new Session();
