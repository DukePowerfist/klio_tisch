<script lang="ts">
  // Charakterbogen, Haut „Papier“: Bogenbild mit Feldern an festen Stellen (ARCHITEKTUR.md 10, 14).
  // Welche Felder es gibt, steht in sheet.yaml, wo sie liegen in skins/paper.yaml.
  import content from 'virtual:klio-content';
  import type { SeatId } from '../engine/types';
  import { sheetFieldInstances } from '../rules/klio/content/schema';
  import { fieldKind, getField } from '../rules/klio/fields';
  import type { KlioSheet } from '../rules/klio/state';
  import SheetField from './SheetField.svelte';
  import TrumpCard from './TrumpCard.svelte';
  import { SHEET_FONT } from './fitText';
  import { SHEET_W, type SheetBox } from './layout';
  import { preparePhoto } from './photo';
  import { photos, session } from './session.svelte';
  import { t, text } from './texts';
  import { anySourceOpen, context } from './trumpDialog';
  import { view } from './view.svelte';

  let { box, sheet, hit = false }: { box: SheetBox; sheet: KlioSheet; hit?: boolean } = $props();

  const skin = content.skinPaper;
  const [imgW, imgH] = skin.size;
  const k = $derived((SHEET_W * box.scale) / imgW);
  const seat = $derived(box.seat as SeatId);
  const image = $derived(`${import.meta.env.BASE_URL}assets/${skin.images[sheet.variant]}`);

  type Box = { x: number; y: number; w: number; h: number; font?: number };
  type Check = { x: number; y: number; size: number };
  const fields = sheetFieldInstances(content.sheet).map((id) => ({ id, kind: fieldKind(id), pos: skin.fields[id]! }));
  const inputs = fields.filter((f) => f.kind === 'text' || f.kind === 'number') as { id: string; kind: 'text' | 'number'; pos: Box }[];
  const checks = fields.filter((f) => f.kind === 'check') as { id: string; pos: Check }[];
  const slots = fields.filter((f) => f.id.startsWith('trumps.')).map((f) => ({ index: Number(f.id.split('.')[1]), pos: f.pos as Box }));
  const photoBox = skin.fields['photo'] as Box;
  const heart = skin.fields['scars.heart'] as Check;

  const value = (id: string) => getField(sheet, id);
  const struck = (id: string) => id.startsWith('gear.text.') && value(id.replace('.text.', '.struck.')) === true;
  const trumpOf = (id: string | null) => (id ? content.trumps.find((x) => x.id === id) : undefined);
  const canChoose = $derived(anySourceOpen(content, context(content, sheet)));

  async function submit(cmd: object) {
    const r = await session.submit(cmd);
    if (!r.ok) view.say(text(r.reason), true);
  }

  // Kästchen: Größe wie bisher (unter 20 → 13 px Schrift, über 24 → 30 px, sonst 22 px)
  const checkFont = (size: number) => (size < 20 ? 13 : size > 24 ? 30 : 22);

  // „Auswürfeln“ fragt nach, wenn schon Einträge da sind (wie bisher 3,5 s)
  let confirmRoll = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  const filled = $derived(
    sheet.strengths.some((s) => s.text) || sheet.weaknesses.some(Boolean) || sheet.experiences.some(Boolean) ||
    Object.values(sheet.attributes).some((a) => a !== null),
  );
  function roll() {
    if (filled && !confirmRoll) {
      confirmRoll = true;
      confirmTimer = setTimeout(() => (confirmRoll = false), 3500);
      return;
    }
    clearTimeout(confirmTimer);
    confirmRoll = false;
    void submit({ type: 'sheet.roll', seat });
  }

  // Foto: verkleinern, nach Inhalt benennen, lokal ablegen, dann am Bogen eintragen
  let fileInput = $state<HTMLInputElement>();
  let photoUrl = $state<string | null>(null);
  $effect(() => {
    const ref = sheet.photo;
    if (!ref) {
      photoUrl = null;
      return;
    }
    void photos.url(ref.hash).then((u) => (photoUrl = u));
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
  class:hit
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
        center={f.id === 'name'}
      />
    {/each}

    {#each checks as c (c.id)}
      {#if c.id.startsWith('gear.struck.')}
        <button
          class="strike control"
          class:on={value(c.id) === true}
          style:left="{c.pos.x - c.pos.size / 2}px"
          style:top="{c.pos.y - c.pos.size / 2}px"
          title={t('sheet.strike')}
          onclick={() => submit({ type: 'sheet.toggle', seat, field: c.id })}>–</button>
      {:else}
        <button
          class="cb control"
          class:on={value(c.id) === true}
          class:red={c.id.startsWith('scars.')}
          data-check={c.id}
          aria-pressed={value(c.id) === true}
          style:left="{c.pos.x - c.pos.size / 2}px"
          style:top="{c.pos.y - c.pos.size / 2}px"
          style:width="{c.pos.size}px"
          style:height="{c.pos.size}px"
          style:font-size="{checkFont(c.pos.size)}px"
          onclick={() => submit({ type: 'sheet.toggle', seat, field: c.id })}
        ></button>
      {/if}
    {/each}

    {#if sheet.newScars > 0}
      <!-- Zähler „neue Narben“, dezent an der Herz-Narbe (13.1) -->
      <div class="scars-new" style:left="{heart.x + heart.size / 2 + 4}px" style:top="{heart.y - heart.size / 2}px">{sheet.newScars}</div>
    {/if}

    <button
      class="photo control"
      aria-label="Foto"
      style:left="{photoBox.x}px" style:top="{photoBox.y}px" style:width="{photoBox.w}px" style:height="{photoBox.h}px"
      style:background-image={photoUrl ? `url(${photoUrl})` : undefined}
      onclick={() => fileInput?.click()}
    ></button>
    <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPhoto} />

    {#each slots as s (s.index)}
      {@const trump = trumpOf(sheet.trumps[s.index] ?? null)}
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
        <path d="M4 3L96 97M96 3L4 97" stroke="#b3261e" stroke-width="12" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
    {/if}
  </div>

  <div class="sbar control">
    <button onclick={roll} title={t('sheet.rollTitle')}>{confirmRoll ? t('sheet.rollConfirm') : t('sheet.roll')}</button>
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
  .cb.red.on::after { color: #b3261e; }
  .strike { position: absolute; display: none; width: 13px; height: 13px; padding: 0; border: 1px solid rgba(0, 0, 0, 0.45); border-radius: 50%; background: rgba(255, 255, 255, 0.75); cursor: pointer; font-size: 10px; line-height: 11px; color: #333; }
  :global(body.zoomed) .strike { display: block; opacity: 0.4; }
  :global(body.zoomed) .strike:hover { opacity: 0.95; }
  :global(body.zoomed) .strike.on { opacity: 0.6; background: rgba(0, 0, 0, 0.45); color: #fff; border-color: transparent; }
  .scars-new { position: absolute; font: 600 13px/1 system-ui, sans-serif; color: #b3261e; background: rgba(255, 255, 255, 0.85); border-radius: 7px; padding: 1px 4px; display: none; }
  :global(body.zoomed) .scars-new { display: block; }
  .photo { position: absolute; padding: 0; border: 0; background: transparent center / cover no-repeat; cursor: pointer; }
  .slot { position: absolute; cursor: pointer; }
  .slot.empty { display: flex; align-items: center; justify-content: center; font: 300 54px/1 sans-serif; color: rgba(0, 0, 0, 0.25); border-radius: 6px; }
  .slot.empty.go { color: #d6a828; font-weight: 400; }
  .slot.empty:hover { background: rgba(214, 168, 40, 0.2); color: rgba(0, 0, 0, 0.6); }
  .rmv { display: none; position: absolute; top: 18px; right: 3px; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 10px; line-height: 16px; cursor: pointer; }
  :global(body.zoomed) .rmv { display: block; }
  .dead-cross { position: absolute; left: 0; top: 0; pointer-events: none; }
  .sbar { position: absolute; left: 6px; top: 5px; display: flex; gap: 4px; z-index: 3; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  :global(body.zoomed) .sbar { opacity: 0.4; pointer-events: auto; }
  :global(body.zoomed) .sbar:hover, .dead .sbar { opacity: 0.95; pointer-events: auto; }
  .sbar button { background: #17332a; color: var(--ink); border: 1px solid var(--line); border-radius: 5px; font-size: 11px; padding: 2px 7px; cursor: pointer; }
  .revive { background: #7a2a22 !important; }
</style>
