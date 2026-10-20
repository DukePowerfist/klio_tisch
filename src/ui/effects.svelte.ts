// Ereignis → Effekt, an einer Stelle (ARCHITEKTUR.md 11): Meldungen, Rucken, Hervorhebung.
// Dauern stehen in theme.css; bei „Bewegung reduzieren“ sind die Bewegungen aus.

import content from 'virtual:klio-content';
import { SEATS, type EngineEvent, type SeatId, type ZoneId } from '../engine/types';
import { seatZoneId } from '../engine/zones';
import type { KlioEvent } from '../rules/klio/events';
import { session } from './session.svelte';
import { cardName, hasText, t } from './texts';
import { view } from './view.svelte';

const SHAKE_MS = 650;
const seatNo = (seat: SeatId) => SEATS.indexOf(seat) + 1;

class Effects {
  /** Zonen, deren Karten gerade rucken */
  shaking = $state.raw<ReadonlySet<ZoneId>>(new Set());
  /** Bögen, die gerade einen Treffer zeigen */
  hit = $state.raw<ReadonlySet<SeatId>>(new Set());

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
        return this.shake(e.shuffled);
      case 'damageTaken':
        this.shake([seatZoneId(e.seat, 'damage')]);
        this.flash(e.seat);
        return;
      case 'scarMarked':
        return view.say(t('toast.scar', { seat: seatNo(e.seat), suit: t(`cards.suits.${e.scar === 'heart' ? 'H' : 'S'}`) }), true);
      case 'characterDied':
        return view.say(t('toast.dead', { seat: seatNo(e.seat) }), true);
      case 'sheetRolled':
        return view.say(t('toast.rolled', { seat: seatNo(e.seat) }));
      case 'trumpChosen': {
        const trump = e.trump ? content.trumps.find((x) => x.id === e.trump) : undefined;
        return view.say(trump ? t('toast.trumpChosen', { seat: seatNo(e.seat), trump: trump.name }) : t('toast.strengthImproved', { seat: seatNo(e.seat) }));
      }
    }
  }

  private shake(zones: ZoneId[]): void {
    this.shaking = new Set([...this.shaking, ...zones]);
    setTimeout(() => (this.shaking = new Set([...this.shaking].filter((z) => !zones.includes(z)))), SHAKE_MS);
  }

  private flash(seat: SeatId): void {
    this.hit = new Set([...this.hit, seat]);
    setTimeout(() => (this.hit = new Set([...this.hit].filter((s) => s !== seat))), SHAKE_MS);
  }
}

/** Meldung je Ziel (texts: toast.drawnTo.<zone>), sonst „Aufgedeckt“. */
function drawnKey(to: ZoneId): string {
  const specific = `toast.drawnTo.${to}`;
  return hasText(specific) ? specific : 'toast.drawn';
}

export const effects = new Effects();
