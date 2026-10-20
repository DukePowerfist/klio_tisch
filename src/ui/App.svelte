<script lang="ts">
  import { onMount } from 'svelte';
  import Board from './Board.svelte';
  import Dock from './Dock.svelte';
  import Toast from './Toast.svelte';
  import BigTrump from './BigTrump.svelte';
  import TrumpDialog from './TrumpDialog.svelte';
  import GmDialog from './GmDialog.svelte';
  import { view } from './view.svelte';
  import { session } from './session.svelte';

  let error = $state<string | null>(null);
  onMount(() => {
    session.start().catch((e: unknown) => (error = String(e)));
  });
</script>

{#if error}
  <p class="error">{error}</p>
{:else if session.state}
  <Board table={session.state} />
  <Dock players={session.state.settings.players} />
  <Toast />
  <BigTrump />
  {#if view.gmDialog}
    <GmDialog />
  {/if}
  {#if view.trumpDialog}
    {#key view.trumpDialog}<TrumpDialog seat={view.trumpDialog} />{/key}
  {/if}
  {#if session.saveError}
    <div class="save-error" role="alert">Speichern fehlgeschlagen: {session.saveError}</div>
  {/if}
{/if}

<style>
  .error, .save-error { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); background: #7a2a22; color: #fff; padding: 10px 18px; border-radius: 8px; z-index: 3000000; }
</style>
