<script lang="ts">
  // Kopf jedes Fensters (5v, 10.8): Titel, daneben optional ein Schild (`badge`), rechts optional Knöpfe (`actions`,
  // z. B. der Hauptknopf im Ergebnisfenster) und das ×; feine Linie bis an den Rand des Fensters. Den Innenrand des
  // Fensters (--box-pad-y, --box-pad-x aus Modal.svelte) gleicht der Kopf mit negativem Rand aus.
  import type { Snippet } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import CloseX from './CloseX.svelte';

  let { title, onclose, badge, actions, closeAttach }: {
    title: string;
    onclose: () => void;
    badge?: Snippet;
    actions?: Snippet;
    /** am × (z. B. Fokus beim Öffnen, 5t Q3) */
    closeAttach?: Attachment<HTMLButtonElement>;
  } = $props();
</script>

<header class="dialog-head">
  <div class="titleline">
    <h2>{title}</h2>
    {@render badge?.()}
  </div>
  {@render actions?.()}
  <CloseX onclick={onclose} {@attach closeAttach} />
</header>

<style>
  .dialog-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 16px 12px 22px;
    margin: calc(-1 * var(--box-pad-y, 0px)) calc(-1 * var(--box-pad-x, 0px)) var(--box-pad-y, 0px); border-bottom: 1px solid var(--pane-rule); }
  .titleline { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
  h2 { margin: 0; font-size: 17px; font-weight: 600; }
</style>
