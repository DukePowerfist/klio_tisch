<script lang="ts">
  // SL-Leiste im Spielbereich (wie bisher unten rechts): Expedition, Orakel, Spielerzahl, Zurücksetzen
  // (Einstellungen seit Schritt 5b im Menü oben rechts). Seit 5s im Menüstil (10.5): eine Fläche, Gruppen mit feinen
  // Linien, feste Bildschirmgröße durch Gegenskalierung wie bei den Zeigern. Immer eine Zeile: passt sie nicht in den
  // Filz, wird sie als Ganzes gerade so klein, dass sie passt (nie kleiner als früher, als sie voll mitskalierte).
  // Jeder Knopf nur mit dem passenden Recht (9.3); ohne ein einziges Recht keine Leiste.
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { at, maxW, scale, players }: { at: { x: number; y: number }; maxW: number; scale: number; players: number } = $props();

  const draw = $derived(session.can({ type: 'gm.expedition' }) || session.can({ type: 'gm.oracle' }));
  const any = $derived(draw || session.can({ type: 'table.setPlayers' }) || session.can({ type: 'table.reset' }));
  /** natürliche Breite (offsetWidth sieht keine Transformation), ändert sich mit den Rechten */
  let width = $state(0);
  /** Maßstab der Leiste im Tisch: 1 / Tischmaßstab, höchstens so groß, dass sie in maxW (TP) passt */
  const f = $derived(width > 0 ? Math.min(1 / scale, maxW / width) : 1 / scale);
</script>

{#if any}
  <div class="ctl control" role="group" aria-label={t('gm.bar')} bind:offsetWidth={width} style:left="{at.x}px" style:top="{at.y}px" style:--f={f}>
    <div class="rows">
      {#if draw}
        <div class="group">
          {#if session.can({ type: 'gm.expedition' })}
            <button class="menu-item" title={t('gm.expeditionTitle')} onclick={() => submitOrSay({ type: 'gm.expedition' })}>{t('gm.expeditionShort')}</button>
          {/if}
          {#if session.can({ type: 'gm.oracle' })}
            <button class="menu-item" title={t('gm.oracleTitle')} onclick={() => submitOrSay({ type: 'gm.oracle' })}>{t('gm.oracle')}</button>
          {/if}
        </div>
      {/if}
      {#if session.can({ type: 'table.setPlayers' })}
        <div class="group">
          <label>
            {t('gm.players')}
            <select value={players} onchange={(e) => submitOrSay({ type: 'table.setPlayers', players: Number(e.currentTarget.value) })}>
              {#each [1, 2, 3, 4] as n (n)}<option value={n}>{n}</option>{/each}
            </select>
          </label>
        </div>
      {/if}
      {#if session.can({ type: 'table.reset' })}
        <div class="group">
          <button class="menu-item" onclick={() => (view.confirmReset = true)}>{t('gm.reset')}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* über dem Licht (z 450000, 11.9): Bedienung, kein Gegenstand auf dem Tisch; eine darüber gezogene Karte liegt kurz darunter.
     Rechte untere Ecke am Anker, von dort mit --f skaliert */
  .ctl { position: absolute; z-index: 460000; box-sizing: border-box; transform: translate(-100%, -100%) scale(var(--f)); transform-origin: 100% 100%;
    padding: 3px; background: var(--menu-bar-bg); border: 1px solid var(--menu-rim); border-radius: var(--menu-radius); box-shadow: var(--menu-bar-shadow);
    color: var(--ink); font-size: 14px; white-space: nowrap; transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease); }
  /* Linie links an jeder Gruppe; an der ersten liegt sie einen Punkt außerhalb und wird abgeschnitten */
  .rows { display: flex; overflow: hidden; }
  .group { display: flex; gap: 4px; align-items: center; padding: 3px 6px; margin-left: -1px; border-left: 1px solid var(--menu-rule); }
  button.menu-item { width: auto; min-height: 36px; padding: 5px 12px; }
  label { display: flex; gap: 8px; align-items: center; padding-left: 6px; color: var(--menu-head); }
  select { min-height: 36px; background: transparent; color: var(--ink); border: 1px solid var(--menu-rim); border-radius: 6px; padding: 3px 9px; font: inherit; cursor: pointer; }
  select:focus { outline: none; }
  select:focus-visible { outline: 2px solid var(--menu-focus); outline-offset: 1px; }
  option { background: var(--menu-bg); }
</style>
