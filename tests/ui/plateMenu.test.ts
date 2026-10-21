import { describe, expect, it } from 'vitest';
import { plateEntries, type PlateContext } from '../../src/ui/plateMenu';

const base: PlateContext = { can: () => true, occupied: true, online: true, host: true, inRoleView: false, moveTargets: 2, watchers: 1 };

describe('Menü am Namensschild: Einträge (10.1)', () => {
  it('SL am besetzten Platz: alles außer Zuweisen, in drei Gruppen', () => {
    expect(plateEntries(base)).toEqual([['profile', 'view'], ['roll', 'photo', 'reset'], ['move', 'release']]);
  });

  it('SL als Host am freien Platz: Zuweisen statt Umsetzen und Freigeben, nur mit Zuschauern', () => {
    expect(plateEntries({ ...base, occupied: false }).at(-1)).toEqual(['assign']);
    expect(plateEntries({ ...base, occupied: false, watchers: 0 })).toHaveLength(2);
    expect(plateEntries({ ...base, occupied: false, host: false }).flat()).not.toContain('assign');
  });

  it('lokal: nichts zu Personen', () => {
    expect(plateEntries({ ...base, online: false, host: false }).flat()).toEqual(['profile', 'view', 'roll', 'photo', 'reset']);
  });

  it('Spieler am fremden Platz: nur die Rollenansicht; im eigenen Rollenbogen dann gar nichts', () => {
    const foreign = { ...base, can: () => false };
    expect(plateEntries(foreign)).toEqual([['view']]);
    expect(plateEntries({ ...foreign, inRoleView: true })).toEqual([]);
  });

  it('Rechte je Eintrag', () => {
    const only = (key: string) => plateEntries({ ...base, inRoleView: true, can: (t) => t === key }).flat();
    expect(only('seat.edit')).toEqual(['profile']);
    expect(only('sheet.roll')).toEqual(['roll']);
    expect(only('sheet.setPhoto')).toEqual(['photo']);
    expect(only('sheet.reset')).toEqual(['reset']);
    expect(only('table.moveSeat')).toEqual(['move']);
    expect(only('table.setSeat')).toEqual(['release']);
    expect(plateEntries({ ...base, moveTargets: 0 }).flat()).not.toContain('move');
  });
});
