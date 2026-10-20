// Ablauf eines Befehls (ARCHITEKTUR.md 6.3): Rechte → Prüfen/Übersetzen → Anwenden → Reaktionen.
// Alles oder nichts: gearbeitet wird auf einer Kopie, übernommen wird nur das fertige Ergebnis.

import { applyEngineEvent, isEngineEvent } from './apply';
import { engineCommands, reject } from './commands';
import { can } from './permissions';
import { expandZones } from './zones';
import type { Actor, Command, CommandDef, DispatchResult, Event, Rng, Ruleset, SequencedEvent, TableState } from './types';

/** Höchstens so viele Runden Reaktion auf Reaktion; darüber wird der ganze Befehl abgelehnt. */
export const MAX_REACTION_DEPTH = 8;

export type Engine<G> = {
  ruleset: Ruleset<G>;
  commands: Record<string, CommandDef<G, any>>;
  dispatch(state: TableState<G>, cmd: unknown, actor: Actor, rng: Rng): DispatchResult<G>;
  replay(state: TableState<G>, events: readonly SequencedEvent[]): TableState<G>;
};

export function createEngine<G>(ruleset: Ruleset<G>): Engine<G> {
  const zones = expandZones(ruleset.zones);
  const commands: Record<string, CommandDef<G, any>> = { ...engineCommands(zones, ruleset.deck), ...ruleset.commands };
  for (const key of Object.keys(ruleset.commands)) {
    if (key in engineCommands(zones, ruleset.deck)) throw new Error(`Regelwerk überschreibt Engine-Befehl ${key}`);
  }

  function apply(state: TableState<G>, event: Event): TableState<G> {
    if (isEngineEvent(event)) return applyEngineEvent(state, event);
    const def = ruleset.events[event.type];
    if (!def) throw new Error(`unbekanntes Ereignis ${event.type}`);
    return def.apply(state, event);
  }

  function dispatch(state: TableState<G>, input: unknown, actor: Actor, rng: Rng): DispatchResult<G> {
    const type = (input as Command | null)?.type;
    const def = typeof type === 'string' ? commands[type] : undefined;
    if (!def) return reject('reject.unknownCommand');
    let cmd: Command;
    try {
      cmd = def.parse(input);
    } catch {
      return reject('reject.invalid');
    }
    if (!can(actor, def, cmd, state as TableState<unknown>, ruleset.permissions)) return reject('reject.notAllowed');

    const first = def.handle(cmd, state, actor, rng);
    if ('rejected' in first) return first;

    let next = structuredClone(state);
    const done: Event[] = [];
    let wave: Event[] = first;
    for (let depth = 0; wave.length > 0; depth++) {
      if (depth > MAX_REACTION_DEPTH) return reject('reject.reactionLoop');
      const caused: Event[] = [];
      for (const event of wave) {
        next = apply(next, event);
        done.push(event);
        for (const r of ruleset.reactions) {
          if (next.settings.automation[r.id] === false) continue;
          caused.push(...r.react(next, event, rng));
        }
      }
      wave = caused;
    }
    next.seq = state.seq + done.length;
    return { state: next, events: done.map((event, i) => ({ seq: state.seq + 1 + i, event })) };
  }

  /** Clients: nur bestätigte Ereignisse anwenden, keine Reaktionen (6.3). */
  function replay(state: TableState<G>, events: readonly SequencedEvent[]): TableState<G> {
    let next = structuredClone(state);
    for (const { seq, event } of events) {
      if (seq !== next.seq + 1) throw new Error(`Lücke in der Ereignisfolge: erwartet ${next.seq + 1}, bekommen ${seq}`);
      next = apply(next, event);
      next.seq = seq;
    }
    return next;
  }

  return { ruleset, commands, dispatch, replay };
}
