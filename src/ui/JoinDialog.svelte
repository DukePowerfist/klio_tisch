<script lang="ts">
  // Platz wählen (8.2): Name und einer der freien, sichtbaren Plätze; oder nur zuschauen (der Name geht dann an die SL).
  // Je Platz der Charakter und wer dort sitzt bzw. zuletzt saß (8.7), Rand in der Platzfarbe.
  import { PLAYER_NAME_MAX } from '../engine/schemas';
  import { SEATS, type TextRef } from '../engine/types';
  import { seatVisible } from '../engine/zones';
  import { whoColor } from './colors';
  import DialogHead from './DialogHead.svelte';
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
  <DialogHead title={t('room.join.title')} {onclose} />
  <p><input class="dialog-field" type="text" maxlength={PLAYER_NAME_MAX} placeholder={t('room.join.name')} bind:value={name} /></p>
  <div class="dialog-choices seats" style:--cols="2">
    {#each SEATS.filter((s) => seatVisible(s, table)) as seat (seat)}
      {@const names = seatNames(table, seat)}
      {@const who = !names.free
        ? names.person || t('room.join.takenNoName')
        : names.last ? `${t('room.free')} · ${t('room.last', { name: names.last })}` : t('room.free')}
      <button class="dialog-choice" disabled={!names.free} style:--c={whoColor(seat)} onclick={async () => (refused = await session.claim(seat, name.trim()))}>
        <span class="character">{names.character}</span>
        <span class="dialog-aside">{who}</span>
      </button>
    {/each}
  </div>
  {#if refused}<p class="problem">{text(refused)}</p>{/if}
  <div class="dialog-end">
    <button class="watch" onclick={() => { session.watch(name.trim()); onclose(); }}>{t('room.join.watch')}</button>
  </div>
</Modal>

<style>
  p { margin: 0 0 12px; }
  .seats .dialog-choice { border-left: 4px solid color-mix(in srgb, var(--c) 80%, transparent); }
  .character { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
