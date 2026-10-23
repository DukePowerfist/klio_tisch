<script lang="ts">
  // Trumpf wählen (ARCHITEKTUR.md 14): Weg → Schritte → Kategorie → Trumpf, mit begründet ausgegrauten Karten.
  // Die Schritte kommen aus trump-sources.yaml, ihre Ansichten aus trumpSteps/. Alle Entscheidungen bleiben lokal;
  // erst am Ende geht ein einziger Befehl an den Host (6.2).
  import content from 'virtual:klio-content';
  import type { SeatId } from '../engine/types';
  import { seatNo } from '../engine/zones';
  import { trumpCount, type Choices } from '../rules/klio/blocks';
  import { sheetOf } from '../rules/klio/events';
  import { contextFor, fullReason, isFull } from '../rules/klio/trumps';
  import DialogHead from './DialogHead.svelte';
  import Modal from './Modal.svelte';
  import TrumpCard from './TrumpCard.svelte';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { t, text } from './texts';
  import {
    CATEGORIES, finalCommand, nextStep, selectableByCategory, sourceRows, trumpRows, type DialogStep, type SourcePath, type SourceRow,
  } from './trumpDialog';
  import { STEP_VIEWS } from './trumpSteps';
  import { view } from './view.svelte';

  let { seat }: { seat: SeatId } = $props();

  const cfg = content.trumpSources;
  const sheet = $derived(sheetOf(session.state!, seat));
  const ctx = $derived(contextFor(content, sheet));

  let history = $state<DialogStep[]>([{ at: 'sources' }]);
  const step = $derived(history[history.length - 1]!);
  const rows = $derived(step.at === 'categories' || step.at === 'trumps' ? trumpRows(content, ctx, step.path, step.choices) : []);

  const go = (s: DialogStep) => (history = [...history, s]);
  const back = () => (history = history.slice(0, -1));
  const close = () => (view.trumpDialog = null);

  async function submit(cmd: { type: string }) {
    if (await submitOrSay(cmd)) close();
  }

  /** Weiter nach Schritt `index`: nächster Schritt, Kategorien oder (nur verbessern) gleich abschicken. */
  function advance(path: SourcePath, choices: Choices, index: number) {
    const next = nextStep(path, choices, index, ctx);
    if (next) go(next);
    else void submit(finalCommand(seat, path, choices, undefined));
  }

  const pickSource = (row: SourceRow) => advance({ kind: 'source', source: row.source, improveOnly: row.improveOnly }, {}, 0);

  function free() {
    if (isFull(cfg, sheet)) return view.say(text(fullReason(cfg)), true);
    go({ at: 'categories', path: { kind: 'free' }, choices: {} });
  }

  const title = $derived(
    step.at === 'sources' ? t('trumpDialog.title', { seat: seatNo(seat) })
    : step.at === 'step' ? t(`trumpDialog.steps.${step.name}`)
    : step.at === 'categories' ? t('trumpDialog.chooseAttribute')
    : t('trumpDialog.chooseFromCategory', { category: t(`trumps.categories.${step.category}`) }),
  );
</script>

<Modal label={t('trumpDialog.title', { seat: seatNo(seat) })} onclose={close} anchor>
  <div class="td">
    <DialogHead {title} onclose={close} />

    {#if step.at === 'sources'}
      <p>{t('trumpDialog.count', { n: trumpCount(sheet), max: cfg.maxTrumps })}</p>
      <p><button onclick={() => submit({ type: 'trump.random', seat })}>{t('trumpDialog.random')}</button></p>
      <div class="list">
        {#each sourceRows(content, ctx) as row (row.source.id)}
          <button class="source" disabled={!row.ok} onclick={() => pickSource(row)}>
            <b>{row.source.text.name}</b>
            <span>{row.ok ? row.source.text.desc : text(row.why!)}</span>
          </button>
        {/each}
      </div>
      {#if cfg.freeChoice}
        <p><button onclick={free}>{t('trumpDialog.free')}</button></p>
      {/if}

    {:else if step.at === 'step'}
      {@const View = STEP_VIEWS[step.name]}
      {#key history.length}
        <View {ctx} done={(partial) => advance(step.path, { ...step.choices, ...partial }, step.index + 1)} />
      {/key}
      {#if !step.required}
        <p><button onclick={() => advance(step.path, step.choices, step.index + 1)}>{t('trumpDialog.skipImprove')}</button></p>
      {/if}

    {:else if step.at === 'categories'}
      {@const counts = selectableByCategory(rows)}
      <div class="cats">
        {#each CATEGORIES as c (c)}
          <button disabled={counts[c] === 0} onclick={() => go({ at: 'trumps', path: step.path, choices: step.choices, category: c })}>
            {t(`trumps.categories.${c}`)} <small>{t('trumpDialog.selectable', { n: counts[c] })}</small>
          </button>
        {/each}
      </div>

    {:else}
      <div class="cards">
        {#each rows.filter((r) => r.trump.category === step.category) as row (row.trump.id)}
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
</Modal>

<style>
  .td :global(button.sel) { background: var(--selected); color: var(--ink); border-color: var(--selected-rim); }
  .td :global(.list) { display: grid; gap: 10px; margin: 12px 0; }
  .td :global(.source) { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left; padding: 12px 16px; font-size: 16px; }
  .td :global(.source span) { font-size: 13px; opacity: 0.85; font-weight: 400; }
  .td :global(.attrs) { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
  .td :global(.attrs button) { padding: 14px; font-size: 16px; }
  .td :global(input[type='text']) { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; font-size: 18px; border-radius: var(--radius-m); border: 1px solid var(--line); background: var(--paper); color: var(--dark-ink); }
  .cats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 12px 0; }
  .cats button { padding: 14px; font-size: 16px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; margin: 10px 0; }
  .td .tc { padding: 0; background: none; border: 0; border-radius: var(--menu-radius); text-align: left; }
  .tc:hover:not(:disabled) :global(.tcard) { box-shadow: 0 0 0 3px color-mix(in srgb, var(--pickable) 80%, transparent); }
  .tc.off { opacity: 0.5; }
  .why { font-size: 12px; color: var(--reason); margin-top: 4px; }
</style>
