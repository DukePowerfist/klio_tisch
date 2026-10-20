// Ereignis → Effekt, an einer Stelle (ARCHITEKTUR.md 11): Meldungen, Rucken beim Mischen.
// Weitere Effekte (Narbe, Tod, Trumpf) kommen hier dazu; Dauern stehen in theme.css.

import type { EngineEvent, ZoneId } from '../engine/types';
import { session } from './session.svelte';
import { cardName, hasText, t } from './texts';
import { view } from './view.svelte';

const SHAKE_MS = 650;

class Effects {
  /** Zonen, deren Karten gerade rucken */
  shaking = $state.raw<ReadonlySet<ZoneId>>(new Set());

  constructor() {
    session.onEvents((events) => {
      for (const e of events as EngineEvent[]) this.handle(e);
    });
  }

  private handle(e: EngineEvent): void {
    switch (e.type) {
      case 'cardDrawn':
        if (e.announce) view.say(t(drawnKey(e.to), { card: cardName(e.card) }));
        return;
      case 'zonesShuffled':
        this.shaking = new Set(e.shuffled);
        setTimeout(() => (this.shaking = new Set()), SHAKE_MS);
        return;
    }
  }
}

/** Meldung je Ziel (texts: toast.drawnTo.<zone>), sonst „Aufgedeckt“. */
function drawnKey(to: ZoneId): string {
  const specific = `toast.drawnTo.${to}`;
  return hasText(specific) ? specific : 'toast.drawn';
}

export const effects = new Effects();
