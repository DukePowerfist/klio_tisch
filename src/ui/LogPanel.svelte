<script lang="ts">
  // Spielprotokoll: dezent über dem Dock, einklappbar; neueste Einträge oben.
  import { gameLog } from './log.svelte';
  import { t } from './texts';

  const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
</script>

<div class="log control" class:open={gameLog.open}>
  <button class="toggle" aria-expanded={gameLog.open} onclick={() => (gameLog.open = !gameLog.open)}>{t('log.title')}</button>
  {#if gameLog.open}
    <ol aria-label={t('log.title')}>
      {#each gameLog.entries as e (e.id)}
        <li class:warn={e.warn}><time>{clock.format(e.at)}</time> {e.text}</li>
      {:else}
        <li class="empty">{t('log.empty')}</li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .log { position: fixed; left: 12px; bottom: calc(52px + env(safe-area-inset-bottom, 0px)); z-index: 96; width: min(380px, 70vw); opacity: 0.5; transition: opacity 0.2s; }
  .log:hover, .log.open { opacity: 1; }
  .toggle { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 10px; font: inherit; font-size: 13px; cursor: pointer; }
  ol { list-style: none; margin: 6px 0 0; padding: 8px 10px; max-height: 40vh; overflow: auto; background: var(--panel-bg); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; line-height: 1.4; }
  li + li { margin-top: 3px; }
  li.warn { color: var(--reason); }
  time { opacity: 0.6; margin-right: 4px; font-variant-numeric: tabular-nums; }
  .empty { opacity: 0.6; }
</style>
