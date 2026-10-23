// Textfeld am Bogen (8.2, 5x): eine Eingabe geht einmal hinaus, auch wenn Enter kurz nach dem Senden kommt.

import { describe, expect, it } from 'vitest';
import { shouldSend } from '../../src/ui/fieldSend';

describe('shouldSend', () => {
  it('gleich dem Stand: nichts senden', () => {
    expect(shouldSend('Ida', 'Ida', null)).toBe(false);
  });

  it('geändert: senden; gerade gesendet und die Antwort steht aus: nicht noch einmal', () => {
    expect(shouldSend('Ida', '', null)).toBe(true);
    expect(shouldSend('Ida', '', 'Ida')).toBe(false);
    expect(shouldSend('Ida W', '', 'Ida')).toBe(true);
  });

  it('nach fremder Änderung (Merker geleert): die eigene, früher schon gesendete Eingabe geht wieder hinaus', () => {
    // „A“ gesendet, jemand anderes setzt „B“, man tippt wieder „A“
    expect(shouldSend('A', 'B', null)).toBe(true);
  });
});
