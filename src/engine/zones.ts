// Zonen: Vorlagen (perSeat) zu echten Zonen erweitern, Besitzer und Sichtbarkeit.

import { SEATS, type CardId, type SeatId, type TableState, type ZoneConfig, type ZoneId } from './types';

export type ZoneTable = ReadonlyMap<ZoneId, ZoneConfig>;

/** `damage` mit perSeat wird zu `seat1.damage` … `seat4.damage` mit Besitzer. */
export function expandZones(configs: readonly ZoneConfig[]): ZoneTable {
  const out = new Map<ZoneId, ZoneConfig>();
  for (const z of configs) {
    if (z.perSeat) {
      for (const seat of SEATS) {
        const { perSeat: _, ...rest } = z;
        out.set(`${seat}.${z.id}`, { ...rest, id: `${seat}.${z.id}`, owner: seat });
      }
    } else {
      out.set(z.id, z);
    }
  }
  return out;
}

export function seatZoneId(seat: SeatId, zone: string): ZoneId {
  return `${seat}.${zone}`;
}

/** Platz 1 … n ist sichtbar, n = Spielerzahl (8.2). */
export function seatVisible(seat: SeatId, state: TableState<unknown>): boolean {
  return SEATS.indexOf(seat) < state.settings.players;
}

export function zoneVisible(zone: ZoneConfig, state: TableState<unknown>): boolean {
  return !zone.owner || seatVisible(zone.owner, state);
}

/** Wo liegt eine Karte gerade? */
export function locate(state: TableState<unknown>, card: CardId): { zone: ZoneId; index: number } | { free: true } | null {
  for (const [zone, cards] of Object.entries(state.zones)) {
    const index = cards.indexOf(card);
    if (index >= 0) return { zone, index };
  }
  return state.free.includes(card) ? { free: true } : null;
}
