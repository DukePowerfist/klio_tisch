// Ereignis → Effekt, an einer Stelle (ARCHITEKTUR.md 11): Meldungen (Texte aus eventText.ts), Kartenbewegungen (an
// animator.svelte.ts), Hervorhebung, Ergebnisfenster.
// Dauern stehen in theme.css; bei „Bewegung reduzieren“ sind die Bewegungen aus.

import type { EngineEvent, SeatId } from '../engine/types';
import { seatNo } from '../engine/zones';
import type { KlioEvent } from '../rules/klio/events';
import { afterReveal, noteEvents } from './animator.svelte';
import { describe } from './eventText';
import { session } from './session.svelte';
import { t } from './texts';
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
  /** Bögen, die gerade einen Treffer zeigen */
  hit = new Pulse<SeatId>();
  /** eigene Textfelder (`seat1/name`), die gerade jemand anderes geändert hat */
  overwritten = new Pulse<string>();
  /** zuletzt selbst gesendeter Wert je Feld */
  private edits = new Map<string, { value: unknown; at: number }>();

  constructor() {
    // Eigene Eingaben merken, egal von wo gesendet
    session.onSubmit((cmd) => {
      if (cmd.type === 'sheet.setText' || cmd.type === 'sheet.setNumber') this.edits.set(`${cmd['seat']}/${cmd['field']}`, { value: cmd['value'], at: Date.now() });
    });
    session.onEvents((events, own, prev) => {
      // Bewegungen der Karten: eigene Züge kürzer, fremde länger, mehrere gestaffelt, Mischen, Schaden (11)
      if (session.state) noteEvents(events, own, prev, session.state);
      for (const e of events) {
        if (!own && e.type === 'fieldsChanged') this.foreignChange(e.seat, e.changes);
        this.handle(e);
      }
    });
  }

  /** Jemand anderes hat ein Feld geändert, das man selbst gerade bearbeitet hat: kurzer Hinweis (8.2). */
  private foreignChange(seat: SeatId, changes: { field: string; value: unknown }[]): void {
    const hit = changes.filter((c) => {
      const mine = this.edits.get(`${seat}/${c.field}`);
      return mine && Date.now() - mine.at < EDIT_MS && mine.value !== c.value;
    }).map((c) => `${seat}/${c.field}`);
    if (hit.length === 0) return;
    for (const key of hit) this.edits.delete(key);
    this.overwritten.add(hit);
    view.say(t('settings.fieldChanged', { seat: seatNo(seat) }));
  }

  private handle(e: EngineEvent | KlioEvent): void {
    const d = describe(e);
    if (d && d.level !== 'log') {
      const say = () => view.say(d.text, d.level === 'warn');
      // gezogen und aufgedeckt: erst das Ziel zeigen, dann den Wert (11.1); das Protokoll trägt sofort ein
      if (e.type === 'cardDrawn' && e.faceUp) afterReveal(e.card, say);
      else say();
    }
    switch (e.type) {
      case 'damageTaken':
        this.hit.add([e.seat]);
        return;
      // Ergebnis sehen alle (13.1): das Fenster öffnet sich mit dem Ereignis
      case 'expeditionRolled':
        view.gmDialog = 'expedition';
        return;
      case 'oracleDrawn':
        view.gmDialog = 'oracle';
        return;
    }
  }
}

export const effects = new Effects();
