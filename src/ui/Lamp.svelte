<script lang="ts">
  // Laterne und Licht (ARCHITEKTUR.md 11.9, Schritt 5n). Die Laterne liegt über den Zonen und unter den Karten (z 5),
  // das Licht über allen Karten (z 450000), Stapelmenüs, SL-Leiste und Zeiger darüber. Ob sie brennt, steht im Stand
  // (`lamp`) und gilt für alle; Anzünden und Löschen laufen am Ereignis `lampChanged`, beim Laden ohne Übergang.
  import { untrack } from 'svelte';
  import { timing } from './animator.svelte';
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
  const shade = $derived(lightGradient(lamp.flame, light));
  const halo = $derived(haloGradient(lamp.flame));

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
    <div class="ember" bind:this={ember} style:mask-image={mask} style:opacity={lit ? 1 : 0}></div>
  </button>
{:else}
  <div class="lamp" style:left="{lamp.x}px" style:top="{lamp.y}px" style:width="{lamp.w}px" style:height="{lamp.h}px" data-lamp data-lit={lit}>
    <img src={image} alt="" draggable="false" />
    <div class="ember" bind:this={ember} style:mask-image={mask} style:opacity={lit ? 1 : 0}></div>
  </div>
{/if}

<!-- Hülle ohne z-index und ohne alles andere, was einen Stapelkontext bildet (opacity, transform, filter, isolation):
     sonst wäre sie eine isolierte Gruppe, und multiply hätte keinen Hintergrund (11.9). Die z-Werte stehen an den Ebenen. -->
<div class="light" aria-hidden="true">
  <div class="out" bind:this={out} style:opacity={lit ? 0 : 1}></div>
  <div class="on" bind:this={on} style:background={shade} style:opacity={lit ? 1 : 0}></div>
  <div class="glow" bind:this={glow} style:background={halo} style:opacity={lit ? 1 : 0}></div>
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
  .out { z-index: 450000; mix-blend-mode: multiply; background: var(--lamp-out); }
  .on { z-index: 450001; mix-blend-mode: multiply; }
  .glow { z-index: 450002; mix-blend-mode: screen; }
</style>
