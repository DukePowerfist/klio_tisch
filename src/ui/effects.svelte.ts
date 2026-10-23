// Ereignis → Effekt, an einer Stelle (ARCHITEKTUR.md 11): Meldungen (Texte aus eventText.ts), Kartenbewegungen (an
// animator.svelte.ts), Hervorhebung, Ergebnisfenster.
// Dauern stehen in theme.css; bei „Bewegung reduzieren“ sind die Bewegungen aus.

import type { EngineEvent, SeatId } from '../engine/types';
import { seatNo } from '../engine/zones';
import type { KlioEvent, KlioEventOf } from '../rules/klio/events';
import { afterReveal, noteEvents, strikeImpacted } from './animator.svelte';
import { NOTICE_ARRIVALS } from './arrivals';
import { describe, noticeArrival } from './eventText';
import { rolledRows } from './resultRoll';
import { session, type KlioTableState } from './session.svelte';
import { t } from './texts';
import { view } from './view.svelte';

const PULSE_MS = 650;
/** so lange gilt ein eigener Eintrag als „gerade bearbeitet“ (Hinweis bei fremder Änderung, 8.2) */
const EDIT_MS = 5 * 60_000;

/** Menge, deren Einträge nach kurzer Zeit (bzw. wenn `until` erfüllt ist) von selbst wieder verschwinden (reaktiv). */
class Pulse<K> {
  private items = $state.raw<ReadonlySet<K>>(new Set());
  has = (k: K): boolean => this.items.has(k);
  add(keys: K[], until: Promise<unknown> = new Promise((r) => setTimeout(r, PULSE_MS))): void {
    this.items = new Set([...this.items, ...keys]);
    void until.then(() => (this.items = new Set([...this.items].filter((k) => !keys.includes(k)))));
  }
}

/** Schlüssel eines Feldes am Bogen: `seat1/name` */
const key = (seat: SeatId, field: string): string => `${seat}/${field}`;
/** Folgen eines Treffers (rules/klio/reactions/damage.ts): erscheinen erst mit dem Aufprall (5k) */
const isDamageResult = (e: EngineEvent | KlioEvent): e is Extract<KlioEvent, { type: 'scarMarked' | 'characterDied' }> =>
  e.type === 'scarMarked' || e.type === 'characterDied';

class Effects {
  /** Bögen, die gerade einen Treffer zeigen */
  hit = new Pulse<SeatId>();
  /** gerade angekommene Plätze (`seat2/new`, `seat2/back`; 11.7): Bogen und Schild zeigen es einmal */
  arrived = new Pulse<string>();
  /** Zeiger, die beim nächsten Erscheinen über dem Tisch einmal einen Ring zeigen (Peer-IDs) */
  pings = $state.raw<ReadonlySet<string>>(new Set());
  pinged(peer: string): void {
    this.pings = new Set([...this.pings].filter((p) => p !== peer));
  }
  /** eigene Textfelder (`seat1/name`), die gerade jemand anderes geändert hat */
  overwritten = new Pulse<string>();
  /** Narben und Tod, die der Bogen erst mit dem Aufprall zeigt (`seat1/scars.heart`, `seat1/dead`; 5k) */
  private held = new Pulse<string>();
  holds = (seat: SeatId, what: string): boolean => this.held.has(key(seat, what));
  /** tot, sobald der Bogen es zeigt (erst mit dem Aufprall, 5k): Kreuz am Bogen, „Wiederbeleben“ im Menü */
  shownDead = (seat: SeatId, sheet: { dead: boolean }): boolean => sheet.dead && !this.holds(seat, 'dead');
  /** zuletzt selbst gesendeter Wert je Feld */
  private edits = new Map<string, { value: unknown; at: number }>();
  /** Zeilen des zuletzt gesendeten eigenen Wurfs der Expedition, bis das eigene Ereignis dazu kommt */
  private ownRoll: number[] | null = null;

  constructor() {
    // Kommen und Gehen (11.7): Meldung bei allen außer der Person selbst, sofern die SL sie nicht abgeschaltet hat
    session.onArrivals((signals, state) => {
      // Ankommen am Bogen (Teil 4): `seat2/new` bzw. `seat2/back`
      const arrived = signals.flatMap((x) => (x.type === 'arrived' ? [key(x.seat, x.how)] : []));
      if (arrived.length > 0) this.arrived.add(arrived);
      // Ring am Zeiger, sobald er über dem Tisch erscheint (Teil 5): neu oder wieder da, SL nach „weg“; nicht man selbst
      const peers = signals.flatMap((x) => (x.type === 'arrived' && x.peer ? [x.peer] : x.type === 'gmBack' ? [x.peer] : []));
      if (peers.length > 0) this.pings = new Set([...this.pings, ...peers]);
      if (state.settings.automation[NOTICE_ARRIVALS] === false) return;
      const texts = signals.flatMap((s) => noticeArrival(s, state.seats) ?? []);
      if (texts.length > 0) view.say(texts.join(' '));
    });
    // Eigene Eingaben merken, egal von wo gesendet
    session.onSubmit((cmd) => {
      // eigener Wurf der Expedition: welche Zeile (ohne `table` alle); gilt nur für das eigene Ereignis dazu (5t, Q3)
      if (cmd.type === 'gm.expedition') this.ownRoll = typeof cmd['table'] === 'number' ? [cmd['table']] : [0, 1, 2, 3];
      if (cmd.type === 'sheet.setText' || cmd.type === 'sheet.setNumber') this.edits.set(key(cmd['seat'] as SeatId, String(cmd['field'])), { value: cmd['value'], at: Date.now() });
    });
    session.onEvents((events, own, prev) => {
      // Bewegungen der Karten: eigene Züge kürzer, fremde länger, mehrere gestaffelt, Mischen, Schaden (11)
      if (session.state) noteEvents(events, own, prev, session.state);
      this.holdDamage(events);
      for (const e of events) {
        if (!own && e.type === 'fieldsChanged') this.foreignChange(e.seat, e.changes);
        if (e.type === 'expeditionRolled' || e.type === 'oracleDrawn') this.rolled(e, own, prev);
        if (!isDamageResult(e)) this.handle(e);
      }
    });
  }

  /** Folgen eines Treffers (Narbe, Tod) erst mit dem Aufprall zeigen: nach dem Aufdecken der getroffenen Karte und
   *  dem Weg nach unten (5k). Bis dahin zeigt der Bogen den alten Stand; das Protokoll trägt sofort ein. */
  private holdDamage(events: readonly (EngineEvent | KlioEvent)[]): void {
    const later = events.filter(isDamageResult);
    if (later.length === 0) return;
    const impact = strikeImpacted();
    this.held.add(later.map((e) => key(e.seat, e.type === 'scarMarked' ? `scars.${e.scar}` : 'dead')), impact);
    void impact.then(() => { for (const e of later) this.handle(e); });
  }

  /** Jemand anderes hat ein Feld geändert, das man selbst gerade bearbeitet hat: kurzer Hinweis (8.2). */
  private foreignChange(seat: SeatId, changes: { field: string; value: unknown }[]): void {
    const hit = changes.filter((c) => {
      const mine = this.edits.get(key(seat, c.field));
      return mine && Date.now() - mine.at < EDIT_MS && mine.value !== c.value;
    }).map((c) => key(seat, c.field));
    if (hit.length === 0) return;
    for (const k of hit) this.edits.delete(k);
    this.overwritten.add(hit);
    view.say(t('settings.fieldChanged', { seat: seatNo(seat) }));
  }

  /** Was im Ergebnisfenster kurz einblendet (5t, 10.6, P1): am Ereignis, nicht am Text, also auch bei gleichem Ergebnis.
   *  Orakel: beide Begriffe. Expedition: geänderte Zeilen, beim eigenen Wurf dazu die gewürfelte(n). */
  private rolled(e: KlioEventOf<'expeditionRolled'> | KlioEventOf<'oracleDrawn'>, own: boolean, prev: KlioTableState | null): void {
    let parts: number[];
    if (e.type === 'oracleDrawn') parts = [0, 1];
    else {
      parts = rolledRows(prev?.game.expedition, e.expedition, own, this.ownRoll);
      if (own) this.ownRoll = null;
    }
    view.gmRoll = { n: (view.gmRoll?.n ?? 0) + 1, kind: e.type === 'oracleDrawn' ? 'oracle' : 'expedition', parts };
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
