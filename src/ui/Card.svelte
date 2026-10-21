<script lang="ts">
  // Eine Spielkarte. Lage, Drehung und Größe kommen von außen (layouts.yaml). Drei Ebenen (11.4): `.card` trägt die
  // Endlage, `.lift` Anheben und Stoß, `.inner` das Umklappen; die Bewegung dorthin plant motion.ts.
  import { untrack } from 'svelte';
  import { suitOf } from '../engine/schemas';
  import type { CardId } from '../engine/types';
  import { appear, move, timing, turn } from './animator.svelte';
  import { planMove, planTurn, type Frame } from './motion';
  import { isRed, rankLabel, SUIT_SYMBOL } from './texts';

  let { card, x, y, scale, rotated, z, faceUp, size, slot = '', dragging = false, pending = false, shake = false, mark, still = false }: {
    card: CardId; x: number; y: number; scale: number; rotated: boolean; z: number; faceUp: boolean;
    size: { w: number; h: number };
    /** Platz im Stand (`CardPlace.slot`) */
    slot?: string;
    dragging?: boolean; pending?: boolean; shake?: boolean;
    /** Farbe, wenn jemand anderes die Karte gerade zieht; sie folgt dann dessen Zeiger (8.3) */
    mark?: string | undefined;
    /** ohne Animation (Vorschau) */
    still?: boolean;
  } = $props();

  /** angehoben: selbst oder von jemand anderem gezogen */
  const lifted = $derived(dragging || !!mark);
  const suit = $derived(SUIT_SYMBOL[suitOf(card)]);
  const rank = $derived(rankLabel(card));
  // gedreht: um die linke obere Ecke drehen und um die Kartenhöhe nach rechts schieben (wie bisher). Immer derselbe
  // Aufbau, damit Lage, Drehung und Größe beim Übergang einzeln mitgehen (11.4)
  const transform = $derived(`translate(${rotated ? x + size.h * scale : x}px, ${y}px) rotate(${rotated ? 90 : 0}deg) scale(${scale})`);

  let el: HTMLDivElement;
  let inner: HTMLDivElement;
  /** zuletzt gezeigt (nicht reaktiv): Ausgangspunkt der nächsten Bewegung */
  let shown: { frame: Frame; transform: string; faceUp: boolean } | null = null;
  $effect(() => {
    const frame: Frame = { x, y, scale, rotated, slot, follow: dragging ? 'own' : mark ? 'remote' : null };
    const to = transform;
    untrack(() => {
      if (shown && !still) move(el, shown.transform, planMove(shown.frame, frame, timing()));
      shown = { frame, transform: to, faceUp: shown?.faceUp ?? faceUp };
    });
  });
  $effect(() => {
    const up = faceUp;
    untrack(() => {
      if (shown && shown.faceUp !== up && !still) turn(inner, up, planTurn(shown.faceUp, up, timing()));
      if (shown) shown.faceUp = up;
    });
  });
  // Rückseite: Bild mit eigenem Rand und abgerundeten Ecken (public/assets/cards)
  const back = `url(${import.meta.env.BASE_URL}assets/cards/back.webp)`;
</script>

<div bind:this={el} transition:appear={{ still }} class="card" class:dragging class:pending class:shake class:red={isRed(card)} class:marked={!!mark} style:--mark={mark} style:width="{size.w}px" style:height="{size.h}px" style:transform style:z-index={lifted ? 400000 + z : z} data-card={card}>
  <div class="lift">
  <div bind:this={inner} class="inner" class:down={!faceUp}>
    <div class="face front">
      <div class="corner">{rank}<br />{suit}</div>
      <div class="pip">{suit}</div>
      <div class="corner bottom">{rank}<br />{suit}</div>
    </div>
    <div class="face back" style:background-image={back}></div>
  </div>
  </div>
</div>

<style>
  .card { --lift: 0 8px 18px rgba(0, 0, 0, 0.5); position: absolute; left: 0; top: 0; transform-origin: 0 0; touch-action: none; user-select: none; cursor: grab; }
  .card.dragging { cursor: grabbing; }
  .card.pending { opacity: 0.8; }
  .lift { width: 100%; height: 100%; perspective: 600px; }
  .inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
  .inner.down { rotate: y 180deg; }
  .face { position: absolute; inset: 0; border-radius: 7px; backface-visibility: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55); box-sizing: border-box; }
  .dragging .face { box-shadow: var(--lift); }
  .marked .face { box-shadow: 0 0 0 3px var(--mark), var(--lift); }
  .front { background: var(--card); color: var(--card-black); }
  .red .front { color: var(--card-red); }
  .back { transform: rotateY(180deg); background: center / 100% 100% no-repeat; }
  .corner { position: absolute; left: 6px; top: 4px; font: 700 16px/1.05 Georgia, serif; text-align: center; }
  .corner.bottom { left: auto; top: auto; right: 6px; bottom: 4px; transform: rotate(180deg); }
  .pip { position: absolute; inset: 0; display: grid; place-items: center; font-size: 46px; }
  .shake { animation: wob var(--shake) ease-in-out; }
  @keyframes wob {
    0%, 100% { translate: 0 0; } 10% { translate: -7px 2px; } 20% { translate: 7px -2px; } 30% { translate: -6px -1px; }
    40% { translate: 6px 2px; } 50% { translate: -4px 1px; } 60% { translate: 4px -1px; } 75% { translate: -2px 0; } 90% { translate: 2px 0; }
  }
</style>
