// Spielleitung und Charaktere: Wiederbeleben, Expedition, Orakel.
// Spielerzahl, Einstellungen und Zurücksetzen sind Engine-Befehle (src/engine/commands.ts).

import { z } from 'zod';
import { sheetOf } from '../events';
import { drawOracle, rollExpedition } from '../generators/expedition';
import { command, Seat } from './common';

export function tableCommands() {
  return {
    'character.revive': command(
      z.object({ type: z.literal('character.revive'), seat: Seat }).strict(),
      'character.revive',
      (cmd, state) => (sheetOf(state, cmd.seat).dead ? [{ type: 'characterRevived', seat: cmd.seat }] : []),
    ),

    'gm.expedition': command(
      z.object({ type: z.literal('gm.expedition'), table: z.number().int().min(0).max(3).optional() }).strict(),
      'gm.expedition',
      (cmd, state, _actor, rng) => [rollExpedition(state.game.expedition, cmd.table, rng)],
    ),

    'gm.oracle': command(
      z.object({ type: z.literal('gm.oracle') }).strict(),
      'gm.oracle',
      (_cmd, _state, _actor, rng) => [drawOracle(rng)],
    ),
  };
}
