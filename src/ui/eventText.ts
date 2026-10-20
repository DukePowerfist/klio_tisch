// Ereignis → Text, an einer Stelle für Meldungen (Toast) und Spielprotokoll (ARCHITEKTUR.md 11).
// `toast`: erscheint auch als Meldung; `warn`: rot.

import content from 'virtual:klio-content';
import type { EngineEvent, ZoneId } from '../engine/types';
import { seatNo } from '../engine/zones';
import type { KlioEvent } from '../rules/klio/events';
import { trumpById } from '../rules/klio/trumps';
import { cardName, hasText, t } from './texts';

export type EventText = { text: string; toast: boolean; warn: boolean };

const say = (text: string, toast = false, warn = false): EventText => ({ text, toast, warn });

export function describe(e: EngineEvent | KlioEvent): EventText | null {
  switch (e.type) {
    case 'cardDrawn':
      return e.announce ? say(t(drawnKey(e.to), { card: cardName(e.card) }), true) : null;
    case 'zonesShuffled':
      return say(t('log.shuffled', { zones: e.shuffled.map(zoneName).filter(Boolean).join(', ') }));
    case 'cardsReset':
      return say(t('log.reset'));
    case 'charactersReset':
      return say(t('log.charactersReset'));
    case 'scarMarked':
      return say(t('toast.scar', { seat: seatNo(e.seat), suit: t(`scars.${e.scar}`) }), true, true);
    case 'characterDied':
      return say(t('toast.dead', { seat: seatNo(e.seat) }), true, true);
    case 'characterRevived':
      return say(t('log.revived', { seat: seatNo(e.seat) }));
    case 'sheetRolled':
      return say(t('toast.rolled', { seat: seatNo(e.seat) }), true);
    case 'trumpChosen': {
      const trump = trumpById(content.trumps, e.trump);
      return say(trump ? t('toast.trumpChosen', { seat: seatNo(e.seat), trump: trump.name }) : t('toast.strengthImproved', { seat: seatNo(e.seat) }), true);
    }
    case 'trumpRemoved':
      return say(t('log.trumpRemoved', { seat: seatNo(e.seat) }));
    case 'expeditionRolled':
      return say(t('log.expedition', { result: e.expedition.map((n, i) => content.expedition.expedition[i]!.entries[n]).join(' · ') }));
    case 'oracleDrawn':
      return say(t('log.oracle', { words: e.oracle.map((d) => content.expedition.oracle[d.suit][d.rank]).join(', ') }));
    default:
      return null;
  }
}

/** Meldung je Ziel (texts: toast.drawnTo.<zone>), sonst „Aufgedeckt“. */
function drawnKey(to: ZoneId): string {
  const specific = `toast.drawnTo.${to}`;
  return hasText(specific) ? specific : 'toast.drawn';
}

const zoneName = (id: ZoneId): string => (hasText(`zones.${id}`) ? t(`zones.${id}`) : '');
