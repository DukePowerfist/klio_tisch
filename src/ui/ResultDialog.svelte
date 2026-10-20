<script lang="ts">
  // Ergebnis von Expedition bzw. Orakel; öffnet sich bei allen mit dem Ereignis (13.1).
  // Neu würfeln dürfen nur, wer das Recht dazu hat (sonst fehlen die Knöpfe).
  import content from 'virtual:klio-content';
  import Modal from './Modal.svelte';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { cardName, t } from './texts';
  import { view } from './view.svelte';

  let { kind }: { kind: 'expedition' | 'oracle' } = $props();

  const game = $derived(session.state!.game);
  const close = () => (view.gmDialog = null);
</script>

<Modal label={t(`gm.${kind}`)} onclose={close}>
  <h3>{t(`gm.${kind}`)}</h3>
  {#if kind === 'expedition' && game.expedition}
    {@const reroll = session.can({ type: 'gm.expedition' })}
    {#each content.expedition.expedition as table, i (i)}
      <div class="row">
        <div><small>{table.prompt}</small><b>{table.entries[game.expedition[i]!]}</b></div>
        {#if reroll}<button class="small" onclick={() => submitOrSay({ type: 'gm.expedition', table: i })}>{t('gm.reroll')}</button>{/if}
      </div>
    {/each}
    <div class="go">
      {#if reroll}<button onclick={() => submitOrSay({ type: 'gm.expedition' })}>{t('gm.rerollAll')}</button>{/if}
      <button onclick={close}>{t('gm.close')}</button>
    </div>
  {:else if kind === 'oracle' && game.oracle}
    <div class="go">
      {#each game.oracle as d, i (i)}
        <div class="word"><small>{cardName(`${d.suit}${d.rank}`)}</small><b>{content.expedition.oracle[d.suit][d.rank]}</b></div>
      {/each}
    </div>
    <div class="go">
      {#if session.can({ type: 'gm.oracle' })}<button onclick={() => submitOrSay({ type: 'gm.oracle' })}>{t('gm.redraw')}</button>{/if}
      <button onclick={close}>{t('gm.close')}</button>
    </div>
  {/if}
</Modal>

<style>
  h3 { margin: 0 0 10px; font-size: 20px; }
  .small { font-size: 13px !important; padding: 4px 10px !important; opacity: 0.8; }
  .row { margin: 12px 0; padding: 12px 16px; background: rgba(255, 255, 255, 0.07); border-radius: 10px; display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; font-size: 16px; }
  .row small { display: block; opacity: 0.7; font-size: 15px; margin-bottom: 3px; }
  .row b { font-size: 23px; line-height: 1.3; font-weight: 600; }
  .go { display: flex; gap: 16px; justify-content: center; margin: 18px 0 4px; }
  .word { flex: 1; text-align: center; background: rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px 16px; }
  .word small { display: block; font-size: 17px; opacity: 0.75; margin-bottom: 4px; }
  .word b { font-size: 36px; font-weight: 600; }
</style>
