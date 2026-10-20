<script lang="ts">
  // Fenster der Spielleitung: Expedition (4 Tabellen, einzeln neu), Orakel (zwei Begriffe), Rückfrage Zurücksetzen.
  import content from 'virtual:klio-content';
  import { submitOrSay } from './commands';
  import { session } from './session.svelte';
  import { cardName, t } from './texts';
  import { view } from './view.svelte';

  const game = $derived(session.state!.game);
  const close = () => (view.gmDialog = null);
  let withCharacters = $state(false);

  async function reset() {
    if (await submitOrSay({ type: 'table.reset', includeCharacters: withCharacters })) close();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  {#if view.gmDialog === 'expedition' && game.expedition}
    <div class="box" role="dialog" aria-label={t('gm.expedition')}>
      <h3>{t('gm.expedition')}</h3>
      {#each content.expedition.expedition as table, i (i)}
        <div class="row">
          <div><small>{table.prompt}</small><b>{table.entries[game.expedition[i]!]}</b></div>
          <button class="small" onclick={() => submitOrSay({ type: 'gm.expedition', table: i })}>{t('gm.reroll')}</button>
        </div>
      {/each}
      <div class="go">
        <button onclick={() => submitOrSay({ type: 'gm.expedition' })}>{t('gm.rerollAll')}</button>
        <button onclick={close}>{t('gm.close')}</button>
      </div>
    </div>
  {:else if view.gmDialog === 'oracle' && game.oracle}
    <div class="box" role="dialog" aria-label={t('gm.oracle')}>
      <h3>{t('gm.oracle')}</h3>
      <div class="go">
        {#each game.oracle as d, i (i)}
          <div class="word">
            <small>{cardName(`${d.suit}${d.rank}`)}</small>
            <b>{content.expedition.oracle[d.suit][d.rank]}</b>
          </div>
        {/each}
      </div>
      <div class="go">
        <button onclick={() => submitOrSay({ type: 'gm.oracle' })}>{t('gm.redraw')}</button>
        <button onclick={close}>{t('gm.close')}</button>
      </div>
    </div>
  {:else if view.gmDialog === 'reset'}
    <div class="box narrow" role="dialog" aria-label={t('reset.title')}>
      <b>{t('reset.title')}</b>
      <p>{t('reset.text')}</p>
      <label><input type="checkbox" bind:checked={withCharacters} /><span>{t('reset.characters')}</span></label>
      <div class="go end">
        <button onclick={close}>{t('reset.cancel')}</button>
        <button class="danger" onclick={reset}>{t('reset.confirm')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); display: flex; align-items: center; justify-content: center; z-index: 3000000; }
  .box { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; padding: 20px 26px; width: min(820px, 94vw); max-height: 90vh; overflow: auto; font-size: 16px; }
  .box.narrow { width: auto; max-width: 420px; font-size: 15px; border-radius: 12px; padding: 18px 22px; }
  h3 { margin: 0 0 10px; font-size: 20px; }
  button { background: var(--button-hover); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
  button.small { font-size: 13px; padding: 4px 10px; opacity: 0.8; }
  button.danger { background: #7a2a22; }
  .row { margin: 12px 0; padding: 12px 16px; background: rgba(255, 255, 255, 0.07); border-radius: 10px; display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; }
  .row small { display: block; opacity: 0.7; font-size: 15px; margin-bottom: 3px; }
  .row b { font-size: 23px; line-height: 1.3; font-weight: 600; }
  .go { display: flex; gap: 16px; justify-content: center; margin: 18px 0 4px; }
  .go.end { justify-content: flex-end; gap: 10px; }
  .word { flex: 1; text-align: center; background: rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px 16px; }
  .word small { display: block; font-size: 17px; opacity: 0.75; margin-bottom: 4px; }
  .word b { font-size: 36px; font-weight: 600; }
  label { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 14px; }
  p { margin: 8px 0 12px; }
</style>
