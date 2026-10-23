<script lang="ts">
  // Meldung gleitet von unten herein (11.6). Ausgeblendet wird nur, wenn keine neue folgt: das Ausblenden hängt an der
  // Hülle im {#if}, das Hereingleiten an der Meldung im {#key}; sonst stünden beim Wechsel zwei übereinander.
  import { fade } from 'svelte/transition';
  import { timing } from './animator.svelte';
  import { view } from './view.svelte';
</script>

{#if view.toast}
  <div out:fade={{ duration: timing().fade }}>
    {#key view.toast.id}
      <div class="toast" class:warn={view.toast.warn} role="status">{view.toast.text}</div>
    {/key}
  </div>
{/if}

<style>
  .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: var(--panel-bg); border: 2px solid var(--accent); color: var(--warn-ink); padding: 10px 20px; border-radius: var(--menu-radius); font-size: 18px; font-weight: 600; z-index: 2000000; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5); pointer-events: none; animation: rise-in var(--pop) var(--spring-soft); }
  .toast.warn { background: var(--warn-bg); border-color: var(--warn-rim); }
</style>
