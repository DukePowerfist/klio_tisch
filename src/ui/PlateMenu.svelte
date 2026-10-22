<script lang="ts" module>
  // Menü am Namensschild (ARCHITEKTUR.md 10.1, Schritt 5j): Aktionen zu diesem Platz und diesem Bogen.
  // Welche Einträge es gibt, sagt plateMenu.ts; was sie tun, kommt aus seatActions.ts, sheetActions.ts und confirm.svelte.ts.
  import type { SeatId } from '../engine/types';
  import { plateEntries, type PlateEntry } from './plateMenu';
  import { sheetOf } from '../rules/klio/events';
  import { effects } from './effects.svelte';
  import { assignable, moveTargets } from './seatActions';
  import { session } from './session.svelte';
  import { view } from './view.svelte';

  /** Einträge an diesem Platz für den aktuellen Nutzer; leer = das Schild ist kein Knopf */
  export function entriesAt(seat: SeatId): PlateEntry[][] {
    const table = session.state;
    if (!table) return [];
    return plateEntries({
      can: (type) => session.can({ type, seat }),
      occupied: table.seats[seat].occupied,
      dead: effects.shownDead(seat, sheetOf(table, seat)),
      online: session.mode !== 'local',
      host: session.mode === 'host',
      inRoleView: view.role === seat,
      moveTargets: moveTargets(table, seat).length,
      watchers: assignable(table, session.online, seat).length,
    });
  }
</script>

<script lang="ts">
  import content from 'virtual:klio-content';
  import { rollOverwrites } from '../rules/klio/generators/rollSheet';
  import { emptySheet } from '../rules/klio/state';
  import { seatNo } from '../engine/zones';
  import { assignOrSay, submitOrSay } from './commands';
  import { Confirm } from './confirm.svelte';
  import { exportCharacter, importCharacter, pickPhoto } from './sheetActions';
  import { t } from './texts';

  let { seat }: { seat: SeatId } = $props();

  const table = $derived(session.state!);
  const groups = $derived(entriesAt(seat));
  const occupied = $derived(table.seats[seat].occupied);
  const rollConfirm = new Confirm();
  const resetConfirm = new Confirm();
  const importConfirm = new Confirm();
  /** aufgeklappte Auswahl (Umsetzen, Zuweisen) */
  let expanded = $state<'move' | 'assign' | null>(null);
  let root = $state<HTMLElement>();
  /** Lage beim Öffnen (das Menü schließt, sobald sich die Ansicht ändert) */
  const at = { ...view.plateMenu! };
  let top = $state(at.y);

  const close = () => (view.plateMenu = null);
  /** ausführen und schließen; erst ausführen, denn nach dem Schließen liest `seat` schon den leeren Stand von außen */
  const run = (action: () => unknown) => () => {
    void action();
    close();
  };

  function roll() {
    if (rollConfirm.click(rollOverwrites(content, sheetOf(table, seat)))) run(() => submitOrSay({ type: 'sheet.roll', seat }))();
  }
  const isEmpty = () => JSON.stringify(sheetOf(table, seat)) === JSON.stringify(emptySheet());
  function reset() {
    if (resetConfirm.click(!isEmpty())) run(() => submitOrSay({ type: 'sheet.reset', seat }))();
  }
  // Laden ersetzt den Bogen: bei Einträgen erst nachfragen, dann die Datei wählen
  function load() {
    if (importConfirm.click(!isEmpty())) run(() => importCharacter(seat))();
  }
  const assign = (peer: string) => assignOrSay(peer, seat);

  // passt es nicht unter das Schild, steht das Menü darüber
  $effect(() => {
    const h = root?.offsetHeight ?? 0;
    top = at.y + h > innerHeight - 8 && at.above - h > 8 ? at.above - h : at.y;
  });

  // Ansicht gewechselt, gezoomt oder verschoben: Das Schild ist woanders, das Menü schließt
  const where = `${view.role}|${view.zoom}|${view.ox}|${view.oy}`;
  $effect(() => {
    if (`${view.role}|${view.zoom}|${view.ox}|${view.oy}` !== where) close();
  });
  // Ohne Einträge (z. B. Recht entzogen) gibt es nichts zu zeigen
  $effect(() => {
    if (groups.length === 0) close();
  });

  function outside(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (root?.contains(target) || target.closest(`[data-plate="${seat}"]`)) return;
    close();
  }
  // Esc schließt nur das Menü, nicht auch die Rollenansicht (Dock)
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    close();
  }
</script>

<svelte:window onpointerdown={outside} onkeydowncapture={onKey} />

<div class="plate-menu control" role="menu" aria-label={t('plate.title', { n: seatNo(seat) })} data-plate-menu={seat} bind:this={root} style:left="{Math.max(8, Math.min(at.x, innerWidth - 230))}px" style:top="{top}px">
  {#each groups as group, i (i)}
    {#if i > 0}<hr />{/if}
    {#each group as entry (entry)}
      {#if entry === 'profile'}
        <button role="menuitem" onclick={run(() => (view.profileFor = seat))}>{occupied ? t('menu.profile') : t('plate.color')}</button>
      {:else if entry === 'view'}
        <button role="menuitem" onclick={run(() => view.setRole(seat))}>{t('plate.view')}</button>
      {:else if entry === 'revive'}
        <button role="menuitem" onclick={run(() => submitOrSay({ type: 'character.revive', seat }))}>{t('plate.revive')}</button>
      {:else if entry === 'roll'}
        <button role="menuitem" title={t('sheet.rollTitle')} onclick={roll}>{rollConfirm.armed ? t('sheet.rollConfirm') : t('plate.roll')}</button>
      {:else if entry === 'photo'}
        <button role="menuitem" onclick={run(() => pickPhoto(seat))}>{t('plate.photo')}</button>
      {:else if entry === 'export'}
        <button role="menuitem" onclick={run(() => exportCharacter(seat))}>{t('plate.export')}</button>
      {:else if entry === 'import'}
        <button role="menuitem" class:danger={importConfirm.armed} title={t('plate.importTitle')} onclick={load}>{importConfirm.armed ? t('plate.importConfirm') : t('plate.import')}</button>
      {:else if entry === 'reset'}
        <button role="menuitem" class:danger={resetConfirm.armed} title={t('plate.resetTitle')} onclick={reset}>{resetConfirm.armed ? t('plate.resetConfirm') : t('plate.reset')}</button>
      {:else if entry === 'move'}
        <button role="menuitem" aria-expanded={expanded === 'move'} title={t('room.moveTitle', { n: seatNo(seat) })} onclick={() => (expanded = expanded === 'move' ? null : 'move')}>{t('room.move')}</button>
        {#if expanded === 'move'}
          {#each moveTargets(table, seat) as o (o.seat)}
            <button role="menuitem" class="sub" onclick={run(() => submitOrSay({ type: 'table.moveSeat', from: seat, to: o.seat }))}>{o.label}</button>
          {/each}
        {/if}
      {:else if entry === 'release'}
        <button role="menuitem" title={t('room.releaseTitle')} onclick={run(() => submitOrSay({ type: 'table.setSeat', seat, occupied: false }))}>{t('plate.release')}</button>
      {:else if entry === 'assign'}
        <button role="menuitem" aria-expanded={expanded === 'assign'} onclick={() => (expanded = expanded === 'assign' ? null : 'assign')}>{t('room.assign')}</button>
        {#if expanded === 'assign'}
          {#each assignable(table, session.online, seat) as w (w.peer)}
            <button role="menuitem" class="sub" class:unnamed={!w.named} onclick={run(() => assign(w.peer))}>{w.label}</button>
          {/each}
        {/if}
      {/if}
    {/each}
  {/each}
</div>

<style>
  /* wie das Menü oben rechts (Menu.svelte), am Schild verankert */
  .plate-menu { position: fixed; z-index: 98; display: flex; flex-direction: column; gap: 4px; min-width: 190px; max-width: 320px; padding: 6px; font-size: 13px; background: var(--panel-bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5); transform-origin: top left; animation: pop-in var(--pop) var(--spring-soft); }
  button { text-align: left; background: transparent; color: var(--ink); border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; font: inherit; cursor: pointer; }
  button:hover { background: var(--button-hover); }
  button[aria-expanded='true'] { border-color: var(--line); }
  button.sub { padding-left: 20px; }
  button.unnamed { font-style: italic; }
  button.danger { color: var(--danger); }
  hr { width: 100%; margin: 2px 0; border: 0; border-top: 1px solid var(--line); }
</style>
