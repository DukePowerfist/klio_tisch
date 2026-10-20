<script lang="ts">
  // Raumleiste oben rechts (ARCHITEKTUR.md 10, RoomBar): Verbindungsstatus, Einladungslink, eigener Platz.
  import { seatNo } from '../engine/zones';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { onChooseSeat }: { onChooseSeat: () => void } = $props();

  async function invite() {
    await session.invite();
    await session.copyInvite();
  }
</script>

<div class="bar control" class:alert={session.status === 'waiting' || session.status === 'reload'}>
  {#if session.mode === 'local'}
    <button title={t('room.inviteTitle')} onclick={invite}>{t('room.invite')}</button>
  {:else if session.mode === 'host'}
    <span>{t('room.open', { n: session.online.length })}</span>
    <button onclick={() => session.copyInvite()}>{t('room.copy')}</button>
    <button title={t('room.manageTitle')} onclick={() => (view.gmPanel = 'room')}>{t('room.manage')}</button>
  {:else if session.status === 'ready' && session.role}
    {#if session.role.role === 'player'}
      <span>{t('room.player', { n: seatNo(session.role.seat) })}</span>
    {:else}
      <span>{t('room.spectator')}</span>
      <button onclick={onChooseSeat}>{t('room.chooseSeat')}</button>
    {/if}
  {:else}
    <span>{session.statusText}</span>
    {#if session.status === 'reload'}<button onclick={() => location.reload()}>{t('room.reloadButton')}</button>{/if}
  {/if}
</div>

<style>
  .bar { position: fixed; top: 10px; right: 12px; display: flex; gap: 8px; align-items: center; z-index: 96; font-size: 13px; opacity: 0.55; transition: opacity 0.2s; background: rgba(0, 0, 0, 0.35); padding: 4px 8px; border-radius: 8px; }
  .bar:hover, .bar.alert { opacity: 1; }
  .bar.alert { background: var(--warn-bg); }
  button { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; font: inherit; cursor: pointer; }
</style>
