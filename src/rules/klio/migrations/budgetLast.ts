// Format 6 → 7 (Schritt 6a): Jede Aktion beginnt mit Budget 0, man zählt hoch. Der Vorschlag aus der letzten Aktion
// (`game.budget.last`) entfällt.

import type { Migration } from '../../../engine/types';

export const budgetLast: Migration = {
  from: 6,
  migrate(stored) {
    const s = stored as { game?: { budget?: object } };
    if (!s.game?.budget || typeof s.game.budget !== 'object') return stored;
    const { last: _, ...budget } = s.game.budget as { last?: unknown };
    return { ...s, game: { ...s.game, budget } };
  },
};
