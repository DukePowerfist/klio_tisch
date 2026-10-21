// Lokaler Zustand der Ansicht (nicht synchronisiert, 6.1): Ansicht, Zoom, offenes Stapelmenü, Meldungen.

import { tick, untrack } from 'svelte';
import { SeatSchema } from '../engine/schemas';
import type { SeatId, ZoneId } from '../engine/types';
import { timing } from './animator.svelte';
import { effectLevel } from './effectLevel.svelte';
import type { SettingsPage } from './settingsPages';

const ROLE_KEY = 'klio.view.role';

function storedRole(): SeatId | null {
  const r = SeatSchema.safeParse(localStorage.getItem(ROLE_KEY));
  return r.success ? r.data : null;
}

export type Toast = { text: string; warn: boolean; id: number };

class ViewState {
  /** null = Draufsicht, sonst Rollenansicht dieses Platzes */
  role = $state<SeatId | null>(storedRole());
  /** zuletzt gewählte Ansicht: gilt sofort (Dock), `role` wechselt erst im Schnitt (11.8) */
  chosen = $state<SeatId | null>(this.role);
  /** Schnitt beim Ansichtswechsel (11.8): Bögen, Zonen und Karten springen, statt zu gleiten */
  cutting = $state(false);
  /** Zoom 1–5, Verschiebung in Tischkoordinaten relativ zur Mitte */
  zoom = $state(1);
  ox = $state(0);
  oy = $state(0);
  open = $state<ZoneId | null>(null);
  /** offener Trumpf-Dialog für diesen Bogen */
  trumpDialog = $state<SeatId | null>(null);
  /** offenes Ergebnisfenster (Expedition bzw. Orakel), geöffnet durch das Ereignis */
  gmDialog = $state<'expedition' | 'oracle' | null>(null);
  /** Rückfrage vor dem Zurücksetzen (Fenster liegen außerhalb des skalierten Tisches, daher hier) */
  confirmReset = $state(false);
  /** offenes Fenster der SL: Raum (Plätze, Link) bzw. Einstellungen (Automatik, Rechte) */
  gmPanel = $state<'room' | 'settings' | null>(null);
  /** zuletzt gewählte Seite der Einstellungen (nur für die Sitzung, nicht im Stand) */
  settingsPage = $state<SettingsPage>('automation');
  /** Großansicht eines Trumpfs; angeheftet (per Klick) bleibt sie bis zum nächsten Klick */
  bigTrump = $state<{ id: string; pinned: boolean } | null>(null);
  /** offenes Menü am Namensschild (10.1): Platz und Lage am Bildschirm (unter dem Schild) */
  plateMenu = $state<{ seat: SeatId; x: number; y: number; above: number } | null>(null);
  /** Profilfenster für einen bestimmten Platz, geöffnet aus dem Menü am Namensschild */
  profileFor = $state<SeatId | null>(null);
  toast = $state<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastId = 0;

  setRole(r: SeatId | null): void {
    // ohne Abhängigkeiten: Aufrufer in einem Effekt (App.svelte, Platz beim Beitritt) liefen sonst bei jedem Wechsel
    // erneut und setzten ihre Rolle zurück
    untrack(() => this.choose(r));
  }

  private choose(r: SeatId | null): void {
    // gleiche Ansicht: kein Schnitt, nur der Zoom gleitet zurück (wie beim Doppelklick auf freie Fläche)
    if (r === this.chosen) {
      if (!this.phase) this.animateTo(1, 0, 0);
      return;
    }
    this.chosen = r;
    if (r) localStorage.setItem(ROLE_KEY, r);
    else localStorage.removeItem(ROLE_KEY);
    // noch nicht gezeichnet oder Stufe „Aus“: sofort, ohne Blende
    if (!this.faded || timing().viewOut === 0) {
      this.role = r;
      this.animateTo(1, 0, 0);
      return;
    }
    // während des Abblendens zählt nur die zuletzt gewählte Ansicht
    if (this.phase !== 'out') void this.cut(this.faded);
  }

  // ---------- Schnitt beim Ansichtswechsel (11.8) ----------
  /** Was beim Schnitt abblendet: seit 5n der ganze Tisch (`.board`), weil Filz, Laterne und Licht mit der Tischmitte
   *  rücken. Nicht nur der Inhalt: Während der Blende wäre er eine isolierte Gruppe, und `multiply` im Licht hätte
   *  keinen Hintergrund (11.9). */
  private faded: HTMLElement | null = null;
  /** `out`: blendet ab, `in`: blendet auf; null: kein Schnitt */
  private phase: 'out' | 'in' | null = null;
  private fade: Animation | null = null;
  private cuts = 0;

  attachFade(el: HTMLElement): () => void {
    this.faded = el;
    return () => {
      if (this.faded === el) this.faded = null;
    };
  }

  /** Schnitt läuft: der Tisch nimmt keine neuen Zeigereingaben an */
  get inCut(): boolean {
    return this.phase !== null;
  }

  private async cut(el: HTMLElement): Promise<void> {
    const id = ++this.cuts;
    const t = timing();
    this.phase = 'out';
    this.stopAnimation();
    await this.fadeTo(el, 0, t.viewOut, 'ease-in');
    if (id !== this.cuts) return;
    this.cutting = true;
    this.role = this.chosen;
    [this.zoom, this.ox, this.oy] = [1, 0, 0];
    await this.settle(el);
    this.phase = 'in';
    await this.fadeTo(el, 1, t.viewIn, 'ease-out');
    if (id === this.cuts) this.phase = null;
  }

  /** Neue Spielerzahl (11.8): die Anordnung kommt mit dem Stand, also ohne Abblenden; Sprung, dann Aufblenden.
   *  Aufruf vor dem Neuzeichnen (`$effect.pre` in Board.svelte), damit die Karten schon mit dem Schnitt planen. */
  async reveal(): Promise<void> {
    const el = this.faded;
    if (!el || timing().viewIn === 0) return;
    this.cutting = true;
    // läuft gerade ein Abblenden, blendet dieser Schnitt am Ende auf
    if (this.phase === 'out') return;
    const id = ++this.cuts;
    this.phase = 'in';
    this.fade?.cancel();
    this.fade = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
    await this.settle(el);
    await this.fadeTo(el, 1, timing().viewIn, 'ease-out');
    if (id === this.cuts) this.phase = null;
  }

  /** Neue Lagen ohne Übergang setzen: erst neu zeichnen, dann den Stil berechnen lassen, dann den Schnitt lösen.
   *  Ohne das Lesen fielen neue Lage und gelöstes `data-cut` in dieselbe Stilberechnung, und `--shift` liefe doch. */
  private async settle(el: HTMLElement): Promise<void> {
    await tick();
    void getComputedStyle(el.querySelector('.zone') ?? el).left;
    this.cutting = false;
  }

  /** Deckkraft der Hülle von der gezeigten zu `to` (nur Compositor); voll sichtbar wieder ohne Animation */
  private fadeTo(el: HTMLElement, to: number, duration: number, easing: string): Promise<void> {
    const from = getComputedStyle(el).opacity;
    this.fade?.cancel();
    const a = el.animate([{ opacity: from }, { opacity: to }], { duration, easing, fill: 'forwards' });
    this.fade = a;
    return a.finished.then(
      () => {
        if (to === 1 && this.fade === a) {
          a.cancel();
          this.fade = null;
        }
      },
      () => undefined,
    );
  }

  say(text: string, warn = false): void {
    this.toast = { text, warn, id: ++this.toastId };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 3500);
  }

  private anim = 0;
  /** weicher Wechsel von Zoom und Verschiebung (wie bisher 420 ms, ease-in-out) */
  animateTo(z: number, ox: number, oy: number): void {
    cancelAnimationFrame(this.anim);
    const [z0, x0, y0] = [this.zoom, this.ox, this.oy];
    const t0 = performance.now();
    // Stufe „Aus“: sofort (11.5)
    const reduce = effectLevel.level === 'off';
    const step = (t: number) => {
      let p = reduce ? 1 : Math.min(1, (t - t0) / 420);
      p = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      this.zoom = z0 + (z - z0) * p;
      this.ox = x0 + (ox - x0) * p;
      this.oy = y0 + (oy - y0) * p;
      if (p < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  stopAnimation(): void {
    cancelAnimationFrame(this.anim);
  }
}

export const view = new ViewState();
