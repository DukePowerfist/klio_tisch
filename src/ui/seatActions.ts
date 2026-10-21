// Aktionen zu Platz und Person (8.7, 10.1): Ziele zum Umsetzen, freie Plätze, Zuschauer zum Zuweisen.
// Raumfenster (alle Plätze auf einen Blick) und Menü am Namensschild (ein Platz) zeigen dieselben Einträge.

import { SEATS, type SeatId } from '../engine/types';
import { seatNo, seatVisible } from '../engine/zones';
import type { Online } from '../net/host';
import type { KlioTable } from '../rules/klio/events';
import { seatNames } from './seatNames';
import { t } from './texts';

export type SeatTarget = { seat: SeatId; label: string };
/** verbundener Zuschauer; `named`: mit eigenem Namen (sonst ist `label` „Zuschauer ohne Namen“) */
export type Watcher = { peer: string; label: string; named: boolean };

/** Platz mit Charakter, falls benannt: „Platz 3 – Hilda“ bzw. „auf Platz 3 – Hilda“ */
export function withCharacter(table: KlioTable, base: string, seat: SeatId): string {
  const { character } = seatNames(table, seat);
  return character !== t('room.player', { n: seatNo(seat) }) ? `${base} – ${character}` : base;
}

/** Ziele zum Umsetzen: sichtbare Plätze; vom ausgeblendeten Platz nur freie (sonst landete der andere dort) */
export function moveTargets(table: KlioTable, from: SeatId): SeatTarget[] {
  const hidden = !seatVisible(from, table);
  return SEATS.filter((s) => s !== from && seatVisible(s, table) && !(hidden && table.seats[s].occupied)).map((seat) => {
    const names = seatNames(table, seat);
    const n = seatNo(seat);
    if (names.free) return { seat, label: `${withCharacter(table, t('room.moveTo', { n }), seat)} (${t('room.free')})` };
    return { seat, label: `${withCharacter(table, t('room.swapWith', { n }), seat)}${names.person ? ` (${names.person})` : ''}` };
  });
}

/** freie sichtbare Plätze, beschriftet für „Platz zuweisen …“ */
export const freeSeats = (table: KlioTable): SeatTarget[] =>
  SEATS.filter((s) => seatVisible(s, table) && !table.seats[s].occupied).map((seat) => ({ seat, label: withCharacter(table, t('room.seat', { n: seatNo(seat) }), seat) }));

/** verbundene Zuschauer mit Namen (ohne Namen „Zuschauer ohne Namen“) */
export const watchers = (online: readonly Online[]): Watcher[] =>
  online.filter((r) => r.role === 'spectator').map((r) => ({ peer: r.peer, label: r.name || t('room.unnamed'), named: !!r.name }));

/** Zuschauer, die man auf diesen Platz setzen kann: nur bei einem freien sichtbaren Platz */
export const assignable = (table: KlioTable, online: readonly Online[], seat: SeatId): Watcher[] =>
  seatVisible(seat, table) && !table.seats[seat].occupied ? watchers(online) : [];
