<script lang="ts">
  // Stärke verbessern: erst die Stärke wählen, dann die neue Formulierung (leer = alte bleibt).
  import { t } from '../texts';
  import type { StepProps } from './props';
  let { ctx, done, end }: StepProps = $props();

  let chosen = $state<number | null>(null);
  let wording = $state('');
  const finish = () => done({ improveStrength: { index: chosen!, text: wording } });
</script>

{#if chosen === null}
  <p class="note">{t('trumpDialog.improveHint')}</p>
  <div class="dialog-choices">
    {#each ctx.sheet.strengths as s, i (i)}
      <button class="dialog-choice" disabled={s.improved} onclick={() => { chosen = i; wording = s.text; }}>
        <b>{t(`numerals.${i + 1}`)} · {s.text || t('trumpDialog.empty')}</b>
        {#if s.improved}<span class="note">{t('trumpDialog.alreadyImproved')}</span>{/if}
      </button>
    {/each}
  </div>
  {@render end()}
{:else}
  <h3 class="dialog-heading">{t('trumpDialog.newWording')}</h3>
  <p class="note">{t('trumpDialog.newWordingHint', { n: t(`numerals.${chosen + 1}`) })}</p>
  <form onsubmit={(e) => { e.preventDefault(); finish(); }}>
    <!-- svelte-ignore a11y_autofocus -->
    <p><input class="dialog-field" type="text" maxlength="70" aria-label={t('trumpDialog.newWording')} bind:value={wording} autofocus /></p>
    {#snippet next()}<button class="main" type="submit">{t('trumpDialog.next')}</button>{/snippet}
    {@render end(next)}
  </form>
{/if}

<style>
  p { margin: 0 0 12px; }
  h3 { margin-bottom: 8px; }
</style>
