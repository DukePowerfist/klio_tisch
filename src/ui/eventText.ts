// Ereignis → Text, an einer Stelle für Meldungen (Toast) und Spielprotokoll (ARCHITEKTUR.md 11).
// Stufe: `log` nur im Protokoll, `toast` auch als Meldung, `warn` als rote Meldung.

import content from 'virtual:klio-content';
import type { EngineEvent, SeatId, TableState, ZoneId } from '../engine/types';
import { seatNo } from '../engine/zones';
import type { KlioEvent } from '../rules/klio/events';
import { trumpById } from '../rules/klio/trumps';
import type { ArrivalSignal } from './arrivals';
import { expeditionCards, expeditionText } from './expedition';
import { oracleCards, oracleText } from './oracle';
import { cardName, hasText, t, tMaybe } from './texts';

export type EventText = { text: string; level: 'log' | 'toast' | 'warn' };

const say = (text: string, level: EventText['level'] = 'log'): EventText => ({ text, level });

/** `seats`: Namen für Einträge, die eine Person nennen (Laterne); ohne sie „Spieler n“. */
export function describe(e: EngineEvent | KlioEvent, seats?: TableState<unknown>['seats']): EventText | null {
  switch (e.type) {
    case 'cardDrawn':
      return e.announce ? say(t(drawnKey(e.to), { card: cardName(e.card) }), 'toast') : null;
    case 'zonesShuffled':
      return say(t('log.shuffled', { zones: e.shuffled.map(zoneName).filter(Boolean).join(', ') }));
    case 'cardsReset':
      return say(t('log.reset'));
    case 'lampChanged': {
      // Person am Platz wie bei Schild und Zeiger (seatNames): ihr Name, sonst „Spieler n“
      const who = e.by === 'gm' || e.by === 'spectator' ? t(`log.lamp.${e.by}`) : person(e.by, seats);
      return say(t(e.lit ? 'log.lamp.lit' : 'log.lamp.out', { who }));
    }
    // Kartenbudget (6a): Beginn, Wechsel der Person, Vorteil/Nachteil, Sperre, Ende; das Budget selbst (▲/▼) nicht
    case 'budgetStarted':
      return say(e.left ? t('log.budget.started', { who: person(e.seat, seats), n: e.left }) : t('log.budget.startedUnset', { who: person(e.seat, seats) }));
    case 'budgetChanged': {
      const parts = [
        ...(e.seat ? [t('log.budget.seat', { who: person(e.seat, seats) })] : []),
        ...(e.advantage === undefined ? [] : [t(e.advantage ? 'log.budget.advantageOn' : 'log.budget.advantageOff')]),
        ...(e.disadvantage === undefined ? [] : [t(e.disadvantage ? 'log.budget.disadvantageOn' : 'log.budget.disadvantageOff')]),
      ];
      return parts.length ? say(t('log.budget.changed', { what: parts.join(', ') })) : null;
    }
    case 'budgetSpent':
      return e.lock ? say(t(`log.budget.lock.${e.lock}`)) : null;
    case 'budgetStopped':
      return e.drawn === undefined ? null : say(t('log.budget.stopped', { n: e.drawn }));
    case 'charactersReset':
      return say(t('log.charactersReset'));
    case 'characterReset':
      return say(t('log.characterReset', { seat: seatNo(e.seat) }));
    case 'characterImported':
      return say(t('log.characterImported', { seat: seatNo(e.seat) }), 'toast');
    case 'scarMarked':
      return say(t('toast.scar', { seat: seatNo(e.seat), suit: t(`scars.${e.scar}`) }), 'warn');
    case 'characterDied':
      return say(t('toast.dead', { seat: seatNo(e.seat) }), 'warn');
    case 'characterRevived':
      return say(t('log.revived', { seat: seatNo(e.seat) }));
    case 'sheetRolled':
      return say(t('toast.rolled', { seat: seatNo(e.seat) }), 'toast');
    case 'trumpChosen': {
      const trump = trumpById(content.trumps, e.trump);
      return say(trump ? t('toast.trumpChosen', { seat: seatNo(e.seat), trump: trump.name }) : t('toast.strengthImproved', { seat: seatNo(e.seat) }), 'toast');
    }
    case 'trumpRemoved':
      return say(t('log.trumpRemoved', { seat: seatNo(e.seat) }));
    case 'expeditionRolled':
      return say(t('log.expedition', { result: expeditionText(expeditionCards(e.expedition)) }));
    case 'oracleDrawn':
      return say(t('log.oracle', { words: oracleText(oracleCards(e.oracle)) }));
    default:
      return null;
  }
}

/** Person am Platz wie bei Schild und Zeiger (seatNames): ihr Name, sonst „Spieler n“ */
const person = (seat: SeatId, seats?: TableState<unknown>['seats']): string => (seats?.[seat].name ?? '').trim() || t('room.player', { n: seatNo(seat) });

/** Kommen und Gehen (11.7) → Text für Protokoll und Meldung; null, wenn es nichts zu sagen gibt (neu angekommen:
 *  steht schon mit dem Belegen im Protokoll). Namen aus dem Stand: die Person am Platz, nicht der Charakter. */
export function describeArrival(s: ArrivalSignal, seats: TableState<unknown>['seats']): string | null {
  if (s.type === 'gmBack') return null;
  const n = seatNo(s.seat);
  const name = seats[s.seat].name;
  const named = (key: string) => (name ? t(`log.seat.${key}`, { name, n }) : t(`log.seat.${key}NoName`, { n }));
  switch (s.type) {
    case 'seated':
      return named('seated');
    case 'left':
      return named('left');
    case 'arrived':
      return s.how === 'back' ? named('back') : null;
    case 'freed':
      return t('log.seat.freed', { n });
  }
}

/** Meldung (Toast) zu Kommen und Gehen: neu, nicht mehr verbunden, wieder da; nicht bei der Person selbst (wer
 *  zugewiesen oder umgesetzt wird, hat schon die Meldung aus 8.7). Text wie im Protokoll. */
export function noticeArrival(s: ArrivalSignal, seats: TableState<unknown>['seats']): string | null {
  if (s.type === 'arrived' && s.how === 'new') return s.self ? null : describeArrival({ type: 'seated', seat: s.seat }, seats);
  return s.type === 'left' || s.type === 'arrived' ? describeArrival(s, seats) : null;
}

/** Meldung je Ziel (texts: toast.drawnTo.<zone>), sonst „Aufgedeckt“. */
function drawnKey(to: ZoneId): string {
  const specific = `toast.drawnTo.${to}`;
  return hasText(specific) ? specific : 'toast.drawn';
}

const zoneName = (id: ZoneId): string => tMaybe(`zones.${id}`) ?? '';
