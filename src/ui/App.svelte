<script lang="ts">
  import { onMount } from 'svelte';
  import Board from './Board.svelte';
  import BigTrump from './BigTrump.svelte';
  import Dock from './Dock.svelte';
  import FieldDialog from './FieldDialog.svelte';
  import { gameLog } from './log.svelte';
  import JoinDialog from './JoinDialog.svelte';
  import LogPanel from './LogPanel.svelte';
  import Menu from './Menu.svelte';
  import PlateMenu from './PlateMenu.svelte';
  import ProfileDialog from './ProfileDialog.svelte';
  import ResetDialog from './ResetDialog.svelte';
  import ResultDialog from './ResultDialog.svelte';
  import RoomDialog from './RoomDialog.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import StackMenu from './StackMenu.svelte';
  import Toast from './Toast.svelte';
  import TrumpDialog from './TrumpDialog.svelte';
  import { session } from './session.svelte';
  import { view } from './view.svelte';

  let error = $state<string | null>(null);
  onMount(() => {
    session.start().catch((e: unknown) => (error = String(e)));
  });

  // Mitspieler ohne Platz: Platzwahl anbieten, bis gewählt oder „Nur zuschauen“
  let joinOpen = $state(true);
  const chooseSeat = $derived(joinOpen && session.seatless);
  // eigener Name und eigene Farbe (5e)
  let profileOpen = $state(false);
  // Menü am Namensschild (10.1); ein anderes Schild öffnet ein neues Menü
  const plateSeat = $derived(view.plateMenu?.seat ?? null);

  // Wer einen Platz bekommt, startet in seiner Rollenansicht (10)
  const mySeat = $derived(session.role?.role === 'player' ? session.role.seat : null);
  $effect(() => {
    if (mySeat) view.setRole(mySeat);
  });

  // offenes Protokoll: Tisch und Menüknopf rücken zur Seite statt verdeckt zu werden
  $effect(() => {
    document.documentElement.style.setProperty('--table-right', gameLog.open ? 'var(--log-w)' : '0px');
  });
</script>

{#if error}
  <p class="error">{error}</p>
{:else if session.state}
  <Board table={session.state} />
  <Dock players={session.state.settings.players} />
  <LogPanel />
  <Toast />
  <BigTrump />
  {#if view.gmDialog}
    {#key view.gmDialog}<ResultDialog kind={view.gmDialog} />{/key}
  {/if}
  {#if view.confirmReset}
    <ResetDialog />
  {/if}
  {#if view.gmPanel === 'room'}
    <RoomDialog />
  {:else if view.gmPanel === 'settings'}
    <SettingsDialog />
  {/if}
  {#if view.trumpDialog}
    {#key view.trumpDialog}<TrumpDialog seat={view.trumpDialog} />{/key}
  {/if}
  {#if view.fieldDialog}
    {#key view.fieldDialog}<FieldDialog seat={view.fieldDialog.seat} field={view.fieldDialog.field} />{/key}
  {/if}
  {#if chooseSeat}
    <JoinDialog onclose={() => (joinOpen = false)} />
  {/if}
  {#if profileOpen}
    <ProfileDialog onclose={() => (profileOpen = false)} />
  {/if}
  {#if plateSeat}
    {#key plateSeat}<PlateMenu seat={plateSeat} />{/key}
  {/if}
  <!-- Stapelmenü (10.2): jedes Öffnen ein neues Menü mit der Geometrie von diesem Moment -->
  {#if view.stackMenu}
    {#key view.stackMenu}<StackMenu />{/key}
  {/if}
  {#if view.profileFor}
    {#key view.profileFor}<ProfileDialog for={view.profileFor} onclose={() => (view.profileFor = null)} />{/key}
  {/if}
  {#if session.saveError}
    <div class="save-error" role="alert">Speichern fehlgeschlagen: {session.saveError}</div>
  {/if}
{:else if session.status !== 'starting'}
  <p class="center">{session.statusText}</p>
{/if}
<Menu onChooseSeat={() => (joinOpen = true)} onProfile={() => (profileOpen = true)} />

<style>
  .error, .save-error { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); background: var(--warn-bg); color: var(--warn-ink); padding: 10px 18px; border-radius: var(--radius-m); z-index: 3000000; }
  .center { position: fixed; inset: 0; display: grid; place-items: center; margin: 0; font-size: 18px; opacity: 0.8; }
</style>
