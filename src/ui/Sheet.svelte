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
  import { photos } from './photos.svelte';
  import { seatNames } from './seatNames';
  import { session } from './session.svelte';
  import { t, text, whoColor } from './texts';
  import { anySourceOpen } from './trumpDialog';
  import { view } from './view.svelte';

  /**
   * Zuordnung (10): Namensschild in der Draufsicht, Farbstreifen an den kleinen Bögen der Rollenansicht.
   * `tools`: kleine Bedienelemente sichtbar; `quiet`: „Auswürfeln“ dezent (beides 10, Schritt 5b).
   */
  let { box, sheet, mark, tools, quiet }: { box: SheetBox; sheet: KlioSheet; mark: 'plate' | 'strip' | null; tools: boolean; quiet: boolean } = $props();

  const skin = content.skinPaper;
  const [imgW, imgH] = skin.size;
  const k = $derived((SHEET_W * box.scale) / imgW);
  const seat = $derived(box.seat);
  const image = $derived(`${import.meta.env.BASE_URL}assets/${skin.images[sheet.variant]}`);
  const names = $derived(mark === 'plate' && session.state ? seatNames(session.state, seat) : null);
  const plate = skin.nameplate;
  const rollAt = skin.rollButton;

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

  const submit = (cmd: { type: string }) => submitOrSay(cmd);

  // Was darf man an diesem Bogen? (9.3: ohne Recht ausgeblendet bzw. nur lesbar)
  const may = (type: string) => session.can({ type, seat });
  const canEdit = $derived(may('sheet.toggle'));
  const canRoll = $derived(may('sheet.roll'));
  const canPhoto = $derived(may('sheet.photo'));
  const canChooseTrump = $derived(may('trump.choose'));
  const canRemoveTrump = $derived(may('trump.remove'));
  const canRevive = $derived(may('character.revive'));

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

  // Foto: verkleinern, nach Inhalt benennen, ablegen (bzw. zum Host bringen), dann am Bogen eintragen
  let fileInput = $state<HTMLInputElement>();
  const photoHash = $derived(sheet.photo?.hash ?? null);
  const photoUrl = $derived(photoHash ? photos.urls[photoHash] : undefined);
  $effect(() => {
    if (photoHash) void session.wantPhoto(photoHash);
  });
  async function onPhoto() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    fileInput!.value = '';
    const prepared = await preparePhoto(file).catch(() => null);
    if (!prepared) return view.say(t('sheet.photoUnreadable'), true);
    const stored = await session.addPhoto(prepared.hash, prepared.bytes);
    if (!stored.ok) return view.say(text(stored.reason), true);
    await submit({ type: 'sheet.setPhoto', seat, photo: { hash: prepared.hash, type: 'image/jpeg' } });
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
  class:tools
  data-sheet={seat}
  style:left="{box.x}px"
  style:top="{box.y}px"
  style:width="{box.w}px"
  style:height="{box.h}px"
  style:opacity={box.opacity}
  style:--c={whoColor(seat)}
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
        readonly={!canEdit}
      />
    {/each}

    {#each checks as c (c.id)}
      {@const on = value(c.id) === true}
      {#if c.strikes}
        <button
          class="strike control"
          disabled={!canEdit}
          class:on
          style:left="{c.pos.x - c.pos.size / 2}px"
          style:top="{c.pos.y - c.pos.size / 2}px"
          title={t('sheet.strike')}
          onclick={() => submit({ type: 'sheet.toggle', seat, field: c.id })}>–</button>
      {:else}
        <button
          class="cb control"
          disabled={!canEdit}
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
        disabled={!canPhoto}
        onclick={() => fileInput?.click()}
      ></button>
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPhoto} />
    {/if}

    {#each slots as s (s.index)}
      {@const trump = trumpById(content.trumps, sheet.trumps[s.index])}
      <div
        class="slot control"
        class:empty={!trump}
        class:go={!trump && canChoose && canChooseTrump}
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
          else if (canChooseTrump) view.trumpDialog = seat;
        }}
        onkeydown={(e) => { if (e.key === 'Enter' && !trump && canChooseTrump) view.trumpDialog = seat; }}
      >
        {#if trump}
          <TrumpCard {trump} />
          {#if canRemoveTrump}<button class="rmv" title={t('sheet.trumpRemove')} onclick={(e) => { e.stopPropagation(); void submit({ type: 'trump.remove', seat, slot: s.index }); }}>✕</button>{/if}
        {:else}
          ＋
        {/if}
      </div>
    {/each}

    {#if names}
      <div
        class="plate"
        data-plate={seat}
        title={names.label}
        style:left="{plate.x}px" style:top="{plate.y}px" style:max-width="{plate.w}px" style:height="{plate.h}px" style:font-size="{plate.font}px"
      ><b>{names.character}</b>{#if names.person}<small>{names.person}</small>{/if}</div>
    {/if}

    <div class="sbar control" class:quiet style:left="{rollAt.x}px" style:top="{rollAt.y}px" style:width="{rollAt.w}px" style:font-size="{rollAt.font}px">
      {#if canRoll}
        <button onclick={roll} title={t('sheet.rollTitle')}>{confirmTimer !== undefined ? t('sheet.rollConfirm') : t('sheet.roll')}</button>
      {/if}
      {#if sheet.dead && canRevive}
        <button class="revive" onclick={() => submit({ type: 'character.revive', seat })}>{t('sheet.revive')}</button>
      {/if}
    </div>

    {#if sheet.dead}
      <svg class="dead-cross" viewBox="0 0 100 100" preserveAspectRatio="none" width={imgW} height={imgH}>
        <path d="M4 3L96 97M96 3L4 97" stroke-width="12" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
    {/if}
  </div>

  {#if mark === 'strip'}<div class="strip" data-strip={seat}></div>{/if}

</div>

<style>
  .sheet { position: absolute; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5); background: #fff; color: #1b1b1b; transition: left var(--shift), top var(--shift), width var(--shift), height var(--shift), opacity var(--shift); }
  .sheet.hit { outline: 3px solid rgba(190, 40, 30, 0.75); outline-offset: -3px; }
  .paper { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: center / 100% 100% no-repeat; transition: transform var(--shift); }
  .cb { position: absolute; padding: 0; border: 0; background: transparent; cursor: pointer; color: inherit; }
  .cb:disabled, .photo:disabled, .strike:disabled { cursor: default; }
  .cb.on::after { content: '\2715'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); font: 700 1em/1 sans-serif; color: #111; }
  .cb.danger.on::after { color: var(--danger); }
  .strike { position: absolute; display: none; width: 13px; height: 13px; padding: 0; border: 1px solid rgba(0, 0, 0, 0.45); border-radius: 50%; background: rgba(255, 255, 255, 0.75); cursor: pointer; font-size: 10px; line-height: 11px; color: #333; }
  .tools .strike { display: block; opacity: 0.4; }
  .tools .strike:hover { opacity: 0.95; }
  .tools .strike.on { opacity: 0.6; background: rgba(0, 0, 0, 0.45); color: #fff; border-color: transparent; }
  .counter { position: absolute; font-family: system-ui, sans-serif; font-weight: 600; line-height: 1; color: var(--danger); background: rgba(255, 255, 255, 0.85); border-radius: 7px; padding: 1px 4px; display: none; }
  .tools .counter { display: block; }
  .photo { position: absolute; padding: 0; border: 0; background: transparent center / cover no-repeat; cursor: pointer; }
  .slot { position: absolute; cursor: pointer; }
  .slot.empty { display: flex; align-items: center; justify-content: center; font: 300 54px/1 sans-serif; color: rgba(0, 0, 0, 0.25); border-radius: 6px; }
  .slot.empty.go { color: var(--accent); font-weight: 400; }
  .slot.empty:hover { background: rgba(214, 168, 40, 0.2); color: rgba(0, 0, 0, 0.6); }
  .rmv { display: none; position: absolute; top: 18px; right: 3px; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 10px; line-height: 16px; cursor: pointer; }
  .tools .rmv { display: block; }
  .dead-cross { position: absolute; left: 0; top: 0; pointer-events: none; stroke: var(--danger); }
  .plate { position: absolute; box-sizing: border-box; display: flex; align-items: baseline; gap: 0.35em; padding: 0 0.4em; border-radius: 0.3em; background: color-mix(in srgb, var(--c) 55%, transparent); color: #111; line-height: 1.5; white-space: nowrap; overflow: hidden; font-family: system-ui, sans-serif; pointer-events: none; }
  .plate b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .plate small { font-size: 0.6em; flex: none; }
  .strip { position: absolute; left: 0; top: 0; right: 0; height: 5px; background: var(--c); pointer-events: none; }
  /* immer sichtbar, unter dem Namensschild (Lage aus der Haut); außer am eigenen Bogen der Rollenansicht dezent */
  .sbar { position: absolute; display: flex; flex-wrap: wrap; gap: 0.3em; z-index: 3; opacity: 0.95; transition: opacity 0.2s; font-family: system-ui, sans-serif; }
  .sbar.quiet { opacity: 0.4; }
  .sbar.quiet:hover, .dead .sbar { opacity: 0.95; }
  .sbar button { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 0.4em; font: inherit; padding: 0.15em 0.6em; cursor: pointer; white-space: nowrap; }
  .revive { background: var(--warn-bg) !important; }
</style>
