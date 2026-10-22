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
  // in den Einstellungen (Seite „Tisch“). Einfahren über einen Knopf im Spalt rechts neben dem Filz, wo nie Karten liegen.
  import { timing } from './animator.svelte';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { at, maxW, toggle, scale }: { at: { x: number; y: number }; maxW: number; toggle: { x: number; d: number }; scale: number } = $props();

  const draw = $derived(session.can({ type: 'gm.expedition' }) || session.can({ type: 'gm.oracle' }));
  const any = $derived(draw || session.can({ type: 'table.reset' }));
  let open = $state(localStorage.getItem(OPEN_KEY) !== '0');
  function flip() {
    open = !open;
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  }

  /** natürliche Größe (offsetWidth sieht keine Transformation), ändert sich mit den Rechten; eingefahren bleibt die
   *  letzte, damit der Knopf an seiner Stelle bleibt (vor der ersten Messung etwa die volle Höhe) */
  let w = $state(0);
  let h = $state(0);
  let size = $state({ w: 0, h: 50 });
  $effect(() => {
    if (w > 0 && h > 0) size = { w, h };
  });
  /** Maßstab der Leiste im Tisch: 1 / Tischmaßstab, höchstens so groß, dass sie in maxW (TP) passt */
  const f = $derived(size.w > 0 ? Math.min(1 / scale, maxW / size.w) : 1 / scale);
  /** Knopf: auf dem Bildschirm höchstens BUTTON px, im Tisch höchstens der Spalt; senkrecht mittig zur Leiste */
  const BUTTON = 28;
  const g = $derived(Math.min(1 / scale, toggle.d / BUTTON));
  const midY = $derived(at.y - (size.h * f) / 2);

  /** Ein- und Ausfahren: von rechts, also vom Knopf her, auf- und zugedeckt, mit --shift; ohne Effekte springt es */
  function slide(_: Element) {
    return { duration: timing().shift, css: (k: number) => `opacity: ${k}; clip-path: inset(0 0 0 ${(1 - k) * 100}%)` };
  }
</script>

{#if any}
  {#if open}
    <div class="ctl control" id="gm-bar" role="group" aria-label={t('gm.bar')} bind:offsetWidth={w} bind:offsetHeight={h} style:left="{at.x}px" style:top="{at.y}px" style:--f={f} transition:slide>
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
        {#if session.can({ type: 'table.reset' })}
          <div class="group">
            <button class="menu-item" onclick={() => (view.confirmReset = true)}>{t('gm.reset')}</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  <button
    class="toggle control"
    class:closed={!open}
    aria-expanded={open}
    aria-controls={open ? 'gm-bar' : null}
    aria-label={t(open ? 'gm.barCollapse' : 'gm.barExpand')}
    title={t(open ? 'gm.barCollapse' : 'gm.barExpand')}
    style:left="{toggle.x}px"
    style:top="{midY}px"
    style:--g={g}
    onclick={flip}
  ></button>
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
  /* Knopf im Spalt rechts neben dem Filz, Mitte am Punkt, mit --g skaliert; Pfeil mit CSS gezeichnet:
     ausgefahren nach rechts (die Leiste fährt in den Knopf), eingefahren nach links (sie kommt heraus) */
  .toggle { position: absolute; z-index: 460000; width: 28px; height: 28px; padding: 0; box-sizing: border-box; border-radius: 50%;
    transform: translate(-50%, -50%) scale(var(--g)); background: var(--menu-bar-bg); border: 1px solid var(--menu-rim); box-shadow: var(--menu-bar-shadow);
    cursor: pointer; transition: background 0.2s, top var(--shift) var(--shift-ease), left var(--shift) var(--shift-ease); }
  .toggle:hover { background: var(--menu-bg); }
  .toggle:focus { outline: none; }
  .toggle:focus-visible { outline: 2px solid var(--menu-focus); outline-offset: 1px; }
  .toggle::after { content: ''; position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; margin: -4px 0 0 -6px; border: solid var(--ink); border-width: 1.5px 1.5px 0 0; rotate: 45deg; }
  .toggle.closed::after { margin-left: -2px; rotate: -135deg; }
</style>
