<script lang="ts">
  // Menü oben rechts (ARCHITEKTUR.md 10, Schritt 5b Teil 4): ersetzt Raumleiste und Protokoll-Knopf.
  // Am Knopf bleibt der Zustand sichtbar (Punkt, bei der SL die Zahl der Verbundenen); Störungen erscheinen als Hinweis daneben.
  import { gameLog } from './log.svelte';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { onChooseSeat, onProfile }: { onChooseSeat: () => void; onProfile: () => void } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();

  /** Eintrag ausführen und Menü schließen */
  const pick = (action: () => unknown) => () => {
    open = false;
    void action();
  };

  async function invite() {
    await session.invite();
    await session.copyInvite();
  }
</script>

<svelte:window onpointerdown={(e) => { if (open && !root?.contains(e.target as Node)) open = false; }} />

<div class="menu control" bind:this={root}>
  {#if session.trouble}
    <div class="alert" role="alert">
      {session.statusText}
      {#if session.status === 'reload'}<button onclick={() => location.reload()}>{t('room.reloadButton')}</button>{/if}
    </div>
  {/if}
  {#if session.mode === 'host'}<span class="count" title={t('room.open', { n: session.online.length })}>{session.online.length}</span>{/if}
  <button class="open" aria-label={t('menu.title')} aria-expanded={open} data-health={session.health} onclick={() => (open = !open)}>
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    <span class="dot"></span>
  </button>
  {#if open}
    <div class="items">
      {#if session.mode === 'local'}
        <button title={t('room.inviteTitle')} onclick={pick(invite)}>{t('room.invite')}</button>
      {:else if session.mode === 'host'}
        <div class="info">{t('room.open', { n: session.online.length })}</div>
        <button onclick={pick(() => session.copyInvite())}>{t('room.copy')}</button>
        <button title={t('room.manageTitle')} onclick={pick(() => (view.gmPanel = 'room'))}>{t('room.manage')}</button>
      {/if}
      {#if session.can({ type: 'table.setSettings' })}
        <button onclick={pick(() => (view.gmPanel = 'settings'))}>{t('gm.settings')}</button>
      {/if}
      {#if session.seatless}
        <button onclick={pick(onChooseSeat)}>{t('room.chooseSeat')}</button>
      {/if}
      {#if session.actor.role === 'player' && session.can({ type: 'seat.edit', seat: session.actor.seat })}
        <button onclick={pick(onProfile)}>{t('menu.profile')}</button>
      {:else if session.mode === 'client' && session.actor.role === 'spectator'}
        <button onclick={pick(onProfile)}>{t('menu.name')}</button>
      {/if}
      <button aria-pressed={gameLog.open} onclick={pick(() => (gameLog.open = !gameLog.open))}>{t('log.title')}</button>
    </div>
  {/if}
</div>

<style>
  .menu { position: fixed; top: var(--menu-inset); right: var(--menu-inset); z-index: 97; display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .open { position: relative; width: var(--menu-size); height: var(--menu-size); padding: 0; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--panel-bg) 60%, transparent); color: var(--ink); border: 1px solid var(--line); cursor: pointer; transition: background 0.2s; }
  .open:hover, .open[aria-expanded='true'] { background: var(--panel-bg); }
  .dot { position: absolute; right: -1px; top: -1px; width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--bg); background: var(--menu-local); }
  [data-health='ok'] .dot { background: var(--menu-ok); }
  [data-health='trouble'] .dot { background: var(--menu-trouble); }
  .count { opacity: 0.7; font-variant-numeric: tabular-nums; }
  .alert { display: flex; gap: 8px; align-items: center; background: var(--warn-bg); color: #fff; padding: 4px 10px; border-radius: 8px; }
  .items { position: absolute; top: 36px; right: 0; display: flex; flex-direction: column; gap: 4px; min-width: 190px; padding: 6px; background: var(--panel-bg); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5); }
  .info { padding: 2px 6px 4px; opacity: 0.7; }
  .items button { text-align: left; }
  .items button, .alert button { background: transparent; color: var(--ink); border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; font: inherit; cursor: pointer; }
  .items button:hover { background: var(--button-hover); }
  .items button[aria-pressed='true'] { border-color: var(--line); }
  .alert button { border-color: rgba(255, 255, 255, 0.6); }
</style>
