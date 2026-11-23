<script lang="ts">
  // Trumpf wählen (ARCHITEKTUR.md 14, 10.22): Anlass → Schritte → Trumpf (Gruppen als Reiter) → Bestätigen.
  // Die Schritte kommen aus trump-sources.yaml, ihre Ansichten aus trumpSteps/. Alle Entscheidungen bleiben lokal;
  // erst am Ende geht ein einziger Befehl an den Host (6.2).
  // Seit 5y (10.10): Knöpfe in einer Reihe am Ende (`footer`, auch an die Schritte gereicht), Ablehnungen im Fenster.
  import content from 'virtual:klio-content';
  import { tick, type Snippet } from 'svelte';
  import type { SeatId, TextRef } from '../engine/types';
  import { seatNo } from '../engine/zones';
  import type { Choices } from '../rules/klio/blocks';
  import { sheetOf } from '../rules/klio/events';
  import { contextFor, fullReason, isFull } from '../rules/klio/trumps';
  import DialogHead from './DialogHead.svelte';
  import Modal from './Modal.svelte';
  import TrumpCard from './TrumpCard.svelte';
  import { timing } from './animator.svelte';
  import { session } from './session.svelte';
  import { t, text } from './texts';
  import {
    consequences, finalCommand, intro, nextStep, selectableByCategory, sourceRows, tabRows, trail, TRUMP_TABS, trumpRows, type DialogStep, type Path, type SourcePath, type SourceRow, type TrumpTab,
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
  const rows = $derived(step.at === 'trumps' ? trumpRows(content, ctx, step.path, step.choices) : []);
  /** offener Reiter der Trumpfliste; bleibt bei „Zurück“ aus der Bestätigung, beginnt sonst vorn */
  let tab = $state<TrumpTab>('all');
  /** Pfeiltasten wechseln den Reiter, Pos1 und Ende springen an die Ränder; der Fokus geht mit */
  function tabKey(e: KeyboardEvent, c: TrumpTab) {
    const i = TRUMP_TABS.indexOf(c);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TRUMP_TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    tab = TRUMP_TABS[(next + TRUMP_TABS.length) % TRUMP_TABS.length]!;
    const list = (e.currentTarget as HTMLElement).parentElement!;
    void tick().then(() => list.querySelector<HTMLElement>('[aria-selected=true]')?.focus());
  }
  /** Grund der letzten Ablehnung, im Fenster über der Reihe am Ende (F3); `id` zeigt eine neue Ablehnung an */
  let problem = $state<{ text: string; id: number } | null>(null);

  const go = (s: DialogStep) => {
    problem = null;
    if (s.at === 'trumps') tab = 'all';
    history = [...history, s];
  };
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
    else confirm(path, choices, undefined);
  }

  /** Letzte Ansicht vor dem Befehl (5zw): die Karte und was am Bogen geschieht */
  const outcome = (path: Path, choices: Choices, trump: string | undefined) => consequences(content, ctx, path, choices, trump);
  function confirm(path: Path, choices: Choices, trump: (typeof content.trumps)[number] | undefined) {
    go({ at: 'confirm', path, choices, trump, shown: JSON.stringify(outcome(path, choices, trump?.id)) });
  }

  const pickSource = (row: SourceRow) => advance({ kind: 'source', source: row.source, improveOnly: row.improveOnly }, {}, 0);

  function free() {
    if (isFull(cfg, sheet)) return refuse(fullReason(cfg));
    go({ at: 'trumps', path: { kind: 'free' }, choices: {} });
  }

  const title = $derived(
    step.at === 'sources' ? t('trumpDialog.title', { seat: seatNo(seat) })
    : step.at === 'step' ? t(`trumpDialog.steps.${step.name}`)
    : step.at === 'confirm' ? t(step.trump ? 'trumpDialog.confirmTrump' : 'trumpDialog.confirmImprove')
    : t('trumpDialog.chooseTrump'),
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
      {#if canFree}<button type="button" aria-describedby="trump-free-hint" onclick={free}>{t('trumpDialog.free')}</button>{/if}
      <button type="button" aria-describedby="trump-random-hint" onclick={() => submit({ type: 'trump.random', seat })}>{t('trumpDialog.random')}</button>
    {:else if step.at === 'step' && !step.required}
      <button type="button" onclick={() => advance(step.path, step.choices, step.index + 1)}>{t('trumpDialog.skipImprove')}</button>
    {/if}
    {@render main?.()}
  </div>
{/snippet}

<Modal label={t('trumpDialog.title', { seat: seatNo(seat) })} onclose={close} anchor>
  <DialogHead {title} onclose={close} />

  <!-- Wegleiste (5zv, 10.22): welcher Anlass, welche Schritte, was schon gewählt ist; nur Anzeige (F3) -->
  {#if step.at !== 'sources'}
    <ol class="trail" aria-label={t('trumpDialog.trail.label')}>
      {#each trail(step, ctx) as item (item.id)}
        <li class={item.state} data-trail={item.id} aria-current={item.state === 'now' ? 'step' : undefined}>
          {typeof item.label === 'string' ? item.label : text(item.label)}{#if item.value}<span class="dialog-aside">: {typeof item.value === 'string' ? item.value : text(item.value)}</span>{/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if step.at === 'sources'}
    <!-- Einstieg (5zu, 10.22): Einleitung, offene Anlässe zuerst, gesperrte darunter mit Grund und Stand -->
    {@const all = sourceRows(content, ctx)}
    {@const locked = all.filter((r) => !r.ok)}
    <p class="intro">{text(intro(content, ctx))}</p>
    <div class="dialog-choices">
      {#each all.filter((r) => r.ok) as row (row.source.id)}
        <button class="dialog-choice" data-source={row.source.id} onclick={() => pickSource(row)}>
          <b>{row.source.text.name}</b>
          <span class="note">{row.improveOnly ? t('trumpDialog.improveOnly') : row.source.text.desc}</span>
        </button>
      {/each}
    </div>
    {#if locked.length > 0}
      <h3 class="dialog-heading later">{t('trumpDialog.later')}</h3>
      <div class="dialog-choices">
        {#each locked as row (row.source.id)}
          <button class="dialog-choice" data-source={row.source.id} disabled>
            <b>{row.source.text.name}{#if row.progress}<span class="dialog-aside"> · {text(row.progress)}</span>{/if}</b>
            <span class="note">{text(row.why!)}</span>
          </button>
        {/each}
      </div>
    {/if}
    <p class="note hints">
      <span id="trump-random-hint"><b>{t('trumpDialog.random')}:</b> {t('trumpDialog.randomHint')}</span>
      {#if canFree}<span id="trump-free-hint"><b>{t('trumpDialog.free')}:</b> {t('trumpDialog.freeHint')}</span>{/if}
    </p>
    {@render footer()}

  {:else if step.at === 'step'}
    {@const View = STEP_VIEWS[step.name]}
    {#key history.length}
      <View {ctx} improveOnly={step.path.improveOnly} done={(partial) => advance(step.path, { ...step.choices, ...partial }, step.index + 1)} end={footer} />
    {/key}

  {:else if step.at === 'confirm'}
    <!-- Bestätigen (5zw, 10.22): erst hier geht der Befehl hinaus. Die Liste rechnet am aktuellen Bogen. -->
    {@const out = outcome(step.path, step.choices, step.trump?.id)}
    <div class="confirm">
      {#if step.trump}<div class="chosen"><TrumpCard trump={step.trump} size="list" /></div>{/if}
      <div class="after">
        <h3 class="dialog-heading">{t('trumpDialog.afterTitle')}</h3>
        {#if 'lines' in out}
          <ul>{#each out.lines as line, i (i)}<li>{text(line)}</li>{/each}</ul>
          {#if JSON.stringify(out) !== step.shown}<p class="note changed" role="status">{t('trumpDialog.changed')}</p>{/if}
        {:else}
          <p class="problem" role="alert">{text(out.why)}</p>
        {/if}
      </div>
    </div>
    {#snippet take()}
      <button
        type="button" class="main" disabled={'why' in out} {@attach (el) => el.focus()}
        onclick={() => submit(finalCommand(seat, step.path, step.choices, step.trump?.id))}
      >{t(step.trump ? 'trumpDialog.take' : 'trumpDialog.improve')}</button>
    {/snippet}
    {@render footer(take)}

  {:else}
    <!-- Trumpfliste mit Reitern (5zx, 10.22): vorn alle wählbaren, dann je Gruppe ein Reiter mit den wählbaren zuerst -->
    {@const counts = selectableByCategory(rows)}
    {@const total = rows.filter((r) => !r.why).length}
    {@const shown = tabRows(rows, tab)}
    <div class="tabs" role="tablist" aria-label={t('trumpDialog.groups')}>
      {#each TRUMP_TABS as c (c)}
        {@const n = c === 'all' ? total : counts[c]}
        <button
          type="button" role="tab" class="tab" class:none={n === 0} data-tab={c}
          aria-selected={c === tab} aria-controls="trump-panel" tabindex={c === tab ? 0 : -1}
          onclick={() => (tab = c)} onkeydown={(e) => tabKey(e, c)}
        >{#if c !== 'all' && c !== 'X'}<i style:background="var(--attr-{c})"></i>{/if}{c === 'all' ? t('trumpDialog.allSelectable') : t(`trumps.categories.${c}`)}<span class="dialog-aside">{n}</span></button>
      {/each}
    </div>
    <div class="cards" id="trump-panel" role="tabpanel">
      {#each shown.ok as row (row.trump.id)}
        <button class="tc" onclick={() => confirm(step.path, step.choices, row.trump)}>
          <TrumpCard trump={row.trump} size="list" />
        </button>
      {:else}
        <p class="note wide">{t(tab === 'all' ? 'toast.noTrumpLeft' : 'trumpDialog.noneInGroup')}</p>
      {/each}
      {#if shown.off.length > 0}
        <h3 class="dialog-heading wide">{t('trumpDialog.notSelectable')}</h3>
        {#each shown.off as row (row.trump.id)}
          <button class="tc off" disabled>
            <TrumpCard trump={row.trump} size="list" />
            <div class="why problem">{text(row.why!)}</div>
          </button>
        {/each}
      {/if}
    </div>
    {@render footer()}
  {/if}
</Modal>

<style>
  p { margin: 0 0 12px; }
  /* Wegleiste: Glieder mit „›“ getrennt, das aktuelle kräftig, kommende blass; bricht bei schmalem Fenster um */
  .trail { display: flex; flex-wrap: wrap; gap: 2px 0; margin: 0 0 14px; padding: 0; list-style: none; font-size: 13px; }
  .trail li { min-width: 0; overflow-wrap: anywhere; }
  .trail li + li::before { content: '›'; margin: 0 8px; opacity: 0.5; font-weight: 400; }
  .trail .now { font-weight: 700; }
  .trail .todo { opacity: 0.5; }
  .trail .done { opacity: 0.85; }
  /* Bestätigen: Karte links, Folgen rechts; schmal untereinander */
  .confirm { display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: flex-start; margin: 0 0 14px; }
  .chosen { flex: 0 1 250px; min-width: 200px; }
  .after { flex: 1 1 260px; min-width: 0; }
  .after h3 { margin: 0 0 8px; }
  .after ul { margin: 0 0 10px; padding-left: 20px; display: grid; gap: 5px; font-size: 14px; }
  .later { margin: 4px 0 8px; }
  .hints { display: grid; gap: 3px; margin-top: 14px; }
  .dialog-aside { font-weight: 400; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; margin: 10px 0 12px; }
  .cards .tc { padding: 0; background: none; border: 0; border-radius: var(--menu-radius); text-align: left; }
  .cards .tc:hover:not(:disabled) :global(.tcard) { box-shadow: 0 0 0 3px color-mix(in srgb, var(--pickable) 80%, transparent); }
  .cards .tc.off { opacity: 0.5; }
  .cards .wide { grid-column: 1 / -1; margin: 0; }
  .cards h3.wide { margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--pane-rule); }
  /* Reiter: der offene in der Farbe der gewählten Wahlfläche, leere blass; die Linie darunter trägt die Liste */
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 4px; border-bottom: 1px solid var(--pane-rule); }
  .tabs .tab { display: flex; align-items: baseline; gap: 6px; margin-bottom: -1px; padding: 8px 14px; background: none; border: 1px solid transparent; border-bottom: 0; border-radius: var(--menu-radius) var(--menu-radius) 0 0; opacity: 0.75; scale: none; }
  .tabs .tab[aria-selected='true'] { background: var(--selected); border-color: var(--selected-rim); opacity: 1; font-weight: 600; }
  .tabs .tab.none:not([aria-selected='true']) { opacity: 0.4; }
  .tabs .tab i { align-self: center; width: 9px; height: 9px; border-radius: 2px; }
  .why { margin-top: 4px; }
</style>
