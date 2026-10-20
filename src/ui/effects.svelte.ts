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
/** so lange gilt ein eigener Eintrag als „gerade bearbeitet“ (Hinweis bei fremder Änderung, 8.2) */
const EDIT_MS = 5 * 60_000;

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
  /** eigene Textfelder (`seat1/name`), die gerade jemand anderes geändert hat */
  overwritten = new Pulse<string>();
  /** zuletzt selbst gesendeter Wert je Feld */
  private edits = new Map<string, { value: unknown; at: number }>();

  constructor() {
    session.onEvents((events, own) => {
      for (const e of events as (EngineEvent | KlioEvent)[]) {
        if (!own && e.type === 'fieldsChanged') this.foreignChange(e.seat, e.changes);
        this.handle(e);
      }
    });
  }

  /** Eigene Eingabe in einem Textfeld merken. */
  noteEdit(seat: SeatId, field: string, value: unknown): void {
    this.edits.set(`${seat}/${field}`, { value, at: Date.now() });
  }

  /** Jemand anderes hat ein Feld geändert, das man selbst gerade bearbeitet hat: kurzer Hinweis (8.2). */
  private foreignChange(seat: SeatId, changes: { field: string; value: unknown }[]): void {
    const hit = changes.map((c) => `${seat}/${c.field}`).filter((key, i) => {
      const mine = this.edits.get(key);
      return mine && Date.now() - mine.at < EDIT_MS && mine.value !== changes[i]!.value;
    });
    if (hit.length === 0) return;
    for (const key of hit) this.edits.delete(key);
    this.overwritten.add(hit);
    view.say(t('settings.fieldChanged', { seat: seatNo(seat) }));
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
