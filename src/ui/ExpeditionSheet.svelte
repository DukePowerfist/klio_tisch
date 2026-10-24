<script lang="ts">
  // Expeditionsblatt in Ruhe (Schritt 5zb, ARCHITEKTUR.md 10.12): ragt vom unteren Bildschirmrand herein, über der
  // unteren Brettkante; vom Bild liegt nur der gemalte Kopf auf dem Tisch, gesetzter Text steht erst in der Leselage
  // (ExpeditionReader.svelte, U4). Ein Knopf für alle; über den Zonen, unter frei liegenden Karten und dem Licht (U3).
  // Beim Überfahren rückt es hoch und hebt sich ab; nach einem Wurf rückt es bei allen einmal kurz hoch, nicht während
  // eines eigenen Kartenzugs (U1). Hochziehen öffnet die Leselage wie ein Klick (Teil 2b, T4): Das Blatt folgt dem Zeiger
  // nach oben; losgelassen ab einem Viertel der Fensterhöhe öffnet es, sonst gleitet es zurück.
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { timing } from './animator.svelte';
  import type { Layout } from './layout';
  import { shadowCss, shadowOver, HEIGHT } from './light';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { layout, flame, dragging, scale }: { layout: Layout; flame: Layout['lamp']['flame'] | null; dragging: boolean; scale: number } = $props();

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

  // ---------- Hochziehen (Teil 2b) ----------
  /** ab so viel Bewegung (Bildschirmpunkte) ist es ein Ziehen, sonst ein Klick (wie bei Karten) */
  const SLOP = 4;
  /** Anteil der Fensterhöhe, ab dem losgelassen die Leselage öffnet */
  const OPEN_AT = 0.25;
  let press: { id: number; y: number; moved: boolean } | null = null;
  /** wie weit das Blatt gerade hochgezogen ist (TP, negativ = nach oben) */
  let pull = $state(0);
  let pulling = $state(false);
  /** nach einem Ziehen kein Klick hinterher */
  let swallowClick = false;
  function down(e: PointerEvent) {
    if (e.button > 0) return;
    swallowClick = false;
    press = { id: e.pointerId, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    const dy = e.clientY - press.y;
    if (!press.moved && Math.abs(dy) < SLOP) return;
    press.moved = pulling = true;
    pull = Math.min(0, dy) / scale;
  }
  function up(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    const moved = press.moved;
    press = null;
    pulling = false;
    if (!moved) return;
    swallowClick = true;
    if (-pull * scale >= innerHeight * OPEN_AT) view.openExpedition();
    // zurück in die Ruhelage; offen gleitet die Leselage von der gezeigten Stelle heran (gemessen vor diesem Bild)
    requestAnimationFrame(() => (pull = 0));
  }
  /** abgebrochen (Systemgeste am unteren Rand): zurück in die Ruhelage, ohne zu öffnen und ohne den nächsten Klick zu
   *  verschlucken */
  function cancel(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    pulling = false;
    pull = 0;
  }
  function click() {
    if (swallowClick) return void (swallowClick = false);
    view.openExpedition();
  }
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
  onclick={click}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={cancel}
>
  <div class="pull" class:pulling style:height="{paper.h}px" style:translate="0 {pull}px" data-expedition-pull>
  <div class="lift" style:height="{paper.h}px">
    <div class="nudge" bind:this={nudgeEl}>
      <img src={image} alt="" draggable="false" data-expedition-paper
        style:left="{img.x - paper.x}px" style:top="{img.y - paper.y}px" style:width="{img.w}px" style:height="{img.h}px" />
    </div>
  </div>
  </div>
</button>

<style>
  /* über den Zonen und ihren Karten, knapp unter frei liegenden Karten (FREE_Z 20000, U3) und dem Licht */
  .expedition { position: absolute; z-index: 19990; padding: 0; border: 0; background: none; cursor: pointer; transform-origin: 50% 0; touch-action: none; }
  .expedition:focus:not(:focus-visible) { outline: none; }
  .pull, .lift, .nudge { position: absolute; left: 0; top: 0; width: 100%; }
  .pull { transition: translate var(--sheet-glide) ease-out; }
  .pull.pulling { transition: none; }
  .nudge { height: 100%; }
  .lift { transition: translate var(--hover) ease-out, box-shadow var(--hover) ease-out; }
  img { position: absolute; max-width: none; pointer-events: none; user-select: none; }
  @media (hover: hover) {
    .expedition:not(.dragging):hover .lift { translate: 0 var(--lift); box-shadow: var(--lift-shadow); }
  }
</style>
