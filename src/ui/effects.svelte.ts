// Ereignis → Effekt, an einer Stelle (ARCHITEKTUR.md 11): Meldungen, Rucken, Hervorhebung, Ergebnisfenster.
// Dauern stehen in theme.css; bei „Bewegung reduzieren“ sind die Bewegungen aus.

import content from 'virtual:klio-content';
import type { EngineEvent, SeatId, ZoneId } from '../engine/types';
import { seatNo, seatZoneId } from '../engine/zones';
import type { KlioEvent } from '../rules/klio/events';
import { trumpById } from '../rules/klio/trumps';
import { session } from './session.svelte';
import { cardName, hasText, t } from './texts';
import { view } from './view.svelte';

const PULSE_MS = 650;

/** Menge, deren Einträge nach kurzer Zeit von selbst wieder verschwinden (reaktiv). */
class Pulse<K> {
  private items = $state.raw<ReadonlySet<K>>(new Set());
  has = (k: K): boolean => this.items.has(k);
  values = (): K[] => [...this.items];
  add(keys: K[]): void {
    this.items = new Set([...this.items, ...keys]);
    setTimeout(() => (this.items = new Set([...this.items].filter((k) => !keys.includes(k)))), PULSE_MS);
  }
}

class Effects {
  /** Zonen, deren Karten gerade rucken */
  shaking = new Pulse<ZoneId>();
  /** Bögen, die gerade einen Treffer zeigen */
  hit = new Pulse<SeatId>();

  constructor() {
    session.onEvents((events) => {
      for (const e of events as (EngineEvent | KlioEvent)[]) this.handle(e);
    });
  }

  private handle(e: EngineEvent | KlioEvent): void {
    switch (e.type) {
      case 'cardDrawn':
        if (e.announce) view.say(t(drawnKey(e.to), { card: cardName(e.card) }));
        return;
      case 'zonesShuffled':
        return this.shaking.add(e.shuffled);
      case 'damageTaken':
        this.shaking.add([seatZoneId(e.seat, 'damage')]);
        this.hit.add([e.seat]);
        return;
      case 'scarMarked':
        return view.say(t('toast.scar', { seat: seatNo(e.seat), suit: t(`scars.${e.scar}`) }), true);
      case 'characterDied':
        return view.say(t('toast.dead', { seat: seatNo(e.seat) }), true);
      // Ergebnis sehen alle (13.1): das Fenster öffnet sich mit dem Ereignis
      case 'expeditionRolled':
        view.gmDialog = 'expedition';
        return;
      case 'oracleDrawn':
        view.gmDialog = 'oracle';
        return;
      case 'sheetRolled':
        return view.say(t('toast.rolled', { seat: seatNo(e.seat) }));
      case 'trumpChosen': {
        const trump = trumpById(content.trumps, e.trump);
        return view.say(trump ? t('toast.trumpChosen', { seat: seatNo(e.seat), trump: trump.name }) : t('toast.strengthImproved', { seat: seatNo(e.seat) }));
      }
    }
  }
}

/** Meldung je Ziel (texts: toast.drawnTo.<zone>), sonst „Aufgedeckt“. */
function drawnKey(to: ZoneId): string {
  const specific = `toast.drawnTo.${to}`;
  return hasText(specific) ? specific : 'toast.drawn';
}

export const effects = new Effects();
