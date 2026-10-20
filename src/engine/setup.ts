// Anfangsstand des Tisches.

import { shuffled } from './rng';
import { expandZones } from './zones';
import { SEATS, type CardId, type DeckConfig, type Rng, type Ruleset, type TableState, type ZoneId } from './types';

/** Format des gespeicherten Stands; steigt bei jeder Strukturänderung (7, Versionierung). */
export const FORMAT = 2;

/** Alle Karten auf ihre Startplätze, je Zone gemischt; alle Zonen existieren (auch leere). */
export function dealStart(deck: DeckConfig, zoneIds: Iterable<ZoneId>, rng: Rng): Record<ZoneId, CardId[]> {
  const zones: Record<ZoneId, CardId[]> = {};
  for (const id of zoneIds) zones[id] = shuffled(deck.start[id] ?? [], rng);
  return zones;
}

export function initialTable<G>(ruleset: Ruleset<G>, rng: Rng, zoneIds: Iterable<ZoneId> = expandZones(ruleset.zones).keys()): TableState<G> {
  return {
    format: FORMAT,
    ruleset: { id: ruleset.id, version: ruleset.version },
    seq: 0,
    zones: dealStart(ruleset.deck, zoneIds, rng),
    free: [],
    freePos: {},
    faceUp: {},
    seats: Object.fromEntries(SEATS.map((s) => [s, { occupied: false }])) as TableState<G>['seats'],
    settings: { players: 4, automation: {}, permissionOverrides: {} },
    game: ruleset.initialGame(rng),
  };
}
