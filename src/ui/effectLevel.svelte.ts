// Effektstufe (ARCHITEKTUR.md 11.5, Schritt 5g): Aus, Ruhig, Voll; pro Person im Browser, nicht im Stand.
// Ohne eigene Wahl gilt „Ruhig“, bei „Bewegung reduzieren“ „Aus“. Die Stufe steht als `data-effects` am Wurzelelement,
// daran hängen die Dauern in theme.css.

import { resetTiming } from './animator.svelte';

export const EFFECT_LEVELS = ['off', 'calm', 'full'] as const;
export type EffectLevel = (typeof EFFECT_LEVELS)[number];

const KEY = 'klio.effects';
const isLevel = (v: unknown): v is EffectLevel => EFFECT_LEVELS.includes(v as EffectLevel);

/** Stufe ohne eigene Wahl */
export const defaultLevel = (reduceMotion: boolean): EffectLevel => (reduceMotion ? 'off' : 'calm');

class Effects {
  /** eigene Wahl; null = Voreinstellung */
  #chosen = $state<EffectLevel | null>(null);
  #reduce = $state(false);

  constructor() {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(KEY);
    this.#chosen = isLevel(stored) ? stored : null;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    this.#reduce = media.matches;
    media.addEventListener('change', () => {
      this.#reduce = media.matches;
      this.#apply();
    });
    this.#apply();
  }

  get level(): EffectLevel {
    return this.#chosen ?? defaultLevel(this.#reduce);
  }

  set level(v: EffectLevel) {
    this.#chosen = v;
    localStorage.setItem(KEY, v);
    this.#apply();
  }

  #apply(): void {
    document.documentElement.dataset['effects'] = this.level;
    resetTiming();
  }
}

export const effectLevel = new Effects();
