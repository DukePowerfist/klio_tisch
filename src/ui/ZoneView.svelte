<script lang="ts">
  // Eine Zone: Rahmen, Beschriftung mit Anzahl, bei Stapeln das Menü Mischen/Umdrehen/Ziehen.
  import content from 'virtual:klio-content';
  import type { ZoneBox } from './layout';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { zone, count, open, hot, onToggle, onAction }: {
    zone: ZoneBox; count: number; open: boolean; hot: boolean; onToggle: () => void; onAction: (a: 'shuffle' | 'flip' | 'draw') => void;
  } = $props();

  const cfg = $derived(content.zones[zone.template]);
  const hasMenu = $derived(!!cfg?.actions);
  const onSheet = $derived(zone.owner !== null);
  const label = $derived(t(`zones.${zone.template}`));
  const isDiamond = $derived(zone.template.startsWith('diamonds_'));
  const isClubs = $derived(zone.template === 'clubs');
  // Menülage wie bisher: Karo an fester Stelle, Deck links, Kreuz unten bzw. rechts (Rollenansicht), sonst unten
  const menuStyle = $derived.by(() => {
    if (isDiamond) return `left:${content.layouts[view.role ? 'role' : 'overview'].menu[0] - zone.x}px;top:${content.layouts[view.role ? 'role' : 'overview'].menu[1] - zone.y}px`;
    if (zone.template === 'deck') return 'right:calc(100% + 8px);top:0';
    if (isClubs && view.role) return 'left:calc(100% + 8px);top:0';
    return 'left:50%;top:calc(100% + 32px);transform:translateX(-50%)';
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="zone"
  class:sheet={onSheet}
  class:fan={!onSheet && !hasMenu && (zone.fanX || zone.fanY)}
  class:hot
  class:collect={zone.template === 'collect'}
  class:damage={zone.template === 'damage'}
  class:under={isDiamond || isClubs}
  style:left="{zone.x}px"
  style:top="{zone.y}px"
  style:width="{zone.w}px"
  style:height="{zone.h}px"
  title={zone.template === 'collect' ? t('zones.collectTitle') : undefined}
  role={hasMenu ? 'button' : undefined}
  tabindex={hasMenu ? 0 : undefined}
  onclick={(e) => { if (hasMenu && !(e.target as HTMLElement).closest('.menu')) onToggle(); }}
>
  {#if label}
    <div class="label">{label}{#if !onSheet}<span class="n">{count}</span>{/if}</div>
  {/if}
  {#if hasMenu && open}
    <div class="menu control" style={menuStyle}>
      <button onclick={() => onAction('shuffle')}>{t('zones.actions.shuffle')}</button>
      <button onclick={() => onAction('flip')}>{t('zones.actions.flip')}</button>
      <button onclick={() => onAction('draw')}>{t('zones.actions.draw')}</button>
    </div>
  {/if}
</div>

<style>
  .zone { position: absolute; border: 2px dashed var(--line); border-radius: 8px; box-sizing: border-box; background: rgba(255, 255, 255, 0.04); transition: left 0.35s, top 0.35s, width 0.35s, height 0.35s; }
  .zone.hot { border-color: #f5d76e; background: rgba(245, 215, 110, 0.1); }
  .zone.fan { border-color: rgba(255, 255, 255, 0.2); background: none; }
  .label { position: absolute; left: 0; top: 100%; margin-top: 4px; font-size: 15px; font-weight: 700; letter-spacing: 0.03em; white-space: nowrap; color: #fff; background: rgba(0, 0, 0, 0.45); padding: 2px 8px; border-radius: 6px; text-shadow: 0 1px 2px #000; pointer-events: none; }
  .under .label { left: 50%; transform: translateX(-50%); }
  .fan .label { font-size: 12px; font-weight: 600; opacity: 0.7; background: none; padding: 2px 0; }
  .n { margin-left: 7px; padding: 0 6px; border-radius: 9px; background: rgba(255, 255, 255, 0.22); font-size: 12px; font-weight: 600; }
  /* Bogenzonen: dezent, Beschriftung innen */
  .zone.sheet { border-color: rgba(0, 0, 0, 0.35); background: rgba(255, 255, 255, 0.04); }
  .zone.sheet .label { top: 50%; left: 50%; margin: 0; transform: translate(-50%, -50%); font-size: 9px; font-weight: 500; letter-spacing: 0.05em; color: #333; background: none; padding: 0; text-shadow: none; opacity: 0.6; }
  .zone.collect .label { transform: translate(-50%, -50%) rotate(-90deg); }
  .zone.damage .label { left: 22%; transform: translate(-50%, -50%) rotate(-90deg); }
  .menu { position: absolute; display: flex; flex-direction: column; gap: 5px; z-index: 500000; }
  .menu button { font: inherit; font-size: 15px; padding: 8px 14px; min-width: 104px; border-radius: 7px; background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); cursor: pointer; }
  .menu button:hover { background: var(--button-hover); }
</style>
