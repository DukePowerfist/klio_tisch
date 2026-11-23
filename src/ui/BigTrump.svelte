<script lang="ts">
  // Großansicht eines Trumpfs (beim Überfahren nach 650 ms oder per Klick angeheftet).
  import content from 'virtual:klio-content';
  import { trumpById } from '../rules/klio/trumps';
  import TrumpCard from './TrumpCard.svelte';
  import { view } from './view.svelte';

  const trump = $derived(trumpById(content.trumps, view.bigTrump?.id));

  /** Esc schließt die angeheftete Großansicht (auch per Tastatur geöffnet) und geht sonst nirgends hin, etwa nicht an
   *  das Dock (Esc verlässt dort die Rollenansicht). Die Vorschau beim Überfahren lässt Esc durch. */
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !view.bigTrump?.pinned) return;
    e.stopImmediatePropagation();
    view.bigTrump = null;
  }
</script>

<!-- Jeder Klick irgendwo schließt sie (wie bisher); der Klick auf einen Trumpf öffnet sie danach wieder. -->
<svelte:window onpointerdown={() => (view.bigTrump = null)} onkeydowncapture={onKey} />

{#if trump}
  <div class="big"><TrumpCard {trump} size="large" /></div>
{/if}

<style>
  /* richtet sich beim Erscheinen kurz auf (5zr). Die Bewegung liegt auf der Karte, .big zentriert sich selbst über
     transform. Beim Wechsel von einem Trumpf zum nächsten bleibt die Karte stehen (dasselbe Element). */
  .big :global(.tcard) { animation: trump-rise var(--trump-rise) ease-out both; }
  @keyframes -global-trump-rise {
    from { opacity: 0; transform: perspective(900px) translateY(12px) rotateX(10deg) scale(0.94); }
    to { opacity: 1; transform: perspective(900px) translateY(0) rotateX(0deg) scale(1); }
  }
  .big { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3000001; pointer-events: none; filter: drop-shadow(0 14px 40px rgba(0, 0, 0, 0.65)); }
</style>
