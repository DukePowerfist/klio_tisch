<script lang="ts">
  // Attributspunkt umverteilen: eins verringern, ein anderes erhöhen.
  import type { Attr } from '../../rules/klio/blocks';
  import { t } from '../texts';
  import { attributeOptions } from '../trumpDialog';
  import type { StepProps } from './props';
  let { ctx, done, end }: StepProps = $props();

  let lowered = $state<Attr>();
  let raised = $state<Attr>();
  const opts = $derived(attributeOptions(ctx, lowered));
</script>

<h3 class="dialog-heading">{t('trumpDialog.lower')}</h3>
<div class="dialog-choices" style:--cols="3">
  {#each opts as o (o.attr)}
    <button class="dialog-choice center" class:sel={lowered === o.attr} disabled={!o.canLower} onclick={() => { lowered = o.attr; if (raised === o.attr) raised = undefined; }}>{t(`attributes.${o.attr}`)} ({o.value})</button>
  {/each}
</div>
<h3 class="dialog-heading">{t('trumpDialog.raise')}</h3>
<div class="dialog-choices" style:--cols="3">
  {#each opts as o (o.attr)}
    <button class="dialog-choice center" class:sel={raised === o.attr} disabled={!o.canRaise} onclick={() => (raised = o.attr)}>{t(`attributes.${o.attr}`)} ({o.value})</button>
  {/each}
</div>
{#snippet next()}
  <button class="main" disabled={!lowered || !raised} onclick={() => done({ moveAttribute: { lowered: lowered!, raised: raised! } })}>{t('trumpDialog.next')}</button>
{/snippet}
{@render end(next)}

<style>
  h3 { margin-bottom: 8px; }
</style>
