// Ablauf des Trumpf-Dialogs (ARCHITEKTUR.md 6.2, 14): sammelt alle Entscheidungen lokal,
// am Ende geht ein einziger Befehl an den Host. Die Regeln kommen aus rules/klio (Bausteine, Wege).

import type { SeatId, TextRef } from '../engine/types';
import { attrValue, ATTRS, steps, type Attr, type BlockContext, type Choices, type Trump } from '../rules/klio/blocks';
import type { KlioContent } from '../rules/klio/content/validate';
import { sourceStatus, stepSkipped, stepsOf, trumpProblem, type Source, type StepName } from '../rules/klio/trumps';

export type Category = 'K' | 'V' | 'P' | 'X';
export const CATEGORIES: Category[] = ['K', 'V', 'P', 'X'];

/** Gewählter Weg: ein Eintrag aus trump-sources.yaml oder die freie Wahl. */
export type SourcePath = { kind: 'source'; source: Source; improveOnly: boolean };
export type Path = SourcePath | { kind: 'free' };

/** Der Dialog Schritt für Schritt; `choices` wächst mit jedem Schritt. */
export type DialogStep =
  | { at: 'sources' }
  | { at: 'step'; name: StepName; required: boolean; path: SourcePath; choices: Choices; index: number }
  | { at: 'categories'; path: Path; choices: Choices }
  | { at: 'trumps'; path: Path; choices: Choices; category: Category };

export type SourceRow = { source: Source; ok: boolean; why: TextRef | null; improveOnly: boolean };

export function sourceRows(content: KlioContent, ctx: BlockContext): SourceRow[] {
  const cfg = content.trumpSources;
  return cfg.trumpSources.map((source) => {
    const st = sourceStatus(cfg, source, ctx);
    return st.ok ? { source, ok: true, why: null, improveOnly: st.improveOnly } : { source, ok: false, why: st.why, improveOnly: false };
  });
}

/** Ist irgendein Weg offen? (goldenes Plus am leeren Trumpf-Platz) */
export const anySourceOpen = (content: KlioContent, ctx: BlockContext): boolean =>
  sourceRows(content, ctx).some((r) => r.ok);

/** Nächster Schritt ab `index`; danach Kategorien, oder null, wenn kein Trumpf folgt (nur verbessern). */
export function nextStep(path: SourcePath, choices: Choices, index: number, ctx: BlockContext): DialogStep | null {
  const list = stepsOf(path.source, path.improveOnly);
  for (let i = index; i < list.length; i++) {
    const s = list[i]!;
    if (stepSkipped(s.step, ctx)) continue;
    return { at: 'step', name: s.name, required: s.required, path, choices, index: i };
  }
  return path.improveOnly ? null : { at: 'categories', path, choices };
}

export type TrumpRow = { trump: Trump; why: TextRef | null };

export function trumpRows(content: KlioContent, ctx: BlockContext, path: Path, choices: Choices): TrumpRow[] {
  const src = path.kind === 'free' ? 'free' : path.source;
  return content.trumps.map((trump) => ({ trump, why: trumpProblem(content.trumpSources, src, trump, ctx, choices) }));
}

/** Wählbare Trümpfe je Kategorie (in einem Durchgang). */
export function selectableByCategory(rows: TrumpRow[]): Record<Category, number> {
  const out: Record<Category, number> = { K: 0, V: 0, P: 0, X: 0 };
  for (const r of rows) if (!r.why) out[r.trump.category]++;
  return out;
}

/** Der Befehl am Ende des Dialogs. */
export function finalCommand(seat: SeatId, path: Path, choices: Choices, trump: string | undefined): { type: string; [key: string]: unknown } {
  if (path.kind === 'free') return { type: 'trump.chooseFree', seat, trump };
  return { type: 'trump.choose', seat, source: path.source.id, ...(trump ? { trump } : {}), ...choices };
}

/** Attribut-Knöpfe beim Umverteilen, abgeleitet aus den gültigen Möglichkeiten des Bausteins. */
export function attributeOptions(ctx: BlockContext, lowered: Attr | undefined) {
  const pairs = steps.moveAttributePoint.options(ctx).flatMap((o) => (o.moveAttribute ? [o.moveAttribute] : []));
  return ATTRS.map((a) => ({
    attr: a,
    value: attrValue(ctx.sheet, a),
    canLower: pairs.some((p) => p.lowered === a),
    canRaise: !!lowered && pairs.some((p) => p.lowered === lowered && p.raised === a),
  }));
}
