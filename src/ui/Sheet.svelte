<script lang="ts">
  // Charakterbogen, Haut „Papier“: Bogenbild mit Feldern an festen Stellen (ARCHITEKTUR.md 10, 14).
  // Welche Felder es gibt und welcher Art, steht in sheet.yaml; Lage, Schrift und Farbton in skins/paper.yaml.
  import { untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import type { SeatId } from '../engine/types';
  import { sheetFields, type SkinBox, type SkinCheck } from '../rules/klio/content/schema';
  import { fieldParts, getField } from '../rules/klio/fields';
  import type { KlioSheet } from '../rules/klio/state';
  import { contextFor, isFull, trumpById } from '../rules/klio/trumps';
  import { CARD_BACK } from './Card.svelte';
  import SheetField from './SheetField.svelte';
  import SheetLantern from './SheetLantern.svelte';
  import TrumpCard from './TrumpCard.svelte';
  import { fitLine } from './fitLine';
  import { submitOrSay as submit } from './commands';
  import { arrivePlate, arriveSheet } from './animator.svelte';
  import { effects } from './effects.svelte';
  import { SHEET_FONT } from './fitText';
  import { CONTROLS_ZOOM, sheetImageScale, type SheetBox } from './layout';
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
  /** `onPlate`: Menü am Namensschild öffnen (Board.svelte rechnet die Lage), mit der gemessenen Breite des Schilds */
  let { box, sheet, mark, onPlate }: { box: SheetBox; sheet: KlioSheet; mark: 'plate' | 'strip' | null; onPlate: (seat: SeatId, width: number) => void } = $props();

  const skin = content.skinPaper;
  const [imgW, imgH] = skin.size;
  const k = $derived(sheetImageScale(box.scale, imgW));
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
  // Breite ohne Transformationen (R7): direkt nach dem Klick gäbe der Rahmen das Nachgeben beim Drücken mit
  function toggleMenu(e: MouseEvent) {
    if (view.plateMenu?.seat === seat) return void (view.plateMenu = null);
    onPlate(seat, (e.currentTarget as HTMLElement).offsetWidth);
  }
  const plate = skin.nameplate;
  // Bedienelemente (10, Schritt 5b): am eigenen Bogen der Rollenansicht immer und deutlich, sonst klein erst ab CONTROLS_ZOOM
  const own = $derived(mark === null);
  const tools = $derived(own || view.zoom >= CONTROLS_ZOOM);

  // Felder nach Art (sheet.yaml); Lage aus der Haut
  const all = sheetFields(content.sheet);
  const inputs = all.filter((f) => f.kind === 'text' || f.kind === 'number').map((f) => ({ ...f, kind: f.kind as 'text' | 'number', pos: skin.fields[f.id] as SkinBox }));
  // Die Kästchen der Erlebnislaterne zeichnet SheetLantern als einen Füllstand (5zm); sie haben keine eigene Position
  const lampPrefix = `${skin.lantern.field}.`;
  const lampIds = all.filter((f) => f.kind === 'check' && f.id.startsWith(lampPrefix)).map((f) => f.id);
  const checks = all.filter((f) => f.kind === 'check' && !f.id.startsWith(lampPrefix)).map((f) => ({ ...f, pos: skin.fields[f.id] as SkinCheck }));
  // Zähler „neue Narben“ (kind: counter) zeigt der Bogen seit 5k nicht mehr: ob „Neue Narbe“ offen ist, steht im Trumpfdialog
  const slots = all.filter((f) => f.kind === 'trumpSlot').map((f) => ({ index: fieldParts(f.id).index!, pos: skin.fields[f.id] as SkinBox }));
  const photoField = all.find((f) => f.kind === 'photo');
  const photoBox = photoField && (skin.fields[photoField.id] as SkinBox);
  /** Textfeld → Kästchen, das es durchstreicht bzw. hervorhebt */
  const strikerOf = new Map(checks.flatMap((c) => (c.strikes ? [[c.strikes, c.id] as const] : [])));
  const emphasizerOf = new Map(checks.flatMap((c) => (c.emphasizes ? [[c.emphasizes, c.id] as const] : [])));

  // Gezeichnete Zeichen (5z): zwei leicht gebogene Striche wie mit dem Stift, statt Zeichen aus einer Computerschrift
  const CROSS = 'M4.5 4 Q10 9.5 15.8 16.2 M15.6 4.4 Q9.5 10.5 4.2 15.6';
  const PLUS = 'M20.5 7 Q19.6 20 20 33.5 M7 20.4 Q20 19.4 33 20';

  // Narbe und Tod nach einem Treffer erst mit dem Aufprall (5k)
  const checked = (id: string) => !effects.holds(seat, id) && getField(sheet, id) === true;
  const dead = $derived(effects.shownDead(seat, sheet));
  const struck = (id: string) => strikerOf.has(id) && checked(strikerOf.get(id)!);
  const bold = (id: string) => emphasizerOf.has(id) && checked(emphasizerOf.get(id)!);
  const hasEmptySlot = $derived(!isFull(content.trumpSources, sheet));
  const sourceOpen = $derived(anySourceOpen(content, contextFor(content, sheet)));
  const canChoose = $derived(hasEmptySlot && sourceOpen);

  // Was darf man an diesem Bogen? (9.3: ohne Recht ausgeblendet bzw. nur lesbar)
  const may = (type: string) => session.can({ type, seat });
  const canEdit = $derived(may('sheet.toggle'));
  const canLamps = $derived(may('sheet.stepLamps'));
  const canPhoto = $derived(may('sheet.setPhoto'));
  const canChooseTrump = $derived(may('trump.choose'));
  const canRemoveTrump = $derived(may('trump.remove'));
  /** Trumpffeld, das mit Tab erreicht wurde: nur dann zeigt der Fokus die Geisterkarte wie beim Überfahren. Nicht über
   *  `:focus-visible`: Das träfe auch zu, wenn das Auswahlfenster mit Esc schließt und der Fokus ins Feld zurückkehrt;
   *  die Karte bliebe dann stehen, obwohl die Maus längst woanders ist. */
  let tabbedSlot = $state<number | null>(null);
  /** Feld, dessen Auswahl mit der Tastatur geöffnet wurde: kehrt der Fokus zurück, gilt es wieder als mit Tab erreicht */
  let keyedSlot: number | null = null;

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
  // Foto auch auf den Rahmen ziehen oder bei fokussiertem Rahmen einfügen (5z); nur Bilddateien
  const imageOf = (files: FileList | undefined | null): File | undefined => [...(files ?? [])].find((f) => f.type.startsWith('image/'));
  let dropping = $state(false);
  function onDragOver(e: DragEvent) {
    if (!canPhoto || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropping = true;
  }
  function onDrop(e: DragEvent) {
    dropping = false;
    const file = imageOf(e.dataTransfer?.files);
    if (!canPhoto || !file) return;
    e.preventDefault();
    void setPhoto(seat, file);
  }
  function onPaste(e: ClipboardEvent) {
    const file = imageOf(e.clipboardData?.files);
    if (!canPhoto || !file) return;
    e.preventDefault();
    void setPhoto(seat, file);
  }

  // Großansicht eines Trumpfs: beim Überfahren nach 650 ms, beim Klick angeheftet. Nur wenn das Feld dann noch unter
  // dem Zeiger liegt: Ein Ansichtswechsel verschiebt den Bogen, ohne dass ein pointerleave kommt (5x).
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  function hoverTrump(id: string | null, el?: Element) {
    clearTimeout(hoverTimer);
    if (id) hoverTimer = setTimeout(() => { if (el?.matches(':hover')) view.bigTrump = { id, pinned: false }; }, 650);
    else if (view.bigTrump && !view.bigTrump.pinned) view.bigTrump = null;
  }
  /** Klick oder Taste auf einen Trumpfplatz: belegter Platz → Großansicht angeheftet, leerer mit Recht → Auswahl */
  function activateSlot(trump: { id: string } | undefined) {
    if (trump) view.bigTrump = { id: trump.id, pinned: true };
    else if (canChooseTrump) view.trumpDialog = seat;
  }
  // abgebaut (weniger Spieler): kein Überfahren mehr offen
  $effect(() => () => clearTimeout(hoverTimer));
</script>

<div
  bind:this={sheetEl}
  class="sheet"
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
        bold={bold(f.id)}
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
          style:--hit={c.pos.hit ? `${c.pos.hit}px` : undefined}
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
          style:--hit={c.pos.hit ? `${c.pos.hit}px` : undefined}
          style:font-size="{c.pos.font ?? 22}px"
          onclick={() => submit({ type: 'sheet.toggle', seat, field: c.id })}
        >{#if on}<svg class="mark" viewBox="0 0 20 20" aria-hidden="true"><path d={CROSS} /></svg>{/if}</button>
      {/if}
    {/each}

    <SheetLantern {seat} level={lampIds.filter(checked).length} canEdit={canLamps} improve={!hasEmptySlot && sourceOpen && canChooseTrump} />

    {#if photoBox}
      <button
        class="photo control"
        class:dropping
        aria-label="Foto"
        title={canPhoto ? t('sheet.photoTitle') : undefined}
        style:left="{photoBox.x}px" style:top="{photoBox.y}px" style:width="{photoBox.w}px" style:height="{photoBox.h}px"
        style:rotate={photoBox.rotate ? `${photoBox.rotate}deg` : undefined}
        style:background-image={photoUrl ? `url(${photoUrl})` : undefined}
        disabled={!canPhoto}
        onclick={() => fileInput?.click()}
        ondragover={onDragOver}
        ondragleave={() => (dropping = false)}
        ondrop={onDrop}
        onpaste={onPaste}
      ></button>
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPhoto} />
    {/if}

    {#each slots as s (s.index)}
      {@const trump = trumpById(content.trumps, sheet.trumps[s.index])}
      <!-- leerer Platz ohne Recht: nur das graue Plus, ohne Hand, Färbung und Tooltip (5z) -->
      {@const inert = !trump && !canChooseTrump}
      <!-- Rolle und tabindex nur zusammen (nicht bei „inert“); Svelte sieht das bei bedingten Werten nicht -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="slot control"
        class:empty={!trump}
        class:go={!trump && canChoose && canChooseTrump}
        class:tabbed={s.index === tabbedSlot}
        onkeyup={(e) => { if (e.key === 'Tab' && e.target === e.currentTarget) tabbedSlot = s.index; }}
        onfocus={() => { if (keyedSlot === s.index) tabbedSlot = s.index; keyedSlot = null; }}
        onblur={() => { if (tabbedSlot === s.index) tabbedSlot = null; }}
        class:inert
        data-slot={s.index}
        style:left="{s.pos.x}px" style:top="{s.pos.y}px" style:width="{s.pos.w}px" style:height="{s.pos.h}px"
        aria-label={trump || inert ? undefined : canChoose ? t('sheet.trumpChoose') : t('sheet.trumpLocked')}
        role={inert ? undefined : 'button'}
        tabindex={inert ? undefined : 0}
        onpointerenter={(e) => hoverTrump(trump?.id ?? null, e.currentTarget)}
        onpointerleave={() => hoverTrump(null)}
        onclick={(e) => {
          e.stopPropagation();
          clearTimeout(hoverTimer);
          keyedSlot = null;
          activateSlot(trump);
        }}
        onkeydown={(e) => {
          // nur am Platz selbst: Enter auf ✕ darunter entfernt den Trumpf und soll ihn nicht groß anheften
          if (inert || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault();
          if (e.repeat) return;
          keyedSlot = s.index;
          activateSlot(trump);
        }}
        onfocusout={(e) => { if (trump && view.bigTrump?.pinned && view.bigTrump.id === trump.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) view.bigTrump = null; }}
      >
        {#if trump}
          <!-- neuer Trumpf (5zr): liegt kurz mit der Rückseite der Spielkarten im Feld und dreht sich einmal um -->
          {@const dealt = effects.dealt.has(`${seat}/trumps.${s.index}`)}
          <div class="turn" class:dealt>
            <TrumpCard {trump} />
            {#if dealt}<!-- Rückseite der Spielkarten (5zr); beide im Format 5:7 --><i class="tback" style:background-image={CARD_BACK} aria-hidden="true"></i>{/if}
          </div>
          {#if canRemoveTrump}<button class="rmv" title={t('sheet.trumpRemove')} onclick={(e) => { e.stopPropagation(); void submit({ type: 'trump.remove', seat, slot: s.index }); }}>✕</button>{/if}
        {:else}
          <!-- Geisterkarte (5zn, 10.19): leerer Umriss einer Trumpfkarte, deutet an, dass hier eine Karte hinkommt -->
          {#if !inert}
            <div class="ghost" aria-hidden="true"><i></i></div>
            {@const hintText = canChoose ? t('sheet.trumpChoose') : t('sheet.trumpLockedHint')}
            <span class="hint" aria-hidden="true" {@attach fitLine(hintText, 9)}>{hintText}</span>
          {/if}
          <svg class="plus" viewBox="0 0 40 40" aria-hidden="true"><path d={PLUS} /></svg>
        {/if}
      </div>
    {/each}

    {#if names}
      <!-- Klick nur als <button> (mit Menü); als <div> ohne Handler -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
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
  .sheet { position: absolute; border-radius: var(--radius-s); overflow: hidden; box-shadow: var(--sheet-shadow, 0 2px 10px rgba(0, 0, 0, 0.5)); background: var(--sheet-bg); color: var(--sheet-ink); transition: left var(--shift) var(--shift-ease), top var(--shift) var(--shift-ease), width var(--shift) var(--shift-ease), height var(--shift) var(--shift-ease), opacity var(--shift) var(--shift-ease); }
  .sheet.hit { outline: 3px solid var(--sheet-hit); outline-offset: -3px; }
  .paper { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: center / 100% 100% no-repeat; transition: transform var(--shift) var(--shift-ease); }
  .cb { position: absolute; padding: 0; border: 0; background: transparent; cursor: pointer; color: inherit; }
  .cb:disabled, .photo:disabled, .strike:disabled { cursor: default; }
  /* unsichtbare Klickfläche um die Mitte (`hit` in der Haut, 5z); ohne `hit` so groß wie das Kästchen */
  .cb::before, .strike::before { content: ''; position: absolute; left: 50%; top: 50%; width: var(--hit, 100%); height: var(--hit, 100%); transform: translate(-50%, -50%); }
  .mark { position: absolute; left: 50%; top: 50%; width: 1em; height: 1em; transform: translate(-50%, -50%); overflow: visible; color: var(--dark-ink); }
  .cb.danger .mark { color: var(--danger); }
  .mark path, .plus path { fill: none; stroke: currentColor; stroke-linecap: round; }
  .mark path { stroke-width: 2.6; }
  .plus { width: 40px; height: 40px; }
  .plus path { stroke-width: 3; }
  .go .plus path { stroke-width: 3.6; }
  .strike { position: absolute; display: none; width: 13px; height: 13px; padding: 0; border: 1px solid rgba(0, 0, 0, 0.45); border-radius: 50%; background: rgba(255, 255, 255, 0.75); cursor: pointer; font-size: 10px; line-height: 11px; color: var(--sheet-label); }
  .tools .strike { display: block; opacity: 0.4; }
  .tools .strike:not(:disabled):hover { opacity: 0.95; }
  .tools .strike.on { opacity: 0.6; background: rgba(0, 0, 0, 0.45); color: #fff; border-color: transparent; }
  /* multiply: weißes Papier lässt das Foto unverändert, Rahmenlinien und Klebestreifen scheinen durch (eingeklebt) */
  .photo { position: absolute; padding: 0; border: 0; background: transparent center / cover no-repeat; mix-blend-mode: multiply; cursor: pointer; }
  .photo.dropping { outline: 3px dashed var(--pickable); outline-offset: 2px; }
  .slot { position: absolute; cursor: pointer; }
  .slot.empty { display: flex; align-items: center; justify-content: center; color: rgba(0, 0, 0, 0.25); border-radius: var(--radius-s); }
  .slot.empty.go { color: var(--pickable); }
  .slot.inert { cursor: default; }
  /* Fokusrahmen nur, wenn das Feld mit der Tastatur erreicht wurde (.tabbed): Nach Klick und Esc im Auswahlfenster
     kehrt der Fokus hierher zurück und gälte als Tastaturfokus, der Rahmen bliebe um das Feld stehen (5zn) */
  .slot:focus-visible:not(.tabbed) { outline: none; }
  /* Geisterkarte (5zn): Rand und Kopfband wie eine Trumpfkarte, leer, mit dem Papier verrechnet (Wasserzeichen und
     Rahmen scheinen durch). Bewegung und Deckkraft liegen auf .ghost, nicht auf .slot: sonst wirkt multiply nicht mehr
     gegen das Papier. In Ruhe ist sie unsichtbar und wartet etwas höher und schräg; beim Überfahren
     legt sie sich ins Feld. Gesperrte Felder (ohne .go) haben keine Karte, nur die Zeile unter dem Plus. */
  .ghost { position: absolute; inset: 0; box-sizing: border-box; border: 2px solid var(--pickable); border-radius: var(--radius-m); overflow: hidden; mix-blend-mode: multiply; pointer-events: none; opacity: 0; transform: translateY(var(--ghost-shift)) rotate(var(--ghost-tilt)); transition: opacity var(--ghost-out) ease, transform var(--ghost-out) ease; }
  .ghost i { display: block; height: 22px; background: var(--pickable); }
  .hint { position: absolute; pointer-events: none; opacity: 0; color: var(--sheet-label); font-family: system-ui, sans-serif; transition: opacity var(--ghost-out) ease; }
  .slot.go .hint { left: 7px; right: 7px; top: 28px; font-family: var(--trump-serif); font-weight: 700; font-size: 13.5px; line-height: 1.15; white-space: nowrap; }
  .slot:not(.go) .hint { left: 8px; right: 8px; top: 114px; font-size: 11px; line-height: 1.25; text-align: center; }
  .plus path { transition: stroke-width var(--ghost-in) ease; }
  .slot.go.tabbed .ghost, .slot.go:active .ghost { opacity: var(--ghost-on); transform: none; transition-duration: var(--ghost-in); transition-timing-function: ease-out; }
  .slot.go.tabbed .hint { opacity: 0.75; transition-duration: var(--ghost-in); }
  .slot.empty.tabbed:not(.go, .inert) .hint { opacity: 0.6; }
  .slot.go.tabbed .plus path { stroke-width: 4.4; }
  /* Überfahren nur mit Zeiger: auf Touch bliebe die Karte nach dem Antippen stehen */
  @media (hover: hover) {
    .slot.go:hover .ghost { opacity: var(--ghost-on); transform: none; transition-duration: var(--ghost-in); transition-timing-function: ease-out; }
    .slot.go:hover .hint { opacity: 0.75; transition-duration: var(--ghost-in); }
    .slot.empty:not(.go, .inert):hover .hint { opacity: 0.6; }
    .slot.go:hover .plus path { stroke-width: 4.4; }
  }
  /* Aufdecken eines neuen Trumpfs (5zr): Vorder- und Rückseite Rücken an Rücken, in der Mitte leicht angehoben */
  .turn { position: absolute; inset: 0; }
  .turn.dealt { transform-style: preserve-3d; animation: trump-turn var(--trump-turn) ease-in-out both; }
  .turn.dealt :global(.tcard), .tback { backface-visibility: hidden; }
  .tback { position: absolute; inset: 0; border-radius: var(--radius-m); background: center / 100% 100% no-repeat; box-shadow: var(--trump-shadow); transform: rotateY(180deg); }
  /* solange die Karte sich dreht, schwebt kein ✕ über dem Feld */
  .turn.dealt + .rmv { visibility: hidden; }
  @keyframes -global-trump-turn {
    0% { transform: perspective(500px) translateY(0) rotateY(180deg) scale(1); }
    50% { transform: perspective(500px) translateY(-7px) rotateY(90deg) scale(1.07); }
    100% { transform: perspective(500px) translateY(0) rotateY(0deg) scale(1); }
  }
  .rmv { display: none; position: absolute; top: 25px; right: 5px; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 10px; line-height: 16px; cursor: pointer; }
  .tools .rmv { display: block; }
  .dead-cross { position: absolute; left: 0; top: 0; pointer-events: none; stroke: var(--danger); }
  .plate { position: absolute; box-sizing: border-box; display: flex; align-items: baseline; gap: 0.35em; padding: 0 0.4em; border-radius: 0.3em; background: color-mix(in srgb, var(--c) 55%, transparent); color: var(--dark-ink); line-height: 1.5; white-space: nowrap; overflow: hidden; font-family: system-ui, sans-serif; pointer-events: none; }
  .plate.menu { pointer-events: auto; border: 0; cursor: pointer; transition: background 0.15s, scale var(--press) ease-out, opacity var(--away-t, var(--back)) ease; }
  .plate.menu:hover, .plate.menu[aria-expanded='true'] { background: color-mix(in srgb, var(--c) 80%, transparent); }
  .plate b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .plate small { font-size: 0.6em; flex: none; opacity: 0.75; }
  .strip { position: absolute; left: 0; top: 0; right: 0; height: 5px; background: var(--c); pointer-events: none; }
</style>
