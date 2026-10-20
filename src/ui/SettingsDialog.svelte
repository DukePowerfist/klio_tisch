<script lang="ts">
  // Einstellungen der SL (7 „Abschaltbare Automatik“, 9.3): Automatik je Reaktion und Rechte der Spieler zur Laufzeit.
  // Gespeichert im Stand (settings), also für alle gleich; die Voreinstellung bleibt in permissions.yaml.
  // Dazu für die SL im eigenen Browser: Spielstand als Datei und automatische Sicherungen (8.2, A34).
  import { permissionFor } from '../engine/permissions';
  import type { PermissionValue, TableState, TextRef } from '../engine/types';
  import type { BackupInfo } from '../net/host';
  import Modal from './Modal.svelte';
  import { submitOrSay } from './commands';
  import { ruleset, session } from './session.svelte';
  import { t, text } from './texts';
  import { view } from './view.svelte';

  const VALUES: PermissionValue[] = ['allow', 'own', 'deny'];
  const defaults = ruleset.permissions.player;
  const settings = $derived(session.state!.settings);
  const overrides = $derived(settings.permissionOverrides.player ?? {});
  const close = () => (view.gmPanel = null);

  const current = (key: string) => permissionFor('player', key, ruleset.permissions, session.state as TableState<unknown>);

  function setAutomation(id: string, on: boolean) {
    void submitOrSay({ type: 'table.setSettings', automation: { ...settings.automation, [id]: on } });
  }

  const setOverrides = (player: Record<string, PermissionValue>) =>
    void submitOrSay({ type: 'table.setSettings', permissionOverrides: { ...settings.permissionOverrides, player } });

  // ---------- Spielstand (nur beim Host, nicht bei Mitspielern) ----------
  const isHost = $derived(session.mode !== 'client');
  let backups = $state<BackupInfo[]>([]);
  let confirm = $state<string | null>(null);
  let problem = $state<TextRef | null>(null);
  let fileInput = $state<HTMLInputElement>();
  const refresh = async () => (backups = await session.backups());
  $effect(() => {
    if (isHost) void refresh();
  });

  async function importFile() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    fileInput!.value = '';
    problem = await session.importFile(file);
    if (!problem) view.say(t('settings.imported'));
    await refresh();
  }

  async function restore(id: string) {
    confirm = null;
    const r = await session.restore(id);
    if (r.ok) view.say(t('settings.restored'));
    else problem = r.reason;
    await refresh();
  }

  const when = (at: number) => new Date(at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  /** Nur Abweichungen von der Voreinstellung werden gespeichert. */
  function setPermission(key: string, value: PermissionValue) {
    const { [key]: _, ...rest } = overrides;
    setOverrides(value === defaults[key] ? rest : { ...rest, [key]: value });
  }
</script>

<Modal label={t('settings.title')} onclose={close} narrow>
  <b>{t('settings.automation')}</b>
  {#each ruleset.reactions as r (r.id)}
    <label class="check">
      <input type="checkbox" checked={settings.automation[r.id] !== false} onchange={(e) => setAutomation(r.id, e.currentTarget.checked)} />
      <span>{t(`settings.automationIds.${r.id}`)}</span>
    </label>
  {/each}

  <b>{t('settings.permissions')}</b>
  <p class="note">{t('settings.permissionsNote')}</p>
  <div class="perms">
    {#each Object.keys(defaults) as key (key)}
      <span class:changed={current(key) !== defaults[key]}>{t(`permissions.${key}`)}</span>
      <select value={current(key)} aria-label={t(`permissions.${key}`)} onchange={(e) => setPermission(key, e.currentTarget.value as PermissionValue)}>
        {#each VALUES as v (v)}<option value={v}>{t(`settings.values.${v}`)}</option>{/each}
      </select>
    {/each}
  </div>
  {#if isHost}
    <b class="gap">{t('settings.game')}</b>
    <div class="buttons">
      <button onclick={() => session.exportFile()}>{t('settings.export')}</button>
      <button onclick={() => fileInput?.click()}>{t('settings.import')}</button>
      <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importFile} />
    </div>
    <p class="note">{t('settings.importNote')}</p>
    {#if problem}<p class="problem">{text(problem)}</p>{/if}
    <b class="gap">{t('settings.backups')}</b>
    {#each backups as b (b.id)}
      <div class="backup">
        <span>{when(b.at)} · {t(`settings.backupReasons.${b.reason}`)}</span>
        {#if confirm === b.id}
          <button onclick={() => (confirm = null)}>{t('reset.cancel')}</button>
          <button class="danger" onclick={() => restore(b.id)}>{t('settings.restore')}</button>
        {:else}
          <button onclick={() => (confirm = b.id)}>{t('settings.restore')}</button>
        {/if}
      </div>
    {:else}
      <p class="note">{t('settings.noBackups')}</p>
    {/each}
  {/if}

  <div class="buttons end">
    <button disabled={Object.keys(overrides).length === 0} onclick={() => setOverrides({})}>{t('settings.defaults')}</button>
    <button onclick={close}>{t('gm.close')}</button>
  </div>
</Modal>

<style>
  b { display: block; margin: 4px 0 8px; }
  .check { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
  .note { margin: 0 0 8px; }
  .perms { display: grid; grid-template-columns: 1fr auto; gap: 6px 14px; align-items: center; }
  .changed { color: var(--accent-hint); }
  .gap { margin-top: 18px; }
  .problem { color: var(--reason); }
  .backup { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
  .backup span { flex: 1; }
  .backup button { padding: 4px 10px; }
  .buttons { justify-content: space-between; margin-top: 16px; }
</style>
