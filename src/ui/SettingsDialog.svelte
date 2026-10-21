<script lang="ts">
  // Einstellungen der SL (7 „Abschaltbare Automatik“, 9.3): Automatik je Reaktion und Rechte der Spieler zur Laufzeit.
  // Gespeichert im Stand (settings), also für alle gleich; die Voreinstellung bleibt in permissions.yaml.
  // Dazu für die SL im eigenen Browser: Spielstand als Datei und automatische Sicherungen (8.2, A34).
  import { permissionFor } from '../engine/permissions';
  import type { PermissionValue, TableState, TextRef } from '../engine/types';
  import type { BackupInfo } from '../net/host';
  import type { CommandResult } from '../net/protocol';
  import Modal from './Modal.svelte';
  import { submitOrSay } from './commands';
  import { ruleset, session } from './session.svelte';
  import { openPage, visiblePages, type SettingsPage } from './settingsPages';
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
  // ---------- Seiten (Schritt 5f): Seitenleiste links, Seite rechts ----------
  const TITLE: Record<SettingsPage, string> = { automation: 'settings.automation', permissions: 'settings.permissions', game: 'settings.game' };
  const pages = $derived(visiblePages(isHost));
  const page = $derived(openPage(view.settingsPage, pages));
  let backups = $state<BackupInfo[]>([]);
  let confirm = $state<string | null>(null);
  let problem = $state<TextRef | null>(null);
  let fileInput: HTMLInputElement | undefined;
  const refresh = async () => (backups = await session.backups());
  $effect(() => {
    if (isHost) void refresh();
  });

  /** Ersetzen des Stands (Datei, Sicherung): Meldung oder Grund im Fenster */
  async function done(r: CommandResult, ok: string) {
    problem = r.ok ? null : r.reason;
    if (r.ok) view.say(t(ok));
    await refresh();
  }

  async function importFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) await done(await session.importFile(file), 'settings.imported');
  }

  async function restore(id: string) {
    confirm = null;
    await done(await session.restore(id), 'settings.restored');
  }

  const when = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  /** Nur Abweichungen von der Voreinstellung werden gespeichert. */
  function setPermission(key: string, value: PermissionValue) {
    const { [key]: _, ...rest } = overrides;
    setOverrides(value === defaults[key] ? rest : { ...rest, [key]: value });
  }
</script>

<Modal label={t('settings.title')} onclose={close} size="pane">
  <div class="side">
    <p class="heading">{t('settings.title')}</p>
    <div role="tablist" aria-orientation="vertical" aria-label={t('settings.title')}>
      {#each pages as p (p)}
        <button role="tab" id="settings-tab-{p}" aria-selected={p === page} aria-controls="settings-panel" class:current={p === page} onclick={() => (view.settingsPage = p)}>{t(TITLE[p])}</button>
      {/each}
    </div>
  </div>
  <div class="main">
    <header>
      <h2>{t(TITLE[page])}</h2>
      <button class="close" aria-label={t('gm.close')} title={t('gm.close')} onclick={close}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </header>
    <div class="body" role="tabpanel" id="settings-panel" aria-labelledby="settings-tab-{page}">
      {#if page === 'automation'}
        {#each ruleset.reactions as r (r.id)}
          <label class="check">
            <input type="checkbox" checked={settings.automation[r.id] !== false} onchange={(e) => setAutomation(r.id, e.currentTarget.checked)} />
            <span>{t(`settings.automationIds.${r.id}`)}</span>
          </label>
        {/each}
      {:else if page === 'permissions'}
        <p class="note">{t('settings.permissionsNote')}</p>
        <div class="perms">
          {#each Object.keys(defaults) as key (key)}
            <span class:changed={current(key) !== defaults[key]}>{t(`permissions.${key}`)}</span>
            <select value={current(key)} aria-label={t(`permissions.${key}`)} onchange={(e) => setPermission(key, e.currentTarget.value as PermissionValue)}>
              {#each VALUES as v (v)}<option value={v}>{t(`settings.values.${v}`)}</option>{/each}
            </select>
          {/each}
        </div>
        <div class="buttons">
          <button disabled={Object.keys(overrides).length === 0} onclick={() => setOverrides({})}>{t('settings.defaults')}</button>
        </div>
      {:else}
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
            <span>{when.format(b.at)} · {t(`settings.backupReasons.${b.reason}`)}</span>
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
    </div>
  </div>
</Modal>

<style>
  /* Aufbau im Stil des Zed-Editors (Schritt 5f): Seitenleiste, fester Kopf, nur die Seite scrollt */
  .side { width: 190px; flex: none; background: var(--pane-side); border-right: 1px solid var(--pane-rule); padding: 16px 10px; box-sizing: border-box; }
  .heading { margin: 0 10px 12px; font-size: 13px; opacity: 0.75; }
  [role='tablist'] { display: flex; flex-direction: column; gap: 2px; }
  .side button { background: none; border: none; border-radius: 6px; padding: 7px 10px; text-align: left; }
  .side button:hover { background: var(--pane-current); }
  .side button.current { background: var(--pane-current); font-weight: 600; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 12px 22px; border-bottom: 1px solid var(--pane-rule); }
  h2 { margin: 0; font-size: 17px; font-weight: 600; }
  header .close { background: none; border: none; padding: 5px; line-height: 0; opacity: 0.75; }
  header .close:hover { background: var(--button-hover); opacity: 1; }
  .close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  .body { flex: 1; overflow: auto; padding: 14px 22px 18px; }
  b { display: block; margin: 4px 0 8px; }
  .check { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
  .note { margin: 0 0 8px; }
  .perms { display: grid; grid-template-columns: 1fr auto; gap: 6px 14px; align-items: center; }
  .changed { color: var(--accent-hint); }
  .gap { margin-top: 18px; }
  .backup { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
  .backup span { flex: 1; }
  .backup button { padding: 4px 10px; }
  .perms + .buttons { margin-top: 16px; }
</style>
