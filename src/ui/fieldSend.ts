// Textfeld am Bogen (8.2, 5x): wann eine Eingabe hinausgeht.

/** Senden, wenn der Entwurf vom Stand abweicht und nicht gerade erst gesendet wurde (Antwort des Hosts noch nicht
 *  da). `lastSent` ist null, sobald sich der Stand geändert hat oder der Befehl abgelehnt wurde; dann gilt nur der
 *  Stand, sonst ginge nach einer fremden Änderung die eigene gleiche Eingabe verloren. */
export function shouldSend(draft: string, value: string, lastSent: string | null): boolean {
  return draft !== value && draft !== lastSent;
}
