// Client (ARCHITEKTUR.md 8.2): schickt Befehle mit eindeutiger ID, wendet nur bestätigte Ereignisse an.
// Übernimmt Stand und Ereignisse nur vom Host-Peer; würfelt nie selbst.

import type { Engine } from '../engine/dispatch';
import type { Event, SeatId, SequencedEvent, TableState, TextRef } from '../engine/types';
import { toBase64, unpackPhoto, type PhotoBank } from './photos';
import { ToClient, type CommandResult, type ReceivedEvents, type Role, type ToHost } from './protocol';
import type { PeerId, Transport } from './transport';

export type ClientStatus =
  | 'connecting' // noch kein Host gefunden
  | 'ready'
  | 'waiting' // Host weg: „Warte auf Spielleitung“
  | 'reload' // andere Version: „Bitte Seite neu laden“
  | 'denied' // Platz nicht bekommen
  | 'replaced'; // „In einem anderen Tab geöffnet“

export type ClientWarning = { kind: 'secondHost' } | { kind: 'invalidMessage' };

export type ClientOptions = {
  build: string;
  key: string;
  name: string;
  newId?: () => string;
  onChange?: () => void;
  /** bestätigte Ereignisse, nachdem sie angewendet wurden (Meldungen, Animationen); `cause` = auslösende Befehls-ID,
   *  `own` = von einem eigenen, noch unbeantworteten Befehl */
  onEvents?: (events: Event[], cause: string | undefined, own: boolean) => void;
  onWarning?: (w: ClientWarning) => void;
  /** die SL hat den ganzen Stand ersetzt (Datei geladen, Sicherung wiederhergestellt) */
  onReplaced?: (reason: string) => void;
  /** Ablage für angefragte Fotos (8.4); der Inhalt ist am Namen geprüft */
  photos?: PhotoBank;
};

/** Unbeantwortete Nachricht mit ID (Befehl oder Foto); wird nach dem Wiederverbinden erneut geschickt. */
type Pending = { msg: Extract<ToHost, { t: 'cmd' | 'photo' }>; resolve: (r: CommandResult) => void };

export class Client<G> {
  status: ClientStatus = 'connecting';
  state: TableState<G> | null = null;
  role: Role | null = null;
  denied: TextRef | null = null;
  private host: PeerId | null = null;
  private peers: PeerId[] = [];
  private pending = new Map<string, Pending>();
  private claims = new Map<string, (r: CommandResult) => void>();
  /** angefragte, noch nicht erhaltene Fotos */
  private wanted = new Set<string>();
  private newId: () => string;

  constructor(private engine: Engine<G>, private transport: Transport, private options: ClientOptions) {
    this.newId = options.newId ?? (() => crypto.randomUUID());
    transport.onMessage((msg, from) => this.receive(msg, from));
    transport.onPeers((peers) => this.peersChanged(peers));
  }

  /** Als Zuschauer einen freien Platz nehmen; bei Erfolg folgt ein neues Willkommen mit der neuen Rolle. */
  claim(seat: SeatId, name: string): Promise<CommandResult> {
    if (this.status !== 'ready' || !this.host) return Promise.resolve({ ok: false, reason: { key: 'reject.invalid' } });
    const id = this.newId();
    const host = this.host;
    return new Promise((resolve) => {
      this.claims.set(id, resolve);
      this.transport.send({ t: 'claim', id, seat, name }, host);
    });
  }

  /** Befehl schicken; Antwort kommt, sobald der Host ihn bearbeitet hat (auch nach Wiederverbinden).
   *  `id` (sonst neu erzeugt) kommt bei den ausgelösten Ereignissen als `cause` zurück. */
  submit(cmd: unknown, id: string = this.newId()): Promise<CommandResult> {
    return this.request({ t: 'cmd', id, cmd });
  }

  /** Foto an den Host, bevor der Befehl es einträgt (8.4). */
  uploadPhoto(hash: string, bytes: Uint8Array): Promise<CommandResult> {
    return this.request({ t: 'photo', id: this.newId(), hash, data: toBase64(bytes) });
  }

  /** Foto beim Host anfragen; kommt über `onPhoto`, auch wenn die Verbindung zwischendurch abreißt. */
  requestPhoto(hash: string): void {
    if (this.wanted.has(hash)) return;
    this.wanted.add(hash);
    if (this.status === 'ready' && this.host) this.transport.send({ t: 'photoGet', hash }, this.host);
  }

  private request(msg: Pending['msg']): Promise<CommandResult> {
    return new Promise((resolve) => {
      this.pending.set(msg.id, { msg, resolve });
      if (this.status === 'ready' && this.host) this.transport.send(msg, this.host);
    });
  }

  private hello(to?: PeerId): void {
    const { build, key, name } = this.options;
    this.transport.send({ t: 'hello', build, key, name, want: null }, to);
  }

  private peersChanged(peers: PeerId[]): void {
    const added = peers.filter((p) => !this.peers.includes(p));
    this.peers = peers;
    if (this.host && !peers.includes(this.host)) {
      this.host = null;
      this.setStatus('waiting');
    }
    // Ohne Host bei jedem neuen Peer fragen: Der Host hat nach einem Neustart eine neue Peer-ID.
    if (!this.host && (this.status === 'connecting' || this.status === 'waiting')) for (const p of added) this.hello(p);
  }

  private receive(raw: unknown, from: PeerId): void {
    const parsed = ToClient.safeParse(raw);
    if (!parsed.success) return this.options.onWarning?.({ kind: 'invalidMessage' });
    const msg = parsed.data;

    // Antworten auf hello kommen, bevor ein Host feststeht; alles andere nur vom Host-Peer (8.2)
    switch (msg.t) {
      case 'reload':
        return this.setStatus('reload');
      case 'welcome':
        return this.welcome(msg.role, msg.state, from);
      case 'denied':
        // Beitritt verweigert (Antwort auf hello, also bevor ein Host feststeht)
        if (this.host) return;
        this.denied = msg.reason;
        return this.setStatus('denied');
    }
    if (from !== this.host) return;

    switch (msg.t) {
      case 'replaced':
        this.host = null;
        return this.setStatus('replaced');
      case 'state':
        if (this.adopt(msg.state) && msg.reason) this.options.onReplaced?.(msg.reason);
        return;
      case 'result': {
        const result: CommandResult = msg.ok ? { ok: true } : { ok: false, reason: msg.reason ?? { key: 'reject.invalid' } };
        const claim = this.claims.get(msg.id);
        if (claim) {
          this.claims.delete(msg.id);
          return claim(result);
        }
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        return p.resolve(result);
      }
      case 'events':
        return this.apply(msg.events, msg.cause);
      case 'photo':
        return void this.photo(msg.hash, msg.data);
    }
  }

  private welcome(role: Role, state: unknown, from: PeerId): void {
    if (this.host && this.host !== from && this.peers.includes(this.host)) {
      return this.options.onWarning?.({ kind: 'secondHost' });
    }
    if (this.status === 'replaced' || this.status === 'reload') return;
    this.host = from;
    this.role = role;
    if (!this.adopt(state)) return;
    this.setStatus('ready');
    // Unbeantwortetes mit derselben ID erneut schicken; der Host erkennt Wiederholungen. Fotos erneut anfragen.
    for (const p of this.pending.values()) this.transport.send(p.msg, from);
    for (const hash of this.wanted) this.transport.send({ t: 'photoGet', hash }, from);
  }

  private async photo(hash: string, data: string): Promise<void> {
    if (!this.wanted.has(hash)) return;
    const bytes = await unpackPhoto(hash, data);
    if (!bytes) return this.options.onWarning?.({ kind: 'invalidMessage' });
    this.wanted.delete(hash);
    await this.options.photos?.put(hash, bytes);
  }

  /** Vollständigen Stand übernehmen (geprüft). */
  private adopt(raw: unknown): boolean {
    try {
      this.state = this.engine.parseState(raw);
    } catch {
      this.options.onWarning?.({ kind: 'invalidMessage' });
      return false;
    }
    this.options.onChange?.();
    return true;
  }

  private apply(raw: ReceivedEvents, cause?: string): void {
    const state = this.state;
    if (!state || !this.host) return;
    const fresh = raw.filter((e) => e.seq > state.seq);
    if (fresh.length === 0) return;
    // Lücke: Stand still neu anfordern (8.2). replay würde sie auch finden, aber als Fehler melden.
    if (fresh[0]!.seq !== state.seq + 1) return this.transport.send({ t: 'resync' }, this.host);
    let events: SequencedEvent[];
    try {
      events = fresh.map((e) => ({ seq: e.seq, event: this.engine.parseEvent(e.event) }));
      this.state = this.engine.replay(state, events);
    } catch {
      this.options.onWarning?.({ kind: 'invalidMessage' });
      return this.transport.send({ t: 'resync' }, this.host);
    }
    this.options.onChange?.();
    this.options.onEvents?.(events.map((e) => e.event), cause, !!cause && this.pending.has(cause));
  }

  private setStatus(s: ClientStatus): void {
    this.status = s;
    this.options.onChange?.();
  }
}
