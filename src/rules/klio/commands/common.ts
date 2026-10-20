// Gemeinsames für Klio-Befehle: Schema-Hülle, Platzprüfung, Kontext für Bausteine.

import { z } from 'zod';
import { reject } from '../../../engine/commands';
import { seatVisible } from '../../../engine/zones';
import { SEATS, type Actor, type Command, type CommandDef, type Event, type Rejection, type Rng, type SeatId } from '../../../engine/types';
import type { Attr, BlockContext } from '../blocks';
import type { KlioContent } from '../content/validate';
import { sheetOf, type KlioTable } from '../events';
import type { KlioState } from '../state';

export { reject };
export const Seat = z.enum(SEATS as unknown as [SeatId, ...SeatId[]]);

export type Deps = { content: KlioContent };

/** Befehl aus Zod-Schema, Rechteschlüssel und Handler. `seat` im Befehl = Besitzer (für `own`). */
export function command<S extends z.ZodType<Command>>(
  schema: S,
  permission: string,
  handle: (cmd: z.infer<S>, state: KlioTable, actor: Actor, rng: Rng) => Event[] | Rejection,
): CommandDef<KlioState, z.infer<S>> {
  return {
    parse: (x) => schema.parse(x),
    permission,
    owners: (cmd) => ('seat' in cmd && typeof cmd.seat === 'string' ? [cmd.seat as SeatId] : []),
    handle(cmd, state, actor, rng) {
      // Bögen ausgeblendeter Plätze sind nicht bearbeitbar (8.2)
      if ('seat' in cmd && typeof cmd.seat === 'string' && !seatVisible(cmd.seat as SeatId, state)) return reject('reject.hiddenSeat');
      return handle(cmd, state, actor, rng);
    },
  };
}

export function blockContext(deps: Deps, state: KlioTable, seat: SeatId): BlockContext {
  const names = deps.content.texts['attributes'] as Record<Attr, string>;
  return { sheet: sheetOf(state, seat), attrNames: names };
}
