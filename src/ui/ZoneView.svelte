<script lang="ts">
  // Eine Zone: Rahmen, Beschriftung mit Anzahl, Kanten. Ein Klick auf einen Stapel öffnet sein Menü (StackMenu.svelte,
  // seit 5o außerhalb des skalierten Tisches). Lage der Beschriftung aus layouts.yaml (ZoneBox.label).
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { countChanged, events, popCount } from './animator.svelte';
  import { LABEL, SMALL_LABEL, stackEdges, type LampBox, type ZoneBox } from './layout';
  import { shadowCss, shadowOver } from './light';
  import { session } from './session.svelte';
  import { STACK_ACTIONS } from './stackMenu';
  import { t, tMaybe } from './texts';

  let { zone, count, card, hot, mark, flame = null, onToggle }: {
    zone: ZoneBox; count: number; hot: boolean;
    /** Flamme der Laterne für die Schatten der Kanten (11.9); null: Laterne aus, Schatten nach unten */
    flame?: LampBox['flame'] | null;
    /** Kartengröße bei Maßstab 1 (für die Kanten eines Stapels) */
    card: { w: number; h: number };
    /** Farbe, wenn jemand anderes das Menü dieses Stapels offen hat (8.3) */
    mark: string | undefined;
    onToggle: () => void;
  } = $props();

  // Knopf nur, wenn man an diesem Stapel mindestens eine Aktion darf (9.3; Zuschauer: kein Knopf)
  const actions = $derived(STACK_ACTIONS.filter((a) => content.zones[zone.template]?.actions?.[a] !== undefined && session.can({ type: `zone.${a}`, zone: zone.id })));
  const onSheet = $derived(zone.owner !== null);
  const label = $derived(t(`zones.${zone.template}`));
  const title = $derived(tMaybe(`zones.${zone.template}Title`));
  // Stapel (ohne `fanned` in zones.yaml, wie beim Greifen): versetzte Kanten unter der obersten Karte zeigen die Dicke
  const edges = $derived(Array.from({ length: zone.fanned ? 0 : stackEdges(count) }, (_, i) => i + 1).reverse());
  /** Versatz je Kante: 2 px mal Maßstab; in verkleinerten Zonen etwas mehr, sonst sieht man die Kante dort kaum */
  const step = $derived(zone.scale < 1 ? 2.5 : 2 * zone.scale);
  // Zahl springt, wenn Ereignisse sie ändern (nicht beim Laden und Zurücksetzen, 11.6)
  let n = $state<HTMLSpanElement>();
  $effect(() => {
    void events.seen;
    untrack(() => {
      if (n && countChanged(zone.id)) popCount(n);
    });
  });
  /** Schatten der Kanten von der Flamme weg (11.9); die Kanten liegen in Tischkoordinaten, ohne Drehung und Maßstab.
   *  Kante k (k-ter Versatz) in Höhe 1 + k, wie in der Musterseite: so fällt der Stapel weich statt mit hartem Rand */
  const edgeShadow = (k: number) => shadowCss(shadowOver(flame, { x: zone.x, y: zone.y, w: card.w * zone.scale, h: card.h * zone.scale }, 1 + k));
  const fan = $derived(!onSheet && actions.length === 0 && !!(zone.fanX || zone.fanY));
  /** Schrift aus layout.ts (dort rechnet die SL-Leiste mit); unter einem Stapel rückt die Beschriftung mit den Kanten
   *  nach unten, damit sie nicht angeschnitten wird (5v, 10.8). Bogenzonen tragen sie innen, ihr Maß steht im CSS. */
  const labelStyle = $derived.by(() => {
    const parts = zone.label.x === null ? [] : [`left:${zone.label.x * 100}%`];
    if (onSheet) return parts.join(';') || undefined;
    const f = fan ? SMALL_LABEL : LABEL;
    parts.push(`font-size:${f.size}px`, `line-height:${f.line}px`, `margin-top:${LABEL.gap + (edges.length ? edges.length * step : 0)}px`);
    return parts.join(';');
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="zone"
  class:sheet={onSheet}
  class:fan
  class:hot
  class:marked={!!mark}
  style:--mark={mark}
  class:center={zone.label.center}
  class:rotated={zone.label.rotated}
  style:left="{zone.x}px"
  style:top="{zone.y}px"
  style:width="{zone.w}px"
  style:height="{zone.h}px"
  {title}
  role={actions.length ? 'button' : undefined}
  tabindex={actions.length ? 0 : undefined}
  data-zone={zone.id}
  onclick={() => { if (actions.length) onToggle(); }}
>
  {#if label}
    <div class="label" style={labelStyle}>{label}{#if !onSheet}<span class="n" bind:this={n}>{count}</span>{/if}</div>
  {/if}
  {#each edges as k (k)}
    <div class="edge" style:width="{card.w * zone.scale}px" style:height="{card.h * zone.scale}px" style:translate="{k * step}px {k * step}px" style:filter="brightness({1 - k * 0.07})" style:box-shadow={edgeShadow(k)}></div>
  {/each}
</div>

<style>
  .zone { position: absolute; border: 2px dashed var(--line); border-radius: var(--radius-m); box-sizing: border-box; background: var(--zone-bg); transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease), width var(--shift) var(--shift-ease), height var(--shift) var(--shift-ease); }
  /* Stapel auf dem Filz: feiner Rahmen in der Druckfarbe; aufgefächerte Zonen gestrichelt und blasser */
  .zone:not(.sheet) { border: 1px solid color-mix(in srgb, var(--felt-print) 38%, transparent); background: rgba(0, 0, 0, 0.06); }
  .zone.fan { border-style: dashed; border-color: color-mix(in srgb, var(--felt-print) 28%, transparent); background: rgba(0, 0, 0, 0.025); }
  .zone.hot { border-color: var(--pickable-bright); background: color-mix(in srgb, var(--pickable-bright) 10%, transparent); }
  /* angewählt von jemand anderem: Rahmen in dessen Farbe außen um den Stapel (die Karten decken die Zone ab), ohne Vergrößerung */
  .zone.marked { outline: 3px solid var(--mark); outline-offset: 5px; }
  /* Kanten eines Stapels: Kartengröße, ab der Ecke der Zone (innerhalb des Rahmens), nach rechts unten versetzt;
     wachsen beim Öffnen mit der Zone und den Karten (--shift), statt vorauszuspringen */
  .edge { position: absolute; left: -2px; top: -2px; box-sizing: border-box; border-radius: var(--radius-card); background: var(--stack-edge); border: 1px solid var(--stack-edge-line); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); pointer-events: none; transition: width var(--shift) var(--shift-ease), height var(--shift) var(--shift-ease), translate var(--shift) var(--shift-ease); }
  .label { position: absolute; left: 0; top: 100%; font-weight: 700; letter-spacing: 0.03em; white-space: nowrap; color: var(--label-ink); background: var(--label-bg); padding: 2px 8px; border-radius: var(--radius-s); text-shadow: 0 1px 2px #000; pointer-events: none; transition: margin-top var(--shift) var(--shift-ease); }
  .center .label { left: 50%; transform: translateX(-50%); }
  .zone:not(.sheet) .label { color: var(--felt-print); background: none; font-weight: 600; letter-spacing: 0.06em; }
  .zone:not(.sheet) .edge { left: -1px; top: -1px; }
  .fan .label { font-weight: 600; opacity: 0.7; background: none; padding: 2px 0; }
  .n { display: inline-block; line-height: normal; margin-left: 7px; padding: 0 6px; border-radius: var(--radius-pill); background: var(--label-count-bg); font-size: 12px; font-weight: 600; }
  /* Bogenzonen: dezent, Beschriftung innen */
  .zone.sheet { border-color: var(--sheet-zone-rim); }
  .zone.sheet .label { top: 50%; left: 50%; margin: 0; transform: translate(-50%, -50%); font-size: 9px; font-weight: 500; letter-spacing: 0.05em; color: var(--sheet-label); background: none; padding: 0; text-shadow: none; opacity: 0.6; }
  .zone.sheet.rotated .label { transform: translate(-50%, -50%) rotate(-90deg); }
</style>
