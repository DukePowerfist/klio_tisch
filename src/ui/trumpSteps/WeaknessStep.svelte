<script lang="ts">
  // Schwäche streichen: nur befüllte Schwächen sind wählbar (A29).
  import type { StepProps } from './props';
  let { ctx, done, end }: StepProps = $props();
</script>

<div class="dialog-choices">
  {#each ctx.sheet.weaknesses as w, i (i)}
    {#if w}
      <button class="dialog-choice" onclick={() => done({ removeWeakness: i })}><b>{w}</b></button>
    {/if}
  {/each}
</div>
{@render end()}
