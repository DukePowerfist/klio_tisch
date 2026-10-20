// Ablauf des Trumpf-Dialogs (ARCHITEKTUR.md 6.2, 14): sammelt alle Entscheidungen lokal,
// am Ende geht ein einziger Befehl an den Host. Reine Funktionen auf Inhalten und Bogen.

import type { SeatId, TextRef } from '../engine/types';
import { attrValue, ATTRS, filledWeaknesses, trumpCount, type Attr, type BlockContext, type Choices, type Trump } from '../rules/klio/blocks';
import type { KlioContent } from '../rules/klio/content/validate';
import type { KlioSheet } from '../rules/klio/state';
import { sourceStatus, stepsOf, trumpProblem, type Source, type StepName } from '../rules/klio/trumps';

export type Category = 'K' | 'V' | 'P' | 'X';
export const CATEGORIES: Category[] = ['K', 'V', 'P', 'X'];

/** Gewählter Weg: ein Eintrag aus trump-sources.yaml oder die freie Wahl. */
export type Path = { kind: 'source'; source: Source; improveOnly: boolean } | { kind: 'free' };

/** Der Dialog Schritt für Schritt; `choices` wächst mit jedem Schritt. */
export type DialogStep =
  | { at: 'sources' }
  | { at: StepName; path: Path & { kind: 'source' }; choices: Choices; index: number }
  | { at: 'strengthText'; path: Path & { kind: 'source' }; choices: Choices; index: number; strength: number }
  | { at: 'categories'; path: Path; choices: Choices }
  | { at: 'trumps'; path: Path; choices: Choices; category: Category };

export function context(content: KlioContent, sheet: KlioSheet): BlockContext {
  return { sheet, attrNames: content.texts['attributes'] as Record<Attr, string> };
}

export type SourceRow = { source: Source; ok: boolean; why: TextRef | null; improveOnly: boolean };

export function sourceRows(content: KlioContent, ctx: BlockContext): SourceRow[] {
  const cfg = content.trumpSources;
  return cfg.trumpSources.map((source) => {
    const st = sourceStatus(cfg, source, ctx);
    return st.ok ? { source, ok: true, why: null, improveOnly: st.improveOnly } : { source, ok: false, why: st.why, improveOnly: false };
  });
}

/** Ist irgendein Weg offen? (goldenes Plus am leeren Trumpf-Platz) */
export const anySourceOpen = (content: KlioContent, ctx: BlockContext): boolean => sourceRows(content, ctx).some((r) => r.ok);

export const isFull = (content: KlioContent, sheet: KlioSheet): boolean => trumpCount(sheet) >= content.trumpSources.maxTrumps;

/** Nächster Schritt nach `index` (bzw. Kategorien, wenn ein Trumpf folgt; null = fertig ohne Trumpf). */
export function nextStep(path: Path & { kind: 'source' }, choices: Choices, index: number, ctx: BlockContext): DialogStep | null {
  const list = stepsOf(path.source, path.improveOnly);
  for (let i = index; i < list.length; i++) {
    const s = list[i]!;
    // Schwäche streichen entfällt, wenn beide leer sind (A29)
    if (s.name === 'chooseWeaknessToRemove' && filledWeaknesses(ctx.sheet).length === 0) continue;
    return { at: s.name, path, choices, index: i };
  }
  return path.improveOnly ? null : { at: 'categories', path, choices };
}

export function stepRequired(path: Path & { kind: 'source' }, name: StepName): boolean {
  return stepsOf(path.source, path.improveOnly).find((s) => s.name === name)?.required ?? false;
}

export type TrumpRow = { trump: Trump; why: TextRef | null };

export function trumpRows(content: KlioContent, ctx: BlockContext, path: Path, choices: Choices, category: Category): TrumpRow[] {
  const src = path.kind === 'free' ? 'free' : path.source;
  return content.trumps
    .filter((t) => t.category === category)
    .map((trump) => ({ trump, why: trumpProblem(content.trumpSources, src, trump, ctx, choices) }));
}

export const selectableCount = (content: KlioContent, ctx: BlockContext, path: Path, choices: Choices, category: Category): number =>
  trumpRows(content, ctx, path, choices, category).filter((r) => !r.why).length;

/** Der Befehl am Ende des Dialogs. */
export function finalCommand(seat: SeatId, path: Path, choices: Choices, trump: string | undefined): object {
  if (path.kind === 'free') return { type: 'trump.chooseFree', seat, trump };
  return { type: 'trump.choose', seat, source: path.source.id, ...(trump ? { trump } : {}), ...choices };
}

/** Attribut-Knöpfe beim Umverteilen: Verringern nur ab 1, Erhöhen nicht auf das verringerte. */
export function attributeOptions(ctx: BlockContext, lowered: Attr | undefined) {
  return ATTRS.map((a) => ({
    attr: a,
    value: attrValue(ctx.sheet, a),
    canLower: attrValue(ctx.sheet, a) >= 1,
    canRaise: a !== lowered && attrValue(ctx.sheet, a) < 9,
  }));
}
