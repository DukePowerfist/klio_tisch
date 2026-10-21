<script lang="ts">
  // Eine Zeile der Einstellungen (Schritt 5f, Stil des Zed-Editors): links Titel und gedämpfte Beschreibung,
  // rechts das Bedienelement. Das Bedienelement verweist per aria-labelledby/-describedby auf `{id}-title`/`{id}-desc`.
  import type { Snippet } from 'svelte';

  let { id, title, description, changed = false, problem, children }: {
    id: string;
    title: string;
    description?: string;
    /** weicht von der Voreinstellung ab */
    changed?: boolean;
    /** Fehlermeldung zur Zeile (z. B. Datei nicht lesbar) */
    problem?: string;
    children: Snippet;
  } = $props();
</script>

<div class="row">
  <div class="text">
    <span class="title" class:changed id="{id}-title">{title}</span>
    {#if description}<span class="desc" id="{id}-desc">{description}</span>{/if}
    {#if problem}<span class="problem" role="alert">{problem}</span>{/if}
  </div>
  <div class="control">{@render children()}</div>
</div>

<style>
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; padding: 10px 0; border-bottom: 1px solid var(--pane-rule); }
  .row:last-child { border-bottom: none; }
  .text { flex: 1 1 12em; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .desc { font-size: 13px; opacity: 0.7; line-height: 1.35; }
  .problem { font-size: 13px; color: var(--reason); }
  .changed { color: var(--accent-hint); }
  .control { flex: none; max-width: 100%; flex-wrap: wrap; justify-content: flex-end; margin-left: auto; display: flex; align-items: center; gap: 8px; }
</style>
