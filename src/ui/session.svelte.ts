// Sitzung im Browser: verbindet Oberfläche, Host und Speicher (lokaler Betrieb, Schritt 3).
// Im Mehrspielerbetrieb (Schritt 4) kommt hier der Client bzw. Host mit Trystero hinzu.

import content from 'virtual:klio-content';
import { createEngine } from '../engine/dispatch';
import { can } from '../engine/permissions';
import { cryptoRng } from '../engine/rng';
import { initialTable } from '../engine/setup';
import type { Actor, CardId, Event, SequencedEvent, TableState } from '../engine/types';
import { Host } from '../net/host';
import { localTransport } from '../net/local';
import type { CommandResult } from '../net/protocol';
import { createKlioRuleset } from '../rules/klio/ruleset';
import type { KlioState } from '../rules/klio/state';
import { IdbStore, PhotoStore } from './storage';

export type KlioTableState = TableState<KlioState>;
type Listener = (events: Event[]) => void;

/** Abgelegte Karten, deren Befehl noch nicht bestätigt ist: bleiben an der Ablegestelle (8.2). */
export type PendingDrop = { cards: CardId[]; dx: number; dy: number };

const ruleset = createKlioRuleset(content);
const engine = createEngine(ruleset);
export const photos = new PhotoStore();

class Session {
  state = $state.raw<KlioTableState | null>(null);
  saveError = $state<string | null>(null);
  /** in Reihenfolge der Befehle; der älteste fällt weg, sobald sein Ergebnis da ist */
  pending = $state.raw<PendingDrop[]>([]);
  /** wer hier bedient; im lokalen Betrieb die Spielleitung (Schritt 4: Platz oder Zuschauer) */
  actor = $state<Actor>({ role: 'gm' });
  private host: Host<KlioState> | null = null;
  private listeners = new Set<Listener>();

  async start(): Promise<void> {
    this.host = await Host.start(engine, localTransport(), new IdbStore<KlioState>(), () => initialTable(ruleset, cryptoRng()), {
      build: __BUILD_ID__,
      onSaveError: (e) => (this.saveError = String(e)),
      onChange: (state, events) => this.changed(state, events),
    });
    this.state = this.host.state;
  }

  /** Befehl als Spielleitung ausführen (lokaler Betrieb: alles erlaubt, wie bisher). */
  async submit(cmd: object, drop?: PendingDrop): Promise<CommandResult> {
    if (!this.host) return { ok: false, reason: { key: 'reject.invalid' } };
    if (drop) this.pending = [...this.pending, drop];
    const result = await this.host.submit(cmd);
    // angenommen: schon in changed() entfernt, zusammen mit dem neuen Stand
    if (drop && this.pending.includes(drop)) this.pending = this.pending.filter((d) => d !== drop);
    return result;
  }

  /** Darf der aktuelle Nutzer diesen Befehl? Zum Ausblenden von Knöpfen (9.3); verbindlich prüft der Host. */
  can(cmd: { type: string }): boolean {
    const def = engine.commands[cmd.type];
    return !!def && !!this.state && can(this.actor, def, cmd, this.state as TableState<unknown>, ruleset.permissions);
  }

  /** Ereignisse für Meldungen und Animationen. */
  onEvents(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(state: KlioTableState, events: SequencedEvent[]): void {
    this.state = state;
    this.pending = this.pending.slice(1);
    const list = events.map((e) => e.event);
    for (const cb of this.listeners) cb(list);
  }
}

export const session = new Session();
