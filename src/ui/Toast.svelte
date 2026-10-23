<script lang="ts">
  // Meldung gleitet von unten herein (11.6). Ausgeblendet wird nur, wenn keine neue folgt: das Ausblenden hängt an der
  // Hülle im {#if}, das Hereingleiten an der Meldung im {#key}; sonst stünden beim Wechsel zwei übereinander.
  import { fade } from 'svelte/transition';
  import { timing } from './animator.svelte';
  import { toastBottom } from './overlap';
  import { view } from './view.svelte';

  /** Abstand zum unteren Rand, und zur SL-Leiste, wenn sie darunter liegt (5v, F1) */
  const BASE = 28;
  const GAP = 8;
  /** misst beim Erscheinen: gemessen wird die SL-Leiste (`data-gm-bar`), nicht `data-menu-avoid` (sonst wichen die Menüs aus) */
  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const b = document.querySelector('[data-gm-bar]')?.getBoundingClientRect();
    const bar = b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
    el.style.bottom = `${toastBottom({ x: r.left, y: r.top, w: r.width, h: r.height }, bar, innerHeight, BASE, GAP)}px`;
  }
</script>

{#if view.toast}
  <div out:fade={{ duration: timing().fade }}>
    {#key view.toast.id}
      <div class="toast" class:warn={view.toast.warn} role="status" use:place>{view.toast.text}</div>
    {/key}
  </div>
{/if}

<style>
  /* im Menüstil (5v, 10.8); Warnungen rot mit feinem Rand */
  .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: var(--menu-bg); border: 1px solid var(--menu-rim); color: var(--ink); padding: 9px 18px; border-radius: var(--menu-radius); font-size: 15px; font-weight: 500; z-index: 2000000; box-shadow: var(--menu-shadow); pointer-events: none; animation: rise-in var(--pop) var(--spring-soft); }
  .toast.warn { background: var(--warn-bg); border-color: var(--warn-rim); color: var(--warn-ink); }
</style>
