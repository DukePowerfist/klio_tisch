<script lang="ts" module>
  /** Das oberste offene Fenster ist das letzte im Dokument (alle liegen auf derselben Ebene) */
  export function isTopmost(box: Element): boolean {
    const open = document.querySelectorAll('[aria-modal="true"]');
    return open[open.length - 1] === box;
  }
</script>

<script lang="ts">
  // Gemeinsames Fenster: abgedunkelter Hintergrund, Klick daneben oder Esc (nur das oberste) schließt.
  // Größe: narrow (Rückfragen, schmal), wide (Trumpf), pane (Einstellungen: feste Größe, Inhalt ordnet sich selbst),
  // result (Expedition und Orakel, 5t: Spalte ohne Innenrand, Knöpfe zeichnet das Fenster selbst).
  // anchor: öffnet mittig, danach bleibt die Oberkante fest und die Höhe ändert sich nur nach unten (5t, 10.6).
  // Tab bleibt im obersten Fenster (Schritt 5f), statt in den Tisch dahinter zu laufen.
  import type { Snippet } from 'svelte';

  let { label, onclose, onescape, size = 'wide', anchor = false, children }: {
    label: string;
    onclose: () => void;
    /** Esc zuerst hier (z. B. offene Rückfrage abbrechen); true = erledigt, Fenster bleibt offen */
    onescape?: () => boolean;
    size?: 'narrow' | 'wide' | 'pane' | 'result';
    anchor?: boolean;
    children: Snippet;
  } = $props();

  let box: HTMLDivElement;

  /** anchor: Oberkante beim Öffnen mittig, danach fest; nur wenn es unten nicht mehr passt, rückt es so weit wie nötig
   *  nach oben. Neu mittig erst, wenn sich das Browserfenster ändert. EDGE wie der Rand in `max-height` unten. */
  const EDGE = 12;
  let top = $state<number | null>(null);
  $effect(() => {
    if (!anchor) return;
    let mid = 0;
    const place = (h: number) => (top = Math.max(EDGE, Math.min(mid, innerHeight - EDGE - h)));
    const recentre = () => {
      mid = Math.max(EDGE, (innerHeight - box.offsetHeight) / 2);
      place(box.offsetHeight);
    };
    recentre();
    // die Größe liefert der Beobachter selbst: kein erneutes Messen in jedem Bild, während die Höhe gleitet
    const ro = new ResizeObserver(([e]) => place(e!.borderBoxSize[0]!.blockSize));
    ro.observe(box);
    addEventListener('resize', recentre);
    return () => {
      ro.disconnect();
      removeEventListener('resize', recentre);
    };
  });

  const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type=hidden]):not([hidden]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

  function onkeydown(e: KeyboardEvent) {
    // Nur das oberste Fenster schließt mit Esc und hält den Fokus; darunter liegende bleiben offen (5x). Abgefangen:
    // Svelte baut das Fenster schon vor dem nächsten Listener ab, sonst wäre das darunter nun oberstes und schlösse mit.
    if (!isTopmost(box)) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      if (!onescape?.()) onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return e.preventDefault();
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const inside = box.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="box {size}" class:anchored={anchor} style:margin-top={top === null ? null : `${top}px`} role="dialog" aria-modal="true" aria-label={label} bind:this={box}>
    {@render children()}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); display: flex; align-items: center; justify-content: center; z-index: 3000000; animation: fade-in var(--pop) ease-out; }
  /* Innenrand als Variable: der Kopf (DialogHead) gleicht ihn aus, damit seine Linie bis an den Rand reicht (5v) */
  .box { --box-pad-y: 18px; --box-pad-x: 22px; background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius-win); padding: var(--box-pad-y) var(--box-pad-x); width: min(860px, 94vw); max-height: 90vh; overflow: auto; font-size: 15px; animation: pop-in var(--pop) var(--spring-soft); }
  .box.narrow { width: auto; max-width: 420px; }
  .box.pane { --box-pad-y: 0px; --box-pad-x: 0px; width: min(780px, 94vw); height: min(620px, 85vh); max-height: none; padding: 0; overflow: hidden; display: flex; }
  /* max-height gilt für den Inhalt: Innenrand und Rahmen abziehen, sonst ragt ein hohes Fenster unten hinaus (5v) */
  .box.anchored { align-self: flex-start; max-height: calc(100vh - 24px - 2 * var(--box-pad-y) - 2px); }
  .box.result { --box-pad-y: 0px; --box-pad-x: 0px; width: min(560px, 94vw); padding: 0; overflow: hidden; display: flex; flex-direction: column; }
  /* Drei Arten von Knöpfen (5v, 10.8) in narrow, wide und pane: normal (Tönung und feiner Rand wie „Neu“ im
     Ergebnisfenster), Hauptknopf `.main`, gefährlich `.danger`. Das Ergebnisfenster zeichnet seine selbst, das ×
     (CloseX) ist ausgenommen. :where hält die Stärke wie bisher (0,2,1, 5t Q1), auch beim Überfahren: örtliche Regeln
     der Fenster (Seitenleiste, Wahlflächen) gehen weiter vor */
  .box:where(:not(.result)) :global(button:where(:not(.dialog-close))) { background: var(--menu-item-hover); color: var(--ink); border: 1px solid var(--menu-rule); border-radius: var(--radius-m); padding: 8px 16px; font: inherit; cursor: pointer; transition: scale var(--press) ease-out, background-color 80ms; }
  .box:where(:not(.result)) :global(button:where(:not(.dialog-close):hover:not(:disabled))) { background: var(--menu-confirm); }
  .box:where(:not(.result)) :global(button:disabled) { opacity: 0.45; cursor: not-allowed; }
  .box:where(:not(.result)) :global(button.main) { background: var(--menu-main); border-color: transparent; font-weight: 600; }
  .box:where(:not(.result)) :global(button.main:where(:hover:not(:disabled))) { background: var(--menu-main-hover); }
  .box:where(:not(.result)) :global(button.danger) { background: var(--warn-bg); border-color: transparent; }
  .box :global(select) { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: var(--radius-s); padding: 3px 9px; font: inherit; }
  /* gemeinsame Bausteine der Fenster: Hinweiszeile und Knopfreihe */
  .box :global(.note) { font-size: 13px; opacity: 0.75; }
  .box :global(.problem) { color: var(--reason); }
  .box :global(.buttons) { display: flex; gap: 10px; margin: 8px 0; }
  /* Bausteine für den Inhalt aller Fenster (5y, 10.10), Vorsilbe dialog- wie dialog-head: Reihe am Ende (rechtsbündig,
     `.start` rückt nach links; den Abstand darüber bringt das Element davor mit), Zwischenüberschrift wie in den
     Einstellungen, Textfeld, kleine Knöpfe in Zeilen. Ohne Knöpfe schwach (:where), damit örtliche Regeln der Fenster
     vorgehen; Knöpfe müssen die Knopfregel oben schlagen */
  :where(.box) :global(.dialog-end) { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
  :where(.box) :global(.dialog-end > .start) { margin-right: auto; }
  :where(.box) :global(.dialog-heading) { margin: 18px 0 2px; font-size: 14px; font-weight: 600; opacity: 0.85; }
  :where(.box) :global(.dialog-field) { width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; border-radius: var(--radius-m); border: 1px solid var(--line); background: var(--paper); color: var(--dark-ink); }
  .box :global(.dialog-small) { padding: 5px 12px; }
  /* Wahlflächen (Trumpf wählen, Platz wählen): großer Knopf mit Titel, darunter `.note`; `center` für kurze Wahl
     (Kategorie, Attribut); `.sel` gewählt. Liste darum mit `--cols` Spalten. Nebentext `.dialog-aside` (Anzahl, Zustand) */
  :where(.box) :global(.dialog-choices) { display: grid; grid-template-columns: repeat(var(--cols, 1), 1fr); gap: 10px; margin: 0 0 12px; }
  .box :global(.dialog-choice) { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; padding: 12px 16px; text-align: left; }
  .box :global(.dialog-choice.center) { flex-direction: row; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 0 6px; text-align: center; }
  .box :global(.dialog-choice.sel) { background: var(--selected); color: var(--ink); border-color: var(--selected-rim); }
  :where(.box) :global(.dialog-aside) { font-size: 12px; opacity: 0.7; }
</style>
