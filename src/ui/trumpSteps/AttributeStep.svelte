<script lang="ts">
  // Attributspunkt umverteilen: eins verringern, ein anderes erhöhen.
  import type { Attr } from '../../rules/klio/blocks';
  import { t } from '../texts';
  import { attributeOptions } from '../trumpDialog';
  import type { StepProps } from './props';
  let { ctx, done }: StepProps = $props();

  let lowered = $state<Attr>();
  let raised = $state<Attr>();
  const opts = $derived(attributeOptions(ctx, lowered));
</script>

<p>{t('trumpDialog.lower')}</p>
<div class="attrs">
  {#each opts as o (o.attr)}
    <button class:sel={lowered === o.attr} disabled={!o.canLower} onclick={() => { lowered = o.attr; if (raised === o.attr) raised = undefined; }}>{t(`attributes.${o.attr}`)} ({o.value})</button>
  {/each}
</div>
<p>{t('trumpDialog.raise')}</p>
<div class="attrs">
  {#each opts as o (o.attr)}
    <button class:sel={raised === o.attr} disabled={!o.canRaise} onclick={() => (raised = o.attr)}>{t(`attributes.${o.attr}`)} ({o.value})</button>
  {/each}
</div>
<p><button class="main" disabled={!lowered || !raised} onclick={() => done({ moveAttribute: { lowered: lowered!, raised: raised! } })}>{t('trumpDialog.next')}</button></p>
