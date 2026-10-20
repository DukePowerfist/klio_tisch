<script lang="ts">
  import { view } from './view.svelte';
</script>

{#if view.toast}
  {#key view.toast.id}
    <div class="toast" class:warn={view.toast.warn} role="status">{view.toast.text}</div>
  {/key}
{/if}

<style>
  .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: var(--panel-bg); border: 2px solid var(--accent); color: #fff; padding: 10px 20px; border-radius: 10px; font-size: 18px; font-weight: 600; z-index: 2000000; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5); pointer-events: none; }
  .toast.warn { background: var(--warn-bg); border-color: #e08070; }
</style>
