<script lang="ts">
  // Der Tisch: Zoom und Verschieben, Bögen, Zonen, Karten, Ziehen und Ablegen (ARCHITEKTUR.md 10, 14).
  // Zeigt nur den Stand an und schickt Befehle; Meldungen und Animationen kommen aus effects.svelte.ts.
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { locate } from '../engine/zones';
  import type { CardId, CardSource, SeatId, ZoneId } from '../engine/types';
  import type { PointerPos } from '../net/presence';
  import { sheetOf } from '../rules/klio/events';
  import Card from './Card.svelte';
  import Cursors from './Cursors.svelte';
  import ExpeditionSheet from './ExpeditionSheet.svelte';
  import FeltMarkings from './FeltMarkings.svelte';
  import Lamp from './Lamp.svelte';
  import OracleBox from './OracleBox.svelte';
  import { shadowCss, shadowOver, stackHeight, HEIGHT } from './light';
  import Sheet from './Sheet.svelte';
  import ZoneView from './ZoneView.svelte';
  import { shownOffset } from './animator.svelte';
  // Meldungen und Animationen hören ab dem Tisch auf die Ereignisse
  import './effects.svelte';
  import { dropCenter, dropHints, dropTarget } from './dropHint';
  import { clamp, computeLayout, FELT_RIM, placeCards, pointerAt, pointerPosAt, SHEET_W, zoneAt, type CardPlace, type Rect } from './layout';
  import { submitOrSay as submit } from './commands';
  import { session, type KlioTableState, type PendingDrop } from './session.svelte';
  import { whoColor } from './colors';
  import { previewPlace } from './overlap';
  import { t } from './texts';
  import type { Area } from './stackMenu';
  import { view, type PlateMenuAt, type StackMenuAt } from './view.svelte';

  let { table }: { table: KlioTableState } = $props();

  let stageW = $state(0);
  let stageH = $state(0);
  let stageEl = $state<HTMLElement>();

  // Spielerzahl als eigener Wert: die Geometrie ändert sich nur, wenn sie sich ändert, nicht bei jedem Befehl
  const players = $derived(table.settings.players);
  // neue Spielerzahl: Sprung und Aufblenden (11.8); vor dem Neuzeichnen, damit die Karten schon mit dem Schnitt planen
  let shownPlayers = untrack(() => players);
  $effect.pre(() => {
    const n = players;
    untrack(() => {
      if (n === shownPlayers) return;
      shownPlayers = n;
      void view.reveal();
    });
  });
  const layout = $derived(computeLayout(content, players, view.role, view.open));
  const places = $derived(placeCards(table, layout));
  // feste Reihenfolge im DOM (nach Kennung): Eine Karte, die die Zone wechselt, behält ihr Element; die Stapelung regelt z (11.4)
  const cards = $derived((Object.entries(places) as [CardId, CardPlace][]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const BW = $derived(layout.board.w);
  const BH = $derived(layout.board.h);

  // ---------- Zoom und Verschieben (wie bisher: 1–5×, Rand bleibt am Rand) ----------
  const fitScale = $derived(stageW && stageH ? Math.min(stageW / BW, stageH / BH) : 1);
  const sc = $derived(fitScale * view.zoom);
  function offsets(z: number, ox: number, oy: number) {
    const s = fitScale * z;
    let tx = stageW / 2 - (BW / 2 + ox) * s;
    let ty = stageH / 2 - (BH / 2 + oy) * s;
    tx = BW * s <= stageW ? (stageW - BW * s) / 2 : clamp(tx, stageW - BW * s, 0);
    ty = BH * s <= stageH ? (stageH - BH * s) / 2 : clamp(ty, stageH - BH * s, 0);
    return { tx, ty, ox: (stageW / 2 - tx) / s - BW / 2, oy: (stageH / 2 - ty) / s - BH / 2 };
  }
  const geo = $derived(offsets(view.zoom, view.ox, view.oy));

  function clampView() {
    const o = offsets(view.zoom, view.ox, view.oy);
    view.ox = o.ox;
    view.oy = o.oy;
  }

  /** Bildschirm → Tisch (die Bühne füllt das ganze Fenster, beginnt also bei 0, 0) */
  const toBoard = (clientX: number, clientY: number): [number, number] => [(clientX - geo.tx) / sc, (clientY - geo.ty) / sc];

  function zoomAt(clientX: number, clientY: number, f: number) {
    const nz = clamp(view.zoom * f, 1, 5);
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
  /** `grab`: Greifpunkt für die anderen (8.3), gesetzt, sobald die Karte bewegt wird */
  /** `ox`, `oy`: wo die Karte beim Losziehen gezeigt wurde, gemessen von ihrer Endlage (im Flug gegriffen, 11.2) */
  type Drag = PendingDrop & { from: CardSource; sx: number; sy: number; moved: boolean; grab?: PointerPos; ox: number; oy: number };
  let drag = $state<Drag | null>(null);
  let boardEl: HTMLDivElement;
  /** Schatten von der Flamme weg (11.9); setzt die Laterne: beim Anzünden am Anfang, beim Löschen am Ende des Übergangs */
  let shadowsLit = $state(true);
  /** Flamme für die Schatten; null bei gelöschter Laterne: dann fallen sie weich nach unten (F4) */
  const flame = $derived(shadowsLit ? layout.lamp.flame : null);
  /** Höhe einer liegenden Karte über dem Tisch (11.9): oberste Karte eines Stapels mit Kanten 2 + Zahl seiner Kanten,
   *  eine einzelne Karte 0 (flach, ohne Schatten). Null für die Karten darunter: Sie liegen genau unter der obersten, und
   *  jeder eigene Schatten machte den Rand des Stapels mit jeder Karte dunkler; die Dicke zeigen die Kanten. */
  const heightOf = (p: CardPlace): number | null => (p.under ? null : p.edges ? stackHeight(p.edges) : 0);
  const feltShadow = $derived(shadowCss(shadowOver(flame, layout.middle, HEIGHT.felt)));
  // Tischplatte (11.9); der Pfad hängt am Basispfad und steht deshalb nicht im CSS. Erst nach dem Dekodieren setzen:
  // Sonst dekodiert der Browser das große Bild beim ersten Zeichnen im Hauptthread (gemessen etwa 150 ms, ein Ruck
  // kurz nach dem Laden); bis dahin der Grundton des Holzes.
  // Der Filz ebenso, bis dahin `--felt` (Grundton des Bildes).
  let wood = $state<string | undefined>();
  let felt = $state<string | undefined>();
  function preload(file: string, set: (css: string) => void): void {
    const src = `${import.meta.env.BASE_URL}assets/table/${file}`;
    const img = new Image();
    img.src = src;
    img.decode().then(() => set(`url(${src})`), () => set(`url(${src})`));
  }
  $effect(() => {
    preload('holz.webp', (css) => (wood = css));
    preload('filz.webp', (css) => (felt = css));
  });
  /** Hülle über dem Filz mit den Karten (direkte Kinder), Zonen und Bögen */
  let sceneEl: HTMLDivElement;
  // Ansichtswechsel (11.8, seit 5n): es blendet der ganze Tisch ab, Filz und Licht rücken mit der Tischmitte
  $effect(() => view.attachFade(boardEl));
  let pan: { x: number; y: number; moved: boolean } | null = null;
  let panned = false;
  const touches = new Map<number, [number, number]>();
  let pinch: { d: number; mx: number; my: number } | null = null;
  let lastClick = { card: null as CardId | null, t: 0 };
  /** große Vorschau einer offenen Karte, Lage in der Bühne (5v, F2) */
  let preview = $state<{ card: CardId; x: number; y: number } | null>(null);

  /** Zeiger beim Ziehen (Tischpunkte): Ziel, wenn die Kartenmitte über keiner Zone liegt */
  let dragPointer = $state<[number, number] | null>(null);
  /** Vorschau der Ablegestelle (11.6): Probelauf des Befehls, den das Loslassen senden würde */
  const hints = $derived.by(() => {
    const to = drag?.moved && dragPointer ? dropTarget(layout, places, drag, dragPointer) : null;
    if (!drag || !to) return [];
    return dropHints(layout, places, session.predict({ type: 'cards.move', cards: drag.cards, from: drag.from, to }), drag.cards);
  });
  /** Zone unter der gezogenen Karte (hervorgehoben, Ziel beim Loslassen) */
  const hot = $derived.by(() => {
    const c = drag?.moved ? dropCenter(layout, places, drag) : null;
    return c ? (zoneAt(layout, c[0], c[1])?.id ?? null) : null;
  });

  /** Abstand und Mitte der ersten beiden Finger */
  function pinchOf() {
    const [a, b] = [...touches.values()] as [[number, number], [number, number]];
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
  }

  function onPointerDown(e: PointerEvent) {
    // während des Schnitts beim Ansichtswechsel beginnt kein Zug (11.8)
    if (view.inCut) return;
    panned = false;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.size === 2) {
        drag = null;
        pan = null;
        pinch = pinchOf();
        return;
      }
    }
    if (e.button > 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    // Karten greifen nur mit Recht (Zuschauer sehen nur zu); verbindlich prüft der Host
    if (el && session.canSome('cards.move')) return grab(el.dataset.card as CardId, e);
    if ((e.target as HTMLElement).closest('input, textarea, button, select, .control')) return;
    pan = { x: e.clientX, y: e.clientY, moved: false };
  }

  /** Darf man die Karte an dieser Stelle greifen? Im Stapel nur die oberste; dieselbe Regel wie beim Host (zones.yaml
   *  `fanned`), nicht der Abstand aus layouts.yaml */
  function topOrFanned(where: { zone: ZoneId; index: number }): boolean {
    return !!layout.zones[where.zone]?.fanned || where.index === table.zones[where.zone]!.length - 1;
  }

  function grab(card: CardId, e: PointerEvent) {
    const where = locate(table, card);
    if (!where) return;
    let grabbed: CardId[] = [card];
    let from: CardSource = { free: true };
    if ('zone' in where) {
      const list = table.zones[where.zone]!;
      // Stapel: nur die oberste Karte; mit Umschalt die Karte samt den darüberliegenden
      if (e.shiftKey) grabbed = list.slice(where.index);
      else if (!topOrFanned(where)) return;
      from = { zone: where.zone };
    }
    e.preventDefault();
    preview = null;
    hover = null;
    drag = { cards: grabbed, from, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, ox: 0, oy: 0 };
  }

  /** Eigenen Zeiger und gezogene Karten den anderen zeigen (8.3) */
  function showPointer(clientX: number, clientY: number) {
    const dragged = drag?.moved ? drag.cards : [];
    session.pointer(pointerPosAt(layout, places, table.free, ...toBoard(clientX, clientY), dragged), dragged, drag?.grab ?? null);
  }
  /** letzte Mausposition über dem Tisch: Ändert sich die Ansicht (Zoom, Verschieben, Rollenansicht, Fenstergröße),
   *  liegt etwas anderes unter der Maus, auch ohne Bewegung */
  let mouse: [number, number] | null = null;
  $effect(() => {
    void geo;
    void layout;
    untrack(() => { if (mouse && session.sharesPointer) showPointer(...mouse); });
  });
  // eigenes offenes Stapelmenü für die anderen
  $effect(() => session.shareOpen(view.open));

  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      mouse = [e.clientX, e.clientY];
      hoverAt(e);
    }
    // beim Verschieben sendet der Effekt oben, sobald sich die Ansicht geändert hat
    if (session.sharesPointer && !pan?.moved && (e.pointerType === 'mouse' || drag)) showPointer(e.clientX, e.clientY);
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size >= 2) {
      const next = pinchOf();
      if (pinch.d > 0) zoomAt(next.mx, next.my, next.d / pinch.d);
      view.ox -= (next.mx - pinch.mx) / sc;
      view.oy -= (next.my - pinch.my) / sc;
      clampView();
      pinch = next;
      return;
    }
    if (drag) {
      const dx = (e.clientX - drag.sx) / sc;
      const dy = (e.clientY - drag.sy) / sc;
      if (!drag.moved && Math.hypot(dx, dy) * sc < 4) return;
      if (!drag.moved) {
        drag.grab = pointerPosAt(layout, places, table.free, ...toBoard(drag.sx, drag.sy));
        const el = sceneEl.querySelector<HTMLElement>(`:scope > [data-card="${drag.cards[0]}"]`);
        if (el) ({ dx: drag.ox, dy: drag.oy } = shownOffset(el));
      }
      drag.moved = true;
      drag.dx = drag.ox + dx;
      drag.dy = drag.oy + dy;
      dragPointer = toBoard(e.clientX, e.clientY);
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

  // ---------- Überfahren (11.6): Karte, die man nehmen darf, hebt sich leicht; Wackeln nur bei echter Bewegung ----------
  const mouseHovers = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;
  /** Karte unter der Maus (auch beim Ziehen): Wackeln nur, wenn eine andere darunter kommt, nicht nach dem Ablegen */
  let under: CardId | null = null;
  /** überfahrene Karte samt Platz (gleitet sie weg, hebt sie sich nicht mehr) und ob sie wackeln soll */
  let hover = $state<{ card: CardId; slot: string; wiggle: boolean } | null>(null);
  /** Darf man die Karte nehmen? Dieselbe Regel wie beim Greifen, dazu das Recht für genau diese Zone bzw. Lage */
  function takeable(card: CardId): boolean {
    const where = locate(table, card);
    if (!where) return false;
    if ('zone' in where) {
      if (!topOrFanned(where)) return false;
      return session.can({ type: 'cards.move', cards: [card], from: { zone: where.zone }, to: { zone: where.zone } });
    }
    const pos = table.freePos[card];
    return !!pos && session.can({ type: 'cards.move', cards: [card], from: { free: true }, to: { free: pos } });
  }
  function hoverAt(e: PointerEvent) {
    // das Ereignis kommt beim Fenster an; Ziel kann auch das Fenster selbst sein
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-card]') : null;
    const card = el && boardEl.contains(el) ? (el.dataset.card as CardId) : null;
    const was = under;
    under = card;
    if (!mouseHovers || drag || pan || !card) return void (hover = null);
    if (hover?.card === card) return;
    // ohne Bewegung (Karten gleiten unter dem ruhenden Zeiger hindurch) nur anheben, nicht wackeln
    hover = { card, slot: places[card]?.slot ?? '', wiggle: card !== was && (e.movementX !== 0 || e.movementY !== 0) };
  }
  /** gilt nur, solange die Karte an ihrem Platz liegt, man sie nehmen darf und niemand sie zieht */
  const hovered = $derived(hover && !drag && places[hover.card]?.slot === hover.slot && !offsetOf.has(hover.card) && !remoteOf.has(hover.card) && takeable(hover.card) ? hover : null);

  /** Vorschau großer Karte beim Überfahren offener Karten (nur wenn sich das Element ändert); unten rechts, sonst dort,
   *  wo sie die Karte nicht verdeckt (5v, F2). Dieselbe Karte behält ihren Platz. */
  const PREVIEW_SCALE = 3;
  const PREVIEW_MARGIN = 16;
  function onPointerOver(e: PointerEvent) {
    if (drag) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    const card = el?.dataset.card as CardId | undefined;
    if (!el || !card || !table.faceUp[card]) return void (preview = null);
    if (preview?.card === card) return;
    const stage = stageEl!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const m = PREVIEW_MARGIN;
    const bounds = { x: stage.left + m, y: stage.top + m, w: stage.width - 2 * m, h: stage.height - 2 * m };
    const size = { w: layout.card.w * PREVIEW_SCALE, h: layout.card.h * PREVIEW_SCALE };
    const at = previewPlace(bounds, size, { x: r.left, y: r.top, w: r.width, h: r.height });
    preview = { card, x: at.x - stage.left, y: at.y - stage.top };
  }

  /** Zeiger los (oder abgebrochen): Verschieben, Zoom und Zug enden; liefert den beendeten Zug */
  function release(e: PointerEvent): Drag | null {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    pan = null;
    const d = drag;
    drag = null;
    dragPointer = null;
    return d;
  }
  /** Zug ohne Ablegen beendet: Die anderen lassen die Karte sofort zurückgleiten, nicht erst nach der Haltefrist
   *  oder der nächsten Mausbewegung (bei Touch kommt keine, 5x) */
  function endDrag(e: PointerEvent) {
    if (!session.sharesPointer) return;
    if (e.pointerType === 'mouse' && mouse) showPointer(...mouse);
    else session.pointer(null, []);
  }

  async function onPointerUp(e: PointerEvent) {
    const d = release(e);
    if (!d) return;
    if (!d.moved) return click(d.cards[0]!);

    const to = dropTarget(layout, places, d, toBoard(e.clientX, e.clientY));
    if (!to) return endDrag(e);
    await submit({ type: 'cards.move', cards: d.cards, from: d.from, to }, { cards: d.cards, dx: d.dx, dy: d.dy });
  }

  /** Vom Browser abgebrochen (Systemgeste, Handballen): kein Ablegen, kein Klick; die Karte gleitet zurück (5x, F2) */
  function onPointerCancel(e: PointerEvent) {
    if (release(e)?.moved) endDrag(e);
  }

  /** Einfacher Klick: Stapelmenü; Doppelklick: umdrehen, an jedem Stapel (5r, F1). */
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
    if (view.open === zone) return view.closeStack();
    view.openStack(menuAt(zone));
    openedWhere = menuWhere;
  }

  /** Menü am Namensschild (10.4): öffnen mit der Lage des Schilds am Bildschirm */
  function openPlate(seat: SeatId, width: number) {
    view.openPlate(plateMenuAt(seat, width));
    openedWhere = menuWhere;
  }

  // ---------- Stapelmenü und Namensschild-Menü (10.2, 10.4): Geometrie beim Öffnen, Schließen, sobald der Anker woanders steht ----------
  /** Abstand des Menüs zum Rand der sichtbaren Tischfläche (N8) */
  const MENU_MARGIN = 8;
  const toScreen = (stage: DOMRect, r: Rect): Rect => ({ x: stage.left + geo.tx + r.x * sc, y: stage.top + geo.ty + r.y * sc, w: r.w * sc, h: r.h * sc });
  /** sichtbare Tischfläche ohne Dock und Menüknopf (`data-menu-avoid`) */
  function menuArea(stage: DOMRect): Area {
    const blocked = [...document.querySelectorAll('[data-menu-avoid]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    return { bounds: { x: stage.left + MENU_MARGIN, y: stage.top + MENU_MARGIN, w: stage.width - 2 * MENU_MARGIN, h: stage.height - 2 * MENU_MARGIN }, blocked };
  }
  /** Bildschirmrechtecke für StackMenu.svelte: Stapel im Endmaß nach dem Öffnen (`growOnOpen`), Ziel von „Ziehen“,
   *  nutzbarer Bereich. Danach wird nichts nachgeführt. */
  function menuAt(zone: ZoneId): StackMenuAt {
    const L = computeLayout(content, players, view.role, zone);
    const stage = stageEl!.getBoundingClientRect();
    const to = content.zones[zone]?.actions?.draw?.to;
    const target = to ? L.zones[to] : undefined;
    const box = L.zones[zone]!;
    return {
      zone,
      anchor: toScreen(stage, box),
      avoid: target ? [toScreen(stage, target)] : [],
      area: menuArea(stage),
      sides: box.menu === 'left' ? ['left', 'right'] : ['right', 'left'],
    };
  }
  /** Schild am Bildschirm (R7): Lage und Höhe aus Layout und Haut, die Breite gemessen (`skin.nameplate.w` ist nur
   *  die Höchstbreite, das Schild ist so breit wie sein Text), alles in Bildpunkten des Bogenbilds */
  function plateMenuAt(seat: SeatId, width: number): PlateMenuAt {
    const box = layout.sheets[seat];
    const plate = content.skinPaper.nameplate;
    const k = (SHEET_W * box.scale) / content.skinPaper.size[0];
    const stage = stageEl!.getBoundingClientRect();
    return { seat, anchor: toScreen(stage, { x: box.x + plate.x * k, y: box.y + plate.y * k, w: width * k, h: plate.h * k }), area: menuArea(stage) };
  }
  /** Lage des Ankers am Bildschirm: Maßstab, Verschiebung, Fenstergröße, Ansicht, Lage im Layout (N4); beim Schild
   *  die Lage des Bogens samt `visible`, so schließt das Menü auch, wenn der Platz verschwindet */
  const menuWhere = $derived.by(() => {
    const at = view.open ? layout.zones[view.open] : view.plateMenu ? layout.sheets[view.plateMenu.seat] : null;
    return at ? JSON.stringify([sc, geo.tx, geo.ty, stageW, stageH, view.role, at]) : null;
  });
  let openedWhere: string | null = null;
  // eine Regel statt aufgezählter Auslöser, für beide Menüs: steht der Anker woanders, schließt das Menü
  $effect(() => {
    if ((view.stackMenu || view.plateMenu) && menuWhere !== openedWhere)
      untrack(() => view.closeMenus());
  });

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
  /** Von anderen gezogen: Versatz = deren Zeiger jetzt − beim Greifen, in dieser Ansicht (8.3) */
  const remoteOf = $derived.by(() => {
    const m = new Map<CardId, { dx: number; dy: number; color: string }>();
    for (const r of session.remoteDrags) {
      const a = pointerAt(layout, places, r.start);
      const b = pointerAt(layout, places, r.last);
      if (!a || !b) continue;
      for (const c of r.cards) if (!offsetOf.has(c)) m.set(c, { dx: b.x - a.x, dy: b.y - a.y, color: whoColor(r.who) });
    }
    return m;
  });
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerCancel} />

<div
  class="stage"
  bind:this={stageEl}
  bind:clientWidth={stageW}
  bind:clientHeight={stageH}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointerover={onPointerOver}
  ondblclick={onDblClick}
  onpointerleave={(e) => {
    if (e.pointerType !== 'mouse') return;
    mouse = null; under = null; hover = null;
    // beim Ziehen (auch über Protokoll oder Rand) senden die Bewegungen am Fenster den Zug weiter (5x)
    if (!drag) session.pointer(null, []);
  }}
  role="application"
>
  <div class="board" bind:this={boardEl} data-cut={view.cutting || undefined} style:width="{BW}px" style:height="{BH}px" style:transform="translate({geo.tx}px, {geo.ty}px) scale({sc})" style:background-image={wood}>
    <div class="scene" bind:this={sceneEl}>
      <div class="panel" style:left="{layout.middle.x}px" style:top="{layout.middle.y}px" style:width="{layout.middle.w}px" style:height="{layout.middle.h}px" style:--felt-rim-w="{FELT_RIM}px" style:--felt-shadow={feltShadow} style:background-image={felt}>
        <FeltMarkings {layout} />
      </div>
      <Lamp lamp={layout.lamp} light={layout.light} lit={table.lamp} bind:shadowsLit />
      <!-- Expedition und Orakel am unteren Rand (5zb, 10.12), an der Tischkante abgeschnitten (Hülle ohne Stapelkontext:
           die z-Werte der beiden gelten weiter gegenüber den Karten) -->
      <div class="table-edge" style:width="{BW}px" style:height="{BH}px">
        <ExpeditionSheet {layout} {flame} dragging={!!drag?.moved} scale={sc} />
        <OracleBox {layout} {fitScale} {flame} />
      </div>
      <div class="ptitle" style:left="{layout.resistTitle.x}px" style:top="{layout.resistTitle.y}px">{t('zones.resistTitle')}</div>

      {#each Object.values(layout.sheets) as box (box.seat)}
        {#if box.visible}
          <Sheet --sheet-shadow={shadowCss(shadowOver(flame, box, HEIGHT.sheet))} {box} sheet={sheetOf(table, box.seat)} mark={layout.role === null ? 'plate' : box.seat === layout.role ? null : 'strip'} onPlate={openPlate} />
        {/if}
      {/each}

      {#each layout.zoneList as zone (zone.id)}
        {@const openedBy = session.openZones.get(zone.id)}
        <ZoneView {zone} {flame} count={table.zones[zone.id]?.length ?? 0} card={layout.card} hot={hot === zone.id} mark={openedBy && whoColor(openedBy)} onToggle={() => toggleMenu(zone.id)} />
      {/each}

      {#each cards as [card, p] (card)}
        {@const off = offsetOf.get(card) ?? remoteOf.get(card)}
        <Card
          {card}
          x={p.x + (off?.dx ?? 0)}
          y={p.y + (off?.dy ?? 0)}
          scale={p.scale}
          rotated={p.rotated}
          z={p.z}
          slot={p.slot}
          size={layout.card}
          {flame}
          shaded
          height={heightOf(p)}
          faceUp={!!table.faceUp[card]}
          dragging={offsetOf.has(card)}
          pending={offsetOf.has(card) && off !== drag}
          mark={remoteOf.get(card)?.color}
          hover={hovered?.card === card}
          wiggle={hovered?.card === card && hovered.wiggle}
        />
      {/each}
      {#each hints as h (h.card)}
        <div class="drop-hint" style:left="{h.x}px" style:top="{h.y}px" style:width="{h.w}px" style:height="{h.h}px" style:border-radius="{7 * h.scale}px"></div>
      {/each}
      <Cursors {layout} {places} scale={sc} />
    </div>
  </div>
  {#if preview}
    <div class="preview" style:left="{preview.x}px" style:top="{preview.y}px" style:width="{layout.card.w * PREVIEW_SCALE}px" style:height="{layout.card.h * PREVIEW_SCALE}px">
      <Card card={preview.card} x={0} y={0} scale={PREVIEW_SCALE} rotated={false} z={1} size={layout.card} faceUp={true} still />
    </div>
  {/if}
</div>

<style>
  /* clip statt hidden (5zb): nicht scrollbar, auch nicht, wenn der Browser ein fokussiertes Element (Blatt am Rand) ins Bild holen will */
  .stage { position: fixed; inset: 0 var(--table-right) 0 0; overflow: clip; touch-action: none; background: var(--room); }
  .scene { position: absolute; inset: 0; }
  /* Holz (11.9): `border-radius` rundet die Platte ab; kein overflow: über den Rand gezogene Karten bleiben sichtbar */
  .board { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: var(--wood) 0 0 / 100% 100% no-repeat; border-radius: 18px; box-shadow: inset 0 0 90px rgba(0, 0, 0, 0.45); }
  /* Filz als Einlage: Struktur über der Filzfarbe, dunkler Rand wie Leder, Schatten nach innen und aufs Holz */
  .panel { position: absolute; background: var(--felt) center / cover no-repeat; border-radius: 56px; box-sizing: border-box;
    box-shadow: 0 0 0 calc(var(--felt-rim-w) - 1px) var(--felt-rim), 0 0 0 var(--felt-rim-w) var(--felt-rim-light), inset 0 0 50px rgba(0, 0, 0, 0.5), inset 0 3px 4px rgba(0, 0, 0, 0.5), var(--felt-shadow, 0 3px 8px rgba(0, 0, 0, 0.5)); transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease), width var(--shift) var(--shift-ease), height var(--shift) var(--shift-ease); }
  .ptitle { position: absolute; color: var(--felt-print); font-size: 11px; font-weight: 600; letter-spacing: 2px; opacity: 0.85; pointer-events: none; transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease); }
  /* Vorschau der Ablegestelle: über den liegenden Karten, unter der gezogenen (400000 + z); blendet ein */
  .table-edge { position: absolute; left: 0; top: 0; overflow: clip; pointer-events: none; }
  .table-edge > :global(*) { pointer-events: auto; }
  .drop-hint { position: absolute; z-index: 390000; box-sizing: border-box; border: 2px dashed var(--drop-hint); background: var(--drop-hint-bg); pointer-events: none; animation: fade-in var(--pop) ease-out; }
  /* Schatten und feiner Rand wie ein Menü: der Schatten der Karte allein ist bei dreifacher Größe zu schwach */
  .preview { position: absolute; pointer-events: none; z-index: 99; border-radius: calc(var(--radius-card) * 3); box-shadow: 0 0 0 1px var(--menu-rim), var(--menu-shadow); }
</style>
