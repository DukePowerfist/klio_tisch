<script lang="ts">
  // Expeditionsblatt in Ruhe (Schritt 5zb, ARCHITEKTUR.md 10.12): ragt vom unteren Bildschirmrand herein, über der
  // unteren Brettkante; vom Bild liegt nur der gemalte Kopf auf dem Tisch, gesetzter Text steht erst in der Leselage
  // (ExpeditionReader.svelte, U4). Ein Knopf für alle; über den Zonen, unter frei liegenden Karten und dem Licht (U3).
  // Beim Überfahren rückt es hoch und hebt sich ab; nach einem Wurf rückt es bei allen einmal kurz hoch, nicht während
  // eines eigenen Kartenzugs (U1).
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { timing } from './animator.svelte';
  import type { Layout } from './layout';
  import { shadowCss, shadowOver, HEIGHT } from './light';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { layout, flame, dragging }: { layout: Layout; flame: Layout['lamp']['flame'] | null; dragging: boolean } = $props();

  const E = content.layouts.middle.expedition;
  const image = `${import.meta.env.BASE_URL}assets/sheet/expedition.webp`;
  const paper = $derived(layout.expedition.paper);
  const img = $derived(layout.expedition.img);
  /** Klickfläche: nur der Teil des Papiers über der Brettkante. Reichte der Knopf darunter weiter, scrollte der Browser
   *  den Tisch beim Fokussieren nach oben, um ihn ganz zu zeigen. */
  const hit = $derived({ ...paper, h: Math.max(0, layout.board.h - paper.y) });
  /** Schatten angehoben (Überfahren), von der Flamme weg wie bei Karten */
  const lifted = $derived(shadowCss(shadowOver(flame, { ...paper, y: paper.y - E.lift }, HEIGHT.lifted)));

  let nudgeEl: HTMLDivElement;
  // Hochrücken nach einem Wurf (nicht beim Öffnen: nur neue Würfe nach dem ersten Zeichnen)
  let seen = untrack(() => view.gmRoll);
  $effect(() => {
    const r = view.gmRoll;
    if (r === seen) return;
    seen = r;
    if (r?.kind !== 'expedition' || dragging || view.expeditionOpen) return;
    const ms = timing().nudge;
    if (ms > 0) nudgeEl.animate([{ translate: '0 0' }, { translate: `0 ${-E.lift}px`, offset: 0.4 }, { translate: '0 0' }], { duration: ms, easing: 'ease-in-out' });
  });
</script>

<!-- Klickfläche nur das Papier über der Brettkante; das Bild ragt darüber hinaus (durchsichtige Ränder, Büroklammer,
     der Teil unter der Kante), ohne Klicks -->
<button
  class="expedition control"
  class:dragging
  style:left="{paper.x}px"
  style:top="{paper.y}px"
  style:width="{hit.w}px"
  style:height="{hit.h}px"
  style:rotate="{E.tilt}deg"
  style:--lift="{-E.lift}px"
  style:--lift-shadow={lifted}
  aria-label={t('gm.expeditionOpen')}
  title={t('gm.expeditionOpen')}
  data-expedition-sheet
  data-toast-avoid
  onclick={() => view.openExpedition()}
>
  <div class="lift" style:height="{paper.h}px">
    <div class="nudge" bind:this={nudgeEl}>
      <img src={image} alt="" draggable="false" data-expedition-paper
        style:left="{img.x - paper.x}px" style:top="{img.y - paper.y}px" style:width="{img.w}px" style:height="{img.h}px" />
    </div>
  </div>
</button>

<style>
  /* über den Zonen (wie die Laterne), unter frei liegenden Karten (U3) und dem Licht */
  .expedition { position: absolute; z-index: 6; padding: 0; border: 0; background: none; cursor: pointer; transform-origin: 50% 0; }
  .expedition:focus:not(:focus-visible) { outline: none; }
  .lift, .nudge { position: absolute; left: 0; top: 0; width: 100%; }
  .nudge { height: 100%; }
  .lift { transition: translate var(--hover) ease-out, box-shadow var(--hover) ease-out; }
  img { position: absolute; max-width: none; pointer-events: none; user-select: none; }
  @media (hover: hover) {
    .expedition:not(.dragging):hover .lift { translate: 0 var(--lift); box-shadow: var(--lift-shadow); }
  }
</style>
