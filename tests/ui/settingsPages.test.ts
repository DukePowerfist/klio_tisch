import { describe, expect, it } from 'vitest';
import { FIXED_PERMISSIONS, PERMISSION_GROUPS, openPage, permissionGroups, visiblePages } from '../../src/ui/settingsPages';
import { content } from '../helpers';

const keys = Object.keys(content.permissions.player);

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

describe('Gruppen der Rechte', () => {
  it('nur bekannte Schlüssel, keiner doppelt', () => {
    const listed = [...FIXED_PERMISSIONS, ...Object.values(PERMISSION_GROUPS).flat()];
    expect(listed.filter((k) => !keys.includes(k))).toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('vier Gruppen, kein Recht unter „Weitere“, Name und Farbe nicht im Dialog', () => {
    const groups = permissionGroups(keys);
    expect(groups.map((g) => g.id)).toEqual(['cards', 'sheet', 'trumps', 'gm']);
    expect(groups.flatMap((g) => g.keys)).not.toContain('seat.edit');
    expect(groups.flatMap((g) => g.keys)).toHaveLength(keys.length - FIXED_PERMISSIONS.length);
  });

  it('ein Recht ohne Gruppe steht unter „Weitere“', () => {
    expect(permissionGroups([...keys, 'table.neu']).at(-1)).toEqual({ id: 'other', keys: ['table.neu'] });
  });
});
