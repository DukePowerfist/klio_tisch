<script lang="ts">
  // Eine Zone: Rahmen, Beschriftung mit Anzahl, bei Stapeln das Menü aus den Aktionen in zones.yaml.
  // Lage von Menü und Beschriftung kommt aus layouts.yaml (ZoneBox.menu, ZoneBox.label).
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { countChanged, events, popCount } from './animator.svelte';
  import { stackEdges, type LampBox, type ZoneBox } from './layout';
  import { shadowAt, shadowCss } from './light';
  import { session } from './session.svelte';
  import { t, tMaybe } from './texts';

  let { zone, count, card, open, hot, mark, fixedMenu, flame = null, onToggle, onAction }: {
    zone: ZoneBox; count: number; open: boolean; hot: boolean;
    /** Flamme der Laterne für die Schatten der Kanten (11.9); null: der bisherige Schatten */
    flame?: LampBox['flame'] | null;
    /** Kartengröße bei Maßstab 1 (für die Kanten eines Stapels) */
    card: { w: number; h: number };
    /** Farbe, wenn jemand anderes das Menü dieses Stapels offen hat (8.3) */
    mark: string | undefined;
    fixedMenu: { x: number; y: number };
    onToggle: () => void; onAction: (a: MenuAction) => void;
  } = $props();

  type MenuAction = 'shuffle' | 'flip' | 'draw';
  /** Reihenfolge im Menü wie bisher; angezeigt wird, was die Zone kann */
  const MENU: MenuAction[] = ['shuffle', 'flip', 'draw'];

  // nur Aktionen, die die Zone kann und die man darf (9.3)
  const actions = $derived(MENU.filter((a) => content.zones[zone.template]?.actions?.[a] !== undefined && session.can({ type: `zone.${a}`, zone: zone.id })));
  const onSheet = $derived(zone.owner !== null);
  const label = $derived(t(`zones.${zone.template}`));
  const title = $derived(tMaybe(`zones.${zone.template}Title`));
  const menuStyle = $derived(
    {
      fixed: `left:${fixedMenu.x - zone.x}px;top:${fixedMenu.y - zone.y}px`,
      left: 'right:calc(100% + 8px);top:0',
      right: 'left:calc(100% + 8px);top:0',
      below: 'left:50%;top:calc(100% + 32px);transform:translateX(-50%)',
    }[zone.menu],
  );
  // Stapel (ohne `fanned` in zones.yaml, wie beim Greifen): versetzte Kanten unter der obersten Karte zeigen die Dicke
  const edges = $derived(Array.from({ length: content.zones[zone.template]?.fanned ? 0 : stackEdges(count) }, (_, i) => i + 1).reverse());
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
  const edgeShadow = (k: number) => (flame ? shadowCss(shadowAt(flame, zone.x + (card.w * zone.scale) / 2, zone.y + (card.h * zone.scale) / 2, 1 + k)) : undefined);
  const labelStyle = $derived(zone.label.x === null ? undefined : `left:${zone.label.x * 100}%`);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="zone"
  class:sheet={onSheet}
  class:fan={!onSheet && actions.length === 0 && (zone.fanX || zone.fanY)}
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
  onclick={(e) => { if (actions.length && !(e.target as HTMLElement).closest('.menu')) onToggle(); }}
>
  {#if label}
    <div class="label" style={labelStyle}>{label}{#if !onSheet}<span class="n" bind:this={n}>{count}</span>{/if}</div>
  {/if}
  {#if open && actions.length}
    <div class="menu control" style={menuStyle}>
      {#each actions as a (a)}
        <button onclick={() => onAction(a)}>{t(`zones.actions.${a}`)}</button>
      {/each}
    </div>
  {/if}
  {#each edges as k (k)}
    <div class="edge" style:width="{card.w * zone.scale}px" style:height="{card.h * zone.scale}px" style:translate="{k * step}px {k * step}px" style:filter="brightness({1 - k * 0.07})" style:box-shadow={edgeShadow(k)}></div>
  {/each}
</div>

<style>
  .zone { position: absolute; border: 2px dashed var(--line); border-radius: 8px; box-sizing: border-box; background: rgba(255, 255, 255, 0.04); transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease), width var(--shift) var(--shift-ease), height var(--shift) var(--shift-ease); }
  .zone.hot { border-color: #f5d76e; background: rgba(245, 215, 110, 0.1); }
  /* angewählt von jemand anderem: Rahmen in dessen Farbe außen um den Stapel (die Karten decken die Zone ab), ohne Vergrößerung */
  .zone.marked { outline: 3px solid var(--mark); outline-offset: 5px; }
  .zone.fan { border-color: rgba(255, 255, 255, 0.2); background: none; }
  /* Kanten eines Stapels: Kartengröße, ab der Ecke der Zone (innerhalb des Rahmens), nach rechts unten versetzt;
     wachsen beim Öffnen mit der Zone und den Karten (--shift), statt vorauszuspringen */
  .edge { position: absolute; left: -2px; top: -2px; box-sizing: border-box; border-radius: 7px; background: var(--stack-edge); border: 1px solid var(--stack-edge-line); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); pointer-events: none; transition: width var(--shift) var(--shift-ease), height var(--shift) var(--shift-ease), translate var(--shift) var(--shift-ease); }
  .label { position: absolute; left: 0; top: 100%; margin-top: 4px; font-size: 15px; font-weight: 700; letter-spacing: 0.03em; white-space: nowrap; color: #fff; background: rgba(0, 0, 0, 0.45); padding: 2px 8px; border-radius: 6px; text-shadow: 0 1px 2px #000; pointer-events: none; }
  .center .label { left: 50%; transform: translateX(-50%); }
  .fan .label { font-size: 12px; font-weight: 600; opacity: 0.7; background: none; padding: 2px 0; }
  .n { display: inline-block; margin-left: 7px; padding: 0 6px; border-radius: 9px; background: rgba(255, 255, 255, 0.22); font-size: 12px; font-weight: 600; }
  /* Bogenzonen: dezent, Beschriftung innen */
  .zone.sheet { border-color: rgba(0, 0, 0, 0.35); }
  .zone.sheet .label { top: 50%; left: 50%; margin: 0; transform: translate(-50%, -50%); font-size: 9px; font-weight: 500; letter-spacing: 0.05em; color: #333; background: none; padding: 0; text-shadow: none; opacity: 0.6; }
  .zone.sheet.rotated .label { transform: translate(-50%, -50%) rotate(-90deg); }
  .menu { position: absolute; display: flex; flex-direction: column; gap: 5px; z-index: 500000; animation: pop-in var(--pop) var(--spring-soft); }
  .menu button { font: inherit; font-size: 15px; padding: 8px 14px; min-width: 104px; border-radius: 7px; background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); cursor: pointer; }
  .menu button:hover { background: var(--button-hover); }
</style>
