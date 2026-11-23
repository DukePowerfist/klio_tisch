// Ablauf des Trumpf-Dialogs (ARCHITEKTUR.md 6.2, 14): sammelt alle Entscheidungen lokal,
// am Ende geht ein einziger Befehl an den Host. Die Regeln kommen aus rules/klio (Bausteine, Wege).

import type { SeatId, TextRef } from '../engine/types';
import { attrValue, ATTRS, steps, trumpCount, type Attr, type BlockContext, type Choices, type Trump } from '../rules/klio/blocks';
import { TrumpCategory } from '../rules/klio/content/schema';
import type { KlioContent } from '../rules/klio/content/validate';
import { resolveText } from '../rules/klio/content/texts';
import { fullReason, isFull, planChoice, sourceStatus, stepSkipped, stepsOf, trumpProblem, type Source, type StepName } from '../rules/klio/trumps';

export type Category = Trump['category'];
export const CATEGORIES = TrumpCategory.options;

/** Gewählter Weg: ein Eintrag aus trump-sources.yaml oder die freie Wahl. */
export type SourcePath = { kind: 'source'; source: Source; improveOnly: boolean };
export type Path = SourcePath | { kind: 'free' };

/** Der Dialog Schritt für Schritt; `choices` wächst mit jedem Schritt. */
export type DialogStep =
  | { at: 'sources' }
  | { at: 'step'; name: StepName; required: boolean; path: SourcePath; choices: Choices; index: number }
  /** Trumpf wählen: alle Gruppen als Reiter über einer Liste (5zx); welcher Reiter offen ist, hält die Ansicht selbst */
  | { at: 'trumps'; path: Path; choices: Choices }
  /** Bestätigen (5zw): `trump` fehlt bei „nur verbessern“; `shown` hält die Folgen fest, wie sie beim Öffnen dastanden */
  | { at: 'confirm'; path: Path; choices: Choices; trump: Trump | undefined; shown: string };

/** `progress`: Stand einer noch offenen Voraussetzung („Erlebnislaterne: 2 von 3“), nur wenn der Weg genau deshalb gesperrt ist */
export type SourceRow = { source: Source; ok: boolean; why: TextRef | null; improveOnly: boolean; progress: TextRef | null };

export function sourceRows(content: KlioContent, ctx: BlockContext): SourceRow[] {
  const cfg = content.trumpSources;
  return cfg.trumpSources.map((source) => {
    const st = sourceStatus(cfg, source, ctx);
    if (st.ok) return { source, ok: true, why: null, improveOnly: st.improveOnly, progress: null };
    // voller Bogen geht der Voraussetzung vor (sourceStatus): dann steht dort dieser Grund, kein Fortschritt
    const unmet = st.why.key === `source.${source.id}.why`;
    return { source, ok: false, why: st.why, improveOnly: false, progress: unmet ? sourceProgress(source, ctx) : null };
  });
}

/** Stand der ersten Kästchenliste, die der Weg voll verlangt und die es noch nicht ist; andere Voraussetzungen haben keinen. */
export function sourceProgress(source: Source, ctx: BlockContext): TextRef | null {
  for (const b of source.requires) {
    if (typeof b === 'string' || !('allMarked' in b)) continue;
    const list = ctx.sheet[b.allMarked];
    const n = list.filter(Boolean).length;
    if (n < list.length) return { key: `trumpDialog.progress.${b.allMarked}`, params: { n, max: list.length } };
  }
  return null;
}

/** Einleitung des Einstiegs (5zu, 10.22): noch kein Trumpf, einige, voll. */
export function intro(content: KlioContent, ctx: BlockContext): TextRef {
  const n = trumpCount(ctx.sheet);
  const max = content.trumpSources.maxTrumps;
  return { key: n === 0 ? 'trumpDialog.introNone' : n >= max ? 'trumpDialog.introFull' : 'trumpDialog.introSome', params: { n, max } };
}

/** Ist irgendein Weg offen? (goldenes Plus am leeren Trumpf-Platz) */
export const anySourceOpen = (content: KlioContent, ctx: BlockContext): boolean =>
  sourceRows(content, ctx).some((r) => r.ok);

/** Nächster Schritt ab `index`; danach die Trumpfliste, oder null, wenn kein Trumpf folgt (nur verbessern). */
export function nextStep(path: SourcePath, choices: Choices, index: number, ctx: BlockContext): DialogStep | null {
  const list = stepsOf(path.source, path.improveOnly);
  for (let i = index; i < list.length; i++) {
    const s = list[i]!;
    if (stepSkipped(s.step, ctx)) continue;
    return { at: 'step', name: s.name, required: s.required, path, choices, index: i };
  }
  return path.improveOnly ? null : { at: 'trumps', path, choices };
}

export type TrumpRow = { trump: Trump; why: TextRef | null };

export function trumpRows(content: KlioContent, ctx: BlockContext, path: Path, choices: Choices): TrumpRow[] {
  const src = path.kind === 'free' ? 'free' : path.source;
  return content.trumps.map((trump) => ({ trump, why: trumpProblem(content.trumpSources, src, trump, ctx, choices) }));
}

/** Reiter der Trumpfliste (5zx, 10.22): vorn alle wählbaren, dann je Gruppe einer. */
export type TrumpTab = 'all' | Category;
export const TRUMP_TABS: readonly TrumpTab[] = ['all', ...CATEGORIES];

/** Karten eines Reiters: „alle wählbaren“ ohne die gesperrten, eine Gruppe mit den wählbaren zuerst. */
export function tabRows(rows: TrumpRow[], tab: TrumpTab): { ok: TrumpRow[]; off: TrumpRow[] } {
  const mine = tab === 'all' ? rows : rows.filter((r) => r.trump.category === tab);
  return { ok: mine.filter((r) => !r.why), off: tab === 'all' ? [] : mine.filter((r) => r.why) };
}

/** Wählbare Trümpfe je Kategorie (in einem Durchgang). */
export function selectableByCategory(rows: TrumpRow[]): Record<Category, number> {
  const out: Record<Category, number> = { K: 0, V: 0, P: 0, X: 0 };
  for (const r of rows) if (!r.why) out[r.trump.category]++;
  return out;
}

/** Ein Glied der Wegleiste (5zv, 10.22): Bezeichnung, bei erledigten die getroffene Wahl, Lage zum aktuellen Schritt. */
export type TrailItem = { id: string; label: TextRef | string; value: TextRef | string | null; state: 'done' | 'now' | 'todo' };

/** Wegleiste: Anlass › Schritte des Wegs › Trumpf › Bestätigen. Aus dem Weg und den Wahlen gebaut; Schritte, die der Weg
 *  hier nicht stellt (A29) oder die übergangen wurden (A35), fehlen. Im Einstieg gibt es keine Leiste. */
export function trail(step: DialogStep, ctx: BlockContext): TrailItem[] {
  if (step.at === 'sources') return [];
  const { path, choices } = step;
  const values: Record<StepName, () => string | null> = {
    chooseWeaknessToRemove: () => (choices.removeWeakness === undefined ? null : ctx.sheet.weaknesses[choices.removeWeakness] || null),
    improveStrength: () => {
      const imp = choices.improveStrength;
      return imp ? imp.text.trim() || ctx.sheet.strengths[imp.index]?.text || String(imp.index + 1) : null;
    },
    moveAttributePoint: () => {
      const m = choices.moveAttribute;
      return m ? `${ctx.attrNames[m.lowered]} −1, ${ctx.attrNames[m.raised]} +1` : null;
    },
  };
  const items: TrailItem[] = [{
    id: 'source', state: 'done', value: null,
    label: path.kind === 'free' ? { key: 'trumpDialog.free' } : path.source.text.name,
  }];
  if (path.kind === 'source') {
    stepsOf(path.source, path.improveOnly).forEach((s, i) => {
      const now = step.at === 'step' && step.index === i;
      const before = step.at !== 'step' || step.index > i;
      const value = before ? values[s.name]() : null;
      // übersprungen oder übergangen: liegt hinter uns und hat keine Wahl hinterlassen
      if (before && value === null) return;
      if (!before && !now && stepSkipped(s.step, ctx)) return;
      items.push({ id: s.name, label: { key: `trumpDialog.trail.${s.name}` }, value, state: now ? 'now' : before ? 'done' : 'todo' });
    });
  }
  const confirming = step.at === 'confirm';
  if (path.kind === 'free' || !path.improveOnly) {
    items.push({
      id: 'trump', label: { key: 'trumpDialog.trail.trump' },
      value: confirming ? (step.trump?.name ?? null) : null,
      state: confirming ? 'done' : step.at === 'trumps' ? 'now' : 'todo',
    });
  }
  items.push({ id: 'confirm', label: { key: 'trumpDialog.trail.confirm' }, value: null, state: confirming ? 'now' : 'todo' });
  return items;
}

/** Was der Befehl am Bogen ändert, als Zeilen für die Bestätigung (5zw, 10.22), oder der Grund, warum er jetzt nicht
 *  mehr ginge. Gerechnet wird mit demselben Plan wie beim Host (`planChoice`), also immer am aktuellen Bogen: Ändert
 *  ihn jemand, während die Bestätigung offen ist, ändern sich die Zeilen mit. */
export function consequences(
  content: KlioContent, ctx: BlockContext, path: Path, choices: Choices, trump: string | undefined,
): { lines: TextRef[] } | { why: TextRef } {
  const cfg = content.trumpSources;
  const slot: TextRef = { key: 'trumpDialog.after.slot', params: { n: ctx.sheet.trumps.findIndex((t) => t === null) + 1 } };
  if (path.kind === 'free') {
    if (isFull(cfg, ctx.sheet)) return { why: fullReason(cfg) };
    const t = content.trumps.find((x) => x.id === trump);
    const why = t ? trumpProblem(cfg, 'free', t, ctx, {}) : { key: 'reject.unknownTrump' };
    return why ? { why } : { lines: [slot] };
  }
  const plan = planChoice(cfg, path.source, content.trumps, ctx, choices, trump);
  if ('why' in plan) return plan;

  const numeral = (i: number) => resolveText(content, `numerals.${i + 1}`) ?? String(i + 1);
  const lines: TextRef[] = [];
  const once = new Set<string>();
  const newText = new Map(plan.changes.flatMap((c) => (c.field.startsWith('strengths.text.') ? [[c.field.slice(15), String(c.value)] as const] : [])));
  for (const c of plan.changes) {
    const [list, a, b] = c.field.split('.');
    if (list === 'weaknesses') lines.push({ key: 'trumpDialog.after.weakness', params: { text: ctx.sheet.weaknesses[Number(a)] ?? '' } });
    else if (list === 'strengths' && a === 'improved') {
      const i = Number(b);
      const text = newText.get(b!);
      const old = ctx.sheet.strengths[i]?.text ?? '';
      lines.push(text !== undefined && text !== old
        ? { key: 'trumpDialog.after.strengthText', params: { n: numeral(i), text } }
        : { key: old ? 'trumpDialog.after.strength' : 'trumpDialog.after.strengthEmpty', params: { n: numeral(i), text: old } });
    } else if (list === 'strengths' && a === 'text') continue;
    else if (list === 'attributes') {
      const attr = a as Attr;
      lines.push({ key: 'trumpDialog.after.attribute', params: { attr: ctx.attrNames[attr], from: attrValue(ctx.sheet, attr), to: Number(c.value) } });
    } else if (list === 'lamps' || list === 'weaknessMarks' || list === 'newScars') {
      if (!once.has(list)) lines.push({ key: `trumpDialog.after.${list}` });
      once.add(list);
    } else lines.push({ key: 'trumpDialog.after.other', params: { field: c.field } });
  }
  if (plan.trump !== null) lines.push(slot);
  return { lines };
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
