<script lang="ts">
  // Rückfrage vor dem Zurücksetzen (Charaktere nur mit Häkchen).
  import Modal from './Modal.svelte';
  import { submitOrSay } from './commands';
  import { t } from './texts';
  import { view } from './view.svelte';

  let withCharacters = $state(false);
  const close = () => (view.confirmReset = false);

  async function reset() {
    if (await submitOrSay({ type: 'table.reset', includeCharacters: withCharacters })) close();
  }
</script>

<Modal label={t('reset.title')} onclose={close} size="narrow">
  <b>{t('reset.title')}</b>
  <p>{t('reset.text')}</p>
  <label><input type="checkbox" bind:checked={withCharacters} /><span>{t('reset.characters')}</span></label>
  <div class="end">
    <button onclick={close}>{t('reset.cancel')}</button>
    <button class="danger" onclick={reset}>{t('reset.confirm')}</button>
  </div>
</Modal>

<style>
  p { margin: 8px 0 12px; }
  label { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 14px; }
  .end { display: flex; gap: 10px; justify-content: flex-end; }
</style>
