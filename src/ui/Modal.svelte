<script lang="ts">
  // Gemeinsames Fenster: abgedunkelter Hintergrund, Klick daneben oder Esc schließt.
  // Größe: narrow (Rückfragen, schmal), wide (Trumpf), pane (Einstellungen: feste Größe, Inhalt ordnet sich selbst),
  // result (Expedition und Orakel, 5t: Spalte ohne Innenrand, Knöpfe zeichnet das Fenster selbst).
  // Tab bleibt im obersten Fenster (Schritt 5f), statt in den Tisch dahinter zu laufen.
  import type { Snippet } from 'svelte';

  let { label, onclose, onescape, size = 'wide', children }: {
    label: string;
    onclose: () => void;
    /** Esc zuerst hier (z. B. offene Rückfrage abbrechen); true = erledigt, Fenster bleibt offen */
    onescape?: () => boolean;
    size?: 'narrow' | 'wide' | 'pane' | 'result';
    children: Snippet;
  } = $props();

  let box: HTMLDivElement;

  const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type=hidden]):not([hidden]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (!onescape?.()) onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    // Nur das oberste Fenster hält den Fokus
    const open = document.querySelectorAll('[aria-modal="true"]');
    if (open[open.length - 1] !== box) return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return e.preventDefault();
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const inside = box.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="box {size}" role="dialog" aria-modal="true" aria-label={label} bind:this={box}>
    {@render children()}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); display: flex; align-items: center; justify-content: center; z-index: 3000000; animation: fade-in var(--pop) ease-out; }
  .box { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; padding: 18px 22px; width: min(860px, 94vw); max-height: 90vh; overflow: auto; font-size: 15px; animation: pop-in var(--pop) var(--spring-soft); }
  .box.narrow { width: auto; max-width: 420px; border-radius: 12px; }
  .box.pane { width: min(780px, 94vw); height: min(620px, 85vh); max-height: none; padding: 0; overflow: hidden; display: flex; }
  .box.result { width: min(560px, 94vw); padding: 0; overflow: hidden; display: flex; flex-direction: column; }
  /* Knöpfe nur in den übrigen Größen; :where hält die Stärke der Regeln wie bisher (0,2,1, 5t Q1) */
  .box:where(:not(.result)) :global(button) { background: var(--button-hover); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
  .box:where(:not(.result)) :global(button:disabled) { opacity: 0.45; cursor: not-allowed; }
  .box:where(:not(.result)) :global(button.danger) { background: var(--warn-bg); }
  .box :global(select) { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; font: inherit; }
  /* gemeinsame Bausteine der Fenster: Hinweiszeile und Knopfreihe */
  .box :global(.note) { font-size: 13px; opacity: 0.75; }
  .box :global(.problem) { color: var(--reason); }
  .box :global(.buttons) { display: flex; gap: 10px; margin: 8px 0; }
</style>
