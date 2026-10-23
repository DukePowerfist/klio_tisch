<script lang="ts">
  // Eigener Name und eigene Farbe (Schritt 5e). Spieler: beides, gilt am Platz für alle. Zuschauer: nur der Name
  // am Zeiger. Farben aus einer festen Auswahl; was ein anderer Platz trägt, ist nicht wählbar.
  // Seit 5j (10.1) auch für einen anderen Platz (`for`, aus dem Menü am Namensschild): die SL an jedem Platz;
  // an einem freien Platz nur die Farbe. Der Name wird dann nicht als eigener gemerkt.
  import { PLAYER_NAME_MAX } from '../engine/schemas';
  import type { SeatId, TextRef } from '../engine/types';
  import { colorHolder, seatColor, seatNo } from '../engine/zones';
  import { colorVar } from './colors';
  import DialogHead from './DialogHead.svelte';
  import Modal from './Modal.svelte';
  import { seatNames } from './seatNames';
  import { ruleset, session } from './session.svelte';
  import { t, text } from './texts';

  let { onclose, for: target }: { onclose: () => void; for?: SeatId } = $props();

  const table = $derived(session.state!);
  const own = $derived(session.ownSeat);
  /** fremder Platz (nicht der eigene) */
  const other = $derived(target !== undefined && target !== own ? target : null);
  const seat = $derived(other ?? own);
  /** Name nur an einem besetzten Platz (seat.edit lehnt ihn sonst ab) */
  const withName = $derived(!other || table.seats[other].occupied);
  const title = $derived(other ? t(withName ? 'profile.titleSeat' : 'profile.titleColor', { n: seatNo(other) }) : seat ? t('profile.title') : t('profile.titleName'));
  let name = $state(seat ? (session.state!.seats[seat].name ?? '') : session.savedName);
  let color = $state(seat ? seatColor(session.state!, seat, ruleset.seatColors) : null);
  let refused = $state<TextRef | null>(null);

  /** Wer trägt diese Farbe schon (anderer Platz)? */
  function holder(id: string): string | null {
    const by = colorHolder(table, id, ruleset.seatColors, seat);
    return by ? seatNames(table, by).label : null;
  }

  async function save() {
    const r = other
      ? await session.submit({ type: 'seat.edit', seat: other, ...(withName ? { name: name.trim() } : {}), ...(color ? { color } : {}) })
      : await session.editProfile(name.trim(), color ?? undefined);
    if (r.ok) onclose();
    else refused = r.reason;
  }
</script>

<Modal label={title} {onclose} size="narrow">
  <DialogHead {title} {onclose} />
  {#if withName}
    {@const label = other ? t('profile.nameOther') : t('profile.name')}
    <p><input type="text" maxlength={PLAYER_NAME_MAX} placeholder={label} aria-label={label} bind:value={name} onkeydown={(e) => { if (e.key === 'Enter') void save(); }} /></p>
  {/if}
  {#if seat}
    <!-- an einem freien Platz sagt es schon der Titel; die Farbwahl behält ihren Namen -->
    {#if withName}<div class="label">{t('profile.color')}</div>{/if}
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
    <button class="main" onclick={save}>{t('profile.save')}</button>
  </div>
</Modal>

<style>
  input { width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; border-radius: var(--radius-m); border: 1px solid var(--line); background: var(--paper); color: var(--dark-ink); }
  .label { font-size: 13px; opacity: 0.8; margin-bottom: 6px; }
  .colors { display: grid; grid-template-columns: repeat(4, 40px); gap: 10px; margin-bottom: 14px; }
  .colors .swatch { width: 40px; height: 40px; padding: 0; border-radius: 50%; background: var(--c); border: 3px solid transparent; }
  .colors .swatch[aria-checked='true'] { border-color: var(--ink); box-shadow: 0 0 0 2px var(--panel-bg) inset; }
  /* vergeben: in der echten Farbe, blasser und durchgestrichen (nicht nur abgedunkelt, sonst wirkt sie wie eine andere Farbe) */
  .colors .swatch:disabled { opacity: 0.6; background: linear-gradient(135deg, transparent 44%, var(--panel-bg) 44% 56%, transparent 56%), var(--c); }
  .end { display: flex; gap: 10px; justify-content: flex-end; }
</style>
