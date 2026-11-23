<script lang="ts">
  // Zähler für das Kartenbudget (Schritt 6a) links neben dem Deck: eine Scheibe mit der Zahl der Karten, die die
  // handelnde Person noch vom Deck ziehen darf. Jede Aktion beginnt bei 0 (noch nicht eingestellt), man zählt hoch.
  // Grau = aus; ein Klick schaltet ein (Spieler für sich, die SL wählt die
  // Person) und wieder aus. ▲/▼, Mausrad und Pfeiltasten ändern das Budget jederzeit. Darunter der Name der handelnden
  // Person in ihrer Farbe; die SL wechselt sie mit einem Klick darauf. Ist das Deck gesperrt, wird die Zahl rot und der
  // Tooltip nennt den Grund. Links die Schalter V (Vorteil) und N (Nachteil); wer nicht ändern darf, sieht nur die
  // gesetzten. Zählen und Sperren macht das Regelwerk (src/rules/klio/budget.ts).
  import { SEATS, type SeatId } from '../engine/types';
  import { seatVisible } from '../engine/zones';
  import { budgetUnset, DECK } from '../rules/klio/budget';
  import { BUDGET_MAX } from '../rules/klio/state';
  import { submitOrSay as submit } from './commands';
  import { whoColor } from './colors';
  import { clamp, type Rect } from './layout';
  import { seatNames } from './seatNames';
  import { session } from './session.svelte';
  import { t, text } from './texts';

  let { at }: { at: Rect } = $props();

  const table = $derived(session.state!);
  const b = $derived(table.game.budget);
  const actor = $derived(session.actor);
  const gm = $derived(actor.role === 'gm');
  /** eigener Platz (Spieler), sonst null */
  const own = $derived(session.ownSeat);
  const mayStart = $derived(gm || (own !== null && session.can({ type: 'budget.start', seat: own })));
  const mayEdit = $derived(b.active && session.can({ type: 'budget.set' }));
  /** noch nicht eingestellt: neutral statt rot, das Deck ist trotzdem gesperrt */
  const unset = $derived(b.active && budgetUnset(b));
  const blocked = $derived(b.active && !unset ? session.blocked({ type: 'zone.draw', zone: DECK }) : null);
  const who = $derived(b.seat ? seatNames(table, b.seat) : null);
  const seats = $derived(SEATS.filter((s) => seatVisible(s, table)));

  /** Auswahl der handelnden Person (nur SL): beim Einschalten oder zum Wechseln */
  let choosing = $state<'start' | 'change' | null>(null);

  const title = $derived.by(() => {
    if (!b.active) return t(mayStart ? 'budget.startHint' : 'budget.off');
    const parts = [t('budget.left', { n: b.left, who: who?.label ?? '' })];
    if (b.advantage && b.disadvantage) parts.push(t('budget.both'));
    else if (b.advantage) parts.push(t('budget.advantageOn'));
    else if (b.disadvantage) parts.push(t('budget.disadvantageOn'));
    if (unset) parts.push(t('budget.unsetHint'));
    else if (blocked) parts.push(text(blocked));
    if (mayEdit) parts.push(t('budget.editHint'));
    return parts.join('\n');
  });

  function toggle() {
    if (b.active) {
      if (mayEdit) void submit({ type: 'budget.stop' });
      return;
    }
    if (gm) choosing = choosing ? null : 'start';
    else if (own && mayStart) void submit({ type: 'budget.start', seat: own });
  }

  function choose(seat: SeatId) {
    const mode = choosing;
    choosing = null;
    void submit(mode === 'start' ? { type: 'budget.start', seat } : { type: 'budget.set', seat });
  }

  function step(d: number) {
    if (!mayEdit) return;
    const left = clamp(b.left + d, 0, BUDGET_MAX);
    if (left !== b.left) void submit({ type: 'budget.set', left });
  }

  function flip(key: 'advantage' | 'disadvantage') {
    if (mayEdit) void submit({ type: 'budget.set', [key]: !b[key] });
  }

  function onWheel(e: WheelEvent) {
    // der Tisch zoomt sonst mit
    e.stopPropagation();
    if (!mayEdit) return;
    e.preventDefault();
    step(e.deltaY < 0 ? 1 : -1);
  }

  function onKey(e: KeyboardEvent) {
    if (!b.active) return;
    if (e.key === 'ArrowUp' || e.key === '+') step(1);
    else if (e.key === 'ArrowDown' || e.key === '-') step(-1);
    else return;
    e.preventDefault();
  }
</script>

<div class="budget control" data-budget data-budget-active={b.active} style:left="{at.x}px" style:top="{at.y}px" style:width="{at.w}px" style:height="{at.h}px" style:--who={b.seat ? whoColor(b.seat) : undefined} onwheel={onWheel}>
  {#if mayEdit}
    <button class="arrow up" aria-label={t('budget.up')} title={t('budget.up')} disabled={b.left >= BUDGET_MAX} onclick={() => step(1)}><i></i></button>
  {/if}
  <button
    class="disc"
    class:on={b.active}
    class:blocked={!!blocked}
    class:unset
    {title}
    aria-label={title}
    aria-pressed={b.active}
    disabled={b.active ? !mayEdit : !mayStart}
    onclick={toggle}
    onkeydown={onKey}
    data-budget-left={b.active ? b.left : undefined}
  >{b.active ? b.left : '–'}</button>
  {#if mayEdit}
    <button class="arrow down" aria-label={t('budget.down')} title={t('budget.down')} disabled={b.left <= 0} onclick={() => step(-1)}><i></i></button>
  {/if}
  {#if b.active}
    {#each [['advantage', 'V'], ['disadvantage', 'N']] as const as [key, letter] (key)}
      {#if mayEdit || b[key]}
        <button class="mod {key}" class:set={b[key]} class:void={b.advantage && b.disadvantage} title={t(`budget.${key}Title`)} aria-label={t(`budget.${key}Title`)}
          aria-pressed={b[key]} disabled={!mayEdit} onclick={() => flip(key)} data-budget-mod={key}>{letter}</button>
      {/if}
    {/each}
  {/if}
  {#if b.active && who}
    {#if gm}
      <button class="who" title={t('budget.changeSeat')} onclick={() => (choosing = choosing ? null : 'change')} data-budget-who>{who.plate}</button>
    {:else}
      <span class="who" data-budget-who>{who.plate}</span>
    {/if}
  {/if}
  {#if choosing}
    <div class="choose" role="menu" aria-label={t('budget.chooseSeat')} data-budget-choose>
      <div class="head">{t('budget.chooseSeat')}</div>
      {#each seats as s (s)}
        <button role="menuitem" class:current={b.active && b.seat === s} style:--c={whoColor(s)} onclick={() => choose(s)}>{seatNames(table, s).plate}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* über den Zonen und liegenden Karten, unter gezogenen Karten (400000 + z) und dem Licht */
  .budget { position: absolute; z-index: 300000; transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease); }
  .budget button { font: inherit; cursor: pointer; }
  .budget button:disabled { cursor: default; }
  .disc { position: absolute; inset: 0; border-radius: 50%; padding: 0; border: 2px solid color-mix(in srgb, var(--felt-print) 45%, transparent); background: rgba(0, 0, 0, 0.18);
    color: color-mix(in srgb, var(--felt-print) 45%, transparent); font-size: 24px; font-weight: 700; font-family: Georgia, serif; line-height: 1; box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4); }
  .disc:not(:disabled):not(.on):hover { color: var(--felt-print); border-color: var(--felt-print); }
  .disc.on { border: 3px solid var(--who, var(--felt-print)); background: rgba(0, 0, 0, 0.35); color: var(--felt-print); font-size: 28px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5), inset 0 1px 3px rgba(0, 0, 0, 0.4); }
  .disc.blocked { color: #e8735a; }
  /* noch nicht eingestellt: Zahl blass, der Pfeil nach oben lädt zum Hochzählen ein */
  .disc.unset { color: color-mix(in srgb, var(--felt-print) 55%, transparent); }
  .arrow { position: absolute; left: 50%; translate: -50% 0; display: grid; place-items: center; width: 34px; height: 17px; padding: 0; border: 0; background: none; opacity: 0.8; }
  /* Dreieck statt Zeichen: in der Tischschrift sind ▲/▼ zu klein */
  .arrow i { width: 16px; height: 9px; background: var(--felt-print); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .arrow.down i { clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .arrow:not(:disabled):hover { opacity: 1; }
  .arrow:disabled { opacity: 0.25; }
  .arrow.up { bottom: 100%; margin-bottom: 1px; }
  .arrow.down { top: 100%; margin-top: 1px; }
  /* Vorteil oben links, Nachteil unten links neben der Scheibe; gesetzt: gefüllt (V grün, N rot), beide: blass */
  .mod { position: absolute; right: 100%; margin-right: 6px; width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--felt-print) 45%, transparent);
    background: rgba(0, 0, 0, 0.2); color: color-mix(in srgb, var(--felt-print) 55%, transparent); font-size: 12px !important; font-weight: 700; line-height: 1; }
  .mod.advantage { top: -3px; }
  .mod.disadvantage { bottom: -3px; }
  .mod:not(:disabled):hover { color: var(--felt-print); border-color: var(--felt-print); }
  .mod.set { color: #fff; border-color: transparent; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
  .mod.advantage.set { background: #4f9a5b; }
  .mod.disadvantage.set { background: #c0503a; }
  .mod.set.void { opacity: 0.55; }
  .who { position: absolute; left: 50%; top: 100%; translate: -50% 0; margin-top: 19px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 7px; border: 0;
    border-radius: var(--radius-pill); background: var(--who); color: #1b1b1b; font-size: 11px; font-weight: 600; line-height: 15px; }
  .choose { position: absolute; left: 100%; top: 50%; translate: 8px -50%; display: flex; flex-direction: column; gap: 3px; min-width: 110px; padding: 6px; border-radius: var(--radius-m);
    background: var(--menu-bg); box-shadow: 0 0 0 1px var(--menu-rim), var(--menu-shadow); }
  .choose .head { font-size: 11px; color: var(--menu-count); padding: 0 4px 2px; }
  .choose button { text-align: left; padding: 3px 8px 3px 6px; border: 0; border-left: 4px solid var(--c); border-radius: var(--radius-s); background: none; color: var(--menu-head); font-size: 12px; }
  .choose button:hover, .choose button.current { background: var(--menu-item-hover); }
</style>
