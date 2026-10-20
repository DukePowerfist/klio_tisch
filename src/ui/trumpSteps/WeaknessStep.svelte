<script lang="ts">
  // Schwäche streichen: nur befüllte Schwächen sind wählbar (A29).
  import type { StepProps } from './props';
  let { ctx, done }: StepProps = $props();
</script>

<div class="list">
  {#each ctx.sheet.weaknesses as w, i (i)}
    {#if w}
      <button class="source" onclick={() => done({ removeWeakness: i })}><b>{w}</b></button>
    {/if}
  {/each}
</div>
