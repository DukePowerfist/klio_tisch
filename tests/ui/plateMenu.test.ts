import { describe, expect, it } from 'vitest';
import { plateEntries, type PlateContext } from '../../src/ui/plateMenu';

const base: PlateContext = { can: () => true, occupied: true, dead: false, photo: false, online: true, host: true, inRoleView: false, moveTargets: 2, watchers: 1 };

describe('Menü am Namensschild: Einträge (10.1)', () => {
  it('SL am besetzten Platz: alles außer Zuweisen, in drei Gruppen', () => {
    expect(plateEntries(base)).toEqual([['profile', 'view'], ['roll', 'photo', 'export', 'import', 'reset'], ['move', 'release']]);
  });

  it('SL als Host am freien Platz: Zuweisen statt Umsetzen und Freigeben, nur mit Zuschauern', () => {
    expect(plateEntries({ ...base, occupied: false }).at(-1)).toEqual(['assign']);
    expect(plateEntries({ ...base, occupied: false, watchers: 0 })).toHaveLength(2);
    expect(plateEntries({ ...base, occupied: false, host: false }).flat()).not.toContain('assign');
  });

  it('lokal: nichts zu Personen', () => {
    expect(plateEntries({ ...base, online: false, host: false }).flat()).toEqual(['profile', 'view', 'roll', 'photo', 'export', 'import', 'reset']);
  });

  it('Spieler am fremden Platz: Rollenansicht und Export; in dessen Rollenansicht nur noch der Export', () => {
    const foreign = { ...base, can: () => false };
    expect(plateEntries(foreign)).toEqual([['view'], ['export']]);
    expect(plateEntries({ ...foreign, inRoleView: true })).toEqual([['export']]);
  });

  it('Rechte je Eintrag', () => {
    const only = (key: string) => plateEntries({ ...base, inRoleView: true, can: (t) => t === key }).flat().filter((e) => e !== 'export');
    expect(only('seat.edit')).toEqual(['profile']);
    expect(only('sheet.roll')).toEqual(['roll']);
    expect(only('character.revive')).toEqual([]);
    expect(only('sheet.setPhoto')).toEqual(['photo']);
    expect(only('sheet.import')).toEqual(['import']);
    expect(only('sheet.reset')).toEqual(['reset']);
    expect(only('table.moveSeat')).toEqual(['move']);
    expect(only('table.setSeat')).toEqual(['release']);
    expect(plateEntries({ ...base, moveTargets: 0 }).flat()).not.toContain('move');
  });

  it('Foto entfernen nur mit Foto und Recht, direkt nach Foto ändern (5z)', () => {
    expect(plateEntries({ ...base, photo: true })[1]).toEqual(['roll', 'photo', 'photoRemove', 'export', 'import', 'reset']);
    expect(plateEntries({ ...base, photo: true, can: (t) => t !== 'sheet.setPhoto' }).flat()).not.toContain('photoRemove');
  });

  it('Wiederbeleben nur am toten Charakter, vorn in der Gruppe Bogen', () => {
    expect(plateEntries({ ...base, dead: true })[1]![0]).toBe('revive');
    expect(plateEntries({ ...base, dead: true, can: (t) => t !== 'character.revive' }).flat()).not.toContain('revive');
  });
});
