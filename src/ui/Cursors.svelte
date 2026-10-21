<script lang="ts">
  // Mauszeiger der anderen mit Namen (ARCHITEKTUR.md 8.3). Lage relativ zum Anker, damit sie in jeder Ansicht passt;
  // die Größe bleibt beim Zoomen gleich.
  import { seatNo } from '../engine/zones';
  import type { PresenceInfo } from '../net/presence';
  import { pointerAt, type Layout, type Places } from './layout';
  import { session } from './session.svelte';
  import { whoColor } from './colors';
  import { t } from './texts';

  let { layout, places, scale }: { layout: Layout; places: Places; scale: number } = $props();

  /** Spieler heißen wie im Stand, Zuschauer wie gesendet */
  function label(p: PresenceInfo): string {
    if (p.who === 'gm') return t('presence.gm');
    if (p.who === 'spectator') return p.name || t('room.spectator');
    return session.state?.seats[p.who].name || t('room.player', { n: seatNo(p.who) });
  }

  const shown = $derived(session.cursors.flatMap(([peer, p]) => {
    if (!p.at) return [];
    const pt = pointerAt(layout, places, p.at);
    return pt ? [{ peer, ...pt, color: whoColor(p.who), text: label(p) }] : [];
  }));
</script>

{#each shown as c (c.peer)}
  <div class="cursor" style:transform="translate({c.x}px, {c.y}px) scale({1 / scale})" style:--c={c.color}>
    <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" /></svg>
    <span>{c.text}</span>
  </div>
{/each}

<style>
  .cursor { position: absolute; left: 0; top: 0; z-index: 600000; pointer-events: none; transform-origin: 0 0; transition: transform 0.08s linear; }
  svg { display: block; fill: var(--c); stroke: #000; stroke-width: 1; }
  span { position: absolute; left: 14px; top: 16px; font-size: 12px; white-space: nowrap; background: var(--c); color: #111; padding: 1px 6px; border-radius: 6px; }
</style>
