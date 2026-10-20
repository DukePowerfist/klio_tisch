<script lang="ts">
  // Eine Spielkarte. Lage und Drehung kommen von außen; Umklappen und Gleiten per CSS.
  import type { CardId } from '../engine/types';
  import { isRed, rankLabel, SUIT_SYMBOL } from './texts';

  let { card, x, y, scale, rotated, z, faceUp, dragging = false, pending = false, shake = false }: {
    card: CardId; x: number; y: number; scale: number; rotated: boolean; z: number; faceUp: boolean; dragging?: boolean; pending?: boolean; shake?: boolean;
  } = $props();

  const suit = $derived(SUIT_SYMBOL[card[0] as keyof typeof SUIT_SYMBOL]);
  const rank = $derived(rankLabel(card));
  // gedreht: um die linke obere Ecke drehen und um die Kartenhöhe nach rechts schieben (wie bisher)
  const transform = $derived(rotated ? `translate(${x + 112 * scale}px, ${y}px) rotate(90deg) scale(${scale})` : `translate(${x}px, ${y}px) scale(${scale})`);
</script>

<div class="card" class:dragging class:pending class:shake class:red={isRed(card)} style:transform style:z-index={dragging ? 400000 + z : z} data-card={card}>
  <div class="inner" class:down={!faceUp}>
    <div class="face front">
      <div class="corner">{rank}<br />{suit}</div>
      <div class="pip">{suit}</div>
      <div class="corner bottom">{rank}<br />{suit}</div>
    </div>
    <div class="face back"></div>
  </div>
</div>

<style>
  .card { position: absolute; left: 0; top: 0; width: 80px; height: 112px; transform-origin: 0 0; touch-action: none; user-select: none; cursor: grab; transition: transform var(--glide, 0.3s) ease-out; perspective: 600px; }
  .card.dragging { transition: none; cursor: grabbing; }
  .card.pending { opacity: 0.8; }
  .inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform var(--flip, 0.35s) ease-in-out; }
  .inner.down { transform: rotateY(180deg); }
  .face { position: absolute; inset: 0; border-radius: 7px; backface-visibility: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55); box-sizing: border-box; }
  .dragging .face { box-shadow: 0 8px 18px rgba(0, 0, 0, 0.5); }
  .front { background: var(--card); color: var(--card-black); }
  .red .front { color: var(--card-red); }
  .back { transform: rotateY(180deg); background: repeating-linear-gradient(45deg, #24457a 0 6px, #2d5799 6px 12px); border: 4px solid var(--card); }
  .corner { position: absolute; left: 6px; top: 4px; font: 700 16px/1.05 Georgia, serif; text-align: center; }
  .corner.bottom { left: auto; top: auto; right: 6px; bottom: 4px; transform: rotate(180deg); }
  .pip { position: absolute; inset: 0; display: grid; place-items: center; font-size: 46px; }
  .shake { animation: wob 0.6s ease-in-out; }
  @keyframes wob {
    0%, 100% { translate: 0 0; } 10% { translate: -7px 2px; } 20% { translate: 7px -2px; } 30% { translate: -6px -1px; }
    40% { translate: 6px 2px; } 50% { translate: -4px 1px; } 60% { translate: 4px -1px; } 75% { translate: -2px 0; } 90% { translate: 2px 0; }
  }
</style>
