// Rechteprüfung (ARCHITEKTUR.md 9). Beim Host verbindlich, in der Oberfläche zum Ausblenden.

import { seatVisible } from './zones';
import type { Actor, Command, CommandDef, PermissionTable, PermissionValue, TableState } from './types';

/** Welche Regel gilt für diese Rolle und diesen Schlüssel? Fehlt sie: deny (9.2). */
export function permissionFor(role: 'player' | 'spectator', key: string, table: PermissionTable, state: TableState<unknown>): PermissionValue {
  const override = state.settings.permissionOverrides[role]?.[key];
  if (override) return override;
  const base = table[role];
  if (base === 'none') return 'deny';
  return base[key] ?? 'deny';
}

export function can<C extends Command>(actor: Actor, def: CommandDef<any, C>, cmd: C, state: TableState<unknown>, table: PermissionTable): boolean {
  if (actor.role === 'gm') return true;
  // Wer auf einem ausgeblendeten Platz sitzt, ist bis zur Wiedereinblendung Zuschauer (8.2).
  const role = actor.role === 'player' && seatVisible(actor.seat, state) ? 'player' : 'spectator';
  const value = permissionFor(role, def.permission, table, state);
  if (value === 'allow') return true;
  if (value === 'deny' || actor.role !== 'player') return false;
  // own: alles Betroffene mit Besitzer muss dem eigenen Platz gehören (9.2)
  const owners = def.owners?.(cmd, state) ?? [];
  return owners.every((s) => s === actor.seat);
}
