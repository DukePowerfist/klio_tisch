// Zusammenbau (ARCHITEKTUR.md 7): Inhalte + Bausteine + Befehle + Reaktionen + Rechte → ein Regelwerk.

import type { CardDef, DeckConfig, Ruleset, ZoneConfig } from '../../engine/types';
import type { KlioContent } from './content/validate';
import { sheetCommands } from './commands/sheet';
import { tableCommands } from './commands/table';
import { trumpCommands } from './commands/trump';
import { klioEvents } from './events';
import { damageReaction } from './reactions/damage';
import { initialKlioState, type KlioState } from './state';

export const KLIO_ID = 'klio';
export const KLIO_VERSION = '1';

const VALUE: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };

/** Karten aus deck.yaml; Heimatstapel = Startzone. */
export function deckFrom(content: KlioContent): DeckConfig {
  const cards: CardDef[] = Object.entries(content.deck.start).flatMap(([zone, ids]) =>
    ids.map((id) => {
      const rank = id.slice(1) as CardDef['rank'];
      return { id: id as CardDef['id'], suit: id[0] as CardDef['suit'], rank, value: VALUE[rank] ?? Number(rank), home: zone };
    }),
  );
  return { cards, start: content.deck.start as DeckConfig['start'] };
}

export function zonesFrom(content: KlioContent): ZoneConfig[] {
  return Object.entries(content.zones).map(([id, z]) => {
    const out: ZoneConfig = { id };
    if (z.perSeat) out.perSeat = true;
    if (z.fanned) out.fanned = true;
    if (z.capacity !== undefined) out.capacity = z.capacity;
    if (z.onDrop) out.onDrop = z.onDrop;
    if (z.actions) out.actions = z.actions as ZoneConfig['actions'] & object;
    return out;
  });
}

export function createKlioRuleset(content: KlioContent): Ruleset<KlioState> {
  const deps = { content };
  const deck = deckFrom(content);
  const zones = zonesFrom(content);
  return {
    id: KLIO_ID,
    version: KLIO_VERSION,
    initialGame: () => initialKlioState(),
    deck,
    zones,
    commands: { ...sheetCommands(deps), ...trumpCommands(deps), ...tableCommands(deps, deck, zones) },
    events: klioEvents,
    reactions: [damageReaction],
    permissions: content.permissions,
    migrations: [],
  };
}
