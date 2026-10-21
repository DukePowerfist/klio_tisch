<script lang="ts">
  // Raum der SL (8.2): Plätze freigeben (z. B. neues Gerät eines Spielers), Einladungslink kopieren oder erneuern.
  import { SEATS } from '../engine/types';
  import { seatNo, seatVisible } from '../engine/zones';
  import Modal from './Modal.svelte';
  import { submitOrSay } from './commands';
  import { seatNames } from './seatNames';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  const table = $derived(session.state!);
  const close = () => (view.gmPanel = null);
  const isOnline = (seat: string) => session.online.some((r) => r.role === 'player' && r.seat === seat);
  const spectators = $derived(session.online.filter((r) => r.role === 'spectator').length);
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
        {#if names.character !== numbered}<span class="character">{names.character}</span>{' · '}{/if}
        {#if !names.free}
          {names.person} <small class:on>{t(on ? 'room.online' : 'room.offline')}</small>
        {:else}
          <i>{t('room.free')}</i>{#if names.last}{' '}<small>{t('room.last', { name: names.last })}</small>{/if}
        {/if}
      </span>
      <span>
        {#if !names.free}
          <button title={t('room.releaseTitle')} onclick={() => submitOrSay({ type: 'table.setSeat', seat, occupied: false })}>{t('room.release')}</button>
        {/if}
      </span>
    {/each}
  </div>
  <p class="note">{t('room.spectators', { n: spectators })}</p>

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
  .who i { opacity: 0.65; margin-right: 6px; }
  .character { font-weight: 600; }
  small { font-size: 12px; opacity: 0.6; }
  small.on { color: var(--accent-hint); opacity: 1; }
  .seats button { padding: 4px 10px; }
  .note { margin: 4px 0 14px; }
  .end { justify-content: flex-end; margin-top: 16px; }
</style>
