<script lang="ts">
  // Platz wählen (8.2): Name und einer der freien, sichtbaren Plätze; oder nur zuschauen.
  import { SEATS, type TextRef } from '../engine/types';
  import { seatNo, seatVisible } from '../engine/zones';
  import Modal from './Modal.svelte';
  import { session } from './session.svelte';
  import { t, text } from './texts';

  let { onclose }: { onclose: () => void } = $props();
  let name = $state(session.savedName);
  let refused = $state<TextRef | null>(null);
  const table = $derived(session.state!);
</script>

<Modal label={t('room.join.title')} {onclose} narrow>
  <b>{t('room.join.title')}</b>
  <p><input type="text" maxlength="40" placeholder={t('room.join.name')} bind:value={name} /></p>
  <div class="seats">
    {#each SEATS.filter((s) => seatVisible(s, table)) as seat (seat)}
      {@const info = table.seats[seat]}
      <button disabled={info.occupied} onclick={async () => (refused = await session.claim(seat, name.trim()))}>
        {t('room.join.seat', { n: seatNo(seat) })}
        {#if info.occupied}<small>{info.name ? t('room.join.taken', { name: info.name }) : t('room.join.takenNoName')}</small>{/if}
      </button>
    {/each}
  </div>
  {#if refused}<p class="notice">{text(refused)}</p>{/if}
  <p><button class="watch" onclick={onclose}>{t('room.join.watch')}</button></p>
</Modal>

<style>
  input { width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: #111; }
  .seats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .seats button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
  small { font-size: 12px; opacity: 0.8; }
  .notice { color: var(--reason); }
</style>
