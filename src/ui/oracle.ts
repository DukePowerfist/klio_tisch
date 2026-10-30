// Orakelkarten (5ze, ARCHITEKTUR.md 11.13): Wort und Karte je gezogener Karte, für die Schachtel und das Protokoll.

import content from 'virtual:klio-content';
import type { CardId } from '../engine/types';
import { cardName, t } from './texts';

export type OracleDraw = { suit: 'H' | 'S' | 'C'; rank: string };
export type OracleCard = { word: string; card: CardId };

export const oracleCards = (o: readonly OracleDraw[] | null): OracleCard[] =>
  o ? o.map((d) => ({ word: content.expedition.oracle[d.suit][d.rank as '2'], card: `${d.suit}${d.rank}` as CardId })) : [];

/** „bunt (Herz 7), verlockend (Pik D)“ */
export const oracleText = (cards: readonly OracleCard[]): string =>
  cards.map((c) => t('gm.oracleWord', { word: c.word, card: cardName(c.card) })).join(', ');
