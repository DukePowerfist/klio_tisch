// Bausteine für trump-sources.yaml (ARCHITEKTUR.md 7, Ebene 2).
// YAML setzt sie nur mit Parametern zusammen; jede Funktion hier hat Tests.

import type { TextRef } from '../../../engine/types';
import type { FieldValue } from '../fields';
import type { KlioSheet } from '../state';

export type Attr = 'K' | 'V' | 'P';
export const ATTRS: readonly Attr[] = ['K', 'V', 'P'];
export type CheckList = 'weaknessMarks' | 'lamps';

export type Trump = { id: string; category: string; attributes: Attr[]; level: 1 | 2 | 3; name: string; text: string };

/** Entscheidungen aus dem Dialog, alle auf einmal im Befehl (6.2). */
export type Choices = {
  removeWeakness?: number;
  improveStrength?: { index: number; text: string };
  moveAttribute?: { lowered: Attr; raised: Attr };
};

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
  atLeast: (ctx: BlockContext, p: { newScars: number }) => ctx.sheet.newScars >= p.newScars,
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
  /** Mögliche Teil-Entscheidungen; [{}] = Schritt entfällt */
  options(ctx: BlockContext, required: boolean): Choices[];
  check(ctx: BlockContext, choices: Choices, required: boolean): TextRef | null;
  changes(ctx: BlockContext, choices: Choices): Change[];
};

const MAX_STRENGTH_TEXT = 70;

export const steps: Record<'chooseWeaknessToRemove' | 'improveStrength' | 'moveAttributePoint', StepImpl> = {
  /** Schwäche streichen; nur befüllte sind wählbar, sind beide leer, entfällt der Schritt (A29). */
  chooseWeaknessToRemove: {
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
  decrement: (ctx: BlockContext, _field: 'newScars'): Change[] => [{ field: 'newScars', value: Math.max(0, ctx.sheet.newScars - 1) }],
};
