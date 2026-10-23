<script lang="ts">
  // Stapelmenü (ARCHITEKTUR.md 10.2, Schritt 5o): an jedem Stapel gleich, direkt am Stapel, außerhalb des skalierten
  // Tisches (gleich große Schrift bei jedem Zoom). Einträge und Lage rechnet stackMenu.ts, die Geometrie liefert
  // Board.svelte beim Öffnen (view.stackMenu); verschiebt sich der Stapel, schließt Board.svelte das Menü (N4).
  import content from 'virtual:klio-content';
  import type { CardId } from '../engine/types';
  import { locate } from '../engine/zones';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { placeMenu, stackEntries, type StackEntry } from './stackMenu';
  import { t } from './texts';
  import { view } from './view.svelte';

  /** Geometrie beim Öffnen; jedes Öffnen bringt ein neues Menü ({#key} in App.svelte) */
  const at = view.stackMenu!;
  const zone = at.zone;
  const label = t(`zones.${zone}`);

  const count = $derived(session.state?.zones[zone]?.length ?? 0);
  const entries = $derived(
    session.state
      ? stackEntries({ content, table: session.state, zone, can: (type) => session.can({ type, zone }), predict: (cmd) => session.predict(cmd) })
      : [],
  );

  let root = $state<HTMLElement>();
  /** eigene Größe, einmal gemessen: Breite fest, Höhe ändert sich nicht (D5) */
  let size = $state<{ w: number; h: number } | null>(null);
  $effect(() => {
    if (root && !size) size = { w: root.offsetWidth, h: root.offsetHeight };
  });
  const place = $derived(size && placeMenu(at.anchor, at.avoid, at.area, size, at.sides));

  const close = () => view.closeStack();
  // ohne ein einziges Recht (z. B. entzogen) gibt es nichts zu zeigen
  $effect(() => {
    if (!entries.some((e) => e.allowed)) close();
  });

  function run(e: StackEntry) {
    if (!e.enabled) return;
    void submitOrSay({ type: `zone.${e.action}`, zone });
  }

  // Klick daneben schließt sofort (F3); der Stapel selbst und seine Karten schalten über Board.svelte
  function outside(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (root?.contains(target) || target.closest(`[data-zone="${zone}"]`)) return;
    const card = target.closest<HTMLElement>('[data-card]')?.dataset.card as CardId | undefined;
    const where = card && session.state ? locate(session.state, card) : null;
    if (where && 'zone' in where && where.zone === zone) return;
    close();
  }
  // Esc schließt nur das Menü, nicht auch die Rollenansicht (Dock). Kürzel Z, U, M (F2, N5): groß wie klein, nicht in
  // Textfeldern, nicht mit Strg, Alt oder Meta, nicht bei offenem Fenster; nur behandelte Tasten werden abgefangen.
  // Eine gehaltene Taste wiederholt nichts.
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      close();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const entry = entries.find((x) => x.key === e.key.toLowerCase());
    if (!entry) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) run(entry);
  }
</script>

<svelte:window onpointerdown={outside} onkeydowncapture={onKey} />

<div
  class="menu-panel control"
  role="menu"
  aria-label={label}
  data-stack-menu={zone}
  bind:this={root}
  style:left="{place?.x ?? 0}px"
  style:top="{place?.y ?? 0}px"
  data-side={place?.side}
  style:--tip={place?.tip != null ? `${place.tip}px` : null}
  style:visibility={place ? null : 'hidden'}
>
  {#if place && place.tip !== null}<div class="menu-tip" data-side={place.side}></div>{/if}
  <div class="menu-head"><span>{label}</span><span class="count">{count}</span></div>
  {#each entries as e, i (e.action)}
    {#if i === 1}<hr class="menu-rule" />{/if}
    <button role="menuitem" class="menu-item" class:menu-main={e.action === 'draw'} aria-disabled={e.enabled ? null : 'true'} title={e.title} onclick={() => run(e)}>{e.label}</button>
  {/each}
</div>
