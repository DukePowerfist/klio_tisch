// Zusammenbau (ARCHITEKTUR.md 7): Inhalte + Bausteine + Befehle + Reaktionen + Rechte → ein Regelwerk.

import type { Ruleset, ZoneConfig } from '../../engine/types';
import { expandZones } from '../../engine/zones';
import type { KlioContent } from './content/validate';
import { sheetCommands } from './commands/sheet';
import { tableCommands } from './commands/table';
import { trumpCommands } from './commands/trump';
import { klioEvents } from './events';
import { oracleOpen } from './migrations/oracleOpen';
import { tischmitte } from './migrations/tischmitte';
import { budgetCommands, budgetGuard, budgetReaction } from './budget';
import { budget } from './migrations/budget';
import { budgetLast } from './migrations/budgetLast';
import { damageReaction } from './reactions/damage';
import { initialKlioState, KlioState } from './state';

export const KLIO_ID = 'klio';
export const KLIO_VERSION = '1';

export const zonesFrom = (content: KlioContent): ZoneConfig[] => Object.entries(content.zones).map(([id, z]) => ({ id, ...z }));

export function createKlioRuleset(content: KlioContent): Ruleset<KlioState> {
  const deps = { content };
  const zones = zonesFrom(content);
  const table = expandZones(zones);
  return {
    id: KLIO_ID,
    version: KLIO_VERSION,
    initialGame: () => initialKlioState(),
    parseGame: (x) => KlioState.parse(x),
    resetGame: () => [{ type: 'charactersReset' }],
    photosOf: (game) => game.sheets.flatMap((s) => (s.photo ? [s.photo.hash] : [])),
    deck: { start: content.deck.start },
    zones,
    commands: { ...sheetCommands(deps), ...trumpCommands(deps), ...tableCommands(), ...budgetCommands() },
    events: klioEvents,
    reactions: [damageReaction(table), budgetReaction(table)],
    guard: budgetGuard(table),
    permissions: content.permissions,
    migrations: [tischmitte, oracleOpen, budget, budgetLast],
    seatColors: content.layouts.seatColors,
  };
}
