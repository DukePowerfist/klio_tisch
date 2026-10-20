// Tisch und Spielleitung: Wiederbeleben, Zurücksetzen, Spielerzahl, Einstellungen, Expedition, Orakel.

import { z } from 'zod';
import { dealStart } from '../../../engine/setup';
import { expandZones } from '../../../engine/zones';
import type { DeckConfig, ZoneConfig } from '../../../engine/types';
import { sheetOf } from '../events';
import { drawOracle, rollExpedition } from '../generators/expedition';
import { command, Seat, type Deps } from './common';

const Perm = z.enum(['allow', 'deny', 'own']);

export function tableCommands(_deps: Deps, deck: DeckConfig, zones: ZoneConfig[]) {
  const zoneIds = [...expandZones(zones).keys()];

  return {
    'character.revive': command(
      z.object({ type: z.literal('character.revive'), seat: Seat }).strict(),
      'character.revive',
      (cmd, state) => (sheetOf(state, cmd.seat).dead ? [{ type: 'characterRevived', seat: cmd.seat }] : []),
    ),

    // Sicherung vorher (A34) legt der Host an, nicht das Regelwerk.
    'table.reset': command(
      z.object({ type: z.literal('table.reset'), includeCharacters: z.boolean() }).strict(),
      'table.reset',
      (cmd, _state, _actor, rng) => [
        { type: 'cardsReset', zones: dealStart(deck, zoneIds, rng) },
        ...(cmd.includeCharacters ? [{ type: 'charactersReset' }] : []),
      ],
    ),

    'table.setPlayers': command(
      z.object({ type: z.literal('table.setPlayers'), players: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).strict(),
      'table.setPlayers',
      (cmd, state) => (cmd.players === state.settings.players ? [] : [{ type: 'settingsChanged', settings: { ...state.settings, players: cmd.players } }]),
    ),

    'table.setSettings': command(
      z.object({
        type: z.literal('table.setSettings'),
        automation: z.record(z.string(), z.boolean()).optional(),
        permissionOverrides: z.object({ player: z.record(z.string(), Perm).optional(), spectator: z.record(z.string(), Perm).optional() }).strict().optional(),
      }).strict(),
      'table.setSettings',
      (cmd, state) => [{
        type: 'settingsChanged',
        settings: {
          ...state.settings,
          automation: cmd.automation ?? state.settings.automation,
          permissionOverrides: cmd.permissionOverrides ?? state.settings.permissionOverrides,
        },
      }],
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
