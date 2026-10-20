// Client (ARCHITEKTUR.md 8.2): schickt Befehle mit eindeutiger ID, wendet nur bestätigte Ereignisse an.
// Übernimmt Stand und Ereignisse nur vom Host-Peer; würfelt nie selbst.

import type { Engine } from '../engine/dispatch';
import type { SeatId, SequencedEvent, TableState, TextRef } from '../engine/types';
import { ToClient, type CommandResult, type ReceivedEvents, type Role } from './protocol';
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
  /** gewünschter Platz beim ersten Beitritt */
  want: SeatId | 'spectator' | null;
  newId?: () => string;
  onChange?: () => void;
  onWarning?: (w: ClientWarning) => void;
};

type Pending = { cmd: unknown; resolve: (r: CommandResult) => void };

export class Client<G> {
  status: ClientStatus = 'connecting';
  state: TableState<G> | null = null;
  role: Role | null = null;
  denied: TextRef | null = null;
  private host: PeerId | null = null;
  private peers: PeerId[] = [];
  private pending = new Map<string, Pending>();
  private newId: () => string;

  constructor(private engine: Engine<G>, private transport: Transport, private options: ClientOptions) {
    this.newId = options.newId ?? (() => crypto.randomUUID());
    transport.onMessage((msg, from) => this.receive(msg, from));
    transport.onPeers((peers) => this.peersChanged(peers));
  }

  /** Befehl schicken; Antwort kommt, sobald der Host ihn bearbeitet hat (auch nach Wiederverbinden). */
  submit(cmd: unknown): Promise<CommandResult> {
    const id = this.newId();
    return new Promise((resolve) => {
      this.pending.set(id, { cmd, resolve });
      if (this.status === 'ready' && this.host) this.transport.send({ t: 'cmd', id, cmd }, this.host);
    });
  }

  private hello(to?: PeerId): void {
    const { build, key, name, want } = this.options;
    this.transport.send({ t: 'hello', build, key, name, want }, to);
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
        this.adopt(msg.state);
        return;
      case 'result': {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        return p.resolve(msg.ok ? { ok: true } : { ok: false, reason: msg.reason ?? { key: 'reject.invalid' } });
      }
      case 'events':
        return this.apply(msg.events);
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
    // Unbeantwortete Befehle mit derselben ID erneut schicken; der Host erkennt Wiederholungen.
    for (const [id, p] of this.pending) this.transport.send({ t: 'cmd', id, cmd: p.cmd }, from);
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

  private apply(raw: ReceivedEvents): void {
    const state = this.state;
    if (!state || !this.host) return;
    const fresh = raw.filter((e) => e.seq > state.seq);
    if (fresh.length === 0) return;
    // Lücke: Stand still neu anfordern (8.2). replay würde sie auch finden, aber als Fehler melden.
    if (fresh[0]!.seq !== state.seq + 1) return this.transport.send({ t: 'resync' }, this.host);
    try {
      const events: SequencedEvent[] = fresh.map((e) => ({ seq: e.seq, event: this.engine.parseEvent(e.event) }));
      this.state = this.engine.replay(state, events);
    } catch {
      this.options.onWarning?.({ kind: 'invalidMessage' });
      return this.transport.send({ t: 'resync' }, this.host);
    }
    this.options.onChange?.();
  }

  private setStatus(s: ClientStatus): void {
    this.status = s;
    this.options.onChange?.();
  }
}
