<script lang="ts">
  // Dock unten links: Rollenansicht 1–4, Übersicht. Tasten 1–4 und 0/Esc wie bisher.
  // Je Platz Ziffer, dezent in der Farbe des Platzes; der Charaktername steht im Tooltip (ARCHITEKTUR.md 10).
  import { SEATS, type SeatId } from '../engine/types';
  import { seatNames } from './seatNames';
  import { session } from './session.svelte';
  import { whoColor } from './colors';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { players }: { players: number } = $props();

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    // Bei offenem Fenster gehören die Tasten dem Fenster (Esc schließt es)
    if (document.querySelector('[aria-modal="true"]')) return;
    if (e.key === '0' || e.key === 'Escape') view.setRole(null);
    else if (e.key >= '1' && e.key <= '4' && Number(e.key) <= players) view.setRole(SEATS[Number(e.key) - 1] as SeatId);
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="dock control">
  {#each SEATS.slice(0, players) as seat, i (seat)}
    {@const names = session.state ? seatNames(session.state, seat) : null}
    <button
      class="seat away-fade"
      class:away={session.away.has(seat)}
      class:still={session.awayStill.has(seat)}
      class:on={view.chosen === seat}
      data-dock={seat}
      style:--c={whoColor(seat)}
      title={`${names ? `${t('dock.seat', { n: i + 1 })}: ${names.label}` : t('dock.seat', { n: i + 1 })} (${t('dock.key', { n: i + 1 })})`}
      onclick={() => view.setRole(seat)}
    >{i + 1}</button>
  {/each}
  <button class:on={view.chosen === null} title={t('dock.overview')} onclick={() => view.setRole(null)}>⤢</button>
</div>

<style>
  /* gedimmt über den Hintergrund, nicht über opacity: Ringe und Namen bleiben voll deckend (Stream) */
  .dock { position: fixed; left: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 6px; z-index: 96; }
  button { width: 30px; height: 30px; padding: 0; border-radius: 50%; background: color-mix(in srgb, var(--panel-bg) 50%, transparent); color: var(--ink); border: 1px solid var(--line); font-size: 14px; line-height: 1; cursor: pointer; transition: background 0.2s, scale var(--press) ease-out, opacity var(--away-t, var(--back)) ease; }
  .dock:hover button { background: var(--panel-bg); }
  button.seat { border: 2px solid color-mix(in srgb, var(--c) 80%, transparent); background: color-mix(in srgb, var(--c) 22%, color-mix(in srgb, var(--panel-bg) 50%, transparent)); }
  .dock:hover button.seat { background: color-mix(in srgb, var(--c) 22%, var(--panel-bg)); }
  .dock button.on { background: var(--accent); color: #111; border-color: var(--accent); }
  .dock button.seat.on { background: var(--c); border-color: var(--c); }
</style>
