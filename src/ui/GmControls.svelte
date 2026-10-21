<script lang="ts">
  // SL-Leiste im Spielbereich (wie bisher unten rechts): Expedition, Orakel, Spielerzahl, Zurücksetzen
  // (Einstellungen seit Schritt 5b im Menü oben rechts).
  // Jeder Knopf nur mit dem passenden Recht (9.3).
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { at, players }: { at: { x: number; y: number }; players: number } = $props();
</script>

<div class="ctl control" style:left="{at.x}px" style:top="{at.y}px">
  {#if session.can({ type: 'gm.expedition' })}
    <button title={t('gm.expeditionTitle')} onclick={() => submitOrSay({ type: 'gm.expedition' })}>{t('gm.expedition')}</button>
  {/if}
  {#if session.can({ type: 'gm.oracle' })}
    <button title={t('gm.oracleTitle')} onclick={() => submitOrSay({ type: 'gm.oracle' })}>{t('gm.oracle')}</button>
  {/if}
  {#if session.can({ type: 'table.setPlayers' })}
    <label>
      {t('gm.players')}
      <select value={players} onchange={(e) => submitOrSay({ type: 'table.setPlayers', players: Number(e.currentTarget.value) })}>
        {#each [1, 2, 3, 4] as n (n)}<option value={n}>{n}</option>{/each}
      </select>
    </label>
  {/if}
  {#if session.can({ type: 'table.reset' })}
    <button onclick={() => (view.confirmReset = true)}>{t('gm.reset')}</button>
  {/if}
</div>

<style>
  .ctl { position: absolute; transform: translate(-100%, -100%); display: flex; gap: 10px; align-items: center; font-size: 14px; opacity: 0.7; transition: opacity 0.2s, left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease); white-space: nowrap; }
  .ctl:hover { opacity: 1; }
  label { display: flex; gap: 6px; align-items: center; }
  select, button { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; font: inherit; cursor: pointer; }
</style>
