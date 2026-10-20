<script lang="ts">
  // Großansicht eines Trumpfs (beim Überfahren nach 650 ms oder per Klick angeheftet).
  import content from 'virtual:klio-content';
  import TrumpCard from './TrumpCard.svelte';
  import { view } from './view.svelte';

  const trump = $derived(view.bigTrump ? content.trumps.find((x) => x.id === view.bigTrump!.id) : undefined);
</script>

<!-- Jeder Klick irgendwo schließt sie (wie bisher); der Klick auf einen Trumpf öffnet sie danach wieder. -->
<svelte:window onpointerdown={() => (view.bigTrump = null)} />

{#if trump}
  <div class="big"><TrumpCard {trump} size="large" /></div>
{/if}

<style>
  .big { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3000001; pointer-events: none; filter: drop-shadow(0 14px 40px rgba(0, 0, 0, 0.65)); }
</style>
