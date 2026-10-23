<script lang="ts">
  // Trumpf wählen (ARCHITEKTUR.md 14): Weg → Schritte → Kategorie → Trumpf, mit begründet ausgegrauten Karten.
  // Die Schritte kommen aus trump-sources.yaml, ihre Ansichten aus trumpSteps/. Alle Entscheidungen bleiben lokal;
  // erst am Ende geht ein einziger Befehl an den Host (6.2).
  // Seit 5y (10.10): Knöpfe in einer Reihe am Ende (`footer`, auch an die Schritte gereicht), Ablehnungen im Fenster.
  import content from 'virtual:klio-content';
  import type { Snippet } from 'svelte';
  import type { SeatId, TextRef } from '../engine/types';
  import { seatNo } from '../engine/zones';
  import { trumpCount, type Choices } from '../rules/klio/blocks';
  import { sheetOf } from '../rules/klio/events';
  import { contextFor, fullReason, isFull } from '../rules/klio/trumps';
  import DialogHead from './DialogHead.svelte';
  import Modal from './Modal.svelte';
  import TrumpCard from './TrumpCard.svelte';
  import { timing } from './animator.svelte';
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
  /** Freie Wahl nur mit Recht, wie die Bedienelemente am Bogen (F2); folgt einer Änderung der Rechte */
  const canFree = $derived(cfg.freeChoice && session.can({ type: 'trump.chooseFree', seat }));

  let history = $state<DialogStep[]>([{ at: 'sources' }]);
  const step = $derived(history[history.length - 1]!);
  const rows = $derived(step.at === 'categories' || step.at === 'trumps' ? trumpRows(content, ctx, step.path, step.choices) : []);
  /** Grund der letzten Ablehnung, im Fenster über der Reihe am Ende (F3); `id` zeigt eine neue Ablehnung an */
  let problem = $state<{ text: string; id: number } | null>(null);

  const go = (s: DialogStep) => ((problem = null), (history = [...history, s]));
  const back = () => ((problem = null), (history = history.slice(0, -1)));
  const close = () => (view.trumpDialog = null);
  const refuse = (why: TextRef) => (problem = { text: text(why), id: (problem?.id ?? 0) + 1 });

  async function submit(cmd: { type: string }) {
    const r = await session.submit(cmd);
    if (r.ok) close();
    else refuse(r.reason);
  }

  /** Neue Ablehnung ins Bild holen: die Reihe am Ende liegt bei langer Trumpfliste weit unten im Bildlauf */
  function reveal(el: HTMLElement) {
    el.scrollIntoView({ block: 'nearest', behavior: timing().shift > 0 ? 'smooth' : 'instant' });
  }

  /** Weiter nach Schritt `index`: nächster Schritt, Kategorien oder (nur verbessern) gleich abschicken. */
  function advance(path: SourcePath, choices: Choices, index: number) {
    const next = nextStep(path, choices, index, ctx);
    if (next) go(next);
    else void submit(finalCommand(seat, path, choices, undefined));
  }

  const pickSource = (row: SourceRow) => advance({ kind: 'source', source: row.source, improveOnly: row.improveOnly }, {}, 0);

  function free() {
    if (isFull(cfg, sheet)) return refuse(fullReason(cfg));
    go({ at: 'categories', path: { kind: 'free' }, choices: {} });
  }

  const title = $derived(
    step.at === 'sources' ? t('trumpDialog.title', { seat: seatNo(seat) })
    : step.at === 'step' ? t(`trumpDialog.steps.${step.name}`)
    : step.at === 'categories' ? t('trumpDialog.chooseAttribute')
    : t('trumpDialog.chooseFromCategory', { category: t(`trumps.categories.${step.category}`) }),
  );
</script>

<!-- Reihe am Ende (F1, F4): links „Zurück“, rechts die Knöpfe des Schritts, ganz rechts sein Hauptknopf (`main`).
     Die Schritte rufen sie dort auf, wo ihr Hauptknopf steht, „Weiter“ bleibt so im Formular. Nur „Weiter“ schickt
     ein Formular ab, alle anderen Knöpfe sind `type="button"`, sonst löste Enter den ersten von ihnen aus. -->
{#snippet footer(main?: Snippet)}
  {#if problem}
    {#key problem.id}<p class="problem" role="alert" {@attach reveal}>{problem.text}</p>{/key}
  {/if}
  <div class="dialog-end">
    {#if history.length > 1}
      <button type="button" class="start" onclick={back}>{t('trumpDialog.back')}</button>
    {/if}
    {#if step.at === 'sources'}
      {#if canFree}<button type="button" onclick={free}>{t('trumpDialog.free')}</button>{/if}
      <button type="button" onclick={() => submit({ type: 'trump.random', seat })}>{t('trumpDialog.random')}</button>
    {:else if step.at === 'step' && !step.required}
      <button type="button" onclick={() => advance(step.path, step.choices, step.index + 1)}>{t('trumpDialog.skipImprove')}</button>
    {/if}
    {@render main?.()}
  </div>
{/snippet}

<Modal label={t('trumpDialog.title', { seat: seatNo(seat) })} onclose={close} anchor>
  <DialogHead {title} onclose={close} />

  {#if step.at === 'sources'}
    <p class="note">{t('trumpDialog.count', { n: trumpCount(sheet), max: cfg.maxTrumps })}</p>
    <div class="dialog-choices">
      {#each sourceRows(content, ctx) as row (row.source.id)}
        <button class="dialog-choice" disabled={!row.ok} onclick={() => pickSource(row)}>
          <b>{row.source.text.name}</b>
          <span class="note">{row.ok ? row.source.text.desc : text(row.why!)}</span>
        </button>
      {/each}
    </div>
    {@render footer()}

  {:else if step.at === 'step'}
    {@const View = STEP_VIEWS[step.name]}
    {#key history.length}
      <View {ctx} done={(partial) => advance(step.path, { ...step.choices, ...partial }, step.index + 1)} end={footer} />
    {/key}

  {:else if step.at === 'categories'}
    {@const counts = selectableByCategory(rows)}
    <div class="dialog-choices" style:--cols="2">
      {#each CATEGORIES as c (c)}
        <button class="dialog-choice center" disabled={counts[c] === 0} onclick={() => go({ at: 'trumps', path: step.path, choices: step.choices, category: c })}>
          {t(`trumps.categories.${c}`)} <span class="dialog-aside">{t('trumpDialog.selectable', { n: counts[c] })}</span>
        </button>
      {/each}
    </div>
    {@render footer()}

  {:else}
    <div class="cards">
      {#each rows.filter((r) => r.trump.category === step.category) as row (row.trump.id)}
        <button class="tc" class:off={!!row.why} disabled={!!row.why} onclick={() => submit(finalCommand(seat, step.path, step.choices, row.trump.id))}>
          <TrumpCard trump={row.trump} size="list" />
          {#if row.why}<div class="why problem">{text(row.why)}</div>{/if}
        </button>
      {/each}
    </div>
    {@render footer()}
  {/if}
</Modal>

<style>
  p { margin: 0 0 12px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; margin: 10px 0 12px; }
  .cards .tc { padding: 0; background: none; border: 0; border-radius: var(--menu-radius); text-align: left; }
  .cards .tc:hover:not(:disabled) :global(.tcard) { box-shadow: 0 0 0 3px color-mix(in srgb, var(--pickable) 80%, transparent); }
  .cards .tc.off { opacity: 0.5; }
  .why { margin-top: 4px; }
</style>
