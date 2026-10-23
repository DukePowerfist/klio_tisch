<script lang="ts">
  // Ergebnis von Expedition bzw. Orakel; öffnet sich bei allen mit dem Ereignis (13.1).
  // Neu würfeln dürfen nur, wer das Recht dazu hat (sonst fehlen die Knöpfe und die Fußzeile).
  // Seit 5t (10.6) im Stil der Einstellungen: Kopf mit ×, feine Linien, Knöpfe im Menüstil, ein Hauptknopf;
  // Kopf und Fußzeile stehen, nur der Inhalt dazwischen scrollt.
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import Modal from './Modal.svelte';
  import { timing } from './animator.svelte';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { cardName, t } from './texts';
  import { view } from './view.svelte';

  let { kind }: { kind: 'expedition' | 'oracle' } = $props();

  const game = $derived(session.state!.game);
  const title = $derived(t(kind === 'expedition' ? 'gm.expeditionShort' : 'gm.oracle'));
  const reroll = $derived(session.can({ type: kind === 'expedition' ? 'gm.expedition' : 'gm.oracle' }));
  const close = () => (view.gmDialog = null);

  // Neu gewürfelte Teile blenden kurz ein (Q4: nicht beim Öffnen, dort läuft schon pop-in; nur bei weiteren Würfen)
  const opened = untrack(() => view.gmRoll?.n ?? 0);
  let body: HTMLDivElement;
  $effect(() => {
    const r = view.gmRoll;
    if (!r || r.n <= opened || r.kind !== kind) return;
    const values = body.querySelectorAll('.value');
    for (const i of r.parts) values[i]?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: timing().pop, easing: 'ease-out' });
  });

  /** Fokus beim Öffnen aufs ×, nur wenn dieses Fenster das oberste ist (Q3); weitere Würfe lassen ihn, wo er ist */
  function focusIfTop(el: HTMLElement) {
    const open = document.querySelectorAll('[aria-modal="true"]');
    if (open[open.length - 1] === el.closest('[aria-modal="true"]')) el.focus();
  }
</script>

<Modal label={title} onclose={close} size="result">
  <header>
    <h2>{title}</h2>
    <!-- wie das × der Einstellungen (bewusst übernommen, 10.6) -->
    <button class="close" {@attach focusIfTop} aria-label={t('gm.close')} title={t('gm.close')} onclick={close}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  </header>
  <div class="body" bind:this={body}>
    {#if kind === 'expedition' && game.expedition}
      {#each content.expedition.expedition as table, i (i)}
        <div class="row">
          <div class="text">
            <span class="prompt">{table.prompt}</span>
            <!-- alle Einträge der Tabelle übereinander, sichtbar nur der gewürfelte: die Zeile ist immer so hoch wie ihr
                 längster Eintrag, das Fenster ändert beim Neuwürfeln nie die Größe (10.6) -->
            <span class="slot">
              {#each table.entries as entry, j (j)}
                {#if j === game.expedition[i]}<span class="value">{entry}</span>{:else}<span class="ghost" aria-hidden="true">{entry}</span>{/if}
              {/each}
            </span>
          </div>
          {#if reroll}
            {@const name = t('gm.rerollRow', { prompt: table.prompt })}
            <button class="menu-item" aria-label={name} title={name} onclick={() => submitOrSay({ type: 'gm.expedition', table: i })}>{t('gm.reroll')}</button>
          {/if}
        </div>
      {/each}
    {:else if kind === 'oracle' && game.oracle}
      <div class="words">
        {#each game.oracle as d, i (i)}
          <div class="word"><span class="card">{cardName(`${d.suit}${d.rank}`)}</span><span class="value">{content.expedition.oracle[d.suit][d.rank]}</span></div>
        {/each}
      </div>
    {/if}
  </div>
  {#if reroll}
    <footer>
      {#if kind === 'expedition'}
        <button class="menu-item menu-main" onclick={() => submitOrSay({ type: 'gm.expedition' })}>{t('gm.rerollAll')}</button>
      {:else}
        <button class="menu-item menu-main" onclick={() => submitOrSay({ type: 'gm.oracle' })}>{t('gm.redraw')}</button>
      {/if}
    </footer>
  {/if}
</Modal>

<style>
  header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 12px 22px; border-bottom: 1px solid var(--pane-rule); }
  h2 { margin: 0; font-size: 17px; font-weight: 600; }
  /* × wie in den Einstellungen */
  header .close { background: none; border: none; border-radius: 8px; padding: 5px; line-height: 0; color: var(--ink); opacity: 0.75; cursor: pointer; }
  header .close:hover { background: var(--button-hover); opacity: 1; }
  .close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 22px; }
  /* Expedition: Zeilen wie in den Einstellungen, Frage gedämpft über dem Ergebnis */
  .row { display: flex; align-items: flex-start; gap: 18px; padding: 10px 0; border-bottom: 1px solid var(--pane-rule); }
  .row:last-child { border-bottom: none; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .prompt { font-size: 13px; opacity: 0.7; }
  .slot { display: grid; }
  .slot > span { grid-area: 1 / 1; font-size: 18px; line-height: 1.35; }
  .ghost { visibility: hidden; }
  /* „Neu“ hebt sich leicht ab, damit man den Knopf erkennt: feiner Rand und leichte Tönung, beim Überfahren etwas mehr */
  /* oben bündig auf Höhe der ersten Zeile des Ergebnisses (Frage 13 px und Abstand darüber) */
  .row .menu-item { flex: none; width: auto; margin-top: 14px; padding: 4px 12px; border-color: var(--menu-rule); background: var(--menu-item-hover); }
  .row .menu-item:hover { background: var(--menu-confirm); }
  /* Orakel: zwei Spalten mit feiner Linie dazwischen */
  .words { display: flex; padding: 18px 0; }
  .word { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 12px; text-align: center; }
  .word + .word { border-left: 1px solid var(--pane-rule); }
  .card { font-size: 13px; opacity: 0.7; }
  .word .value { font-size: 28px; font-weight: 500; line-height: 1.2; overflow-wrap: anywhere; }
  footer { flex: none; display: flex; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid var(--pane-rule); }
  footer .menu-item { width: auto; padding: 5px 16px; }
</style>
