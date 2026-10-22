<script lang="ts" module>
  /** ein- oder ausgefahren, nur in diesem Browser (10.5, wie das offene Protokoll) */
  const OPEN_KEY = 'klio.gmBar.open';
</script>

<script lang="ts">
  // SL-Leiste im Spielbereich (wie bisher unten rechts): Expedition, Orakel, Zurücksetzen
  // (Einstellungen seit Schritt 5b im Menü oben rechts). Seit 5s im Menüstil (10.5): eine Fläche, Gruppen mit feinen
  // Linien, feste Bildschirmgröße durch Gegenskalierung wie bei den Zeigern. Immer eine Zeile: passt sie nicht in den
  // Filz, wird sie als Ganzes gerade so klein, dass sie passt (nie kleiner als früher, als sie voll mitskalierte).
  // Jeder Knopf nur mit dem passenden Recht (9.3); ohne ein einziges Recht keine Leiste. Die Spielerzahl steht seit 5s
  // in den Einstellungen (Seite „Tisch“). Die Leiste reicht bis an den Filzrand; rechts daran hängt eine Lasche im Spalt
  // neben dem Filz (dort liegen nie Karten), mit der man sie ein- und ausfährt.
  import { timing } from './animator.svelte';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { at, maxW, tab, scale }: { at: { x: number; y: number }; maxW: number; tab: number; scale: number } = $props();

  const draw = $derived(session.can({ type: 'gm.expedition' }) || session.can({ type: 'gm.oracle' }));
  const any = $derived(draw || session.can({ type: 'table.reset' }));
  let open = $state(localStorage.getItem(OPEN_KEY) !== '0');
  function flip() {
    open = !open;
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  }

  /** natürliche Größe der Knöpfe (offsetWidth sieht keine Transformation), ändert sich mit den Rechten; während des
   *  Ein- und Ausfahrens und eingefahren bleibt die letzte (vor der ersten Messung etwa die volle Höhe) */
  let w = $state(0);
  let h = $state(0);
  let moving = $state(false);
  let size = $state({ w: 0, h: 42 });
  $effect(() => {
    if (!moving && w > 0 && h > 0) size = { w, h };
  });
  /** Maßstab der Leiste im Tisch: 1 / Tischmaßstab, höchstens so groß, dass sie in maxW (TP) passt */
  const f = $derived(size.w > 0 ? Math.min(1 / scale, maxW / size.w) : 1 / scale);

  /** Ein- und Ausfahren: die Knöpfe schieben sich in die Lasche und wieder heraus, mit --shift; ohne Effekte springt es */
  function slide(_: Element) {
    const full = size.w;
    return { duration: timing().shift, css: (k: number) => `max-width: ${k * full}px; opacity: ${k}` };
  }
</script>

{#if any}
  <!-- rechte untere Ecke am Filzrand plus Lasche; die Naht zwischen Knöpfen und Lasche liegt auf dem Filzrand -->
  <div class="ctl control" class:closed={!open} style:left="{at.x + tab}px" style:top="{at.y}px" style:--f={f}>
    {#if open}
      <div class="rows" id="gm-bar" role="group" aria-label={t('gm.bar')} bind:offsetWidth={w} bind:offsetHeight={h}
        transition:slide onintrostart={() => (moving = true)} onintroend={() => (moving = false)} onoutrostart={() => (moving = true)} onoutroend={() => (moving = false)}>
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
        {#if session.can({ type: 'table.reset' })}
          <div class="group">
            <button class="menu-item" onclick={() => (view.confirmReset = true)}>{t('gm.reset')}</button>
          </div>
        {/if}
      </div>
    {/if}
    <!-- Lasche: im Tisch genau `tab` TP breit (in der Leiste also tab / f), so hoch wie die Knöpfe samt Innenrand -->
    <button
      class="toggle"
      aria-expanded={open}
      aria-controls={open ? 'gm-bar' : null}
      aria-label={t(open ? 'gm.barCollapse' : 'gm.barExpand')}
      title={t(open ? 'gm.barCollapse' : 'gm.barExpand')}
      style:width="{tab / f - 1}px"
      style:height="{size.h + 6}px"
      onclick={flip}
    ></button>
  </div>
{/if}

<style>
  /* über dem Licht (z 450000, 11.9): Bedienung, kein Gegenstand auf dem Tisch; eine darüber gezogene Karte liegt kurz darunter.
     Rechte untere Ecke am Anker, von dort mit --f skaliert */
  .ctl { position: absolute; z-index: 460000; display: flex; box-sizing: border-box; transform: translate(-100%, -100%) scale(var(--f)); transform-origin: 100% 100%;
    padding: 3px; background: var(--menu-bar-bg); border: 1px solid var(--menu-rim); border-radius: var(--menu-radius); box-shadow: var(--menu-bar-shadow);
    color: var(--ink); font-size: 14px; white-space: nowrap; transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease); }
  /* Linie links an jeder Gruppe; an der ersten liegt sie einen Punkt außerhalb und wird abgeschnitten */
  .rows { display: flex; overflow: hidden; }
  .group { display: flex; gap: 4px; align-items: center; padding: 3px 6px; margin-left: -1px; border-left: 1px solid var(--menu-rule); }
  button.menu-item { width: auto; min-height: 36px; padding: 5px 12px; }
  /* Lasche: reicht über den Innenrand bis an den Rand der Leiste, feine Naht zu den Knöpfen; Winkel wie bei den
     aufklappenden Einträgen der Menüs (.menu-item.expands), ausgefahren nach rechts, eingefahren nach links */
  .toggle { position: relative; flex: none; box-sizing: border-box; margin: -3px -3px -3px 0; padding: 0; background: transparent; border: none;
    border-left: 1px solid var(--menu-rule); border-radius: 0 calc(var(--menu-radius) - 1px) calc(var(--menu-radius) - 1px) 0; cursor: pointer; transition: background-color 80ms; }
  .closed .toggle { margin-left: -3px; border-left: none; border-radius: calc(var(--menu-radius) - 1px); }
  .toggle:hover { background: var(--menu-item-hover); }
  .toggle:focus { outline: none; }
  .toggle:focus-visible { outline: 2px solid var(--menu-focus); outline-offset: -2px; }
  .toggle::after { content: ''; position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -4px 0 0 -5px; border: solid var(--menu-count); border-width: 0 1.5px 1.5px 0;
    rotate: -45deg; transition: rotate var(--pop) ease-out, margin-left var(--pop) ease-out; }
  .closed .toggle::after { margin-left: -2px; rotate: 135deg; }
</style>
