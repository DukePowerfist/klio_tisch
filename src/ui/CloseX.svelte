<script lang="ts">
  // Das × zum Schließen (5v, 10.8): im Kopf jedes Fensters (DialogHead) und an der Protokollspalte. Name für
  // Bildschirmleser und Tooltip „Schließen“. Weitere Angaben (z. B. ein Attachment für den Fokus) gehen an den Knopf.
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { t } from './texts';

  let { onclick, ...rest }: { onclick: () => void } & HTMLButtonAttributes = $props();
</script>

<button {...rest} class="dialog-close" aria-label={t('gm.close')} title={t('gm.close')} {onclick}>
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
</button>

<style>
  /* von den Knöpfen der Fenster ausgenommen (Modal.svelte, :not(.dialog-close)) */
  .dialog-close { flex: none; background: none; border: none; border-radius: var(--radius-m); padding: 5px; line-height: 0; color: var(--ink); opacity: 0.75; cursor: pointer; }
  .dialog-close:hover { background: var(--button-hover); opacity: 1; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
</style>
