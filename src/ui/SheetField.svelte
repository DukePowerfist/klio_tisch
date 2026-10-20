<script lang="ts">
  // Text- oder Zahlenfeld auf dem Bogen. Getippt wird lokal; gesendet ~300 ms nach der letzten Eingabe
  // und beim Verlassen. Solange das Feld den Fokus hat, ersetzen eingehende Änderungen es nicht (8.2).
  import type { SeatId } from '../engine/types';
  import { submitOrSay } from './commands';
  import { fitFontSize } from './fitText';

  let { seat, field, kind, value, x, y, w, h, font, struck = false, center = false, readonly = false }: {
    seat: SeatId; field: string; kind: 'text' | 'number'; value: string; x: number; y: number; w: number; h: number; font: number;
    struck?: boolean; center?: boolean; readonly?: boolean;
  } = $props();

  const SEND_MS = 300;
  let focused = $state(false);
  let draft = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const shown = $derived(focused ? draft : value);
  const size = $derived(kind === 'number' ? font : fitFontSize(shown, w - 6, font));

  async function send() {
    clearTimeout(timer);
    timer = undefined;
    if (draft === value) return;
    const cmd = kind === 'text'
      ? { type: 'sheet.setText', seat, field, value: draft }
      : { type: 'sheet.setNumber', seat, field, value: draft === '' ? null : Number(draft) };
    await submitOrSay(cmd);
  }

  function onInput(e: Event) {
    let v = (e.target as HTMLInputElement).value;
    if (kind === 'number') {
      v = v.replace(/\D/g, '').slice(-1); // eine Ziffer 0–9 oder leer
      (e.target as HTMLInputElement).value = v;
    }
    draft = v;
    clearTimeout(timer);
    timer = setTimeout(send, SEND_MS);
  }
</script>

<input
  class:struck
  class:center
  class:number={kind === 'number'}
  style:left="{x}px"
  style:top="{y}px"
  style:width="{w}px"
  style:height="{h}px"
  style:font-size="{size}px"
  value={shown}
  {readonly}
  spellcheck="false"
  inputmode={kind === 'number' ? 'numeric' : undefined}
  data-field={field}
  onfocus={() => { draft = value; focused = true; }}
  onblur={() => { focused = false; void send(); }}
  oninput={onInput}
  onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
/>

<style>
  input { position: absolute; box-sizing: border-box; background: transparent; border: 0; outline: 0; font: inherit; color: inherit; padding: 0 3px; margin: 0; }
  input:focus { background: rgba(255, 235, 150, 0.5); }
  .center, .number { text-align: center; font-weight: 700; padding: 0; }
  .struck { text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: var(--danger); color: #666; font-style: italic; }
</style>
