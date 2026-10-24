<script lang="ts">
  // Leselage des Expeditionsblatts (Schritt 5zb, ARCHITEKTUR.md 10.12): ein Fenster über Modal.svelte, das Blatt selbst
  // ist der Inhalt, 85 % der Fensterhöhe und bei jedem Zoom gleich groß; voll beleuchtet, der Tisch dahinter abgedunkelt.
  // Jeder öffnet es selbst (F3). Klick aufs Blatt tut nichts außer an den Knöpfen, Klick daneben und Esc schließen.
  // Würfeln nur mit Recht: „Alles neu“ im Kopf, „Neu“ je Abschnitt in der Zeile der Frage. Lange Antworten werden bis
  // 12 TP kleiner (fitBlock, T2). Maße in TP des Bilds über Containereinheiten: 1 TP = 100cqw / Breite des Papiers.
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import Modal from './Modal.svelte';
  import { fade, timing } from './animator.svelte';
  import { submitOrSay } from './commands';
  import { fitBlock } from './fitText';
  import { HAND_FONT, handFont } from './fonts';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  const E = content.layouts.middle.expedition;
  const [px, py, pw, ph] = E.paper;
  const [tx0, tx1] = E.text;
  /** Antworten in 14 TP, Fragen in 11 TP; kleiner nur bis 12 TP (S3) */
  const ANSWER = 14;
  const MIN_ANSWER = 12;
  const image = `${import.meta.env.BASE_URL}assets/sheet/expedition.webp`;
  const size = `width: min(90vw, calc(${E.read * 100}vh * ${pw / ph})); aspect-ratio: ${pw} / ${ph};`;
  /** Länge in TP des Blatts als CSS */
  const tp = (v: number) => `calc(var(--tp) * ${v})`;

  const game = $derived(session.state!.game);
  const tables = content.expedition.expedition;
  const reroll = $derived(session.can({ type: 'gm.expedition' }));
  /** Abschnitt i im Papier: von der Linie darüber bis zur nächsten */
  const rowTop = (i: number) => E.rows[i]! - py;
  const rowHeight = (i: number) => E.rows[i + 1]! - E.rows[i]!;

  let paperEl: HTMLDivElement;
  const rows: HTMLElement[] = [];
  let closing = false;

  /** Fensterfläche (Modal) und Blatt in Ruhe am Bildschirm, für das Gleiten */
  const box = () => paperEl.closest<HTMLElement>('[aria-modal="true"]')!;
  const rest = () => document.querySelector<HTMLElement>('[data-expedition-sheet]');
  function glide(dir: 'in' | 'out'): Promise<void> {
    const ms = timing().sheetGlide;
    const from = rest()?.getBoundingClientRect();
    const el = box();
    if (!ms || !from || from.width === 0) return Promise.resolve();
    const to = el.getBoundingClientRect();
    const away = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    const frames = [{ transform: away }, { transform: 'none' }];
    const a = el.animate(dir === 'in' ? frames : frames.reverse(), { duration: ms, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: dir === 'out' ? 'forwards' : 'none' });
    el.style.transformOrigin = '0 0';
    return a.finished.then(() => undefined, () => undefined);
  }

  async function close() {
    if (closing) return;
    closing = true;
    await glide('out');
    view.expeditionOpen = false;
    rest()?.focus({ preventScroll: true });
  }

  /** Antworten einpassen, sobald die Schrift geladen ist und wenn sich das Ergebnis ändert */
  function fitAll() {
    for (const el of rows) if (el) fitBlock(el, (k) => el.style.setProperty('--k', String(k)), MIN_ANSWER / ANSWER);
  }
  $effect(() => {
    void game.expedition;
    void handFont().then(() => requestAnimationFrame(fitAll));
  });

  $effect(() => {
    paperEl.focus({ preventScroll: true });
    void glide('in');
  });

  // Neu gewürfelte Zeilen blenden kurz ein (wie bisher im Ergebnisfenster, 5t); nicht beim Öffnen
  const opened = untrack(() => view.gmRoll);
  $effect(() => {
    const r = view.gmRoll;
    if (!r || r === opened || r.kind !== 'expedition') return;
    for (const i of r.parts) {
      const v = rows[i]?.querySelector<HTMLElement>('.value');
      if (v) fade(v, timing().pop);
    }
  });
</script>

<Modal label={t('gm.expeditionShort')} onclose={close} size="sheet" style={size}>
  <div class="paper" tabindex="-1" bind:this={paperEl} style:font-family={HAND_FONT} style:--tp="calc(100cqw / {pw})" data-expedition-reader>
    <img class="bg" src={image} alt="" draggable="false"
      style:left={tp(-px)} style:top={tp(-py)} style:width={tp(E.size[0])} style:height={tp(E.size[1])} />
    {#if reroll}
      <button class="all" style:left={tp(141)} style:top={tp(18)} style:font-size={tp(12)} onclick={() => submitOrSay({ type: 'gm.expedition' })}>{t('gm.rerollAll')}</button>
    {/if}
    {#each tables as table, i (i)}
      <section class="row" bind:this={rows[i]} style:left={tp(tx0 - px)} style:width={tp(tx1 - tx0)} style:top={tp(rowTop(i))} style:height={tp(rowHeight(i))}>
        <div class="q">
          <span class="prompt" style:font-size={tp(11)}>{table.prompt}</span>
          {#if reroll}
            {@const name = t('gm.rerollRow', { prompt: table.prompt })}
            <button class="one" style:font-size={tp(10)} aria-label={name} title={name} onclick={() => submitOrSay({ type: 'gm.expedition', table: i })}>{t('gm.reroll')}</button>
          {/if}
        </div>
        {#if game.expedition}
          <p class="value" style:font-size="calc(var(--tp) * {ANSWER} * var(--k, 1))">{table.entries[game.expedition[i]!]}</p>
        {/if}
      </section>
    {/each}
  </div>
</Modal>

<style>
  .paper { position: absolute; inset: 0; color: var(--sheet-ink); user-select: text; outline: none; filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.55)); }
  .paper:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
  .bg { position: absolute; max-width: none; pointer-events: none; user-select: none; }
  .row { position: absolute; box-sizing: border-box; padding: calc(var(--tp) * 3) 0 calc(var(--tp) * 2); overflow: hidden; display: flex; flex-direction: column; }
  .q { display: flex; align-items: baseline; gap: calc(var(--tp) * 6); }
  .prompt { flex: 1; min-width: 0; opacity: 0.7; line-height: 1.2; }
  .value { margin: calc(var(--tp) * 1) 0 0; line-height: 1.22; overflow-wrap: break-word; }
  /* Knöpfe auf Papier: Tinte, feiner Rand, kein Menüstil */
  button { position: relative; flex: none; font: inherit; color: var(--sheet-ink); background: rgba(255, 255, 255, 0.45); border: 1px solid rgba(0, 0, 0, 0.35);
    border-radius: calc(var(--tp) * 4); padding: calc(var(--tp) * 0.5) calc(var(--tp) * 6); line-height: 1.2; cursor: pointer; transition: scale var(--press) ease-out, background-color 80ms; }
  button:hover { background: rgba(255, 255, 255, 0.8); }
  button:active { scale: var(--press-scale); }
  .all { position: absolute; }
</style>
