<script lang="ts">
  // Raum der SL (8.2): Plätze freigeben (z. B. neues Gerät eines Spielers), Einladungslink kopieren oder erneuern.
  // Seit 5i (8.7): Personen umsetzen oder tauschen, verbundene Zuschauer auf einen freien Platz setzen.
  import { SEATS, type SeatId } from '../engine/types';
  import { seatNo, seatVisible } from '../engine/zones';
  import Modal from './Modal.svelte';
  import { assignOrSay as assign, submitOrSay } from './commands';
  import { freeSeats, moveTargets, watchers } from './seatActions';
  import { seatNames } from './seatNames';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  const table = $derived(session.state!);
  const close = () => (view.gmPanel = null);
  const isOnline = (seat: string) => session.online.some((r) => r.role === 'player' && r.seat === seat);
  // Ziele, freie Plätze und Zuschauer aus seatActions.ts, wie im Menü am Namensschild (10.1)
  const spectators = $derived(watchers(session.online));
  const free = $derived(freeSeats(table));

  /** Auswahlliste: gewählten Wert ausführen und die Liste wieder auf ihren Titel stellen */
  function picked(e: Event & { currentTarget: HTMLSelectElement }, act: (seat: SeatId) => void) {
    const seat = e.currentTarget.value as SeatId;
    e.currentTarget.value = '';
    if (seat) act(seat);
  }

  let confirmRenew = $state(false);

  async function renew() {
    confirmRenew = false;
    await session.renewLink();
    await session.copyInvite('room.renewed');
  }
</script>

<Modal label={t('room.manageTitle')} onclose={close} size="narrow">
  <b>{t('room.seats')}</b>
  <div class="seats">
    {#each SEATS as seat (seat)}
      {@const names = seatNames(table, seat)}
      {@const numbered = t('room.player', { n: seatNo(seat) })}
      {@const on = isOnline(seat)}
      <span>{numbered}</span>
      <span class="who">
        {#if !seatVisible(seat, table)}<i>{t('room.hidden')}</i>{/if}
        {#if names.named}<span class="character">{names.character}</span>{' · '}{/if}
        {#if !names.free}
          {names.person} <small class:on>{t(on ? 'room.online' : 'room.offline')}</small>
        {:else}
          <i>{t('room.free')}</i>{#if names.last}{' '}<small>{t('room.last', { name: names.last })}</small>{/if}
        {/if}
      </span>
      <span class="actions">
        {#if !names.free}
          {@const to = moveTargets(table, seat)}
          {#if to.length > 0}
            <select aria-label={t('room.move')} title={t('room.moveTitle', { n: seatNo(seat) })} onchange={(e) => picked(e, (dest) => submitOrSay({ type: 'table.moveSeat', from: seat, to: dest }))}>
              <option value="" selected disabled>{t('room.move')}</option>
              {#each to as o (o.seat)}<option value={o.seat}>{o.label}</option>{/each}
            </select>
          {/if}
          <button title={t('room.releaseTitle')} onclick={() => submitOrSay({ type: 'table.setSeat', seat, occupied: false })}>{t('room.release')}</button>
        {/if}
      </span>
    {/each}
  </div>

  <b>{t('room.spectators')}</b>
  {#if spectators.length === 0}
    <p class="note">{t('room.noSpectators')}</p>
  {:else}
    <div class="watchers">
      {#each spectators as s (s.peer)}
        <span class="who">{#if s.named}{s.label}{:else}<i>{s.label}</i>{/if}</span>
        <span class="actions">
          {#if free.length > 0}
            <select aria-label={t('room.assign')} title={t('room.assignTitle', { name: s.label })} onchange={(e) => picked(e, (seat) => assign(s.peer, seat))}>
              <option value="" selected disabled>{t('room.assign')}</option>
              {#each free as o (o.seat)}<option value={o.seat}>{o.label}</option>{/each}
            </select>
          {/if}
        </span>
      {/each}
    </div>
  {/if}

  <b>{t('room.link')}</b>
  {#if confirmRenew}
    <p>{t('room.renewText')}</p>
    <div class="buttons">
      <button onclick={() => (confirmRenew = false)}>{t('reset.cancel')}</button>
      <button class="danger" onclick={renew}>{t('room.renewConfirm')}</button>
    </div>
  {:else}
    <div class="buttons">
      <button onclick={() => session.copyInvite()}>{t('room.copy')}</button>
      <button onclick={() => (confirmRenew = true)}>{t('room.renew')}</button>
    </div>
  {/if}
  <div class="buttons end"><button onclick={close}>{t('gm.close')}</button></div>
</Modal>

<style>
  .seats { display: grid; grid-template-columns: auto 1fr auto; gap: 6px 12px; align-items: center; margin: 8px 0; }
  .watchers { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: center; margin: 8px 0 14px; }
  .actions { display: flex; gap: 6px; justify-content: flex-end; }
  /* geschlossen nur der Titel; die Einträge zeigt die aufgeklappte Liste in voller Breite */
  select { width: 8.5em; }
  .seats > span:nth-child(3n + 1) { white-space: nowrap; }
  .who i { opacity: 0.65; margin-right: 6px; }
  .character { font-weight: 600; }
  small { font-size: 12px; opacity: 0.6; }
  small.on { color: var(--online); opacity: 1; }
  .seats button { padding: 4px 10px; }
  .note { margin: 4px 0 14px; }
  .end { justify-content: flex-end; margin-top: 16px; }
</style>
