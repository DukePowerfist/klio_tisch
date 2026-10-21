// Einträge des Menüs am Namensschild (10.1): welche es an diesem Platz gibt, in Gruppen. Rein, damit testbar;
// was der Eintrag tut, steht in PlateMenu.svelte (mit seatActions.ts, sheetActions.ts, confirm.svelte.ts).

export type PlateEntry = 'profile' | 'view' | 'roll' | 'photo' | 'reset' | 'move' | 'release' | 'assign';

export type PlateContext = {
  /** darf der Nutzer diesen Befehl an diesem Platz? */
  can: (type: string) => boolean;
  /** jemand sitzt am Platz */
  occupied: boolean;
  /** Raum mit Mitspielern (nicht lokal); als Host zusätzlich `host` */
  online: boolean;
  host: boolean;
  /** das Schild steht auf dem großen Bogen der Rollenansicht dieses Platzes */
  inRoleView: boolean;
  /** Zahl der Ziele zum Umsetzen bzw. der Zuschauer zum Zuweisen */
  moveTargets: number;
  watchers: number;
};

/** Gruppen in fester Reihenfolge, getrennt durch feine Linien: Person und Ansicht, Bogen, Platz (SL) */
const GROUPS: PlateEntry[][] = [
  ['profile', 'view'],
  ['roll', 'photo', 'reset'],
  ['move', 'release', 'assign'],
];

function shown(e: PlateEntry, c: PlateContext): boolean {
  switch (e) {
    case 'profile':
      return c.can('seat.edit');
    case 'view':
      return !c.inRoleView;
    case 'roll':
      return c.can('sheet.roll');
    case 'photo':
      return c.can('sheet.setPhoto');
    case 'reset':
      return c.can('sheet.reset');
    case 'move':
      return c.online && c.occupied && c.can('table.moveSeat') && c.moveTargets > 0;
    case 'release':
      return c.online && c.occupied && c.can('table.setSeat');
    case 'assign':
      return c.host && !c.occupied && c.can('table.setSeat') && c.watchers > 0;
  }
}

/** sichtbare Einträge, leere Gruppen fallen weg; keine Gruppe = das Schild ist kein Knopf */
export const plateEntries = (c: PlateContext): PlateEntry[][] => GROUPS.map((g) => g.filter((e) => shown(e, c))).filter((g) => g.length > 0);
