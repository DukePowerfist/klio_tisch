<script lang="ts">
  // Ergebnis von Expedition bzw. Orakel; öffnet sich bei allen mit dem Ereignis (13.1).
  // Neu würfeln dürfen nur, wer das Recht dazu hat (sonst fehlen die Knöpfe, im Kopf bleibt nur das ×).
  // Seit 5t (10.6) im Stil der Einstellungen: Kopf mit Hauptknopf und ×, feine Linien, Knöpfe im Menüstil. Das Fenster
  // öffnet mittig, danach bleibt die Oberkante fest (Modal, Größe result); die Höhe gleitet nur nach unten, und nur
  // der Inhalt unter dem Kopf scrollt, falls es gar nicht passt.
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import Modal, { isTopmost } from './Modal.svelte';
  import { fade, timing } from './animator.svelte';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { cardName, t } from './texts';
  import { view } from './view.svelte';

  let { kind }: { kind: 'expedition' | 'oracle' } = $props();

  const game = $derived(session.state!.game);
  const expedition = $derived(kind === 'expedition');
  const title = $derived(t(expedition ? 'gm.expeditionShort' : 'gm.oracle'));
  /** Befehl für alles neu; einzelne Zeilen würfelt `gm.expedition` mit `table` */
  const cmd = $derived(expedition ? 'gm.expedition' : 'gm.oracle');
  const reroll = $derived(session.can({ type: cmd }));
  const close = () => (view.gmDialog = null);

  // Neu gewürfelte Teile blenden kurz ein (Q4: nicht beim Öffnen, dort läuft schon pop-in; nur bei weiteren Würfen)
  const opened = untrack(() => view.gmRoll);
  let body: HTMLDivElement;
  $effect(() => {
    const r = view.gmRoll;
    if (!r || r === opened || r.kind !== kind) return;
    const values = body.querySelectorAll<HTMLElement>('.value');
    for (const i of r.parts) if (values[i]) fade(values[i], timing().pop);
  });

  /** Ändert sich die Höhe des Inhalts, gleitet sie mit --shift statt zu springen (10.6); währenddessen ohne Bildlauf,
   *  sonst blitzte beim Wachsen kurz die Scrollbar auf (der Inhalt ist schon groß, die Fläche noch klein) */
  function glide(inner: HTMLElement) {
    let last = 0;
    const ro = new ResizeObserver(() => {
      // Höhe des Inhalts selbst, nicht der (vielleicht gerade gleitenden) Fläche darum
      const now = inner.getBoundingClientRect().height;
      const ms = timing().shift;
      if (last > 0 && Math.abs(now - last) > 0.5 && ms > 0) {
        body.style.overflow = 'hidden';
        const a = body.animate([{ height: `${last}px` }, { height: `${now}px` }], { duration: ms, easing: timing().shiftEase });
        const done = () => {
          if (!body.getAnimations().length) body.style.overflow = '';
        };
        a.onfinish = a.oncancel = done;
      }
      last = now;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }

  /** Fokus beim Öffnen aufs ×, nur wenn dieses Fenster das oberste ist (Q3); weitere Würfe lassen ihn, wo er ist */
  function focusIfTop(el: HTMLElement) {
    const box = el.closest('[aria-modal="true"]');
    if (box && isTopmost(box)) el.focus();
  }
</script>

<Modal label={title} onclose={close} size="result" anchor>
  <header>
    <h2>{title}</h2>
    {#if reroll}
      <button class="menu-item menu-main" onclick={() => submitOrSay({ type: cmd })}>{t(expedition ? 'gm.rerollAll' : 'gm.redraw')}</button>
      <span class="sep" aria-hidden="true"></span>
    {/if}
    <!-- wie das × der Einstellungen (bewusst übernommen, 10.6) -->
    <button class="close" {@attach focusIfTop} aria-label={t('gm.close')} title={t('gm.close')} onclick={close}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  </header>
  <div class="body" bind:this={body}>
    <div {@attach glide}>
      {#if expedition && game.expedition}
        {#each content.expedition.expedition as table, i (i)}
          <div class="row">
            <div class="text">
              <span class="prompt">{table.prompt}</span>
              <span class="value">{table.entries[game.expedition[i]!]}</span>
            </div>
            {#if reroll}
              {@const name = t('gm.rerollRow', { prompt: table.prompt })}
              <button class="menu-item" aria-label={name} title={name} onclick={() => submitOrSay({ type: 'gm.expedition', table: i })}>{t('gm.reroll')}</button>
            {/if}
          </div>
        {/each}
      {:else if !expedition && game.oracle}
        <div class="words">
          {#each game.oracle as d, i (i)}
            <div class="word"><span class="card">{cardName(`${d.suit}${d.rank}`)}</span><span class="value">{content.expedition.oracle[d.suit][d.rank]}</span></div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Modal>

<style>
  header { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 16px 12px 22px; border-bottom: 1px solid var(--pane-rule); }
  h2 { flex: 1; margin: 0; font-size: 17px; font-weight: 600; }
  header .menu-item { width: auto; padding: 5px 16px; }
  /* feine Linie zwischen Hauptknopf und ×, damit man nicht schließt statt würfelt */
  .sep { align-self: stretch; margin: 4px 2px; border-left: 1px solid var(--pane-rule); }
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
  .row .value { font-size: 18px; line-height: 1.35; }
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
</style>
