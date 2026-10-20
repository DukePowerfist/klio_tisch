// Lokaler Zustand der Ansicht (nicht synchronisiert, 6.1): Ansicht, Zoom, offenes Stapelmenü, Meldungen.

import type { SeatId, ZoneId } from '../engine/types';

const ROLE_KEY = 'klio.view.role';

function storedRole(): SeatId | null {
  const r = localStorage.getItem(ROLE_KEY);
  return r === 'seat1' || r === 'seat2' || r === 'seat3' || r === 'seat4' ? r : null;
}

export type Toast = { text: string; warn: boolean; id: number };

class ViewState {
  /** null = Draufsicht, sonst Rollenansicht dieses Platzes */
  role = $state<SeatId | null>(storedRole());
  /** Zoom 1–5, Verschiebung in Tischkoordinaten relativ zur Mitte */
  zoom = $state(1);
  ox = $state(0);
  oy = $state(0);
  open = $state<ZoneId | null>(null);
  toast = $state<Toast | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastId = 0;

  setRole(r: SeatId | null): void {
    this.role = r;
    if (r) localStorage.setItem(ROLE_KEY, r);
    else localStorage.removeItem(ROLE_KEY);
    this.animateTo(1, 0, 0);
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
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
