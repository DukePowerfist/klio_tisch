// Format 5 → 6 (Schritt 6a): Zähler für das Kartenbudget (`game.budget`), aus, Vorschlag 3.

import type { Migration } from '../../../engine/types';
import { initialBudget } from '../state';

export const budget: Migration = {
  from: 5,
  migrate(stored) {
    const s = stored as { game?: object };
    if (!s.game || typeof s.game !== 'object') return stored;
    return { ...s, game: { ...s.game, budget: initialBudget() } };
  },
};
