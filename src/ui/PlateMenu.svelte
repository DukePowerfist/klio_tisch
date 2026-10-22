<script lang="ts" module>
  // Menü am Namensschild (ARCHITEKTUR.md 10.1, Schritt 5j; Menüstil seit 5p, 10.4): Aktionen zu diesem Platz und diesem Bogen.
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
  import { seatNames } from './seatNames';
  import { exportCharacter, importCharacter, pickPhoto } from './sheetActions';
  import { placePlateMenu } from './stackMenu';
  import { t } from './texts';

  let { seat }: { seat: SeatId } = $props();

  const table = $derived(session.state!);
  const groups = $derived(entriesAt(seat));
  const occupied = $derived(table.seats[seat].occupied);
  /** Kopf: „Platz n“, rechts der Charaktername, nur wenn benannt (sonst stünde dort „Spieler n“, R3) */
  const name = $derived.by(() => {
    const n = seatNames(table, seat);
    return n.named ? n.character : '';
  });
  const rollConfirm = new Confirm();
  const resetConfirm = new Confirm();
  const importConfirm = new Confirm();
  /** aufgeklappte Auswahl (Umsetzen, Zuweisen) */
  let expanded = $state<'move' | 'assign' | null>(null);
  let root = $state<HTMLElement>();

  /** Geometrie beim Öffnen (Board.svelte); steht das Schild woanders, schließt Board.svelte das Menü (N4) */
  const at = view.plateMenu!;
  /** Größe laufend gemessen (R1): Aufklappen, „Wiederbeleben“, entzogene Rechte, kommende und gehende Zuschauer */
  let size = $state<{ w: number; h: number } | null>(null);
  $effect(() => {
    if (!root) return;
    const el = root;
    // meldet sich auch gleich nach observe(), das ist die erste Messung
    const ro = new ResizeObserver(() => (size = { w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  });
  /** Seite beim Öffnen, danach nur noch diese (R1); Regeln in placePlateMenu */
  let side: 'below' | 'above' | null = null;
  const place = $derived.by(() => {
    if (!size) return null;
    const p = placePlateMenu(at.anchor, at.area, size, side);
    side ??= p.side as 'below' | 'above';
    return p;
  });

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
  const toggle = (what: 'move' | 'assign') => () => (expanded = expanded === what ? null : what);

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

<div
  class="menu-panel wide control"
  role="menu"
  aria-label={t('plate.title', { n: seatNo(seat) })}
  data-plate-menu={seat}
  data-side={place?.side}
  bind:this={root}
  style:left="{place?.x ?? 0}px"
  style:top="{place?.y ?? 0}px"
  style:max-height="{at.area.bounds.h}px"
  style:--tip={place?.tip != null ? `${place.tip}px` : null}
  style:visibility={place ? null : 'hidden'}
>
  {#if place && place.tip !== null}<div class="menu-tip" data-side={place.side}></div>{/if}
  <div class="menu-head" title={name || null}><span>{t('plate.title', { n: seatNo(seat) })}</span>{#if name}<span class="name">{name}</span>{/if}</div>
  <div class="menu-body">
    {#each groups as group, i (i)}
      {#if i > 0}<hr class="menu-rule" />{/if}
      {#each group as entry (entry)}
        {#if entry === 'profile'}
          <button role="menuitem" class="menu-item" onclick={run(() => (view.profileFor = seat))}>{occupied ? t('menu.profile') : t('plate.color')}</button>
        {:else if entry === 'view'}
          <button role="menuitem" class="menu-item" onclick={run(() => view.setRole(seat))}>{t('plate.view')}</button>
        {:else if entry === 'revive'}
          <button role="menuitem" class="menu-item" onclick={run(() => submitOrSay({ type: 'character.revive', seat }))}>{t('plate.revive')}</button>
        {:else if entry === 'roll'}
          <button role="menuitem" class="menu-item" class:armed={rollConfirm.armed} title={t('sheet.rollTitle')} onclick={roll}>{rollConfirm.armed ? t('sheet.rollConfirm') : t('plate.roll')}</button>
        {:else if entry === 'photo'}
          <button role="menuitem" class="menu-item" onclick={run(() => pickPhoto(seat))}>{t('plate.photo')}</button>
        {:else if entry === 'export'}
          <button role="menuitem" class="menu-item" onclick={run(() => exportCharacter(seat))}>{t('plate.export')}</button>
        {:else if entry === 'import'}
          <button role="menuitem" class="menu-item" class:armed={importConfirm.armed} class:danger={importConfirm.armed} title={t('plate.importTitle')} onclick={load}>{importConfirm.armed ? t('plate.importConfirm') : t('plate.import')}</button>
        {:else if entry === 'reset'}
          <button role="menuitem" class="menu-item" class:armed={resetConfirm.armed} class:danger={resetConfirm.armed} title={t('plate.resetTitle')} onclick={reset}>{resetConfirm.armed ? t('plate.resetConfirm') : t('plate.reset')}</button>
        {:else if entry === 'move'}
          <button role="menuitem" class="menu-item expands" aria-expanded={expanded === 'move'} title={t('room.moveTitle', { n: seatNo(seat) })} onclick={toggle('move')}>{t('room.move')}</button>
          {#if expanded === 'move'}
            <div class="menu-subs">
              {#each moveTargets(table, seat) as o (o.seat)}
                <button role="menuitem" class="menu-item" title={o.label} onclick={run(() => submitOrSay({ type: 'table.moveSeat', from: seat, to: o.seat }))}>{o.label}</button>
              {/each}
            </div>
          {/if}
        {:else if entry === 'release'}
          <button role="menuitem" class="menu-item" title={t('room.releaseTitle')} onclick={run(() => submitOrSay({ type: 'table.setSeat', seat, occupied: false }))}>{t('plate.release')}</button>
        {:else if entry === 'assign'}
          <button role="menuitem" class="menu-item expands" aria-expanded={expanded === 'assign'} onclick={toggle('assign')}>{t('room.assign')}</button>
          {#if expanded === 'assign'}
            <div class="menu-subs">
              {#each assignable(table, session.online, seat) as w (w.peer)}
                <button role="menuitem" class="menu-item" class:unnamed={!w.named} title={w.label} onclick={run(() => assign(w.peer))}>{w.label}</button>
              {/each}
            </div>
          {/if}
        {/if}
      {/each}
    {/each}
  </div>
</div>
