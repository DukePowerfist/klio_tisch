// Bausteine für trump-sources.yaml (ARCHITEKTUR.md 7, Ebene 2).
// YAML setzt sie nur mit Parametern zusammen; jede Funktion hier hat Tests.

import { z } from 'zod';
import type { TextRef } from '../../../engine/types';
import type { Trump as TrumpSchema } from '../content/schema';
import type { FieldValue } from '../fields';
import { ATTRS, AttrSchema, type Attr, type KlioSheet } from '../state';

export { ATTRS, type Attr };
export type CheckList = 'weaknessMarks' | 'lamps';
export type Trump = z.infer<typeof TrumpSchema>;

const MAX_STRENGTH_TEXT = 70;

/** Entscheidungen aus dem Dialog, alle auf einmal im Befehl (6.2). */
export const ChoicesSchema = z.object({
  removeWeakness: z.number().int().min(0).max(1).optional(),
  improveStrength: z.object({ index: z.number().int().min(0).max(4), text: z.string().max(MAX_STRENGTH_TEXT) }).strict().optional(),
  moveAttribute: z.object({ lowered: AttrSchema, raised: AttrSchema }).strict().optional(),
});
export type Choices = z.infer<typeof ChoicesSchema>;

export type Change = { field: string; value: FieldValue };

export type BlockContext = {
  sheet: KlioSheet;
  /** Anzeigenamen der Attribute für Begründungen (texts.de.yaml) */
  attrNames: Record<Attr, string>;
};

export const attrValue = (sheet: KlioSheet, a: Attr): number => Math.max(0, sheet.attributes[a] ?? 0);
export const trumpCount = (sheet: KlioSheet): number => sheet.trumps.filter((t) => t !== null).length;
export const unimprovedStrengths = (sheet: KlioSheet): number[] =>
  sheet.strengths.flatMap((s, i) => (s.improved ? [] : [i]));
export const filledWeaknesses = (sheet: KlioSheet): number[] =>
  sheet.weaknesses.flatMap((w, i) => (w !== '' ? [i] : []));

/** Höchstes Attribut (bei Gleichstand alle höchsten); leere zählen als 0. */
export function highestAttributes(sheet: KlioSheet): Attr[] {
  const max = Math.max(...ATTRS.map((a) => attrValue(sheet, a)));
  return ATTRS.filter((a) => attrValue(sheet, a) === max);
}

// ---------- Voraussetzungen (requires) ----------

export const requires = {
  noTrumpYet: (ctx: BlockContext) => trumpCount(ctx.sheet) === 0,
  allMarked: (ctx: BlockContext, list: CheckList) => ctx.sheet[list].every(Boolean),
  atLeast: (ctx: BlockContext, p: Partial<Record<'newScars', number>>) =>
    Object.entries(p).every(([field, min]) => ctx.sheet[field as 'newScars'] >= (min ?? 0)),
};

// ---------- Filter auf Trümpfe (filters): null = passt, sonst Grund ----------

export const filters = {
  matchesHighestAttribute(ctx: BlockContext, trump: Trump): TextRef | null {
    const top = highestAttributes(ctx.sheet);
    if (trump.attributes.some((a) => top.includes(a))) return null;
    return { key: 'trumpDialog.why.highest', params: { attrs: top.map((a) => ctx.attrNames[a]).join(' / ') } };
  },
  needsRaisedAttribute(ctx: BlockContext, trump: Trump, choices: Choices): TextRef | null {
    const raised = choices.moveAttribute?.raised;
    if (!raised) return { key: 'reject.missingChoice' };
    return trump.attributes.includes(raised) ? null : { key: 'trumpDialog.why.needs', params: { attr: ctx.attrNames[raised] } };
  },
};

export const always = {
  noDuplicate: (ctx: BlockContext, trump: Trump): TextRef | null =>
    ctx.sheet.trumps.includes(trump.id) ? { key: 'trumpDialog.why.duplicate' } : null,
};

// ---------- Dialogschritte (steps) ----------
// options: alle gültigen Entscheidungen (für „Zufälliger Trumpf“); check: Entscheidung prüfen; changes: was sich am Bogen ändert.

export type StepImpl = {
  /** welche Angabe im Befehl zu diesem Schritt gehört */
  choice: keyof Choices;
  /** Pflicht? `param` ist der Parameter aus YAML; `improveOnly` = Weg bei vollen Trümpfen */
  required(param: unknown, improveOnly: boolean): boolean;
  /** Mögliche Teil-Entscheidungen; [{}] = Schritt entfällt */
  options(ctx: BlockContext): Choices[];
  /** Grund, wenn es gar keine Möglichkeit gibt (Zufälliger Trumpf) */
  noOptions: TextRef;
  check(ctx: BlockContext, choices: Choices, required: boolean): TextRef | null;
  changes(ctx: BlockContext, choices: Choices): Change[];
};

export const steps: Record<'chooseWeaknessToRemove' | 'improveStrength' | 'moveAttributePoint', StepImpl> = {
  /** Schwäche streichen; nur befüllte sind wählbar, sind beide leer, entfällt der Schritt (A29). */
  chooseWeaknessToRemove: {
    choice: 'removeWeakness',
    required: () => true,
    noOptions: { key: 'reject.invalidChoice' },
    options: (ctx) => {
      const filled = filledWeaknesses(ctx.sheet);
      return filled.length > 0 ? filled.map((i) => ({ removeWeakness: i })) : [{}];
    },
    check(ctx, c) {
      const filled = filledWeaknesses(ctx.sheet);
      if (filled.length === 0) return c.removeWeakness === undefined ? null : { key: 'reject.invalidChoice' };
      if (c.removeWeakness === undefined) return { key: 'reject.missingChoice' };
      return filled.includes(c.removeWeakness) ? null : { key: 'reject.invalidChoice' };
    },
    changes: (_ctx, c) => (c.removeWeakness === undefined ? [] : [{ field: `weaknesses.${c.removeWeakness}`, value: '' }]),
  },

  /** Stärke verbessern, optional mit neuer Formulierung; leerer Text lässt die alte stehen. */
  improveStrength: {
    choice: 'improveStrength',
    required: (param, improveOnly) => improveOnly || param === 'required',
    noOptions: { key: 'reject.invalidChoice' },
    options(ctx) {
      // „Zufälliger Trumpf“ verbessert immer, wenn es noch geht (wie bisher)
      const open = unimprovedStrengths(ctx.sheet);
      return open.length > 0 ? open.map((index) => ({ improveStrength: { index, text: '' } })) : [{}];
    },
    check(ctx, c, required) {
      const imp = c.improveStrength;
      if (!imp) return required ? { key: 'reject.improveRequired' } : null;
      if (!unimprovedStrengths(ctx.sheet).includes(imp.index)) return { key: 'reject.invalidChoice' };
      return imp.text.length <= MAX_STRENGTH_TEXT ? null : { key: 'reject.invalidChoice' };
    },
    changes(_ctx, c) {
      const imp = c.improveStrength;
      if (!imp) return [];
      const text = imp.text.trim();
      return [
        { field: `strengths.improved.${imp.index}`, value: true },
        ...(text ? [{ field: `strengths.text.${imp.index}`, value: text }] : []),
      ];
    },
  },

  /** Einen Attributspunkt umverteilen: eins runter (mindestens 1 vorhanden), ein anderes hoch. */
  moveAttributePoint: {
    choice: 'moveAttribute',
    required: () => true,
    noOptions: { key: 'toast.noAttributeToLower' },
    options(ctx) {
      return ATTRS.flatMap((lowered) =>
        attrValue(ctx.sheet, lowered) < 1
          ? []
          : ATTRS.filter((r) => r !== lowered && attrValue(ctx.sheet, r) < 9).map((raised) => ({ moveAttribute: { lowered, raised } })),
      );
    },
    check(ctx, c) {
      const m = c.moveAttribute;
      if (!m) return { key: 'reject.missingChoice' };
      if (m.lowered === m.raised || attrValue(ctx.sheet, m.lowered) < 1) return { key: 'reject.invalidChoice' };
      return attrValue(ctx.sheet, m.raised) < 9 ? null : { key: 'reject.attributeMax' };
    },
    changes(ctx, c) {
      const m = c.moveAttribute!;
      return [
        { field: `attributes.${m.lowered}`, value: attrValue(ctx.sheet, m.lowered) - 1 },
        { field: `attributes.${m.raised}`, value: attrValue(ctx.sheet, m.raised) + 1 },
      ];
    },
  },
};

// ---------- Nachwirkungen (afterwards) ----------

export const afterwards = {
  clear: (ctx: BlockContext, list: CheckList): Change[] => ctx.sheet[list].map((_, i) => ({ field: `${list}.${i}`, value: false })),
  decrement: (ctx: BlockContext, field: 'newScars'): Change[] => [{ field, value: Math.max(0, ctx.sheet[field] - 1) }],
};
