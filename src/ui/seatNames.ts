// Wer sitzt wo (ARCHITEKTUR.md 10 „Zuordnung der Bögen“): Charaktername für Dock und Namensschild,
// dazu der Name der Person am Platz.

import type { SeatId } from '../engine/types';
import { seatNo } from '../engine/zones';
import { sheetOf, type KlioTable } from '../rules/klio/events';
import { t } from './texts';

export type SeatNames = {
  /** Charaktername, ohne Namen „Spieler n“ */
  character: string;
  /** Name der Person am Platz; leer, wenn frei oder ohne Namen */
  person: string;
  /** beides zusammen, z. B. für Tooltips */
  label: string;
};

export function seatNames(state: KlioTable, seat: SeatId): SeatNames {
  const s = state.seats[seat];
  const character = sheetOf(state, seat).name.trim() || t('room.player', { n: seatNo(seat) });
  const person = s.occupied ? (s.name ?? '').trim() : '';
  return { character, person, label: person ? `${character} · ${person}` : character };
}
