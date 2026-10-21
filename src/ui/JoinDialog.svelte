<script lang="ts">
  // Platz wählen (8.2): Name und einer der freien, sichtbaren Plätze; oder nur zuschauen.
  // Je Platz der Charakter und wer dort sitzt bzw. zuletzt saß (8.7), Rand in der Platzfarbe.
  import { PLAYER_NAME_MAX } from '../engine/schemas';
  import { SEATS, type TextRef } from '../engine/types';
  import { seatVisible } from '../engine/zones';
  import { whoColor } from './colors';
  import Modal from './Modal.svelte';
  import { seatNames } from './seatNames';
  import { session } from './session.svelte';
  import { t, text } from './texts';

  let { onclose }: { onclose: () => void } = $props();
  let name = $state(session.savedName);
  let refused = $state<TextRef | null>(null);
  const table = $derived(session.state!);
</script>

<Modal label={t('room.join.title')} {onclose} size="narrow">
  <b>{t('room.join.title')}</b>
  <p><input type="text" maxlength={PLAYER_NAME_MAX} placeholder={t('room.join.name')} bind:value={name} /></p>
  <div class="seats">
    {#each SEATS.filter((s) => seatVisible(s, table)) as seat (seat)}
      {@const names = seatNames(table, seat)}
      {@const who = !names.free
        ? names.person || t('room.join.takenNoName')
        : names.last ? `${t('room.free')} · ${t('room.last', { name: names.last })}` : t('room.free')}
      <button disabled={!names.free} style:--c={whoColor(seat)} onclick={async () => (refused = await session.claim(seat, name.trim()))}>
        <span class="character">{names.character}</span>
        <small>{who}</small>
      </button>
    {/each}
  </div>
  {#if refused}<p class="problem">{text(refused)}</p>{/if}
  <p><button class="watch" onclick={onclose}>{t('room.join.watch')}</button></p>
</Modal>

<style>
  input { width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: #111; }
  .seats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .seats button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; border-left: 4px solid color-mix(in srgb, var(--c) 80%, transparent); }
  .character { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { font-size: 12px; opacity: 0.8; }
</style>
