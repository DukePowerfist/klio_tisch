// Spielprotokoll (ARCHITEKTUR.md 5): die letzten Ereignisse als Text, je Browser ab dem Öffnen gesammelt.
// Bleibt über ein Neuladen erhalten (localStorage); verdeckte Informationen gibt es nicht (A13).

import type { EngineEvent } from '../engine/types';
import type { KlioEvent } from '../rules/klio/events';
import { describe } from './eventText';
import { session } from './session.svelte';

const KEY = 'klio.log';
const MAX = 100;

export type LogEntry = { at: number; text: string; warn: boolean };

function stored(): LogEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? (list as LogEntry[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

class GameLog {
  /** neueste zuerst */
  entries = $state.raw<LogEntry[]>(stored());
  open = $state(false);

  constructor() {
    session.onEvents((events) => {
      const now = Date.now();
      const added = (events as (EngineEvent | KlioEvent)[]).flatMap((e) => {
        const d = describe(e);
        return d ? [{ at: now, text: d.text, warn: d.warn }] : [];
      });
      if (added.length === 0) return;
      this.entries = [...added.reverse(), ...this.entries].slice(0, MAX);
      localStorage.setItem(KEY, JSON.stringify(this.entries));
    });
  }
}

export const gameLog = new GameLog();
