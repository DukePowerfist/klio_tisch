// Format 3 → 4 (Schritt 5n, ARCHITEKTUR.md 11.9): Der Stand trägt, ob die Laterne brennt. Alte Stände bekommen eine
// brennende Laterne.

import type { Migration } from '../types';

export const lampStep: Migration = { from: 3, migrate: (stored) => ({ ...(stored as object), lamp: true }) };
