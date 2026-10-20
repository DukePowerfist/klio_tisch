<script lang="ts">
  // Stärke verbessern: erst die Stärke wählen, dann die neue Formulierung (leer = alte bleibt).
  import { t } from '../texts';
  import type { StepProps } from './props';
  let { ctx, done }: StepProps = $props();

  let chosen = $state<number | null>(null);
  let wording = $state('');
  const finish = () => done({ improveStrength: { index: chosen!, text: wording } });
</script>

{#if chosen === null}
  <p>{t('trumpDialog.improveHint')}</p>
  <div class="list">
    {#each ctx.sheet.strengths as s, i (i)}
      <button class="source" disabled={s.improved} onclick={() => { chosen = i; wording = s.text; }}>
        <b>{t(`numerals.${i + 1}`)} · {s.text || t('trumpDialog.empty')}</b>
        <span>{s.improved ? t('trumpDialog.alreadyImproved') : ''}</span>
      </button>
    {/each}
  </div>
{:else}
  <p><b>{t('trumpDialog.newWording')}</b></p>
  <p>{t('trumpDialog.newWordingHint', { n: t(`numerals.${chosen + 1}`) })}</p>
  <form onsubmit={(e) => { e.preventDefault(); finish(); }}>
    <!-- svelte-ignore a11y_autofocus -->
    <p><input type="text" maxlength="70" bind:value={wording} autofocus /></p>
    <p><button type="submit">{t('trumpDialog.next')}</button></p>
  </form>
{/if}
