// Gemeinsame Testhilfen: echtes Klio-Regelwerk, fester Zufall, Befehle ausführen.

import { expect } from 'vitest';
import { createEngine } from '../src/engine/dispatch';
import { seededRng } from '../src/engine/rng';
import { initialTable } from '../src/engine/setup';
import type { Actor, CardId, DispatchResult, Rng, SeatId, TableState, TextRef } from '../src/engine/types';
import { resolveText as resolveContentText } from '../src/rules/klio/content/texts';
import { validateContent, type KlioContent } from '../src/rules/klio/content/validate';
import { sheetOf } from '../src/rules/klio/events';
import { createKlioRuleset } from '../src/rules/klio/ruleset';
import type { KlioSheet, KlioState } from '../src/rules/klio/state';
import { readContent } from './content/read';

const validated = validateContent(readContent());
if (!validated.ok) throw new Error(validated.errors.join('\n'));
export const content: KlioContent = validated.content;
export const ruleset = createKlioRuleset(content);
export const engine = createEngine(ruleset);

export type K = TableState<KlioState>;

export const GM: Actor = { role: 'gm' };
export const SPECTATOR: Actor = { role: 'spectator' };
export const player = (seat: SeatId): Actor => ({ role: 'player', seat });

export function fresh(seed = 1): K {
  return initialTable(ruleset, seededRng(seed));
}

/** Text zu einem Grund finden: texts.de.yaml oder Text am Trumpf-Weg (`source.<id>.why`). */
export const resolveText = (ref: TextRef): string | undefined => resolveContentText(content, ref.key);

/** Befehl ausführen; Rückgabe: neuer Stand und Ereignisse (wirft bei Ablehnung). */
export function run(state: K, cmd: object, actor: Actor = GM, rng: Rng = seededRng(7)) {
  const r = engine.dispatch(state, cmd, actor, rng);
  if ('rejected' in r) throw new Error(`abgelehnt: ${r.reason.key}`);
  return { state: r.state, events: r.events.map((e) => e.event) };
}

/** Erwartet Ablehnung mit diesem Grund; der Text dazu muss existieren; der Stand bleibt unverändert. */
export function expectRejected(state: K, cmd: object, key: string, actor: Actor = GM, rng: Rng = seededRng(7)): void {
  const before = structuredClone(state);
  const r: DispatchResult<KlioState> = engine.dispatch(state, cmd, actor, rng);
  expect('rejected' in r ? r.reason.key : 'angenommen').toBe(key);
  if ('rejected' in r) expect(resolveText(r.reason), `Text für ${key}`).toBeTypeOf('string');
  expect(state).toEqual(before);
}

/** Bogen im Stand direkt vorbereiten (nur für Tests). */
export function withSheet(state: K, seat: SeatId, patch: (s: KlioSheet) => void): K {
  const next = structuredClone(state);
  patch(sheetOf(next, seat));
  return next;
}

export const sheet = (state: K, seat: SeatId): KlioSheet => sheetOf(state, seat);

/** Karten direkt in Zonen legen (nur für Tests): entfernt sie überall und setzt sie ans Ende. */
export function place(state: K, zone: string, cards: string[], faceUp = false): K {
  const next = structuredClone(state);
  for (const z of Object.keys(next.zones)) next.zones[z] = next.zones[z]!.filter((c) => !cards.includes(c));
  next.free = next.free.filter((c) => !cards.includes(c));
  const ids = cards as CardId[];
  next.zones[zone] = [...next.zones[zone]!, ...ids];
  for (const c of ids) next.faceUp[c] = faceUp;
  return next;
}
