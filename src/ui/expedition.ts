// Kartenwert am Expeditionsblatt (5zf, ARCHITEKTUR.md 10.13): Antwort und Karte je Tabelle, für die Leselage und das
// Protokoll. Vorbild ist oracle.ts (5ze).

import content from 'virtual:klio-content';
import { RANKS, type CardId, type RankId, type SuitId } from '../engine/types';
import { cardName, isRed, rankText, SUIT_SYMBOL, t } from './texts';

/** Die Farbe zieht der Stand heute nicht (das Regelwerk nennt keine); kommt sie dazu, reicht sie nur hier durch. */
export type ExpeditionCard = { entry: string; rank: RankId; suit?: SuitId };

/** Regelwerk 2.1, S. 16 f.: jede Tabelle hat die Werte 2 bis 14, Eintrag i gehört zum Wert i + 2, also zu `RANKS[i]`. */
export const expeditionCards = (e: readonly number[] | null): ExpeditionCard[] =>
  e ? e.map((n, i) => ({ entry: content.expedition.expedition[i]!.entries[n]!, rank: RANKS[n]! })) : [];

/** Eckzeichen: Wert, darunter das Symbol nur mit Farbe */
export const expeditionIndex = (c: ExpeditionCard): { rank: string; suit?: { symbol: string; red: boolean } } => ({
  rank: rankText(c.rank),
  ...(c.suit && { suit: { symbol: SUIT_SYMBOL[c.suit], red: isRed(cardOf(c, c.suit)) } }),
});

const cardOf = (c: ExpeditionCard, suit: SuitId): CardId => `${suit}${c.rank}` as CardId;

/** Name der Karte: ohne Farbe nur der Wert („D“), mit Farbe wie beim Orakel („Herz D“) */
const cardText = (c: ExpeditionCard): string => (c.suit ? cardName(cardOf(c, c.suit)) : rankText(c.rank));

/** „in eine eisige Bergwelt. (2) · … (D) · …“ */
export const expeditionText = (cards: readonly ExpeditionCard[]): string =>
  cards.map((c) => t('gm.expeditionEntry', { entry: c.entry, card: cardText(c) })).join(' · ');
