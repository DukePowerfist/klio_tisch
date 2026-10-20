// Oberflächentexte aus texts.de.yaml (A23) und Texte an den Trumpf-Wegen.

import content from 'virtual:klio-content';
import type { CardId, RankId, SuitId, TextRef } from '../engine/types';
import type { TextTree } from '../rules/klio/content/schema';

function lookup(key: string): string | undefined {
  const parts = key.split('.');
  if (parts[0] === 'source') {
    const src = content.trumpSources.trumpSources.find((s) => s.id === parts[1]);
    return src?.text[parts[2] as 'why' | 'levelWhy'];
  }
  let node: string | TextTree | undefined = content.texts;
  for (const p of parts) node = typeof node === 'object' ? node[p] : undefined;
  return typeof node === 'string' ? node : undefined;
}

/** Text mit Platzhaltern füllen; fehlt der Text, wird der Schlüssel angezeigt (fällt sofort auf). */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const text = lookup(key) ?? key;
  return text.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`));
}

export const text = (ref: TextRef): string => t(ref.key, ref.params);

export function cardName(card: CardId): string {
  const suit = card[0] as SuitId;
  const rank = card.slice(1) as RankId;
  return t('cards.name', { suit: t(`cards.suits.${suit}`), rank: lookup(`cards.ranks.${rank}`) ?? rank });
}

/** Kurzbezeichnung auf der Karte: 2–10, B, D, K, A (13.1). */
export const rankLabel = (card: CardId): string => lookup(`cards.ranks.${card.slice(1)}`) ?? card.slice(1);

export const SUIT_SYMBOL: Record<SuitId, string> = { H: '♥', S: '♠', C: '♣', D: '♦' };
export const isRed = (card: CardId): boolean => card[0] === 'H' || card[0] === 'D';
