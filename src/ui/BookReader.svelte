<script lang="ts">
  // Regelbuch zum Blättern (Schritt 5zk, ARCHITEKTUR.md 10.16): Leselage über Modal.svelte wie beim Expeditionsblatt,
  // das aufgeschlagene Buch ist der Inhalt. Rein lokal: nichts geht in den Stand oder ins Netz, jeder blättert für sich.
  // Jede Doppelseite ist ein Bild im selben Maß (scripts/book-assets.py); das Fenster hat die Größe des Einbands, der
  // Rand des Bilds (Bändchen, Figuren der Einleitung) ragt darüber hinaus.
  // Blättern: Klick auf die rechte bzw. linke Buchhälfte, Pfeile, Bild auf/ab, Pos1, Ende, Wischen, Verzeichnis.
  // Teil 1: die neue Doppelseite blendet über die alte; was nur die alte zeigt (Figuren), blendet danach aus.
  import content from 'virtual:klio-content';
  import Modal from './Modal.svelte';
  import { timing } from './animator.svelte';
  import { bookSize, chapters, keyTurn, storedSpread, swipeTurn, turned, type Spread, type Turn } from './book';
  import { t } from './texts';
  import { view } from './view.svelte';

  const KEY = 'klio.book.spread';
  const B = content.layouts.book;
  const book = content.book;
  const count = book.spreads.length;
  const toc = chapters(book);
  const [cx, cy, cw, ch] = B.cover;
  /** Anteil der linken Buchhälfte an der Breite des Einbands */
  const leftShare = (B.spine - cx) / cw;
  const src = (i: number) => `${import.meta.env.BASE_URL}assets/book/${book.spreads[i]!.id}.webp`;

  /** Beschreibung der Doppelseite: Seitenzahlen und Überschriften (die Regeln selbst stehen nur im Bild) */
  function describe(s: Spread): string {
    const pages = s.left.page !== undefined && s.right.page !== undefined ? [t('book.pages', { a: s.left.page, b: s.right.page })] : [];
    return [...pages, [...s.left.titles, ...s.right.titles].join(', ')].filter(Boolean).join(': ');
  }

  // ---------- Größe und Lage ----------
  let vw = $state(innerWidth);
  let vh = $state(innerHeight);
  let tocHeight = $state(0);
  const size = $derived(bookSize(vw, vh, B));
  /** Rand des Bilds über und unter dem Einband am Bildschirm */
  const above = $derived((cy / ch) * size.h);
  const below = $derived(((B.size[1] - cy - ch) / ch) * size.h);
  /** Abstand zwischen Einband und Verzeichnis, wenn es darunter steht */
  const TOC_GAP = 14;
  const EDGE = 6;
  /** Platz für das Verzeichnis unter dem Buch, wenn das Bild ganz oben liegt; was nicht passt, scrollt. Hängt nicht von
   *  der gemessenen Höhe ab (sonst messen und setzen sich Höhe und Lage gegenseitig) */
  const tocRoom = $derived(Math.max(60, vh - (EDGE + above + size.h + TOC_GAP) - EDGE));
  /** Das Fenster liegt mittig; verschoben wird, bis das ganze Bild (bzw. Buch und Verzeichnis darunter) mittig liegt */
  const shift = $derived.by(() => {
    if (size.toc === 'side') return (above - below) / 2;
    const group = above + size.h + TOC_GAP + Math.min(tocHeight, tocRoom);
    const top = Math.max(EDGE, (vh - group) / 2);
    return top + above - (vh - size.h) / 2;
  });
  const style = $derived(`width: ${size.w}px; height: ${size.h}px; translate: 0 ${shift}px;`);

  // ---------- Blättern ----------
  /** aufgeschlagene Doppelseite: gilt sofort (Verzeichnis, Zähler, gemerkt) */
  let index = $state(storedSpread(localStorage.getItem(KEY), book));
  /** gezeigtes Bild; wechselt, sobald das neue geladen ist */
  let shown = $state(index);
  /** Bild darunter, solange das neue darüber einblendet */
  let under = $state<number | null>(null);
  let underEl = $state<HTMLImageElement>();
  let change = 0;

  const loading = new Map<number, Promise<void>>();
  /** Bild laden und entpacken, damit beim Wechsel nichts aufblitzt; jedes nur einmal */
  function loaded(i: number): Promise<void> {
    let p = loading.get(i);
    if (!p) {
      const img = new Image();
      img.src = src(i);
      p = img.decode().catch(() => undefined);
      loading.set(i, p);
    }
    return p;
  }
  /** Nachbarn im Voraus */
  function preload(i: number) {
    for (const n of [i + 1, i - 1]) if (n >= 0 && n < count) void loaded(n);
  }

  async function go(to: number) {
    if (to === index) return;
    index = to;
    localStorage.setItem(KEY, book.spreads[to]!.id);
    const mine = ++change;
    await loaded(to);
    if (mine !== change) return;
    under = shown;
    shown = to;
    preload(to);
  }
  const turn = (how: Turn) => go(turned(index, how, count));

  /** neues Bild blendet über das alte; danach blendet aus, was vom alten noch daneben zu sehen ist */
  function enter(node: HTMLImageElement) {
    if (under === null) return;
    const mine = change;
    const ms = timing().fade;
    const drop = () => {
      if (mine === change) under = null;
    };
    const leave = () => {
      if (mine !== change) return;
      if (!ms || !underEl) return drop();
      underEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards' }).finished.then(drop, drop);
    };
    if (!ms) return leave();
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' }).finished.then(leave, leave);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const how = keyTurn(e.key);
    if (!how) return;
    e.preventDefault();
    void turn(how);
  }

  // Wischen: nach dem Loslassen entschieden; der Klick, der darauf folgt, blättert nicht noch einmal
  let press: { id: number; x: number; y: number } | null = null;
  let swiped = false;
  function down(e: PointerEvent) {
    if (e.button > 0) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function up(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    const how = swipeTurn(e.clientX - press.x, e.clientY - press.y);
    press = null;
    if (!how) return;
    swiped = true;
    setTimeout(() => (swiped = false));
    void turn(how);
  }
  const click = (how: Turn) => () => {
    if (!swiped) void turn(how);
  };

  let bookEl: HTMLDivElement;
  $effect(() => {
    bookEl.focus({ preventScroll: true });
    preload(index);
  });

  function close() {
    view.bookOpen = false;
    document.querySelector<HTMLElement>('.menu > .open')?.focus({ preventScroll: true });
  }
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} {onkeydown} />

<Modal label={t('book.title')} onclose={close} size="sheet" {style}>
  <!-- svelte-ignore a11y_no_static_element_interactions (Wischen ist eine Abkürzung; Blättern geht auch über Knöpfe und Tasten) -->
  <div class="book" tabindex="-1" bind:this={bookEl} data-book data-spread={book.spreads[index]!.id} onpointerdown={down} onpointerup={up} onpointercancel={() => (press = null)}
    style:--img-x="{(-cx / cw) * 100}%" style:--img-y="{(-cy / ch) * 100}%" style:--img-w="{(B.size[0] / cw) * 100}%" style:--img-h="{(B.size[1] / ch) * 100}%">
    {#if under !== null}
      <img class="spread" src={src(under)} alt="" draggable="false" bind:this={underEl} data-book-under />
    {/if}
    {#key shown}
      <img class="spread" src={src(shown)} alt={describe(book.spreads[shown]!)} draggable="false" use:enter data-book-shown={book.spreads[shown]!.id} />
    {/key}
    <button class="half prev" style:width="{leftShare * 100}%" aria-label={t('book.prev')} disabled={index === 0} onclick={click('prev')}></button>
    <button class="half next" style:width="{(1 - leftShare) * 100}%" aria-label={t('book.next')} disabled={index === count - 1} onclick={click('next')}></button>
  </div>
  <nav class="menu-panel toc" class:below={size.toc === 'below'} aria-label={t('book.toc')} bind:clientHeight={tocHeight} data-book-toc={size.toc}
    style:--toc-w="{B.toc.w}px" style:--toc-gap="{size.toc === 'side' ? B.toc.gap : TOC_GAP}px" style:--toc-room="{tocRoom}px" style:--book-w="{size.w}px">
    <div class="menu-head"><span>{t('book.title')}</span><span class="name" data-book-position>{t('book.position', { n: index + 1, m: count })}</span></div>
    <div class="menu-body">
      {#each toc as c (c.title)}
        <button class="menu-item" aria-label={c.title} aria-current={c.spread === index ? 'page' : undefined} onclick={() => go(c.spread)}
          ><span>{c.title}</span>{#if c.page !== undefined}<span class="menu-note" aria-hidden="true">{c.page}</span>{/if}</button
        >
      {/each}
    </div>
  </nav>
</Modal>

<style>
  .book { position: absolute; inset: 0; outline: none; touch-action: pan-y pinch-zoom; user-select: none; animation: fade-in var(--pop) ease-out; }
  .spread { position: absolute; left: var(--img-x); top: var(--img-y); width: var(--img-w); height: var(--img-h); max-width: none; pointer-events: none;
    filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.55)); }
  /* Buchhälften als Klickflächen: unsichtbar, nur der Zeiger zeigt die Richtung */
  .half { position: absolute; top: 0; bottom: 0; padding: 0; border: 0; background: none; outline: none; }
  .half.prev { left: 0; cursor: w-resize; }
  .half.next { right: 0; cursor: e-resize; }
  .half:disabled { cursor: default; }
  .half:focus-visible { outline: 2px solid var(--focus); outline-offset: -6px; }
  /* Verzeichnis im Menüstil: links neben dem Buch, oben bündig mit dem Einband */
  .toc { position: absolute; z-index: auto; right: calc(100% + var(--toc-gap)); top: 0; width: var(--toc-w); max-height: 100%; }
  .toc .menu-item[aria-current] { background: var(--menu-item-hover); }
  /* Überschrift links (lange brechen um), Seitenzahl rechts auf der ersten Zeile */
  .toc .menu-item { display: flex; align-items: baseline; gap: 10px; white-space: normal; }
  .toc .menu-note { float: none; margin-left: auto; font-variant-numeric: tabular-nums; }
  /* oder darunter (schmale Fenster): Überschriften nebeneinander, umbrechend */
  .toc.below { right: auto; left: 50%; translate: -50% 0; top: calc(100% + var(--toc-gap)); width: min(var(--book-w), 100vw - 12px); max-height: var(--toc-room); }
  .toc.below .menu-body { flex-direction: row; flex-wrap: wrap; }
  .toc.below .menu-item { width: auto; white-space: nowrap; }
</style>
