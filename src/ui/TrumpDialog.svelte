<script lang="ts">
  // Trumpf wählen (ARCHITEKTUR.md 14): Weg → Schritte → Kategorie → Trumpf, mit begründet ausgegrauten Karten.
  // Alle Entscheidungen bleiben lokal; erst am Ende geht ein einziger Befehl an den Host (6.2).
  import content from 'virtual:klio-content';
  import { SEATS, type SeatId } from '../engine/types';
  import { sheetOf } from '../rules/klio/events';
  import { trumpCount, type Attr, type Choices } from '../rules/klio/blocks';
  import TrumpCard from './TrumpCard.svelte';
  import { session } from './session.svelte';
  import { t, text } from './texts';
  import {
    attributeOptions, CATEGORIES, context, finalCommand, isFull, nextStep, selectableCount, sourceRows, stepRequired, trumpRows,
    type Category, type DialogStep, type Path,
  } from './trumpDialog';
  import { view } from './view.svelte';

  let { seat }: { seat: SeatId } = $props();

  const sheet = $derived(sheetOf(session.state!, seat));
  const ctx = $derived(context(content, sheet));
  const n = $derived(SEATS.indexOf(seat) + 1);

  let history = $state<DialogStep[]>([{ at: 'sources' }]);
  const step = $derived(history[history.length - 1]!);
  let lowered = $state<Attr | undefined>();
  let raised = $state<Attr | undefined>();
  let wording = $state('');

  const go = (s: DialogStep) => (history = [...history, s]);
  const back = () => (history = history.slice(0, -1));
  const close = () => (view.trumpDialog = null);

  async function submit(cmd: object) {
    const r = await session.submit(cmd);
    if (r.ok) close();
    else view.say(text(r.reason), true);
  }

  /** Nach einem Schritt weiter: nächster Schritt, Kategorien oder (nur verbessern) gleich abschicken. */
  function after(path: Path & { kind: 'source' }, choices: Choices, index: number) {
    const next = nextStep(path, choices, index, ctx);
    if (next) go(next);
    else void submit(finalCommand(seat, path, choices, undefined));
  }

  function pickSource(row: ReturnType<typeof sourceRows>[number]) {
    const path = { kind: 'source' as const, source: row.source, improveOnly: row.improveOnly };
    after(path, {}, 0);
  }

  function free() {
    if (isFull(content, sheet)) return view.say(t('toast.maxTrumps', { max: content.trumpSources.maxTrumps }), true);
    go({ at: 'categories', path: { kind: 'free' }, choices: {} });
  }

  const romans = ['I', 'II', 'III', 'IV', 'V'];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="box" role="dialog" aria-modal="true" aria-label={t('trumpDialog.title', { seat: n })}>
    <div class="head">
      <b>
        {#if step.at === 'sources'}{t('trumpDialog.title', { seat: n })}
        {:else if step.at === 'chooseWeaknessToRemove'}{t('trumpDialog.removeWeakness')}
        {:else if step.at === 'improveStrength'}{t('trumpDialog.improveStrength')}
        {:else if step.at === 'strengthText'}{t('trumpDialog.newWording')}
        {:else if step.at === 'moveAttributePoint'}{t('trumpDialog.moveAttribute')}
        {:else if step.at === 'categories'}{t('trumpDialog.chooseAttribute')}
        {:else}{t('trumpDialog.chooseFromCategory', { category: t(`trumps.categories.${step.category}`) })}{/if}
      </b>
      <button onclick={close} aria-label="Schließen">{t('trumpDialog.close')}</button>
    </div>

    {#if step.at === 'sources'}
      <p>{t('trumpDialog.count', { n: trumpCount(sheet), max: content.trumpSources.maxTrumps })}</p>
      <p><button onclick={() => submit({ type: 'trump.random', seat })}>{t('trumpDialog.random')}</button></p>
      <div class="list">
        {#each sourceRows(content, ctx) as row (row.source.id)}
          <button class="source" disabled={!row.ok} onclick={() => pickSource(row)}>
            <b>{row.source.text.name}</b>
            <span>{row.ok ? row.source.text.desc : text(row.why!)}</span>
          </button>
        {/each}
      </div>
      {#if content.trumpSources.freeChoice}
        <p class="note"><a href="#free" onclick={(e) => { e.preventDefault(); free(); }}>{t('trumpDialog.free')}</a></p>
      {/if}

    {:else if step.at === 'chooseWeaknessToRemove'}
      <div class="list">
        {#each sheet.weaknesses as w, i (i)}
          {#if w}
            <button class="source" onclick={() => after(step.path, { ...step.choices, removeWeakness: i }, step.index + 1)}><b>{w}</b></button>
          {/if}
        {/each}
      </div>

    {:else if step.at === 'improveStrength'}
      <p>{t('trumpDialog.improveHint')}</p>
      <div class="list">
        {#each sheet.strengths as s, i (i)}
          <button class="source" disabled={s.improved} onclick={() => { wording = s.text; go({ at: 'strengthText', path: step.path, choices: step.choices, index: step.index, strength: i }); }}>
            <b>{romans[i]} · {s.text || t('trumpDialog.empty')}</b>
            <span>{s.improved ? t('trumpDialog.alreadyImproved') : ''}</span>
          </button>
        {/each}
      </div>
      {#if !stepRequired(step.path, 'improveStrength')}
        <p><button onclick={() => after(step.path, step.choices, step.index + 1)}>{t('trumpDialog.skipImprove')}</button></p>
      {/if}

    {:else if step.at === 'strengthText'}
      <p>{t('trumpDialog.newWordingHint', { n: romans[step.strength]! })}</p>
      <!-- svelte-ignore a11y_autofocus -->
      <p><input type="text" maxlength="70" bind:value={wording} autofocus onkeydown={(e) => { if (e.key === 'Enter') after(step.path, { ...step.choices, improveStrength: { index: step.strength, text: wording } }, step.index + 1); }} /></p>
      <p><button onclick={() => after(step.path, { ...step.choices, improveStrength: { index: step.strength, text: wording } }, step.index + 1)}>{t('trumpDialog.next')}</button></p>

    {:else if step.at === 'moveAttributePoint'}
      {@const opts = attributeOptions(ctx, lowered)}
      <p>{t('trumpDialog.lower')}</p>
      <div class="attrs">
        {#each opts as o (o.attr)}
          <button class:sel={lowered === o.attr} disabled={!o.canLower} onclick={() => { lowered = o.attr; if (raised === o.attr) raised = undefined; }}>{t(`attributes.${o.attr}`)} ({o.value})</button>
        {/each}
      </div>
      <p>{t('trumpDialog.raise')}</p>
      <div class="attrs">
        {#each opts as o (o.attr)}
          <button class:sel={raised === o.attr} disabled={!o.canRaise} onclick={() => (raised = o.attr)}>{t(`attributes.${o.attr}`)} ({o.value})</button>
        {/each}
      </div>
      <p><button disabled={!lowered || !raised} onclick={() => after(step.path, { ...step.choices, moveAttribute: { lowered: lowered!, raised: raised! } }, step.index + 1)}>{t('trumpDialog.next')}</button></p>

    {:else if step.at === 'categories'}
      <div class="cats">
        {#each CATEGORIES as c (c)}
          {@const k = selectableCount(content, ctx, step.path, step.choices, c)}
          <button disabled={k === 0} onclick={() => go({ at: 'trumps', path: step.path, choices: step.choices, category: c as Category })}>
            {t(`trumps.categories.${c}`)} <small>{t('trumpDialog.selectable', { n: k })}</small>
          </button>
        {/each}
      </div>

    {:else}
      <div class="cards">
        {#each trumpRows(content, ctx, step.path, step.choices, step.category) as row (row.trump.id)}
          <button class="tc" class:off={!!row.why} disabled={!!row.why} onclick={() => submit(finalCommand(seat, step.path, step.choices, row.trump.id))}>
            <TrumpCard trump={row.trump} size="list" />
            {#if row.why}<div class="why">{text(row.why)}</div>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if history.length > 1}
      <p><button onclick={back}>{t('trumpDialog.back')}</button></p>
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); display: flex; align-items: center; justify-content: center; z-index: 3000000; }
  .box { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; padding: 18px 22px; width: min(860px, 94vw); max-height: 90vh; overflow: auto; font-size: 15px; }
  button { background: #2c5a47; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.sel { background: var(--accent); color: #111; border-color: var(--accent); }
  .head { display: flex; justify-content: space-between; align-items: center; font-size: 18px; margin-bottom: 10px; }
  .list { display: grid; gap: 10px; margin: 12px 0; }
  .source { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left; padding: 12px 16px; font-size: 16px; }
  .source span { font-size: 13px; opacity: 0.85; font-weight: 400; }
  .attrs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
  .attrs button { padding: 14px; font-size: 16px; }
  .cats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 12px 0; }
  .cats button { padding: 14px; font-size: 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; margin: 10px 0; }
  .tc { padding: 0; background: none; border: 0; border-radius: 10px; text-align: left; }
  .tc:hover:not(:disabled) :global(.tcard) { box-shadow: 0 0 0 3px rgba(214, 168, 40, 0.8); }
  .tc.off { opacity: 0.5; }
  .why { font-size: 12px; color: #f0a090; margin-top: 4px; }
  .note { opacity: 0.75; font-size: 13px; }
  .note a { color: #f5d76e; }
  input[type='text'] { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; font-size: 18px; border-radius: 8px; border: 1px solid var(--line); background: #fffdf7; color: #111; }
</style>
