// Wege zum Trumpf: liest trump-sources.yaml und setzt die Bausteine zusammen.
// Genutzt vom Host (Prüfen, Ausführen) und später von der Oberfläche (ausgegraute Karten mit Grund).

import type { z } from 'zod';
import type { Rng, TextRef } from '../../engine/types';
import { pick } from '../../engine/rng';
import {
  afterwards, always, filters, requires, steps, trumpCount, unimprovedStrengths,
  type BlockContext, type Change, type Choices, type Trump,
} from './blocks';
import type { TrumpSourcesFile } from './content/schema';

export type SourcesConfig = z.infer<typeof TrumpSourcesFile>;
export type Source = SourcesConfig['trumpSources'][number];

export type SourceStatus = { ok: true; improveOnly: boolean } | { ok: false; why: TextRef };

const entry = <T>(block: T): [string, unknown] =>
  typeof block === 'string' ? [block, undefined] : (Object.entries(block as object)[0] as [string, unknown]);

const sourceText = (s: Source, which: 'why' | 'levelWhy'): TextRef => ({ key: `source.${s.id}.${which}` });

/** Ist der Weg gerade nutzbar? */
export function sourceStatus(cfg: SourcesConfig, src: Source, ctx: BlockContext): SourceStatus {
  const met = src.requires.every((b) => {
    const [name, param] = entry(b);
    return (requires as Record<string, (c: BlockContext, p: unknown) => boolean>)[name]!(ctx, param);
  });
  if (trumpCount(ctx.sheet) >= cfg.maxTrumps) {
    const full = { ok: false as const, why: { key: 'toast.maxTrumps', params: { max: cfg.maxTrumps } } };
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

const stepRequired = (src: Source, block: Source['steps'] extends (infer B)[] | undefined ? B : never, improveOnly: boolean): boolean => {
  const [name, param] = entry(block);
  if (name === 'improveStrength') return improveOnly || param === 'required';
  return true;
};

/** Welche Entscheidungen der Weg erwartet; andere sind ein Fehler. */
function expectedChoices(src: Source): Set<keyof Choices> {
  const map: Record<string, keyof Choices> = { chooseWeaknessToRemove: 'removeWeakness', improveStrength: 'improveStrength', moveAttributePoint: 'moveAttribute' };
  return new Set((src.steps ?? []).map((b) => map[entry(b)[0]]!));
}

export type Plan = { changes: Change[]; trump: string | null };

/** Alles prüfen und die Änderungen am Bogen berechnen. */
export function planChoice(
  cfg: SourcesConfig, src: Source, trumps: readonly Trump[], ctx: BlockContext, choices: Choices, trumpId: string | undefined,
): Plan | { why: TextRef } {
  const status = sourceStatus(cfg, src, ctx);
  if (!status.ok) return { why: status.why };

  const expected = expectedChoices(src);
  for (const k of Object.keys(choices) as (keyof Choices)[]) {
    if (choices[k] !== undefined && !expected.has(k)) return { why: { key: 'reject.invalidChoice' } };
  }

  const changes: Change[] = [];
  for (const b of src.steps ?? []) {
    const [name] = entry(b);
    const step = steps[name as keyof typeof steps];
    const why = step.check(ctx, choices, stepRequired(src, b, status.improveOnly));
    if (why) return { why };
    changes.push(...step.changes(ctx, choices));
  }

  let trump: string | null = null;
  if (status.improveOnly) {
    if (trumpId !== undefined) return { why: { key: 'toast.maxTrumps', params: { max: cfg.maxTrumps } } };
  } else {
    const t = trumps.find((x) => x.id === trumpId);
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
  const found = cfg.trumpSources.map((s) => ({ s, st: sourceStatus(cfg, s, ctx) })).find((x) => x.st.ok);
  if (!found || !found.st.ok) return { why: { key: 'toast.noSource' } };
  const { s: src, st } = found;

  // Alle Kombinationen gültiger Entscheidungen (klein: höchstens 2 × 5 × 6)
  let combos: Choices[] = [{}];
  for (const b of src.steps ?? []) {
    const [name] = entry(b);
    const opts = steps[name as keyof typeof steps].options(ctx, stepRequired(src, b, st.improveOnly));
    if (opts.length === 0) return { why: { key: name === 'moveAttributePoint' ? 'toast.noAttributeToLower' : 'reject.invalidChoice' } };
    combos = combos.flatMap((c) => opts.map((o) => ({ ...c, ...o })));
  }
  if (st.improveOnly) return { source: src, choices: pick(combos, rng), trump: undefined };

  // A28: nur Kombinationen, für die noch ein passender Trumpf übrig ist
  const withTrumps = combos
    .map((choices) => ({ choices, ok: trumps.filter((t) => !trumpProblem(cfg, src, t, ctx, choices)) }))
    .filter((x) => x.ok.length > 0);
  if (withTrumps.length === 0) return { why: { key: 'toast.noTrumpLeft' } };
  const chosen = pick(withTrumps, rng);
  return { source: src, choices: chosen.choices, trump: pick(chosen.ok, rng).id };
}
