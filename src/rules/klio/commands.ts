// Regelwerk-Befehle (ARCHITEKTUR.md 6.2) – nur die Form; Schemas und Handler folgen in Schritt 2.
// Rechteschlüssel in Klammern (permissions.yaml).

import type { SeatId } from '../../engine/types';

type Attr = 'K' | 'V' | 'P';

/** Adresse eines Felds auf dem Bogen, z. B. `strengths.2.text`, `lamps.1`, `attributes.K` */
export type FieldPath = string;

export type KlioCommand =
  // (sheet.edit) – Besitzer: der Platz des Bogens
  | { type: 'sheet.setText'; seat: SeatId; field: FieldPath; value: string }
  | { type: 'sheet.toggle'; seat: SeatId; field: FieldPath }
  | { type: 'sheet.setNumber'; seat: SeatId; field: FieldPath; value: number | null }
  // (sheet.photo) – Foto wird vorher übertragen, der Befehl nennt nur den Hash
  | { type: 'sheet.setPhoto'; seat: SeatId; photo: { hash: string; type: 'image/jpeg' } | null }
  // (sheet.roll) – Zufall würfelt der Host
  | { type: 'sheet.roll'; seat: SeatId }
  // (trump.choose) – alle Dialogentscheidungen auf einmal, Host prüft gegen den aktuellen Stand
  | {
      type: 'trump.choose';
      seat: SeatId;
      source: string; // id aus trump-sources.yaml
      trump: string;
      removeWeakness?: 0 | 1;
      improveStrength?: { index: 0 | 1 | 2 | 3 | 4; text: string };
      moveAttribute?: { lowered: Attr; raised: Attr };
    }
  // (trump.chooseFree)
  | { type: 'trump.chooseFree'; seat: SeatId; trump: string }
  // (trump.choose) – „Zufälliger Trumpf“: Host wählt Weg, Schritte und Trumpf
  | { type: 'trump.random'; seat: SeatId }
  // (trump.remove)
  | { type: 'trump.remove'; seat: SeatId; slot: 0 | 1 | 2 | 3 }
  // (character.revive)
  | { type: 'character.revive'; seat: SeatId }
  // (table.reset) – mit Sicherung vorher (A34)
  | { type: 'table.reset'; includeCharacters: boolean }
  // (table.setPlayers)
  | { type: 'table.setPlayers'; players: 1 | 2 | 3 | 4 }
  // (table.setSettings)
  | { type: 'table.setSettings'; automation?: Record<string, boolean>; permissionOverrides?: Record<string, Record<string, 'allow' | 'deny' | 'own'>> }
  // (gm.expedition) – ohne `table`: alle vier neu
  | { type: 'gm.expedition'; table?: 0 | 1 | 2 | 3 }
  // (gm.oracle)
  | { type: 'gm.oracle' };
