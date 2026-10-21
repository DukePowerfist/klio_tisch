// Ereignis → Text, an einer Stelle für Meldungen (Toast) und Spielprotokoll (ARCHITEKTUR.md 11).
// Stufe: `log` nur im Protokoll, `toast` auch als Meldung, `warn` als rote Meldung.

import content from 'virtual:klio-content';
import type { EngineEvent, ZoneId } from '../engine/types';
import { seatNo } from '../engine/zones';
import type { KlioEvent } from '../rules/klio/events';
import { trumpById } from '../rules/klio/trumps';
import { cardName, hasText, t, tMaybe } from './texts';

export type EventText = { text: string; level: 'log' | 'toast' | 'warn' };

const say = (text: string, level: EventText['level'] = 'log'): EventText => ({ text, level });

export function describe(e: EngineEvent | KlioEvent): EventText | null {
  switch (e.type) {
    case 'cardDrawn':
      return e.announce ? say(t(drawnKey(e.to), { card: cardName(e.card) }), 'toast') : null;
    case 'zonesShuffled':
      return say(t('log.shuffled', { zones: e.shuffled.map(zoneName).filter(Boolean).join(', ') }));
    case 'cardsReset':
      return say(t('log.reset'));
    case 'charactersReset':
      return say(t('log.charactersReset'));
    case 'characterReset':
      return say(t('log.characterReset', { seat: seatNo(e.seat) }));
    case 'characterImported':
      return say(t('log.characterImported', { seat: seatNo(e.seat) }));
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

const zoneName = (id: ZoneId): string => tMaybe(`zones.${id}`) ?? '';
