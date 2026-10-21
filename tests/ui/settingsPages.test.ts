import { describe, expect, it } from 'vitest';
import { openPage, visiblePages } from '../../src/ui/settingsPages';

describe('Seiten der Einstellungen', () => {
  it('Spielstand nur beim Host', () => {
    expect(visiblePages(true)).toEqual(['automation', 'permissions', 'game']);
    expect(visiblePages(false)).toEqual(['automation', 'permissions']);
  });

  it('öffnet auf der zuletzt gewählten Seite, fehlt sie, auf der ersten', () => {
    expect(openPage('permissions', visiblePages(false))).toBe('permissions');
    expect(openPage('game', visiblePages(true))).toBe('game');
    expect(openPage('game', visiblePages(false))).toBe('automation');
  });
});
