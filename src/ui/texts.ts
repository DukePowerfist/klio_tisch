// Oberflächentexte aus texts.de.yaml (A23) und Texte an den Trumpf-Wegen.

import content from 'virtual:klio-content';
import { rankOf, suitOf } from '../engine/schemas';
import type { CardId, SuitId, TextRef } from '../engine/types';
import { resolveText } from '../rules/klio/content/texts';

const lookup = (key: string): string | undefined => resolveText(content, key);

export const hasText = (key: string): boolean => lookup(key) !== undefined;

/** Text mit Platzhaltern füllen; fehlt der Text, wird der Schlüssel angezeigt (fällt sofort auf). */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const text = lookup(key) ?? key;
  return text.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`));
}

/** Wie `t`, aber `undefined`, wenn es den Text nicht gibt (für optionale Titel und Hilfen). */
export const tMaybe = (key: string): string | undefined => (hasText(key) ? t(key) : undefined);

export const text = (ref: TextRef): string => t(ref.key, ref.params);

/** Kurzbezeichnung auf der Karte: 2–10, B, D, K, A (13.1). */
export const rankLabel = (card: CardId): string => lookup(`cards.ranks.${rankOf(card)}`) ?? rankOf(card);

export const cardName = (card: CardId): string => t('cards.name', { suit: t(`cards.suits.${suitOf(card)}`), rank: rankLabel(card) });

export const SUIT_SYMBOL: Record<SuitId, string> = { H: '♥', S: '♠', C: '♣', D: '♦' };
export const isRed = (card: CardId): boolean => suitOf(card) === 'H' || suitOf(card) === 'D';
