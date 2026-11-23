<script lang="ts">
  // Erlebnislaterne am Bogen (5zm, ARCHITEKTUR.md 10.18): die drei Lampen als ein Füllstand, von unten gefüllt.
  // Je gefülltem Glasabschnitt ein warmer Schein, dazu eine Flamme, die mit dem Stand wächst; voll leuchtet die
  // Laterne über das Glas hinaus. Linksklick füllt, Rechtsklick leert, Pfeiltasten beides. Daneben zwei kleine Knöpfe,
  // die beim Überfahren, bei Tastaturfokus und nach dem Antippen (Touch) erscheinen. Lage und Maße aus der Haut
  // (`lantern`), gezählt wird im Regelwerk (`sheet.stepLamps`); nicht zu verwechseln mit der Laterne auf dem Tisch
  // (Lamp.svelte).
  import content from 'virtual:klio-content';
  import type { SeatId } from '../engine/types';
  import { submitOrSay as submit } from './commands';
  import { effectLevel } from './effectLevel.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  /** `level`: Zahl der gezeigten Lampen (der Bogen hält Felder zurück, solange ein Effekt läuft) */
  /** `improve`: Marke „Stärke verbessern“ zeigen (voller Bogen, offener Anlass, Recht zur Trumpfwahl; 5zu, 10.22 F8) */
  let { seat, level, canEdit, improve = false }: { seat: SeatId; level: number; canEdit: boolean; improve?: boolean } = $props();

  const { hit, segments, flame, steps, glow, improve: mark } = content.skinPaper.lantern;
  const max = segments.length;
  const points = segments.map((s) => s.map((p) => p.join(',')).join(' '));
  // Flamme mit dem Fuß im Ursprung, 20 breit und 40 hoch; die Haut gibt je Stand Breite und Höhe
  const FLAME = 'M0 0C-7 0-10-6-9-13C-8-20-2-24 0-40C3-28 10-22 9-12C8.5-5 6 0 0 0Z';
  const CORE = 'M0-1C-4-1-5.5-5-5-9C-4.5-13-1-16 0-24C2-17 5.5-13 5-8C4.7-4 3.5-1 0-1Z';
  const size = $derived(level > 0 ? flame.sizes[Math.min(level, max) - 1]! : null);
  const full = $derived(level >= max);
  const label = $derived(t('sheet.lantern', { n: level, max }));
  // Fläche um Laterne und Knöpfe: wer mit dem Zeiger darin ist, sieht die Knöpfe
  const area = { x: hit.x, y: hit.y, w: steps.x + steps.size / 2 + 3 - hit.x, h: hit.h };

  const step = (delta: 1 | -1) => void submit({ type: 'sheet.stepLamps', seat, delta });

  // Touch: Antippen füllt und blendet die Knöpfe ein; sie bleiben, bis woanders getippt wird
  let wrap = $state<HTMLElement>();
  let open = $state(false);
  $effect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap?.contains(e.target as Node)) open = false; };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  });

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    // langes Drücken auf Touch-Geräten löst dasselbe Ereignis aus: dort leert nur der Knopf
    if ((e as PointerEvent).pointerType !== 'touch') step(-1);
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    step(e.key === 'ArrowUp' ? 1 : -1);
  }
</script>

<div
  bind:this={wrap}
  class="wrap"
  class:open={open && canEdit}
  class:flicker={effectLevel.flickering}
  style:left="{area.x}px" style:top="{area.y}px" style:width="{area.w}px" style:height="{area.h}px"
>
  <button
    class="lantern object control"
    disabled={!canEdit}
    data-lantern={level}
    aria-label={label}
    title={canEdit ? `${label}\n${t('sheet.lanternHint')}` : label}
    style:width="{hit.w}px" style:height="{hit.h}px"
    onpointerdown={(e) => { if (e.pointerType === 'touch') open = true; }}
    onclick={() => step(1)}
    oncontextmenu={onContextMenu}
    onkeydown={onKeydown}
  >
    <svg viewBox="{hit.x} {hit.y} {hit.w} {hit.h}" aria-hidden="true">
      <defs>
        <radialGradient id="lantern-glow-{seat}">
          <stop offset="0.25" class="glow-in" />
          <stop offset="1" class="glow-out" />
        </radialGradient>
      </defs>
      <circle class="halo" class:on={full} cx={glow.x} cy={glow.y} r={glow.r} fill="url(#lantern-glow-{seat})" />
      {#each points as p, i (i)}
        <polygon class="glass" class:on={i < level} points={p} />
      {/each}
      <g
        class="flame"
        class:on={size !== null}
        style:transform="translate({flame.x}px, {flame.y}px) rotate({flame.rotate}deg) scale({size ? size[0] / 20 : 0.01}, {size ? size[1] / 40 : 0.01})"
      >
        <g class="sway">
          <path class="outer" d={FLAME} />
          <path class="core" d={CORE} />
        </g>
      </g>
    </svg>
  </button>
  {#if canEdit}
    <!-- kein eigenes Tab-Ziel: mit der Tastatur füllen und leeren die Pfeiltasten an der Laterne -->
    {#each [[1, 'up', 'sheet.lanternFill', full], [-1, 'down', 'sheet.lanternEmpty', level <= 0]] as const as [delta, dir, text, off] (dir)}
      <button
        class="step control {dir}"
        tabindex="-1"
        disabled={off}
        data-lantern-step={dir}
        aria-label={t(text)}
        title={t(text)}
        style:left="{steps.x - steps.size / 2 - area.x}px"
        style:top="{steps.y - area.y + (delta === 1 ? -steps.size - 1 : 1)}px"
        style:width="{steps.size}px" style:height="{steps.size}px"
        onclick={() => step(delta)}
      ><i></i></button>
    {/each}
  {/if}
  {#if improve}
    <!-- bei vier Trümpfen gibt es kein leeres Feld, das den Dialog öffnet: der Einstieg liegt dort, wo der Anlass entsteht -->
    <button
      class="improve control"
      data-lantern-improve
      style:left="{mark.x - area.x}px" style:top="{mark.y - area.y}px"
      onclick={(e) => { e.stopPropagation(); view.trumpDialog = seat; }}
    >{t('sheet.lanternImprove')}</button>
  {/if}
</div>

<style>
  .wrap { position: absolute; }
  .lantern { position: absolute; left: 0; top: 0; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .lantern:disabled { cursor: default; }
  /* Klasse `object` (theme.css): kein Eindrücken wie bei den übrigen Knöpfen. `scale` isolierte den Knopf, dann verrechnete sich der Schein
     nicht mehr mit dem Papier (multiply) und läge für den Moment des Drückens als deckende gelbe Fläche über der Zeichnung */
  /* multiply: die Bleistiftstriche der Laterne scheinen durch Schein und Flamme */
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; mix-blend-mode: multiply; pointer-events: none; }
  .glass { fill: var(--sheet-lamp); opacity: 0; transition: opacity var(--sheet-lamp-t) ease; }
  .glass.on { opacity: 0.8; }
  .glow-in { stop-color: var(--sheet-lamp-glow); }
  .glow-out { stop-color: var(--sheet-lamp-glow); stop-opacity: 0; }
  .halo { opacity: 0; transition: opacity calc(var(--sheet-lamp-t) * 2) ease; }
  .halo.on { opacity: 1; }
  .flame { opacity: 0; transition: transform var(--sheet-lamp-t) ease-out, opacity var(--sheet-lamp-t) ease; }
  .flame.on { opacity: 1; }
  .outer { fill: var(--sheet-flame); }
  .core { fill: var(--sheet-flame-core); }
  /* Stufe „Voll“ mit „Laterne flackert“: die volle Laterne flackert sehr leicht */
  .flicker .halo.on { animation: lantern-halo 2.7s ease-in-out infinite; }
  .flicker:has(.halo.on) .sway { animation: lantern-sway 1.9s ease-in-out infinite; }
  @keyframes lantern-halo { 0%, 100% { opacity: 1; } 35% { opacity: 0.8; } 60% { opacity: 0.95; } 80% { opacity: 0.85; } }
  @keyframes lantern-sway { 0%, 100% { transform: scale(1, 1); } 30% { transform: scale(0.97, 1.04) skewX(1.5deg); } 65% { transform: scale(1.02, 0.97) skewX(-1.5deg); } }

  /* Marke „Stärke verbessern“: golden wie das Plus im wählbaren Trumpffeld */
  .improve { position: absolute; translate: -50% -50%; padding: 1px 7px 2px; border: 1px solid var(--pickable); border-radius: 8px; background: rgba(255, 252, 240, 0.92); color: #7a5a00; font-family: var(--trump-serif); font-weight: 700; font-size: 10px; line-height: 1.1; white-space: nowrap; cursor: pointer; }
  .improve:hover, .improve:focus-visible { background: var(--pickable); color: #fff; }

  /* Knöpfe zum Füllen und Leeren: klein und blass wie der Streichknopf; nur wo der Bogen Bedienelemente zeigt (.tools) */
  .step { position: absolute; display: none; place-items: center; padding: 0; border: 1px solid rgba(0, 0, 0, 0.45); border-radius: 50%; background: rgba(255, 255, 255, 0.75); cursor: pointer; opacity: 0; pointer-events: none; transition: opacity var(--sheet-lamp-t) ease; }
  :global(.sheet.tools) .step { display: grid; }
  /* Dreieck statt Zeichen, wie am Kartenbudget */
  .step i { width: 7px; height: 5px; background: var(--sheet-label); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .step.down i { clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .wrap:hover .step, .wrap:has(:focus-visible) .step, .wrap.open .step { opacity: 0.5; pointer-events: auto; }
  .wrap .step:not(:disabled):hover { opacity: 0.95; }
  .wrap .step:disabled { opacity: 0.15; cursor: default; }
  .wrap:not(:hover, .open, :has(:focus-visible)) .step { opacity: 0; }
</style>
