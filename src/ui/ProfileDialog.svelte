<script lang="ts">
  // Eigener Name und eigene Farbe (Schritt 5e). Spieler: beides, gilt am Platz für alle. Zuschauer: nur der Name
  // am Zeiger. Farben aus einer festen Auswahl; was ein anderer Platz trägt, ist nicht wählbar.
  import { SEATS, type TextRef } from '../engine/types';
  import { seatColor } from '../engine/zones';
  import { colorVar } from './colors';
  import Modal from './Modal.svelte';
  import { seatNames } from './seatNames';
  import { ruleset, session } from './session.svelte';
  import { t, text } from './texts';

  let { onclose }: { onclose: () => void } = $props();

  const table = $derived(session.state!);
  const seat = $derived(session.actor.role === 'player' ? session.actor.seat : null);
  let name = $state(seat ? (session.state!.seats[seat].name ?? '') : session.savedName);
  let color = $state(seat ? seatColor(session.state!, seat, ruleset.seatColors) : null);
  let refused = $state<TextRef | null>(null);

  /** Wer trägt diese Farbe schon (anderer Platz)? */
  function holder(id: string): string | null {
    const other = SEATS.find((s) => s !== seat && seatColor(table, s, ruleset.seatColors) === id);
    return other ? seatNames(table, other).label : null;
  }

  async function save() {
    const r = await session.editProfile(name.trim(), color ?? undefined);
    if (r.ok) onclose();
    else refused = r.reason;
  }
</script>

<Modal label={seat ? t('profile.title') : t('profile.titleName')} {onclose} size="narrow">
  <b>{seat ? t('profile.title') : t('profile.titleName')}</b>
  <p><input type="text" maxlength="40" placeholder={t('profile.name')} aria-label={t('profile.name')} bind:value={name} onkeydown={(e) => { if (e.key === 'Enter') void save(); }} /></p>
  {#if seat}
    <div class="label">{t('profile.color')}</div>
    <div class="colors" role="radiogroup" aria-label={t('profile.color')}>
      {#each ruleset.seatColors as id (id)}
        {@const taken = holder(id)}
        <button
          class="swatch"
          role="radio"
          aria-checked={color === id}
          aria-label={t(`colors.${id}`)}
          title={taken ? `${t(`colors.${id}`)} (${t('profile.takenBy', { who: taken })})` : t(`colors.${id}`)}
          disabled={!!taken}
          style:--c={colorVar(id)}
          onclick={() => (color = id)}
        ></button>
      {/each}
    </div>
  {/if}
  {#if refused}<p class="problem">{text(refused)}</p>{/if}
  <div class="end">
    <button onclick={onclose}>{t('profile.cancel')}</button>
    <button onclick={save}>{t('profile.save')}</button>
  </div>
</Modal>

<style>
  input { width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); color: #111; }
  .label { font-size: 13px; opacity: 0.8; margin-bottom: 6px; }
  .colors { display: grid; grid-template-columns: repeat(4, 40px); gap: 10px; margin-bottom: 14px; }
  .colors .swatch { width: 40px; height: 40px; padding: 0; border-radius: 50%; background: var(--c); border: 3px solid transparent; }
  .colors .swatch[aria-checked='true'] { border-color: var(--ink); box-shadow: 0 0 0 2px var(--panel-bg) inset; }
  /* vergeben: in der echten Farbe, blasser und durchgestrichen (nicht nur abgedunkelt, sonst wirkt sie wie eine andere Farbe) */
  .colors .swatch:disabled { opacity: 0.6; background: linear-gradient(135deg, transparent 44%, var(--panel-bg) 44% 56%, transparent 56%), var(--c); }
  .end { display: flex; gap: 10px; justify-content: flex-end; }
</style>
