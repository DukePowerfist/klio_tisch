// Trümpfe: über einen Weg wählen, frei wählen, zufällig, entfernen.

import { z } from 'zod';
import type { SeatId } from '../../../engine/types';
import { ChoicesSchema } from '../blocks';
import { Slot } from '../state';
import { sheetOf, type KlioEvent, type KlioTable } from '../events';
import { fullReason, isFull, planChoice, planRandom, trumpById, trumpProblem, type Plan } from '../trumps';
import { blockContext, command, reject, Seat, type Deps } from './common';


export function trumpCommands(deps: Deps) {
  const cfg = deps.content.trumpSources;
  const trumps = deps.content.trumps;

  const firstFreeSlot = (state: KlioTable, seat: SeatId) => sheetOf(state, seat).trumps.findIndex((t) => t === null);

  /** Plan in Ereignisse übersetzen: erst die Änderungen am Bogen, dann die Wahl selbst. */
  const toEvents = (state: KlioTable, seat: SeatId, source: string, plan: Plan): KlioEvent[] => {
    const events: KlioEvent[] = [];
    if (plan.changes.length > 0) events.push({ type: 'fieldsChanged', seat, changes: plan.changes });
    const slot = plan.trump === null ? null : firstFreeSlot(state, seat);
    events.push({ type: 'trumpChosen', seat, source, trump: plan.trump, slot });
    return events;
  };

  return {
    'trump.choose': command(
      z.object({ type: z.literal('trump.choose'), seat: Seat, source: z.string(), trump: z.string().optional(), ...ChoicesSchema.shape }).strict(),
      'trump.choose',
      (cmd, state) => {
        const src = cfg.trumpSources.find((s) => s.id === cmd.source);
        if (!src) return reject('reject.unknownSource');
        const { type: _t, seat: _s, source: _src, trump: _tr, ...choices } = cmd;
        const plan = planChoice(cfg, src, trumps, blockContext(deps, state, cmd.seat), choices, cmd.trump);
        if ('why' in plan) return { rejected: true, reason: plan.why };
        return toEvents(state, cmd.seat, src.id, plan);
      },
    ),

    'trump.chooseFree': command(
      z.object({ type: z.literal('trump.chooseFree'), seat: Seat, trump: z.string() }).strict(),
      'trump.chooseFree',
      (cmd, state) => {
        if (!cfg.freeChoice) return reject('reject.unknownSource');
        const ctx = blockContext(deps, state, cmd.seat);
        if (isFull(cfg, ctx.sheet)) return { rejected: true, reason: fullReason(cfg) };
        const t = trumpById(trumps, cmd.trump);
        if (!t) return reject('reject.unknownTrump');
        const why = trumpProblem(cfg, 'free', t, ctx, {});
        if (why) return { rejected: true, reason: why };
        return toEvents(state, cmd.seat, 'free', { changes: [], trump: t.id });
      },
    ),

    'trump.random': command(
      z.object({ type: z.literal('trump.random'), seat: Seat }).strict(),
      'trump.choose',
      (cmd, state, _actor, rng) => {
        const ctx = blockContext(deps, state, cmd.seat);
        const r = planRandom(cfg, trumps, ctx, rng);
        if ('why' in r) return { rejected: true, reason: r.why };
        // Gleiche Prüfung wie bei der Wahl von Hand; planRandom wählt nur aus.
        const plan = planChoice(cfg, r.source, trumps, ctx, r.choices, r.trump);
        if ('why' in plan) return { rejected: true, reason: plan.why };
        return toEvents(state, cmd.seat, r.source.id, plan);
      },
    ),

    'trump.remove': command(
      z.object({ type: z.literal('trump.remove'), seat: Seat, slot: Slot }).strict(),
      'trump.remove',
      (cmd, state) => (sheetOf(state, cmd.seat).trumps[cmd.slot] === null ? reject('reject.slotEmpty') : [{ type: 'trumpRemoved', seat: cmd.seat, slot: cmd.slot }]),
    ),
  };
}
