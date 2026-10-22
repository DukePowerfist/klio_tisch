// Befehl schicken; eine Ablehnung erscheint als rote Meldung. Ergebnis: angenommen?

import type { SeatId, TextRef } from '../engine/types';
import { session, type PendingDrop } from './session.svelte';
import { text } from './texts';
import { view } from './view.svelte';

/** Ablehnung als rote Meldung; Ergebnis: angenommen? */
export function sayIfRejected<R extends { ok: true } | { ok: false; reason: TextRef }>(r: R): r is Extract<R, { ok: true }> {
  if (!r.ok) view.say(text(r.reason), true);
  return r.ok;
}

export const submitOrSay = async (cmd: { type: string }, drop?: PendingDrop): Promise<boolean> => sayIfRejected(await session.submit(cmd, drop));

/** Zuschauer auf einen Platz setzen (Raumfenster, Menü am Namensschild) */
export const assignOrSay = async (peer: string, seat: SeatId): Promise<boolean> => sayIfRejected(await session.assign(peer, seat));
