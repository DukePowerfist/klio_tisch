// Kopf des Menüs oben rechts (10.4, Schritt 5p): Verbindungszustand in einem Wort. Rein, damit testbar.

/** Schlüssel unter `menu.state.*`; bei `open` steht rechts die Zahl der Verbundenen */
export type MenuState = 'local' | 'open' | 'connecting' | 'connected' | 'trouble';

/** Fehler zuerst, in jeder Rolle (wie der rote Punkt); der Host kennt kein Verbinden, sein Punkt ist sofort grün */
export function menuState(mode: 'local' | 'host' | 'client', status: string, trouble: boolean): MenuState {
  if (trouble) return 'trouble';
  if (mode === 'local') return 'local';
  if (mode === 'host') return 'open';
  return status === 'ready' ? 'connected' : 'connecting';
}
