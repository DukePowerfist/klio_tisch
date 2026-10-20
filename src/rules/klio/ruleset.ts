// Zusammenbau (ARCHITEKTUR.md 7): Inhalte + Bausteine + Befehle + Reaktionen + Rechte → ein Regelwerk.

import { rankValue } from '../../engine/schemas';
import type { CardDef, DeckConfig, Ruleset, ZoneConfig } from '../../engine/types';
import { expandZones } from '../../engine/zones';
import type { KlioContent } from './content/validate';
import { sheetCommands } from './commands/sheet';
import { tableCommands } from './commands/table';
import { trumpCommands } from './commands/trump';
import { klioEvents } from './events';
import { damageReaction } from './reactions/damage';
import { initialKlioState, KlioState } from './state';

export const KLIO_ID = 'klio';
export const KLIO_VERSION = '1';

/** Karten aus deck.yaml; Heimatstapel = Startzone. */
export function deckFrom(content: KlioContent): DeckConfig {
  const cards: CardDef[] = Object.entries(content.deck.start).flatMap(([zone, ids]) =>
    ids.map((id) => {
      const rank = id.slice(1) as CardDef['rank'];
      return { id, suit: id[0] as CardDef['suit'], rank, value: rankValue(rank), home: zone };
    }),
  );
  return { cards, start: content.deck.start };
}

export const zonesFrom = (content: KlioContent): ZoneConfig[] => Object.entries(content.zones).map(([id, z]) => ({ id, ...z }));

export function createKlioRuleset(content: KlioContent): Ruleset<KlioState> {
  const deps = { content };
  const zones = zonesFrom(content);
  return {
    id: KLIO_ID,
    version: KLIO_VERSION,
    initialGame: () => initialKlioState(),
    parseGame: (x) => KlioState.parse(x),
    resetGame: () => [{ type: 'charactersReset' }],
    deck: deckFrom(content),
    zones,
    commands: { ...sheetCommands(deps), ...trumpCommands(deps), ...tableCommands() },
    events: klioEvents,
    reactions: [damageReaction(expandZones(zones))],
    permissions: content.permissions,
    migrations: [],
  };
}
