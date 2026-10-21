<script lang="ts">
  // Laterne und Licht (ARCHITEKTUR.md 11.9, Schritt 5n). Die Laterne liegt über den Zonen und unter den Karten (z 5),
  // das Licht über allen Karten (z 450000), Stapelmenüs, SL-Leiste und Zeiger darüber. Ob sie brennt, steht im Stand
  // (`lamp`) und gilt für alle; Anzünden und Löschen laufen am Ereignis `lampChanged`, beim Laden ohne Übergang.
  import { untrack } from 'svelte';
  import { timing } from './animator.svelte';
  import { effectLevel } from './effectLevel.svelte';
  import { submitOrSay } from './commands';
  import type { LampBox } from './layout';
  import { lampShadows } from './lampLight.svelte';
  import { haloGradient, IGNITE, lightGradient } from './light';
  import { session } from './session.svelte';
  import { t } from './texts';

  let { lamp, light, lit }: { lamp: LampBox; light: { reach: number; ambient: number }; lit: boolean } = $props();

  const base = import.meta.env.BASE_URL;
  const image = `${base}assets/table/laterne.webp`;
  const mask = `url(${base}assets/table/laterne-licht.webp)`;

  const may = $derived(session.canSome('table.setLamp'));
  /** Licht und Schein sind um OVER größer als der Tisch, damit beim Flackern (Wandern, Schrumpfen) kein Rand zu
   *  sehen ist; die Hülle schneidet sie auf den Tisch zu. Der Verlauf rückt entsprechend mit. */
  const OVER = 120;
  const centre = $derived({ x: lamp.flame.x + OVER, y: lamp.flame.y + OVER });
  const shade = $derived(lightGradient(centre, light));
  const halo = $derived(haloGradient(centre));

  let layers: HTMLDivElement;
  let out: HTMLDivElement;
  let on: HTMLDivElement;
  let glow: HTMLDivElement;
  // in zwei Zweigen gebunden (Knopf oder schlichtes Element, je nach Recht)
  let ember = $state<HTMLDivElement>();
  /** laufender Übergang; solange er läuft oder der eigene Befehl unterwegs ist, zählt kein Klick */
  let running: Promise<unknown> | null = null;
  let sending = false;

  /** Übergang beim Ereignis: Lichtebenen (und das Glühen) blenden ein bzw. aus, die Dämpfung „aus“ gegenläufig.
   *  Ohne `fill`: Danach gilt die Deckkraft aus dem Stand, die schon gesetzt ist. */
  function turn(to: boolean): void {
    const { lampOn, lampOff } = timing();
    const duration = to ? lampOn : lampOff;
    // Schatten springen, wenn die Laterne am wenigsten leuchtet: beim Anzünden jetzt, beim Löschen am Ende
    if (to || !duration) lampShadows.lit = to;
    if (!duration) return;
    const up = to ? IGNITE : [{ opacity: 1 }, { opacity: 0 }];
    const down = up.map((k) => ({ ...k, opacity: 1 - Number(k.opacity) }));
    const opts = { duration, easing: to ? 'linear' : 'ease-in' };
    const anims = [on, glow, ember].flatMap((el) => (el ? [el.animate(up, opts)] : []));
    anims.push(out.animate(down, opts));
    const r = Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
      if (!to) lampShadows.lit = false;
      // auch nach einem fremden Ereignis wieder frei für Klicks
      if (running === r) running = null;
    });
    running = r;
  }

  // Deckkraft von Licht, Schein und Glühen aus dem Stand. Gesetzt im Skript statt mit `style:`, weil das Flackern
  // dieselbe Eigenschaft bewegt; ein Übergang (WAAPI) liegt während er läuft darüber.
  $effect(() => {
    const v = lit ? '1' : '0';
    for (const el of [on, glow, ember]) if (el) el.style.opacity = v;
  });

  // ---------- Flackern in „Voll“ (11.9) ----------
  // Geglättetes Rauschen, gelegentlich ein Zucken, etwa 30 Werte pro Sekunde. Nur Inline-Stil an den Lichtebenen und
  // am Glühen (opacity, translate, scale), nichts auf :root und keine Schatten: sonst müsste der Browser alles neu
  // berechnen und zeichnen. Keine endlose WAAPI-Animation (Tests zählen getAnimations()). Im Hintergrund hält der
  // Browser requestAnimationFrame ohnehin an.
  const flicker = $derived(effectLevel.level === 'full' && lit);
  $effect(() => {
    if (!flicker) return;
    const f = { v: 1, target: 1, next: 0, t: 0 };
    let raf = requestAnimationFrame(function step(now) {
      raf = requestAnimationFrame(step);
      if (running || now - f.t < 33) return;
      f.t = now;
      if (now > f.next) {
        f.target = Math.random() < 0.08 ? 0.72 + Math.random() * 0.1 : 0.9 + Math.random() * 0.14;
        f.next = now + 60 + Math.random() * 220;
      }
      f.v += (f.target - f.v) * 0.35;
      const bright = Math.min(1, f.v).toFixed(3);
      glow.style.opacity = bright;
      if (ember) ember.style.opacity = bright;
      // die Flamme wandert leicht; wird sie kleiner, reicht das Licht weniger weit
      const move = `${((Math.sin(now / 410) * 0.6 + Math.sin(now / 173) * 0.4) * 1.6).toFixed(2)}px ${(Math.cos(now / 290) * 1.2).toFixed(2)}px`;
      on.style.translate = glow.style.translate = move;
      on.style.scale = (0.97 + 0.04 * (f.v - 0.72) / 0.32).toFixed(4);
      glow.style.scale = (0.92 + 0.1 * (f.v - 0.72) / 0.32).toFixed(4);
      layers.dataset['flicker'] = '';
    });
    return () => {
      cancelAnimationFrame(raf);
      for (const el of [on, glow]) el.style.translate = el.style.scale = '';
      const v = lit ? '1' : '0';
      glow.style.opacity = v;
      if (ember) ember.style.opacity = v;
      delete layers.dataset['flicker'];
    };
  });

  // Laden, Beitreten, Wiederherstellen: ohne Ereignis, also ohne Übergang; die Schatten folgen dem Stand
  $effect(() => {
    const now = lit;
    untrack(() => {
      if (!running) lampShadows.lit = now;
    });
  });

  $effect(() => session.onEvents((events) => {
    let last: boolean | null = null;
    for (const e of events) if (e.type === 'lampChanged') last = e.lit;
    if (last !== null) untrack(() => turn(last!));
  }));

  async function toggle(e: MouseEvent): Promise<void> {
    // zweiter Klick eines Doppelklicks, Befehl unterwegs oder Übergang läuft: nicht noch einmal schalten
    if (e.detail > 1 || sending || running) return;
    sending = true;
    await submitOrSay({ type: 'table.setLamp', lit: !lit });
    sending = false;
  }
</script>

{#if may}
  <button class="lamp control" style:left="{lamp.x}px" style:top="{lamp.y}px" style:width="{lamp.w}px" style:height="{lamp.h}px" title={t(lit ? 'gm.lampOff' : 'gm.lampOn')} aria-pressed={lit} onclick={toggle} data-lamp data-lit={lit}>
    <img src={image} alt="" draggable="false" />
    <div class="ember" bind:this={ember} style:mask-image={mask}></div>
  </button>
{:else}
  <div class="lamp" style:left="{lamp.x}px" style:top="{lamp.y}px" style:width="{lamp.w}px" style:height="{lamp.h}px" data-lamp data-lit={lit}>
    <img src={image} alt="" draggable="false" />
    <div class="ember" bind:this={ember} style:mask-image={mask}></div>
  </div>
{/if}

<!-- Hülle ohne z-index und ohne alles andere, was einen Stapelkontext bildet (opacity, transform, filter, isolation):
     sonst wäre sie eine isolierte Gruppe, und multiply hätte keinen Hintergrund (11.9). Die z-Werte stehen an den Ebenen. -->
<div class="light" bind:this={layers} aria-hidden="true">
  <div class="out" bind:this={out} style:opacity={lit ? 0 : 1}></div>
  <div class="on" bind:this={on} style:background={shade} style:transform-origin="{centre.x}px {centre.y}px"></div>
  <div class="glow" bind:this={glow} style:background={halo} style:transform-origin="{centre.x}px {centre.y}px"></div>
</div>

<style>
  .lamp { position: absolute; z-index: 5; padding: 0; border: 0; background: none; border-radius: 50%; }
  button.lamp { cursor: pointer; }
  .lamp img { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; user-select: none;
    filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.7)) drop-shadow(0 1px 6px rgba(0, 0, 0, 0.5)); }
  /* Glühen aus Kamin, Lüftungslöchern und Glas; `screen` wirkt nur in der Laterne (z 5 ist ein eigener Stapelkontext) */
  .ember { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: screen; mask-size: 100% 100%;
    background: radial-gradient(circle at 50.24% 45.61%, #fff6d8 0, #ffcf6a 14%, #ff9a2e 34%, #d9601a 60%); }
  .light { position: absolute; inset: 0; overflow: clip; border-radius: 18px; pointer-events: none; }
  .light > div { position: absolute; inset: 0; }
  .light > .on, .light > .glow { inset: -120px; } /* OVER */
  .out { z-index: 450000; mix-blend-mode: multiply; background: var(--lamp-out); }
  .on { z-index: 450001; mix-blend-mode: multiply; }
  .glow { z-index: 450002; mix-blend-mode: screen; }
</style>
