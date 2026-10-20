<script lang="ts">
  // Der Tisch: Zoom und Verschieben, Bögen, Zonen, Karten, Ziehen und Ablegen (ARCHITEKTUR.md 10, 14).
  // Zeigt nur den Stand an und schickt Befehle; Meldungen und Animationen kommen aus effects.svelte.ts.
  import content from 'virtual:klio-content';
  import { locate } from '../engine/zones';
  import type { CardId, CardSource, SeatId, ZoneId } from '../engine/types';
  import { sheetOf } from '../rules/klio/events';
  import Card from './Card.svelte';
  import Sheet from './Sheet.svelte';
  import ZoneView from './ZoneView.svelte';
  import { effects } from './effects.svelte';
  import { cardSize, computeLayout, freePosAt, placeCards, zoneAt, type CardPlace } from './layout';
  import { submitOrSay } from './commands';
  import { session, type KlioTableState, type PendingDrop } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { table }: { table: KlioTableState } = $props();

  let stageW = $state(0);
  let stageH = $state(0);

  // Spielerzahl als eigener Wert: die Geometrie ändert sich nur, wenn sie sich ändert, nicht bei jedem Befehl
  const players = $derived(table.settings.players);
  const layout = $derived(computeLayout(content, players, view.role, view.open));
  const places = $derived(placeCards(table, layout));
  const cards = $derived(Object.entries(places) as [CardId, CardPlace][]);
  const BW = $derived(layout.board.w);
  const BH = $derived(layout.board.h);

  // ---------- Zoom und Verschieben (wie bisher: 1–5×, Rand bleibt am Rand) ----------
  const fitScale = $derived(stageW && stageH ? Math.min(stageW / BW, stageH / BH) : 1);
  const sc = $derived(fitScale * view.zoom);
  function offsets(z: number, ox: number, oy: number) {
    const s = fitScale * z;
    let tx = stageW / 2 - (BW / 2 + ox) * s;
    let ty = stageH / 2 - (BH / 2 + oy) * s;
    tx = BW * s <= stageW ? (stageW - BW * s) / 2 : Math.min(0, Math.max(stageW - BW * s, tx));
    ty = BH * s <= stageH ? (stageH - BH * s) / 2 : Math.min(0, Math.max(stageH - BH * s, ty));
    return { tx, ty, ox: (stageW / 2 - tx) / s - BW / 2, oy: (stageH / 2 - ty) / s - BH / 2 };
  }
  const geo = $derived(offsets(view.zoom, view.ox, view.oy));
  $effect(() => document.body.classList.toggle('zoomed', view.zoom >= 1.6));

  function clampView() {
    const o = offsets(view.zoom, view.ox, view.oy);
    view.ox = o.ox;
    view.oy = o.oy;
  }

  /** Bildschirm → Tisch (die Bühne füllt das ganze Fenster, beginnt also bei 0, 0) */
  const toBoard = (clientX: number, clientY: number): [number, number] => [(clientX - geo.tx) / sc, (clientY - geo.ty) / sc];

  function zoomAt(clientX: number, clientY: number, f: number) {
    const nz = Math.max(1, Math.min(5, view.zoom * f));
    if (nz === view.zoom) return;
    const [bx, by] = toBoard(clientX, clientY);
    const s = fitScale * nz;
    view.zoom = nz;
    view.ox = (stageW / 2 - clientX + bx * s) / s - BW / 2;
    view.oy = (stageH / 2 - clientY + by * s) / s - BH / 2;
    clampView();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    view.stopAnimation();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0012)));
  }

  // ---------- Ziehen und Ablegen ----------
  type Drag = PendingDrop & { from: CardSource; sx: number; sy: number; moved: boolean };
  let drag = $state<Drag | null>(null);
  let pan: { x: number; y: number; moved: boolean } | null = null;
  let panned = false;
  const touches = new Map<number, [number, number]>();
  let pinch: { d: number; mx: number; my: number } | null = null;
  let lastClick = { card: null as CardId | null, t: 0 };
  let preview = $state<CardId | null>(null);

  /** Mitte der ersten gezogenen Karte in Tischkoordinaten. */
  function dropPoint(d: PendingDrop): [number, number] | null {
    const p = places[d.cards[0]!];
    if (!p) return null;
    const s = cardSize(layout, p);
    return [p.x + d.dx + s.w / 2, p.y + d.dy + s.h / 2];
  }
  /** Zone unter der gezogenen Karte (hervorgehoben, Ziel beim Loslassen) */
  const hot = $derived.by(() => {
    const c = drag?.moved ? dropPoint(drag) : null;
    return c ? (zoneAt(layout, c[0], c[1])?.id ?? null) : null;
  });

  function onPointerDown(e: PointerEvent) {
    panned = false;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        drag = null;
        pan = null;
        const [a, b] = [...touches.values()] as [[number, number], [number, number]];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
        return;
      }
    }
    if (e.button > 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (el) return grab(el.dataset.card as CardId, e);
    if ((e.target as HTMLElement).closest('input, textarea, button, select, .control')) return;
    pan = { x: e.clientX, y: e.clientY, moved: false };
  }

  function grab(card: CardId, e: PointerEvent) {
    const where = locate(table, card);
    if (!where) return;
    let grabbed: CardId[] = [card];
    let from: CardSource = { free: true };
    if ('zone' in where) {
      const list = table.zones[where.zone]!;
      const zone = layout.zones[where.zone];
      const fanned = !!(zone && (zone.fanX || zone.fanY));
      // Stapel: nur die oberste Karte; mit Umschalt die Karte samt den darüberliegenden
      if (e.shiftKey) grabbed = list.slice(where.index);
      else if (!fanned && where.index !== list.length - 1) return;
      from = { zone: where.zone };
    }
    e.preventDefault();
    preview = null;
    drag = { cards: grabbed, from, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false };
  }

  function onPointerMove(e: PointerEvent) {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()] as [[number, number], [number, number]];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      if (pinch.d > 0) zoomAt(mx, my, d / pinch.d);
      view.ox -= (mx - pinch.mx) / sc;
      view.oy -= (my - pinch.my) / sc;
      clampView();
      pinch = { d, mx, my };
      return;
    }
    if (drag) {
      const dx = (e.clientX - drag.sx) / sc;
      const dy = (e.clientY - drag.sy) / sc;
      if (!drag.moved && Math.hypot(dx, dy) * sc < 4) return;
      drag.moved = true;
      drag.dx = dx;
      drag.dy = dy;
      return;
    }
    if (pan) {
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      pan.moved = panned = true;
      view.stopAnimation();
      view.ox -= dx / sc;
      view.oy -= dy / sc;
      clampView();
      pan.x = e.clientX;
      pan.y = e.clientY;
    }
  }

  /** Vorschau großer Karte beim Überfahren offener Karten (nur wenn sich das Element ändert) */
  function onPointerOver(e: PointerEvent) {
    if (drag) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]')?.dataset.card as CardId | undefined;
    preview = card && table.faceUp[card] ? card : null;
  }

  async function onPointerUp(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    pan = null;
    const d = drag;
    const target = hot;
    drag = null;
    if (!d) return;
    if (!d.moved) return click(d.cards[0]!);

    const zone = target ?? zoneAt(layout, ...toBoard(e.clientX, e.clientY))?.id;
    const p = places[d.cards[0]!]!;
    const to = zone ? { zone } : { free: freePosAt(layout, p.x + d.dx, p.y + d.dy) };
    await submit({ type: 'cards.move', cards: d.cards, from: d.from, to }, { cards: d.cards, dx: d.dx, dy: d.dy });
  }

  /** Einfacher Klick: Stapelmenü; Doppelklick: umdrehen (bzw. bei Kreuz ziehen). */
  function click(card: CardId) {
    const now = Date.now();
    if (lastClick.card === card && now - lastClick.t < 350) {
      lastClick = { card: null, t: 0 };
      void submit({ type: 'card.flip', card });
      return;
    }
    lastClick = { card, t: now };
    const where = locate(table, card);
    if (where && 'zone' in where && content.zones[where.zone]?.actions) toggleMenu(where.zone);
  }

  function toggleMenu(zone: ZoneId) {
    if (panned) return;
    view.open = view.open === zone ? null : zone;
  }

  const submit = (cmd: object, drop?: PendingDrop) => submitOrSay(cmd, drop);

  function onDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-card], input, textarea, button, select, .control, .zone')) return;
    const sheet = target.closest<HTMLElement>('[data-sheet]');
    if (sheet) view.setRole(sheet.dataset.sheet as SeatId);
    else view.animateTo(1, 0, 0);
  }

  /** Verschoben dargestellt: gerade gezogen oder abgelegt und noch nicht bestätigt */
  const offsetOf = $derived.by(() => {
    const m = new Map<CardId, PendingDrop>();
    for (const d of session.pending) for (const c of d.cards) m.set(c, d);
    if (drag?.moved) for (const c of drag.cards) m.set(c, drag);
    return m;
  });
  const shakingCards = $derived(new Set(effects.shaking.values().flatMap((z) => table.zones[z] ?? [])));
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp} />

<div
  class="stage"
  bind:clientWidth={stageW}
  bind:clientHeight={stageH}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointerover={onPointerOver}
  ondblclick={onDblClick}
  role="application"
>
  <div class="board" style:width="{BW}px" style:height="{BH}px" style:transform="translate({geo.tx}px, {geo.ty}px) scale({sc})">
    <div class="panel" style:left="{layout.panel.x}px" style:top="{layout.panel.y}px" style:width="{layout.panel.w}px" style:height="{layout.panel.h}px"></div>
    <div class="ptitle" style:left="{layout.resistTitle.x}px" style:top="{layout.resistTitle.y}px">{t('zones.resistTitle')}</div>

    {#each Object.values(layout.sheets) as box (box.seat)}
      {#if box.visible}
        <Sheet {box} sheet={sheetOf(table, box.seat)} />
      {/if}
    {/each}

    {#each layout.zoneList as zone (zone.id)}
      <ZoneView {zone} count={table.zones[zone.id]?.length ?? 0} open={view.open === zone.id} hot={hot === zone.id} fixedMenu={layout.menu} onToggle={() => toggleMenu(zone.id)} onAction={(a) => submit({ type: `zone.${a}`, zone: zone.id })} />
    {/each}

    {#each cards as [card, p] (card)}
      {@const off = offsetOf.get(card)}
      <Card
        {card}
        x={p.x + (off?.dx ?? 0)}
        y={p.y + (off?.dy ?? 0)}
        scale={p.scale}
        rotated={p.rotated}
        z={p.z}
        size={layout.card}
        faceUp={!!table.faceUp[card]}
        dragging={!!off}
        pending={!!off && off !== drag}
        shake={shakingCards.has(card)}
      />
    {/each}
  </div>
</div>

{#if preview}
  <div class="preview" style:width="{layout.card.w * 3}px" style:height="{layout.card.h * 3}px">
    <Card card={preview} x={0} y={0} scale={3} rotated={false} z={1} size={layout.card} faceUp={true} />
  </div>
{/if}

<style>
  .stage { position: fixed; inset: 0; overflow: hidden; touch-action: none; background: var(--bg); }
  .board { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: var(--felt); border-radius: 18px; box-shadow: inset 0 0 90px rgba(0, 0, 0, 0.45); }
  .panel { position: absolute; background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.28)); border: 2px solid var(--line); border-radius: 56px; box-sizing: border-box; transition: left var(--shift), top var(--shift), width var(--shift), height var(--shift); }
  .ptitle { position: absolute; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; opacity: 0.85; transition: left var(--shift), top var(--shift); }
  .preview { position: fixed; right: 16px; bottom: 16px; pointer-events: none; z-index: 99; }
  .preview :global(.card) { transition: none; }
</style>
