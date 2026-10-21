// Ablauf eines Befehls (ARCHITEKTUR.md 6.3): Rechte → Prüfen/Übersetzen → Anwenden → Reaktionen.
// Alles oder nichts: gearbeitet wird auf einer Kopie, übernommen wird nur das fertige Ergebnis.

import { applyEngineEvent, isEngineEvent } from './apply';
import { ENGINE_EVENTS, EngineEventSchema, tableStateSchema } from './schemas';
import { engineCommands, isRejection, reject } from './commands';
import { can } from './permissions';
import { migrate } from './migrate';
import { seatColor } from './migrations/seatColor';
import { expandZones } from './zones';
import type { Actor, Command, CommandDef, DispatchResult, Event, Rng, Ruleset, SequencedEvent, TableState } from './types';

/** Migrationen der Engine; sie hängen an derselben Formatnummer wie die des Regelwerks (7, Versionierung) */
const ENGINE_MIGRATIONS = [seatColor];

/** Höchstens so viele Runden Reaktion auf Reaktion; darüber wird der ganze Befehl abgelehnt. */
export const MAX_REACTION_DEPTH = 8;

export type Engine<G> = {
  ruleset: Ruleset<G>;
  commands: Record<string, CommandDef<G, any>>;
  dispatch(state: TableState<G>, cmd: unknown, actor: Actor, rng: Rng): DispatchResult<G>;
  replay(state: TableState<G>, events: readonly SequencedEvent[]): TableState<G>;
  /** Empfangenen oder geladenen Stand auf das aktuelle Format bringen und prüfen; wirft bei Fehlern
   *  (`NewerFormatError`, wenn er aus einer neueren Fassung stammt) */
  parseState(input: unknown): TableState<G>;
  /** Empfangenes Ereignis prüfen; wirft bei Fehlern */
  parseEvent(input: unknown): Event;
};

export function createEngine<G>(ruleset: Ruleset<G>): Engine<G> {
  const zones = expandZones(ruleset.zones);
  const base = engineCommands(zones, ruleset);
  for (const key of Object.keys(ruleset.commands)) {
    if (key in base) throw new Error(`Regelwerk überschreibt Engine-Befehl ${key}`);
  }
  const commands: Record<string, CommandDef<G, any>> = { ...base, ...ruleset.commands };

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
    if (isRejection(first)) return first;

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

  const stateSchema = tableStateSchema(ruleset.parseGame);
  function parseEvent(input: unknown): Event {
    const type = (input as { type?: unknown } | null)?.type;
    const schema = typeof type !== 'string' ? undefined : ENGINE_EVENTS.has(type) ? EngineEventSchema : ruleset.events[type];
    if (!schema) throw new Error(`unbekanntes Ereignis ${String(type)}`);
    return schema.parse(input);
  }

  return { ruleset, commands, dispatch, replay, parseState: (input) => stateSchema.parse(migrate(input, [...ENGINE_MIGRATIONS, ...ruleset.migrations])), parseEvent };
}
