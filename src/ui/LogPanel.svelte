<script lang="ts">
  // Spielprotokoll als Spalte am rechten Rand (ARCHITEKTUR.md 10, Schritt 5b Teil 4): geöffnet über das Menü,
  // bleibt beim Weiterspielen offen, bis man sie schließt; neueste Einträge oben.
  import { gameLog } from './log.svelte';
  import { t } from './texts';

  const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
</script>

{#if gameLog.open}
  <aside class="log control">
    <header>
      <h2>{t('log.title')}</h2>
      <button onclick={() => (gameLog.open = false)}>{t('log.close')}</button>
    </header>
    <ol aria-label={t('log.title')}>
      {#each gameLog.entries as e (e.id)}
        <li class:warn={e.warn}><time>{clock.format(e.at)}</time> {e.text}</li>
      {:else}
        <li class="empty">{t('log.empty')}</li>
      {/each}
    </ol>
  </aside>
{/if}

<style>
  .log { position: fixed; top: 0; right: 0; bottom: 0; width: var(--log-w); z-index: 96; display: flex; flex-direction: column; background: var(--panel-bg); border-left: 1px solid var(--line); box-sizing: border-box; }
  /* rechts Platz für den Menüknopf */
  header { display: flex; align-items: center; gap: 8px; padding: 10px calc(var(--menu-size) + 2 * var(--menu-inset)) 8px 12px; border-bottom: 1px solid var(--line); }
  h2 { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
  button { background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; font: inherit; font-size: 12px; cursor: pointer; }
  button:hover { background: var(--button-hover); }
  ol { flex: 1; list-style: none; margin: 0; padding: 8px 12px; overflow: auto; font-size: 13px; line-height: 1.4; }
  li + li { margin-top: 3px; }
  li.warn { color: var(--reason); }
  time { opacity: 0.6; margin-right: 4px; font-variant-numeric: tabular-nums; }
  .empty { opacity: 0.6; }
</style>
