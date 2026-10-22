import { describe, expect, it } from 'vitest';
import { menuState } from '../../src/ui/menuState';

describe('Menü oben rechts: Kopf (10.4, Tabelle R4)', () => {
  it('lokal ohne Fehler: „Lokal“', () => {
    expect(menuState('local', 'starting', false)).toBe('local');
  });

  it('Host ohne Fehler: „Raum offen“, auch beim Starten', () => {
    expect(menuState('host', 'starting', false)).toBe('open');
  });

  it('Client beim Starten und Verbinden: „Verbinde …“, verbunden: „Verbunden“', () => {
    expect(menuState('client', 'starting', false)).toBe('connecting');
    expect(menuState('client', 'connecting', false)).toBe('connecting');
    expect(menuState('client', 'ready', false)).toBe('connected');
  });

  it('jeder Fehler in jeder Rolle: „Störung“', () => {
    for (const status of ['waiting', 'reload', 'denied', 'replaced']) expect(menuState('client', status, true)).toBe('trouble');
    expect(menuState('host', 'otherTab', true)).toBe('trouble');
    expect(menuState('local', 'otherTab', true)).toBe('trouble');
  });
});
