// Befehl schicken; eine Ablehnung erscheint als rote Meldung. Ergebnis: angenommen?

import { session, type PendingDrop } from './session.svelte';
import { text } from './texts';
import { view } from './view.svelte';

export async function submitOrSay(cmd: object, drop?: PendingDrop): Promise<boolean> {
  const r = await session.submit(cmd, drop);
  if (!r.ok) view.say(text(r.reason), true);
  return r.ok;
}
