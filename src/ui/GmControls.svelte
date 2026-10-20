<script lang="ts">
  // SL-Leiste im Spielbereich (wie bisher unten rechts): Expedition, Orakel, Spielerzahl, Zurücksetzen.
  import type { Rect } from './layout';
  import { submitOrSay } from './commands';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { panel, players }: { panel: Rect; players: number } = $props();
</script>

<div class="ctl control" style:left="{panel.x + panel.w - 40}px" style:top="{panel.y + panel.h - 26}px">
  <button title={t('gm.expeditionTitle')} onclick={() => submitOrSay({ type: 'gm.expedition' })}>{t('gm.expedition')}</button>
  <button title={t('gm.oracleTitle')} onclick={() => submitOrSay({ type: 'gm.oracle' })}>{t('gm.oracle')}</button>
  <label>
    {t('gm.players')}
    <select value={players} onchange={(e) => submitOrSay({ type: 'table.setPlayers', players: Number((e.target as HTMLSelectElement).value) })}>
      {#each [1, 2, 3, 4] as n (n)}<option value={n}>{n}</option>{/each}
    </select>
  </label>
  <button onclick={() => (view.gmDialog = 'reset')}>{t('gm.reset')}</button>
</div>

<style>
  .ctl { position: absolute; transform: translate(-100%, -100%); display: flex; gap: 10px; align-items: center; font-size: 14px; opacity: 0.7; transition: opacity 0.2s, left var(--shift), top var(--shift); white-space: nowrap; }
  .ctl:hover { opacity: 1; }
  label { display: flex; gap: 6px; align-items: center; }
  select, button { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; font: inherit; cursor: pointer; }
</style>
