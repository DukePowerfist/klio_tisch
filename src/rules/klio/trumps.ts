// Wege zum Trumpf: liest trump-sources.yaml und setzt die Bausteine zusammen.
// Genutzt vom Host (Prüfen, Ausführen) und später von der Oberfläche (ausgegraute Karten mit Grund).

import type { z } from 'zod';
import type { Rng, TextRef } from '../../engine/types';
import { pick } from '../../engine/rng';
import {
  afterwards, always, filters, requires, steps, trumpCount, unimprovedStrengths,
  type BlockContext, type Change, type Choices, type StepImpl, type Trump,
} from './blocks';
import type { TrumpSourcesFile } from './content/schema';
import type { KlioContent } from './content/validate';
import type { Attr, KlioSheet } from './state';

export type SourcesConfig = z.infer<typeof TrumpSourcesFile>;
export type Source = SourcesConfig['trumpSources'][number];

type SourceStatus = { ok: true; improveOnly: boolean } | { ok: false; why: TextRef };

/** Kontext für die Bausteine: Bogen und Anzeigenamen der Attribute (Host und Oberfläche). */
export function contextFor(content: KlioContent, sheet: KlioSheet): BlockContext {
  return { sheet, attrNames: content.texts['attributes'] as Record<Attr, string> };
}

/** Alle Trumpf-Plätze belegt? */
export const isFull = (cfg: SourcesConfig, sheet: KlioSheet): boolean => trumpCount(sheet) >= cfg.maxTrumps;
/** Grund „höchstens N Trümpfe“ */
export const fullReason = (cfg: SourcesConfig): TextRef => ({ key: 'toast.maxTrumps', params: { max: cfg.maxTrumps } });

const byId = new WeakMap<readonly Trump[], Map<string, Trump>>();
/** Trumpf nach ID (Verzeichnis je Trumpfliste einmal gebaut). */
export function trumpById(trumps: readonly Trump[], id: string | null | undefined): Trump | undefined {
  if (!id) return undefined;
  let map = byId.get(trumps);
  if (!map) byId.set(trumps, (map = new Map(trumps.map((t) => [t.id, t]))));
  return map.get(id);
}

const entry = <T>(block: T): [string, unknown] =>
  typeof block === 'string' ? [block, undefined] : (Object.entries(block as object)[0] as [string, unknown]);

const sourceText = (s: Source, which: 'why' | 'levelWhy'): TextRef => ({ key: `source.${s.id}.${which}` });

/** Ist der Weg gerade nutzbar? */
export function sourceStatus(cfg: SourcesConfig, src: Source, ctx: BlockContext): SourceStatus {
  const met = src.requires.every((b) => {
    const [name, param] = entry(b);
    return (requires as Record<string, (c: BlockContext, p: unknown) => boolean>)[name]!(ctx, param);
  });
  if (isFull(cfg, ctx.sheet)) {
    const full = { ok: false as const, why: fullReason(cfg) };
    if ((src.whenFull ?? cfg.whenFull) === 'blocked') return full;
    if (!met) return { ok: false, why: sourceText(src, 'why') };
    // Nur verbessern: geht nur, solange eine Stärke unverbessert ist
    return unimprovedStrengths(ctx.sheet).length > 0 ? { ok: true, improveOnly: true } : full;
  }
  return met ? { ok: true, improveOnly: false } : { ok: false, why: sourceText(src, 'why') };
}

/** Warum ist dieser Trumpf über diesen Weg (mit diesen Entscheidungen) nicht wählbar? null = wählbar. */
export function trumpProblem(cfg: SourcesConfig, src: Source | 'free', trump: Trump, ctx: BlockContext, choices: Choices): TextRef | null {
  for (const b of cfg.always) {
    const why = always[b](ctx, trump);
    if (why) return why;
  }
  if (src === 'free') return null;
  if (!src.levels.includes(trump.level)) return src.text.levelWhy ? sourceText(src, 'levelWhy') : { key: 'reject.invalidChoice' };
  for (const f of src.filters ?? []) {
    const why = filters[f](ctx, trump, choices);
    if (why) return why;
  }
  return null;
}

export type StepName = keyof typeof steps;

/** Ein Schritt entfällt, wenn es nichts zu entscheiden gibt (z. B. beide Schwächen leer, A29). */
export const stepSkipped = (step: StepImpl, ctx: BlockContext): boolean => {
  const opts = step.options(ctx);
  return opts.length === 1 && Object.keys(opts[0]!).length === 0;
};

/** Die Schritte eines Wegs samt Baustein und Pflicht-Angabe (auch für den Dialog der Oberfläche). */
export function stepsOf(src: Source, improveOnly: boolean): { name: StepName; step: StepImpl; required: boolean }[] {
  return (src.steps ?? []).map((b) => {
    const [name, param] = entry(b);
    const step = steps[name as StepName];
    return { name: name as StepName, step, required: step.required(param, improveOnly) };
  });
}

export type Plan = { changes: Change[]; trump: string | null };

/** Alles prüfen und die Änderungen am Bogen berechnen. */
export function planChoice(
  cfg: SourcesConfig, src: Source, trumps: readonly Trump[], ctx: BlockContext, choices: Choices, trumpId: string | undefined,
): Plan | { why: TextRef } {
  const status = sourceStatus(cfg, src, ctx);
  if (!status.ok) return { why: status.why };

  const plan = stepsOf(src, status.improveOnly);
  // Entscheidungen, die der Weg nicht kennt, sind ein Fehler
  const expected = new Set(plan.map((p) => p.step.choice));
  for (const k of Object.keys(choices) as (keyof Choices)[]) {
    if (choices[k] !== undefined && !expected.has(k)) return { why: { key: 'reject.invalidChoice' } };
  }

  const changes: Change[] = [];
  for (const { step, required } of plan) {
    const why = step.check(ctx, choices, required);
    if (why) return { why };
    changes.push(...step.changes(ctx, choices));
  }

  let trump: string | null = null;
  if (status.improveOnly) {
    if (trumpId !== undefined) return { why: fullReason(cfg) };
  } else {
    const t = trumpById(trumps, trumpId);
    if (!t) return { why: { key: 'reject.unknownTrump' } };
    const why = trumpProblem(cfg, src, t, ctx, choices);
    if (why) return { why };
    trump = t.id;
  }

  for (const b of src.afterwards ?? []) {
    const [name, param] = entry(b);
    changes.push(...(afterwards as Record<string, (c: BlockContext, p: unknown) => Change[]>)[name]!(ctx, param));
  }
  return { changes, trump };
}

/** „Zufälliger Trumpf“: erster nutzbarer Weg, zufällige gültige Entscheidungen, zufälliger passender Trumpf. */
export function planRandom(
  cfg: SourcesConfig, trumps: readonly Trump[], ctx: BlockContext, rng: Rng,
): { source: Source; choices: Choices; trump: string | undefined } | { why: TextRef } {
  let src: Source | undefined;
  let improveOnly = false;
  for (const s of cfg.trumpSources) {
    const st = sourceStatus(cfg, s, ctx);
    if (st.ok) {
      src = s;
      improveOnly = st.improveOnly;
      break;
    }
  }
  if (!src) return { why: { key: 'toast.noSource' } };

  // Alle Kombinationen gültiger Entscheidungen (klein: höchstens 2 × 5 × 6)
  let combos: Choices[] = [{}];
  for (const { step } of stepsOf(src, improveOnly)) {
    const opts = step.options(ctx);
    if (opts.length === 0) return { why: step.noOptions };
    combos = combos.flatMap((c) => opts.map((o) => ({ ...c, ...o })));
  }
  if (improveOnly) return { source: src, choices: pick(combos, rng), trump: undefined };

  // A28: nur Kombinationen, für die noch ein passender Trumpf übrig ist
  const source = src;
  const withTrumps = combos
    .map((choices) => ({ choices, ok: trumps.filter((t) => !trumpProblem(cfg, source, t, ctx, choices)) }))
    .filter((x) => x.ok.length > 0);
  if (withTrumps.length === 0) return { why: { key: 'toast.noTrumpLeft' } };
  const chosen = pick(withTrumps, rng);
  return { source: src, choices: chosen.choices, trump: pick(chosen.ok, rng).id };
}
