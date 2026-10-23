<script lang="ts">
  // Text- oder Zahlenfeld auf dem Bogen. Getippt wird lokal; gesendet ~300 ms nach der letzten Eingabe
  // und beim Verlassen. Solange das Feld den Fokus hat, ersetzen eingehende Änderungen es nicht (8.2).
  // Passt ein Text auch klein nicht hinein, steht rechts „…“ und öffnet das Feldfenster (5z, 10.11).
  // Tasten (5z): Enter springt ins nächste Feld derselben Gruppe (Umschalt+Enter zurück), am Ende der Gruppe und mit
  // Esc verlässt man das Feld; Pfeil hoch/runter zählt an Attributen 0 bis 9.
  import type { SeatId } from '../engine/types';
  import { SHEET_TEXT_MAX } from '../rules/klio/fields';
  import { submitOrSay } from './commands';
  import { effects } from './effects.svelte';
  import { shouldSend } from './fieldSend';
  import { fitText } from './fitText';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { seat, field, kind, value, x, y, w, h, font, struck = false, center = false, readonly = false }: {
    seat: SeatId; field: string; kind: 'text' | 'number'; value: string; x: number; y: number; w: number; h: number; font: number;
    struck?: boolean; center?: boolean; readonly?: boolean;
  } = $props();

  const SEND_MS = 300;
  let focused = $state(false);
  let draft = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const shown = $derived(focused ? draft : value);
  /** Breite des Knopfs „…“ in Bildpunkten */
  const MORE = Math.round(h * 0.75);
  const fit = $derived(kind === 'number' ? { size: font, cut: false } : fitText(shown, w - 6, font));
  /** Text, bei dem das Feld selbst überläuft: Die Messung oben kennt die tatsächlich gezeichnete Schrift nicht genau */
  let overflowFor = $state<string | null>(null);
  /** abgeschnitten und nicht in Bearbeitung: „…“ zeigen, der Text rückt dafür zusammen */
  const more = $derived(!focused && (fit.cut || overflowFor === shown));
  const size = $derived(more ? fitText(shown, w - 6 - MORE, font).size : fit.size);
  let el: HTMLInputElement;
  // erst ohne „…“ messen; einmal übergelaufen, bleibt es für diesen Text dabei (sonst schaltete es hin und her)
  $effect(() => {
    const text = shown;
    void size;
    if (focused || more || kind === 'number') return;
    if (el.scrollWidth > el.clientWidth + 1) overflowFor = text;
  });

  /** zuletzt gesendet, solange der Stand sich seitdem nicht geändert hat: Enter kurz nach dem Senden schickt es nicht
   *  noch einmal (5x). Wer zurückkommt, bevor der Stand da ist, schreibt hier weiter, nicht im alten Stand (5z: sonst
   *  sendete das nächste Verlassen den alten Text zurück, etwa nach Enter und gleich Umschalt+Enter) */
  let lastSent: string | null = null;
  $effect(() => {
    void value;
    lastSent = null;
  });

  async function send() {
    clearTimeout(timer);
    timer = undefined;
    if (!shouldSend(draft, value, lastSent)) return;
    const sent = (lastSent = draft);
    const cmd = kind === 'text'
      ? { type: 'sheet.setText', seat, field, value: sent }
      : { type: 'sheet.setNumber', seat, field, value: sent === '' ? null : Number(sent) };
    if (!(await submitOrSay(cmd)) && lastSent === sent) lastSent = null;
  }

  /** neuer Entwurf, gesendet ~300 ms nach der letzten Änderung */
  function change(v: string) {
    draft = v;
    clearTimeout(timer);
    timer = setTimeout(send, SEND_MS);
  }

  function onInput(e: Event) {
    let v = (e.target as HTMLInputElement).value;
    if (kind === 'number') {
      v = v.replace(/\D/g, '').slice(-1); // eine Ziffer 0–9 oder leer
      (e.target as HTMLInputElement).value = v;
    }
    change(v);
  }

  /** Gruppe: Name ohne die letzte Stelle (`strengths.text.2` → `strengths.text`, `attributes.K` → `attributes`) */
  const group = field.includes('.') ? field.slice(0, field.lastIndexOf('.') + 1) : null;
  /** Nachbarfeld derselben Gruppe auf diesem Bogen, in der Reihenfolge der Seite; null am Ende oder ohne Gruppe */
  function neighbour(step: 1 | -1): HTMLInputElement | null {
    if (!group) return null;
    const all = [...el.closest('.paper')!.querySelectorAll<HTMLInputElement>('input[data-field]')].filter((i) => i.dataset.field!.startsWith(group) && !i.dataset.field!.slice(group.length).includes('.'));
    return all[all.indexOf(el) + step] ?? null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = neighbour(e.shiftKey ? -1 : 1);
      if (next) next.focus(); // der Fokuswechsel sendet (blur)
      else el.blur();
    } else if (e.key === 'Escape') {
      el.blur();
    } else if (kind === 'number' && !readonly && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const n = draft === '' ? 0 : Number(draft);
      change(String(Math.min(9, Math.max(0, n + (e.key === 'ArrowUp' ? 1 : -1)))));
    }
  }
</script>

<input
  bind:this={el}
  class:struck
  class:center
  class:number={kind === 'number'}
  class:overwritten={effects.overwritten.has(`${seat}/${field}`)}
  style:left="{x}px"
  style:top="{y}px"
  style:width="{w}px"
  style:height="{h}px"
  style:font-size="{size}px"
  style:padding-right={more ? `${3 + MORE}px` : undefined}
  value={shown}
  {readonly}
  maxlength={kind === 'text' ? SHEET_TEXT_MAX : undefined}
  spellcheck="false"
  inputmode={kind === 'number' ? 'numeric' : undefined}
  data-field={field}
  onfocus={() => { draft = lastSent ?? value; focused = true; }}
  onblur={() => { focused = false; el.scrollLeft = 0; void send(); }}
  oninput={onInput}
  onkeydown={onKeydown}
/>
{#if more}
  <button
    class="more"
    data-more={field}
    title={t('sheet.more')}
    aria-label={t('sheet.more')}
    style:left="{x + w - MORE}px"
    style:top="{y}px"
    style:width="{MORE}px"
    style:height="{h}px"
    style:font-size="{font}px"
    onclick={() => (view.fieldDialog = { seat, field })}
  >…</button>
{/if}

<style>
  input { position: absolute; box-sizing: border-box; background: transparent; border: 0; outline: 0; font: inherit; color: inherit; padding: 0 3px; margin: 0; }
  /* Gelb nur, wo man schreiben darf (5z); schreibgeschützt ein feiner Rahmen innen (ragt nicht über Nachbarfelder).
     Chrome zählt bei Textfeldern auch den Mausfokus als :focus-visible, der Rahmen erscheint also bei jedem Fokus */
  input:focus:not([readonly]) { background: var(--sheet-focus); }
  input[readonly]:focus-visible { outline: 1px dashed var(--sheet-label); outline-offset: -1px; }
  .overwritten { background: var(--sheet-overwritten); transition: background 0.6s; }
  .center, .number { text-align: center; font-weight: 700; padding: 0; }
  .more { position: absolute; box-sizing: border-box; padding: 0 0 0.3em; border: 0; background: transparent; font: inherit; line-height: 1; color: var(--sheet-label); opacity: 0.75; cursor: pointer; display: flex; align-items: flex-end; justify-content: center; }
  .more:hover { opacity: 1; }
  .struck { text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: var(--danger); color: var(--sheet-struck); font-style: italic; }
</style>
