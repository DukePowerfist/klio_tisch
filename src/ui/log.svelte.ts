// Spielprotokoll (ARCHITEKTUR.md 5): die letzten Ereignisse als Text, je Browser ab dem Öffnen gesammelt.
// Bleibt über ein Neuladen erhalten (localStorage); verdeckte Informationen gibt es nicht (A13).

import { z } from 'zod';
import type { EngineEvent } from '../engine/types';
import type { KlioEvent } from '../rules/klio/events';
import { describe } from './eventText';
import { session } from './session.svelte';
import { t } from './texts';

const KEY = 'klio.log';
const OPEN_KEY = 'klio.log.open';
const MAX = 100;
const SAVE_MS = 1000;

const LogEntry = z.object({ id: z.number(), at: z.number(), text: z.string(), warn: z.boolean() });
export type LogEntry = z.infer<typeof LogEntry>;

const stored = (): LogEntry[] => {
  try {
    return z.array(LogEntry).catch([]).parse(JSON.parse(localStorage.getItem(KEY) ?? '[]')).slice(0, MAX);
  } catch {
    return [];
  }
};

class GameLog {
  /** neueste zuerst */
  entries = $state.raw<LogEntry[]>(stored());
  #open = $state(localStorage.getItem(OPEN_KEY) === '1');
  private nextId = Math.max(0, ...this.entries.map((e) => e.id)) + 1;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    session.onEvents((events) => {
      const texts = (events as (EngineEvent | KlioEvent)[]).flatMap((e) => describe(e) ?? []);
      this.add(texts.map((d) => ({ text: d.text, warn: d.level === 'warn' })));
    });
    session.onReplaced((reason) => this.add([{ text: t(`log.replaced.${reason}`), warn: false }]));
    // beim Verlassen der Seite sofort speichern, damit nichts aus der Bündelung verloren geht
    addEventListener('pagehide', () => { if (this.saveTimer) this.save(); });
  }

  /** Spalte offen oder zu, je Browser gespeichert */
  get open(): boolean {
    return this.#open;
  }
  set open(v: boolean) {
    this.#open = v;
    localStorage.setItem(OPEN_KEY, v ? '1' : '0');
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    localStorage.setItem(KEY, JSON.stringify(this.entries));
  }

  private add(items: { text: string; warn: boolean }[]): void {
    if (items.length === 0) return;
    const at = Date.now();
    const added = items.map((x) => ({ ...x, at, id: this.nextId++ })).reverse();
    this.entries = [...added, ...this.entries].slice(0, MAX);
    // gebündelt speichern, nicht bei jedem Ereignis
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_MS);
  }
}

export const gameLog = new GameLog();
