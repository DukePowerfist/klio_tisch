<script lang="ts">
  // Charakterbogen, Haut „Papier“: Bogenbild mit Feldern an festen Stellen (ARCHITEKTUR.md 10, 14).
  // Welche Felder es gibt und welcher Art, steht in sheet.yaml; Lage, Schrift und Farbton in skins/paper.yaml.
  import content from 'virtual:klio-content';
  import { sheetFields, type SkinBox, type SkinCheck, type SkinLabel } from '../rules/klio/content/schema';
  import { getField } from '../rules/klio/fields';
  import { rollOverwrites } from '../rules/klio/generators/rollSheet';
  import type { KlioSheet } from '../rules/klio/state';
  import { contextFor, trumpById } from '../rules/klio/trumps';
  import SheetField from './SheetField.svelte';
  import TrumpCard from './TrumpCard.svelte';
  import { submitOrSay } from './commands';
  import { effects } from './effects.svelte';
  import { SHEET_FONT } from './fitText';
  import { SHEET_W, type SheetBox } from './layout';
  import { preparePhoto } from './photo';
  import { photos } from './session.svelte';
  import { t } from './texts';
  import { anySourceOpen } from './trumpDialog';
  import { view } from './view.svelte';

  let { box, sheet }: { box: SheetBox; sheet: KlioSheet } = $props();

  const skin = content.skinPaper;
  const [imgW, imgH] = skin.size;
  const k = $derived((SHEET_W * box.scale) / imgW);
  const seat = $derived(box.seat);
  const image = $derived(`${import.meta.env.BASE_URL}assets/${skin.images[sheet.variant]}`);

  // Felder nach Art (sheet.yaml); Lage aus der Haut
  const all = sheetFields(content.sheet);
  const inputs = all.filter((f) => f.kind === 'text' || f.kind === 'number').map((f) => ({ ...f, kind: f.kind as 'text' | 'number', pos: skin.fields[f.id] as SkinBox }));
  const checks = all.filter((f) => f.kind === 'check').map((f) => ({ ...f, pos: skin.fields[f.id] as SkinCheck }));
  const counters = all.filter((f) => f.kind === 'counter').map((f) => ({ ...f, pos: skin.fields[f.id] as SkinLabel }));
  const slots = all.filter((f) => f.kind === 'trumpSlot').map((f) => ({ index: Number(f.id.split('.').pop()), pos: skin.fields[f.id] as SkinBox }));
  const photoField = all.find((f) => f.kind === 'photo');
  const photoBox = photoField && (skin.fields[photoField.id] as SkinBox);
  /** Textfeld → Kästchen, das es durchstreicht */
  const strikerOf = new Map(checks.flatMap((c) => (c.strikes ? [[c.strikes, c.id] as const] : [])));

  const value = (id: string) => getField(sheet, id);
  const struck = (id: string) => strikerOf.has(id) && value(strikerOf.get(id)!) === true;
  const hasEmptySlot = $derived(sheet.trumps.some((x) => x === null));
  const canChoose = $derived(hasEmptySlot && anySourceOpen(content, contextFor(content, sheet)));

  const submit = (cmd: object) => submitOrSay(cmd);

  // „Auswürfeln“ fragt nach, wenn schon Einträge da sind (wie bisher 3,5 s)
  let confirmTimer = $state<ReturnType<typeof setTimeout>>();
  function roll() {
    if (rollOverwrites(content, sheet) && confirmTimer === undefined) {
      confirmTimer = setTimeout(() => (confirmTimer = undefined), 3500);
      return;
    }
    clearTimeout(confirmTimer);
    confirmTimer = undefined;
    void submit({ type: 'sheet.roll', seat });
  }

  // Foto: verkleinern, nach Inhalt benennen, lokal ablegen, dann am Bogen eintragen
  let fileInput = $state<HTMLInputElement>();
  let photoUrl = $state<string | null>(null);
  const photoHash = $derived(sheet.photo?.hash ?? null);
  $effect(() => {
    const hash = photoHash;
    if (!hash) photoUrl = null;
    else void photos.url(hash).then((u) => (photoUrl = u));
  });
  async function onPhoto() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    const { hash, blob } = await preparePhoto(file);
    await photos.put(hash, blob);
    await submit({ type: 'sheet.setPhoto', seat, photo: { hash, type: 'image/jpeg' } });
    fileInput!.value = '';
  }

  // Großansicht eines Trumpfs: beim Überfahren nach 650 ms, beim Klick angeheftet
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  function hoverTrump(id: string | null) {
    clearTimeout(hoverTimer);
    if (id) hoverTimer = setTimeout(() => (view.bigTrump = { id, pinned: false }), 650);
    else if (view.bigTrump && !view.bigTrump.pinned) view.bigTrump = null;
  }
</script>

<div
  class="sheet"
  class:dead={sheet.dead}
  class:hit={effects.hit.has(seat)}
  data-sheet={seat}
  style:left="{box.x}px"
  style:top="{box.y}px"
  style:width="{box.w}px"
  style:height="{box.h}px"
  style:opacity={box.opacity}
>
  <div class="paper" style:width="{imgW}px" style:height="{imgH}px" style:transform="scale({k})" style:background-image="url({image})" style:font-family={SHEET_FONT}>
    {#each inputs as f (f.id)}
      <SheetField
        {seat}
        field={f.id}
        kind={f.kind}
        value={String(value(f.id) ?? '')}
        x={f.pos.x} y={f.pos.y} w={f.pos.w} h={f.pos.h}
        font={f.pos.font ?? 17}
        struck={struck(f.id)}
        center={f.pos.align === 'center'}
      />
    {/each}

    {#each checks as c (c.id)}
      {@const on = value(c.id) === true}
      {#if c.strikes}
        <button
          class="strike control"
          class:on
          style:left="{c.pos.x - c.pos.size / 2}px"
          style:top="{c.pos.y - c.pos.size / 2}px"
          title={t('sheet.strike')}
          onclick={() => submit({ type: 'sheet.toggle', seat, field: c.id })}>–</button>
      {:else}
        <button
          class="cb control"
          class:on
          class:danger={c.pos.tone === 'danger'}
          data-check={c.id}
          aria-pressed={on}
          style:left="{c.pos.x - c.pos.size / 2}px"
          style:top="{c.pos.y - c.pos.size / 2}px"
          style:width="{c.pos.size}px"
          style:height="{c.pos.size}px"
          style:font-size="{c.pos.font ?? 22}px"
          onclick={() => submit({ type: 'sheet.toggle', seat, field: c.id })}
        ></button>
      {/if}
    {/each}

    {#each counters as c (c.id)}
      {@const n = Number(value(c.id) ?? 0)}
      {#if n > 0}
        <div class="counter" data-counter={c.id} style:left="{c.pos.x}px" style:top="{c.pos.y}px" style:font-size="{c.pos.font}px">{n}</div>
      {/if}
    {/each}

    {#if photoBox}
      <button
        class="photo control"
        aria-label="Foto"
        style:left="{photoBox.x}px" style:top="{photoBox.y}px" style:width="{photoBox.w}px" style:height="{photoBox.h}px"
        style:background-image={photoUrl ? `url(${photoUrl})` : undefined}
        onclick={() => fileInput?.click()}
      ></button>
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPhoto} />
    {/if}

    {#each slots as s (s.index)}
      {@const trump = trumpById(content.trumps, sheet.trumps[s.index])}
      <div
        class="slot control"
        class:empty={!trump}
        class:go={!trump && canChoose}
        data-slot={s.index}
        style:left="{s.pos.x}px" style:top="{s.pos.y}px" style:width="{s.pos.w}px" style:height="{s.pos.h}px"
        title={trump ? undefined : canChoose ? t('sheet.trumpChoose') : t('sheet.trumpLocked')}
        role="button"
        tabindex="0"
        onpointerenter={() => hoverTrump(trump?.id ?? null)}
        onpointerleave={() => hoverTrump(null)}
        onclick={(e) => {
          e.stopPropagation();
          if (trump) view.bigTrump = { id: trump.id, pinned: true };
          else view.trumpDialog = seat;
        }}
        onkeydown={(e) => { if (e.key === 'Enter' && !trump) view.trumpDialog = seat; }}
      >
        {#if trump}
          <TrumpCard {trump} />
          <button class="rmv" title={t('sheet.trumpRemove')} onclick={(e) => { e.stopPropagation(); void submit({ type: 'trump.remove', seat, slot: s.index }); }}>✕</button>
        {:else}
          ＋
        {/if}
      </div>
    {/each}

    {#if sheet.dead}
      <svg class="dead-cross" viewBox="0 0 100 100" preserveAspectRatio="none" width={imgW} height={imgH}>
        <path d="M4 3L96 97M96 3L4 97" stroke-width="12" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
    {/if}
  </div>

  <div class="sbar control">
    <button onclick={roll} title={t('sheet.rollTitle')}>{confirmTimer !== undefined ? t('sheet.rollConfirm') : t('sheet.roll')}</button>
    {#if sheet.dead}
      <button class="revive" onclick={() => submit({ type: 'character.revive', seat })}>{t('sheet.revive')}</button>
    {/if}
  </div>
</div>

<style>
  .sheet { position: absolute; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5); background: #fff; color: #1b1b1b; transition: left var(--shift), top var(--shift), width var(--shift), height var(--shift), opacity var(--shift); }
  .sheet.hit { outline: 3px solid rgba(190, 40, 30, 0.75); outline-offset: -3px; }
  .paper { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: center / 100% 100% no-repeat; transition: transform var(--shift); }
  .cb { position: absolute; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .cb.on::after { content: '\2715'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); font: 700 1em/1 sans-serif; color: #111; }
  .cb.danger.on::after { color: var(--danger); }
  .strike { position: absolute; display: none; width: 13px; height: 13px; padding: 0; border: 1px solid rgba(0, 0, 0, 0.45); border-radius: 50%; background: rgba(255, 255, 255, 0.75); cursor: pointer; font-size: 10px; line-height: 11px; color: #333; }
  :global(body.zoomed) .strike { display: block; opacity: 0.4; }
  :global(body.zoomed) .strike:hover { opacity: 0.95; }
  :global(body.zoomed) .strike.on { opacity: 0.6; background: rgba(0, 0, 0, 0.45); color: #fff; border-color: transparent; }
  .counter { position: absolute; font-family: system-ui, sans-serif; font-weight: 600; line-height: 1; color: var(--danger); background: rgba(255, 255, 255, 0.85); border-radius: 7px; padding: 1px 4px; display: none; }
  :global(body.zoomed) .counter { display: block; }
  .photo { position: absolute; padding: 0; border: 0; background: transparent center / cover no-repeat; cursor: pointer; }
  .slot { position: absolute; cursor: pointer; }
  .slot.empty { display: flex; align-items: center; justify-content: center; font: 300 54px/1 sans-serif; color: rgba(0, 0, 0, 0.25); border-radius: 6px; }
  .slot.empty.go { color: var(--accent); font-weight: 400; }
  .slot.empty:hover { background: rgba(214, 168, 40, 0.2); color: rgba(0, 0, 0, 0.6); }
  .rmv { display: none; position: absolute; top: 18px; right: 3px; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 10px; line-height: 16px; cursor: pointer; }
  :global(body.zoomed) .rmv { display: block; }
  .dead-cross { position: absolute; left: 0; top: 0; pointer-events: none; stroke: var(--danger); }
  .sbar { position: absolute; left: 6px; top: 5px; display: flex; gap: 4px; z-index: 3; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  :global(body.zoomed) .sbar { opacity: 0.4; pointer-events: auto; }
  :global(body.zoomed) .sbar:hover, .dead .sbar { opacity: 0.95; pointer-events: auto; }
  .sbar button { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 5px; font-size: 11px; padding: 2px 7px; cursor: pointer; }
  .revive { background: var(--warn-bg) !important; }
</style>
