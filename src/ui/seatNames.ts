// Wer sitzt wo (ARCHITEKTUR.md 10 „Zuordnung der Bögen“): Charaktername für den Dock-Tooltip,
// Name der Person für das Namensschild (der Charaktername steht schon im Namensfeld des Bogens),
// bei freien Plätzen für Beitritts- und Raumfenster, wer zuletzt dort saß (8.7).

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
  /** Namensschild: Name der Person, sonst „Spieler n“ */
  plate: string;
  /** niemand sitzt am Platz */
  free: boolean;
  /** freier Platz: wer zuletzt dort saß (8.7); sonst leer */
  last: string;
};

export function seatNames(state: KlioTable, seat: SeatId): SeatNames {
  const s = state.seats[seat];
  const numbered = t('room.player', { n: seatNo(seat) });
  const character = sheetOf(state, seat).name.trim() || numbered;
  const name = (s.name ?? '').trim();
  const person = s.occupied ? name : '';
  return { character, person, label: person ? `${character} · ${person}` : character, plate: person || numbered, free: !s.occupied, last: s.occupied ? '' : name };
}
