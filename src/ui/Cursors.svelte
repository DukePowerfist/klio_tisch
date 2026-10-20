<script lang="ts">
  // Mauszeiger der anderen mit Namen (ARCHITEKTUR.md 8.3). Lage relativ zum Anker, damit sie in jeder Ansicht passt;
  // die Größe bleibt beim Zoomen gleich.
  import { seatNo } from '../engine/zones';
  import type { PresenceInfo } from '../net/presence';
  import { anchorRect, type Layout } from './layout';
  import { session } from './session.svelte';
  import { t } from './texts';

  let { layout, scale }: { layout: Layout; scale: number } = $props();

  const label = (p: PresenceInfo) =>
    p.name || (p.who === 'gm' ? t('presence.gm') : p.who === 'spectator' ? t('room.spectator') : t('room.player', { n: seatNo(p.who) }));

  const shown = $derived(session.cursors.flatMap(([peer, p]) => {
    const r = p.at && anchorRect(layout, p.at.anchor);
    return r && p.at ? [{ peer, x: r.x + p.at.x * r.w, y: r.y + p.at.y * r.h, color: `var(--who-${p.who})`, text: label(p) }] : [];
  }));
</script>

{#each shown as c (c.peer)}
  <div class="cursor" style:left="{c.x}px" style:top="{c.y}px" style:transform="scale({1 / scale})" style:--c={c.color}>
    <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" /></svg>
    <span>{c.text}</span>
  </div>
{/each}

<style>
  .cursor { position: absolute; z-index: 600000; pointer-events: none; transform-origin: 0 0; transition: left 0.08s linear, top 0.08s linear; }
  svg { display: block; fill: var(--c); stroke: #000; stroke-width: 1; }
  span { position: absolute; left: 14px; top: 16px; font-size: 12px; white-space: nowrap; background: var(--c); color: #111; padding: 1px 6px; border-radius: 6px; }
</style>
