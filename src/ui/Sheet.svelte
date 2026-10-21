<script lang="ts">
  // Charakterbogen, Haut „Papier“: Bogenbild mit Feldern an festen Stellen (ARCHITEKTUR.md 10, 14).
  // Welche Felder es gibt und welcher Art, steht in sheet.yaml; Lage, Schrift und Farbton in skins/paper.yaml.
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { sheetFields, type SkinBox, type SkinCheck } from '../rules/klio/content/schema';
  import { getField } from '../rules/klio/fields';
  import type { KlioSheet } from '../rules/klio/state';
  import { contextFor, isFull, trumpById } from '../rules/klio/trumps';
  import SheetField from './SheetField.svelte';
  import TrumpCard from './TrumpCard.svelte';
  import { submitOrSay as submit } from './commands';
  import { arrivePlate, arriveSheet } from './animator.svelte';
  import { effects } from './effects.svelte';
  import { SHEET_FONT } from './fitText';
  import { CONTROLS_ZOOM, SHEET_W, type SheetBox } from './layout';
  import { photos } from './photos.svelte';
  import { entriesAt } from './PlateMenu.svelte';
  import { seatNames } from './seatNames';
  import { setPhoto } from './sheetActions';
  import { session } from './session.svelte';
  import { whoColor } from './colors';
  import { t } from './texts';
  import { anySourceOpen } from './trumpDialog';
  import { view } from './view.svelte';

  /** Zuordnung (10): Namensschild in der Draufsicht, Farbstreifen an den kleinen Bögen der Rollenansicht, null = eigener Bogen der Rollenansicht */
  let { box, sheet, mark }: { box: SheetBox; sheet: KlioSheet; mark: 'plate' | 'strip' | null } = $props();

  const skin = content.skinPaper;
  const [imgW, imgH] = skin.size;
  const k = $derived((SHEET_W * box.scale) / imgW);
  const seat = $derived(box.seat);
  const image = $derived(`${import.meta.env.BASE_URL}assets/${skin.images[sheet.variant]}`);
  // Namensschild in der Übersicht und auf dem großen Bogen der Rollenansicht (10.1), nicht an den Streifen
  const names = $derived(mark !== 'strip' && session.state ? seatNames(session.state, seat) : null);
  /** nicht verbunden (11.7): Schild und Streifen blasser, am Schild „nicht da“ */
  const away = $derived(session.away.has(seat));
  const still = $derived(session.awayStill.has(seat));
  // Ankommen (11.7, Teil 4): neu mit Bogen und Schild, „wieder da“ nur am Schild
  let sheetEl: HTMLDivElement;
  let plateEl = $state<HTMLElement>();
  const arriving = $derived(effects.arrived.has(`${seat}/new`) ? 'new' : effects.arrived.has(`${seat}/back`) ? 'back' : null);
  $effect(() => {
    const how = arriving;
    if (!how) return;
    untrack(() => {
      if (how === 'new') arriveSheet(sheetEl);
      if (plateEl) arrivePlate(plateEl);
    });
  });
  const menu = $derived(names ? entriesAt(seat).length > 0 : false);
  function toggleMenu(e: MouseEvent) {
    if (view.plateMenu?.seat === seat) return void (view.plateMenu = null);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    view.plateMenu = { seat, x: r.left, y: r.bottom + 4, above: r.top - 4 };
  }
  const plate = skin.nameplate;
  // Bedienelemente (10, Schritt 5b): am eigenen Bogen der Rollenansicht immer und deutlich, sonst klein erst ab CONTROLS_ZOOM
  const own = $derived(mark === null);
  const tools = $derived(own || view.zoom >= CONTROLS_ZOOM);

  // Felder nach Art (sheet.yaml); Lage aus der Haut
  const all = sheetFields(content.sheet);
  const inputs = all.filter((f) => f.kind === 'text' || f.kind === 'number').map((f) => ({ ...f, kind: f.kind as 'text' | 'number', pos: skin.fields[f.id] as SkinBox }));
  const checks = all.filter((f) => f.kind === 'check').map((f) => ({ ...f, pos: skin.fields[f.id] as SkinCheck }));
  // Zähler „neue Narben“ (kind: counter) zeigt der Bogen seit 5k nicht mehr: ob „Neue Narbe“ offen ist, steht im Trumpfdialog
  const slots = all.filter((f) => f.kind === 'trumpSlot').map((f) => ({ index: Number(f.id.split('.').pop()), pos: skin.fields[f.id] as SkinBox }));
  const photoField = all.find((f) => f.kind === 'photo');
  const photoBox = photoField && (skin.fields[photoField.id] as SkinBox);
  /** Textfeld → Kästchen, das es durchstreicht */
  const strikerOf = new Map(checks.flatMap((c) => (c.strikes ? [[c.strikes, c.id] as const] : [])));

  // Narbe und Tod nach einem Treffer erst mit dem Aufprall (5k)
  const checked = (id: string) => !effects.holds(seat, id) && getField(sheet, id) === true;
  const dead = $derived(sheet.dead && !effects.holds(seat, 'dead'));
  const struck = (id: string) => strikerOf.has(id) && checked(strikerOf.get(id)!);
  const hasEmptySlot = $derived(!isFull(content.trumpSources, sheet));
  const canChoose = $derived(hasEmptySlot && anySourceOpen(content, contextFor(content, sheet)));

  // Was darf man an diesem Bogen? (9.3: ohne Recht ausgeblendet bzw. nur lesbar)
  const may = (type: string) => session.can({ type, seat });
  const canEdit = $derived(may('sheet.toggle'));
  const canPhoto = $derived(may('sheet.setPhoto'));
  const canChooseTrump = $derived(may('trump.choose'));
  const canRemoveTrump = $derived(may('trump.remove'));

  // Foto: über das Dateifeld, weiter in `setPhoto` (sheetActions.ts)
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
    await setPhoto(seat, file);
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
  bind:this={sheetEl}
  class="sheet"
  class:dead
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
        value={String(getField(sheet, f.id) ?? '')}
        x={f.pos.x} y={f.pos.y} w={f.pos.w} h={f.pos.h}
        font={f.pos.font ?? 17}
        struck={struck(f.id)}
        center={f.pos.align === 'center'}
        readonly={!canEdit}
      />
    {/each}

    {#each checks as c (c.id)}
      {@const on = checked(c.id)}
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
      <svelte:element
        this={menu ? 'button' : 'div'}
        bind:this={plateEl}
        class="plate away-fade"
        class:menu
        class:away
        class:still
        data-plate={seat}
        title={menu ? `${names.label} – ${t('plate.open')}` : names.label}
        aria-haspopup={menu ? 'menu' : undefined}
        aria-expanded={menu ? view.plateMenu?.seat === seat : undefined}
        onclick={menu ? toggleMenu : undefined}
        style:left="{plate.x}px" style:top="{plate.y}px" style:max-width="{plate.w}px" style:height="{plate.h}px" style:font-size="{plate.font}px"
      ><b>{names.plate}</b>{#if names.free && session.mode !== 'local'}<small>{t('room.free')}</small>{:else if away}<small>{t('room.away')}</small>{/if}</svelte:element>
    {/if}

    {#if dead}
      <svg class="dead-cross" viewBox="0 0 100 100" preserveAspectRatio="none" width={imgW} height={imgH}>
        <path d="M4 3L96 97M96 3L4 97" stroke-width="12" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
    {/if}
  </div>

  {#if mark === 'strip'}<div class="strip away-fade" class:away class:still data-strip={seat}></div>{/if}

</div>

<style>
  .sheet { position: absolute; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5); background: #fff; color: #1b1b1b; transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease), width var(--shift) var(--shift-ease), height var(--shift) var(--shift-ease), opacity var(--shift) var(--shift-ease); }
  .sheet.hit { outline: 3px solid rgba(190, 40, 30, 0.75); outline-offset: -3px; }
  .paper { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: center / 100% 100% no-repeat; transition: transform var(--shift) var(--shift-ease); }
  .cb { position: absolute; padding: 0; border: 0; background: transparent; cursor: pointer; color: inherit; }
  .cb:disabled, .photo:disabled, .strike:disabled { cursor: default; }
  .cb.on::after { content: '\2715'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); font: 700 1em/1 sans-serif; color: #111; }
  .cb.danger.on::after { color: var(--danger); }
  .strike { position: absolute; display: none; width: 13px; height: 13px; padding: 0; border: 1px solid rgba(0, 0, 0, 0.45); border-radius: 50%; background: rgba(255, 255, 255, 0.75); cursor: pointer; font-size: 10px; line-height: 11px; color: #333; }
  .tools .strike { display: block; opacity: 0.4; }
  .tools .strike:hover { opacity: 0.95; }
  .tools .strike.on { opacity: 0.6; background: rgba(0, 0, 0, 0.45); color: #fff; border-color: transparent; }
  .photo { position: absolute; padding: 0; border: 0; background: transparent center / cover no-repeat; cursor: pointer; }
  .slot { position: absolute; cursor: pointer; }
  .slot.empty { display: flex; align-items: center; justify-content: center; font: 300 54px/1 sans-serif; color: rgba(0, 0, 0, 0.25); border-radius: 6px; }
  .slot.empty.go { color: var(--accent); font-weight: 400; }
  .slot.empty:hover { background: rgba(214, 168, 40, 0.2); color: rgba(0, 0, 0, 0.6); }
  .rmv { display: none; position: absolute; top: 18px; right: 3px; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 10px; line-height: 16px; cursor: pointer; }
  .tools .rmv { display: block; }
  .dead-cross { position: absolute; left: 0; top: 0; pointer-events: none; stroke: var(--danger); }
  .plate { position: absolute; box-sizing: border-box; display: flex; align-items: baseline; gap: 0.35em; padding: 0 0.4em; border-radius: 0.3em; background: color-mix(in srgb, var(--c) 55%, transparent); color: #111; line-height: 1.5; white-space: nowrap; overflow: hidden; font-family: system-ui, sans-serif; pointer-events: none; }
  .plate.menu { pointer-events: auto; border: 0; cursor: pointer; transition: background 0.15s, scale var(--press) ease-out, opacity var(--away-t, var(--back)) ease; }
  .plate.menu:hover, .plate.menu[aria-expanded='true'] { background: color-mix(in srgb, var(--c) 80%, transparent); }
  .plate b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .plate small { font-size: 0.6em; flex: none; opacity: 0.75; }
  .strip { position: absolute; left: 0; top: 0; right: 0; height: 5px; background: var(--c); pointer-events: none; }
</style>
