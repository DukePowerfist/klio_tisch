<script lang="ts">
  // Dock unten links: Rollenansicht 1–4, Übersicht. Tasten 1–4 und 0/Esc wie bisher.
  import { SEATS, type SeatId } from '../engine/types';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { players }: { players: number } = $props();

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '0' || e.key === 'Escape') view.setRole(null);
    else if (e.key >= '1' && e.key <= '4' && Number(e.key) <= players) view.setRole(SEATS[Number(e.key) - 1] as SeatId);
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="dock control">
  {#each SEATS.slice(0, players) as seat, i (seat)}
    <button class:on={view.role === seat} title={t('dock.seat', { n: i + 1 })} onclick={() => view.setRole(seat)}>{i + 1}</button>
  {/each}
  <button class:on={view.role === null} title={t('dock.overview')} onclick={() => view.setRole(null)}>⤢</button>
</div>

<style>
  .dock { position: fixed; left: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 6px; z-index: 96; opacity: 0.5; transition: opacity 0.2s; }
  .dock:hover { opacity: 1; }
  button { width: 30px; height: 30px; padding: 0; border-radius: 50%; background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); font-size: 14px; line-height: 1; cursor: pointer; }
  button.on { background: var(--accent); color: #111; border-color: var(--accent); }
</style>
