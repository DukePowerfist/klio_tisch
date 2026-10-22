<script lang="ts">
  // Menü oben rechts (ARCHITEKTUR.md 10, Schritt 5b Teil 4; Menüstil seit 5p, 10.4): ersetzt Raumleiste und Protokoll-Knopf.
  // Am Knopf bleibt der Zustand sichtbar (Punkt, bei der SL die Zahl der Verbundenen); Störungen erscheinen als Hinweis daneben.
  // Im Kopf steht der Verbindungszustand in einem Wort (menuState.ts).
  import { untrack } from 'svelte';
  import { popCount } from './animator.svelte';
  import { gameLog } from './log.svelte';
  import { menuState } from './menuState';
  import { session } from './session.svelte';
  import { t } from './texts';
  import { view } from './view.svelte';

  let { onChooseSeat, onProfile }: { onChooseSeat: () => void; onProfile: () => void } = $props();

  let open = $state(false);
  let root = $state<HTMLElement>();
  const head = $derived(menuState(session.mode, session.status, session.trouble));

  /** Eintrag ausführen und Menü schließen */
  const pick = (action: () => unknown) => () => {
    open = false;
    void action();
  };

  // Zahl der Verbundenen springt, wenn jemand dazukommt (11.7), nicht beim Weggehen
  let count = $state<HTMLElement>();
  let lastCount = untrack(() => session.online.length);
  $effect(() => {
    const n = session.online.length;
    untrack(() => {
      if (n > lastCount && count) popCount(count);
      lastCount = n;
    });
  });

  async function invite() {
    await session.invite();
    await session.copyInvite();
  }

  // Esc schließt das Menü (5p), nur wenn es offen ist; abgefangen, damit das Dock nicht auch die Rollenansicht verlässt (R9)
  function onKey(e: KeyboardEvent) {
    if (!open || e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    open = false;
  }
</script>

<svelte:window onpointerdown={(e) => { if (open && !root?.contains(e.target as Node)) open = false; }} onkeydowncapture={onKey} />

<div class="menu control" data-menu-avoid bind:this={root}>
  {#if session.trouble}
    <div class="alert" role="alert">
      {session.statusText}
      {#if session.status === 'reload'}<button onclick={() => location.reload()}>{t('room.reloadButton')}</button>{/if}
    </div>
  {/if}
  {#if session.mode === 'host'}<span class="count" bind:this={count} title={t('room.open', { n: session.online.length })}>{session.online.length}</span>{/if}
  <button class="open" aria-label={t('menu.title')} aria-expanded={open} data-health={session.health} onclick={() => (open = !open)}>
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    <span class="dot"></span>
  </button>
  {#if open}
    <!-- Zipfel auf die Mitte des Knopfs; feste Lage in der Ecke, kein placeMenu (R8) -->
    <div class="menu-panel wide" data-top-menu data-side="below" aria-label={t('menu.title')}>
      <div class="menu-tip" data-side="below"></div>
      <div class="menu-head"><span>{t(`menu.state.${head}`)}</span>{#if head === 'open'}<span class="count">{session.online.length}</span>{/if}</div>
      {#if session.mode === 'local'}
        <button class="menu-item" title={t('room.inviteTitle')} onclick={pick(invite)}>{t('room.invite')}</button>
      {:else if session.mode === 'host'}
        <button class="menu-item" onclick={pick(() => session.copyInvite())}>{t('room.copy')}</button>
        <button class="menu-item" title={t('room.manageTitle')} onclick={pick(() => (view.gmPanel = 'room'))}>{t('room.manage')}</button>
      {/if}
      <!-- für alle: wenigstens die eigene Darstellung (5g) -->
      <button class="menu-item" onclick={pick(() => (view.gmPanel = 'settings'))}>{t('gm.settings')}</button>
      {#if session.seatless}
        <button class="menu-item" onclick={pick(onChooseSeat)}>{t('room.chooseSeat')}</button>
      {/if}
      {#if session.actor.role === 'player' && session.can({ type: 'seat.edit', seat: session.actor.seat })}
        <button class="menu-item" onclick={pick(onProfile)}>{t('menu.profile')}</button>
      {:else if session.mode === 'client' && session.actor.role === 'spectator'}
        <button class="menu-item" onclick={pick(onProfile)}>{t('menu.name')}</button>
      {/if}
      <!-- offen: dezentes „offen“ statt eines Rahmens (ein Rahmen hieße Rückfrage) -->
      <button class="menu-item" aria-pressed={gameLog.open} onclick={pick(() => (gameLog.open = !gameLog.open))}
        >{t('log.title')}{#if gameLog.open}<span class="menu-note" aria-hidden="true">{t('menu.logOpen')}</span>{/if}</button
      >
    </div>
  {/if}
</div>

<style>
  .menu { position: fixed; top: var(--menu-inset); right: calc(var(--table-right) + var(--menu-inset)); z-index: 97; display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .open { position: relative; width: var(--menu-size); height: var(--menu-size); padding: 0; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--menu-bg) 70%, transparent); color: var(--ink); border: 1px solid var(--menu-rim); cursor: pointer; transition: background 0.2s, scale var(--press) ease-out; }
  .open:hover, .open[aria-expanded='true'] { background: var(--menu-bg); }
  .dot { position: absolute; right: -1px; top: -1px; width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--menu-bg); background: var(--menu-local); }
  [data-health='ok'] .dot { background: var(--menu-ok); }
  [data-health='trouble'] .dot { background: var(--menu-trouble); }
  .menu > .count { display: inline-block; opacity: 0.7; font-variant-numeric: tabular-nums; }
  .alert { display: flex; gap: 8px; align-items: center; background: var(--warn-bg); color: #fff; padding: 4px 10px; border-radius: 8px; }
  /* im Behälter des Knopfs, der beim offenen Protokoll mitrückt (R8); oben Mitte des Knopfs plus halber Knopf plus Abstand,
     der Zipfel auf seiner Mitte, von dort wächst es beim Erscheinen (R11) */
  .menu-panel { position: absolute; top: calc(50% + var(--menu-size) / 2 + 10px); right: 0; --tip: calc(var(--menu-w-wide) - var(--menu-size) / 2); }
  .alert button { background: transparent; color: var(--ink); border: 1px solid rgba(255, 255, 255, 0.6); border-radius: 6px; padding: 4px 8px; font: inherit; cursor: pointer; }
</style>
