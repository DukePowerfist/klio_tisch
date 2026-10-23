<script lang="ts">
  // Feldfenster (5z, 10.11): ganzer Text eines Bogenfelds, geöffnet mit „…“ am abgeschnittenen Feld. Mit Recht zum
  // Bearbeiten ein Textfeld mit Umbruch, sonst nur lesen. Ändert jemand anderes das Feld, folgt die Leseansicht sofort;
  // ein Entwurf bleibt, ein Hinweis sagt es, „Übernehmen“ ersetzt den neuen Stand (F2 a).
  import { untrack } from 'svelte';
  import type { SeatId, TextRef } from '../engine/types';
  import { seatNo, seatVisibleFor } from '../engine/zones';
  import { sheetOf } from '../rules/klio/events';
  import { getField, SHEET_TEXT_MAX } from '../rules/klio/fields';
  import DialogHead from './DialogHead.svelte';
  import Modal from './Modal.svelte';
  import { session } from './session.svelte';
  import { t, text } from './texts';
  import { view } from './view.svelte';

  let { seat, field }: { seat: SeatId; field: string } = $props();

  /** ab so vielen Zeichen zeigt das Fenster den Zähler */
  const COUNT_FROM = 150;

  const table = $derived(session.state!);
  const sheet = $derived(sheetOf(table, seat));
  const value = $derived(String(getField(sheet, field) ?? ''));
  const canEdit = $derived(session.can({ type: 'sheet.setText', seat }));
  const close = () => (view.fieldDialog = null);

  // Name des Felds: „Stärke III“ (Nummern der Stärken wie im Trumpf-Dialog), „Rüstzeug 4“ usw.
  const [group, ...rest] = field.split('.');
  const index = Number(rest.at(-1));
  const label = group === 'name' ? t('sheet.field.name') : t(`sheet.field.${group}`, { n: group === 'strengths' ? t(`numerals.${index + 1}`) : index + 1 });
  const title = $derived(t('sheet.field.title', { field: label, seat: seatNo(seat) }));
  const struck = $derived(group === 'gear' && getField(sheet, `gear.struck.${index}`) === true);

  /** Stand beim Öffnen bzw. beim letzten Übernehmen; weicht der Bogen davon ab, hat jemand anderes geändert */
  let base = $state(untrack(() => value));
  let draft = $state(untrack(() => value));
  const changed = $derived(canEdit && value !== base && value !== draft);
  let refused = $state<TextRef | null>(null);

  // Platz verschwindet (weniger Spieler): Fenster zu
  $effect(() => {
    if (!seatVisibleFor(seat, table.settings.players)) close();
  });

  async function save() {
    if (draft === value) return close();
    const cmd = { type: 'sheet.setText', seat, field, value: draft };
    const r = await session.submit(cmd);
    if (r.ok) close();
    else refused = r.reason;
  }

  /** beim Öffnen gleich weiterschreiben: Fokus mit dem Cursor am Ende */
  function focusEnd(el: HTMLTextAreaElement) {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  // Felder sind einzeilig: Enter übernimmt, eingefügte Zeilenumbrüche werden Leerzeichen
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    void save();
  }
  function oninput(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    if (/[\r\n]/.test(el.value)) el.value = draft = el.value.replace(/\r?\n|\r/g, ' ');
  }
</script>

<Modal label={title} onclose={close} size="narrow">
  <DialogHead {title} onclose={close} />
  {#if canEdit}
    <p><textarea class="dialog-field" rows="4" maxlength={SHEET_TEXT_MAX} aria-label={label} bind:value={draft} {onkeydown} {oninput} {@attach focusEnd}></textarea></p>
    {#if struck || draft.length >= COUNT_FROM}
      <p class="dialog-aside row">
        <span>{struck ? t('sheet.field.struck') : ''}</span>
        {#if draft.length >= COUNT_FROM}<span>{t('sheet.field.count', { n: draft.length, max: SHEET_TEXT_MAX })}</span>{/if}
      </p>
    {/if}
    {#if changed}<p class="note" role="status">{t('sheet.field.changed')}</p>{/if}
    {#if refused}<p class="problem" role="alert">{text(refused)}</p>{/if}
    <div class="dialog-end">
      <button onclick={close}>{t('sheet.field.cancel')}</button>
      <button class="main" onclick={save}>{t('sheet.field.save')}</button>
    </div>
  {:else}
    <p class="read" class:struck>{value}</p>
    {#if struck}<p class="dialog-aside">{t('sheet.field.struck')}</p>{/if}
    <div class="dialog-end">
      <button class="main" onclick={close}>{t('sheet.field.close')}</button>
    </div>
  {/if}
</Modal>

<style>
  p { margin: 0 0 12px; }
  textarea { width: 100%; box-sizing: border-box; resize: none; font-family: inherit; line-height: 1.4; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .read { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; }
  .read.struck { text-decoration: line-through; opacity: 0.75; }
</style>
