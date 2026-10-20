<script lang="ts">
  // Gemeinsames Fenster: abgedunkelter Hintergrund, Klick daneben oder Esc schließt.
  import type { Snippet } from 'svelte';

  let { label, onclose, narrow = false, children }: { label: string; onclose: () => void; narrow?: boolean; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="box" class:narrow role="dialog" aria-modal="true" aria-label={label}>
    {@render children()}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); display: flex; align-items: center; justify-content: center; z-index: 3000000; }
  .box { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; padding: 18px 22px; width: min(860px, 94vw); max-height: 90vh; overflow: auto; font-size: 15px; }
  .box.narrow { width: auto; max-width: 420px; border-radius: 12px; }
  .box :global(button) { background: var(--button-hover); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
  .box :global(button:disabled) { opacity: 0.45; cursor: not-allowed; }
  .box :global(button.danger) { background: var(--warn-bg); }
</style>
