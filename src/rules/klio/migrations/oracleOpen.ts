// Format 4 → 5 (Schritt 5zh, ARCHITEKTUR.md 11.14): Die Kartenschachtel ist offen oder zu (`game.oracleOpen`). Alte
// Stände mit Orakel kommen offen an, damit nach dem Laden nichts verschwindet, was eben noch zu lesen war; ohne zu.

import type { Migration } from '../../../engine/types';

export const oracleOpen: Migration = {
  from: 4,
  migrate(stored) {
    const s = stored as { game?: { oracle?: unknown } };
    if (!s.game || typeof s.game !== 'object') return stored;
    return { ...s, game: { ...s.game, oracleOpen: s.game.oracle != null } };
  },
};
