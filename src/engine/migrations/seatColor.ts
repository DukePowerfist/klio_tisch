// Format 2 → 3 (Schritt 5e): Plätze können eine gewählte Farbe tragen (`seats.*.color`). Alte Stände haben keine,
// es gilt die Voreinstellung des Platzes; zu ändern ist nichts. Die Nummer steigt trotzdem, damit eine ältere
// Fassung einen neuen Stand mit Meldung ablehnt, statt an der unbekannten Angabe zu scheitern.

import type { Migration } from '../types';

export const seatColor: Migration = { from: 2, migrate: (stored) => stored };
