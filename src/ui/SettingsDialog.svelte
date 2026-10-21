<script lang="ts">
  // Einstellungen der SL (7 „Abschaltbare Automatik“, 9.3): Automatik je Reaktion und Rechte der Spieler zur Laufzeit.
  // Gespeichert im Stand (settings), also für alle gleich; die Voreinstellung bleibt in permissions.yaml.
  // Dazu für die SL im eigenen Browser: Spielstand als Datei und automatische Sicherungen (8.2, A34).
  // Seit 5g für alle: Seite „Darstellung“ mit der Effektstufe (nur im eigenen Browser, 11.5).
  import { permissionFor } from '../engine/permissions';
  import type { PermissionValue, TableState, TextRef } from '../engine/types';
  import type { BackupInfo } from '../net/host';
  import type { CommandResult } from '../net/protocol';
  import Modal from './Modal.svelte';
  import SettingRow from './SettingRow.svelte';
  import { submitOrSay } from './commands';
  import { ruleset, session } from './session.svelte';
  import { openPage, permissionGroups, visiblePages } from './settingsPages';
  import { t, text, tMaybe } from './texts';
  import { view } from './view.svelte';
  import { EFFECT_LEVELS, effectLevel, type EffectLevel } from './effectLevel.svelte';
  import { NOTICE_ARRIVALS } from './arrivals';

  const VALUES: PermissionValue[] = ['allow', 'own', 'deny'];
  const defaults = ruleset.permissions.player;
  const settings = $derived(session.state!.settings);
  const overrides = $derived(settings.permissionOverrides.player ?? {});
  const close = () => (view.gmPanel = null);
  /** Bedienung per Tastatur (Schritt 5f): Fokus auf ein Element, sobald es erscheint */
  const focus = (el: HTMLElement) => el.focus();

  const current = (key: string) => permissionFor('player', key, ruleset.permissions, session.state as TableState<unknown>);

  function setAutomation(id: string, on: boolean) {
    void submitOrSay({ type: 'table.setSettings', automation: { ...settings.automation, [id]: on } });
  }

  const setOverrides = (player: Record<string, PermissionValue>) =>
    void submitOrSay({ type: 'table.setSettings', permissionOverrides: { ...settings.permissionOverrides, player } });

  // ---------- Spielstand (nur beim Host, nicht bei Mitspielern) ----------
  const isHost = $derived(session.mode !== 'client');
  // ---------- Seiten (Schritt 5f): Seitenleiste links, Seite rechts ----------
  const pages = $derived(visiblePages(isHost, session.can({ type: 'table.setSettings' })));
  const page = $derived(openPage(view.settingsPage, pages));
  const groups = permissionGroups(Object.keys(defaults));
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

<!-- Esc bricht zuerst eine offene Rückfrage ab, erst dann schließt es den Dialog -->
<Modal label={t('settings.title')} onclose={close} onescape={() => (confirm ? ((confirm = null), true) : false)} size="pane">
  <div class="side">
    <p class="heading">{t('settings.title')}</p>
    <div role="tablist" aria-orientation="vertical" aria-label={t('settings.title')}>
      {#each pages as p (p)}
        <!-- beim Öffnen steht der Fokus auf der aktuellen Seite -->
        <button {@attach (el) => { if (p === page) focus(el); }} role="tab" id="settings-tab-{p}" aria-selected={p === page} aria-controls="settings-panel" class:current={p === page} onclick={() => (view.settingsPage = p)}>{t(`settings.${p}`)}</button>
      {/each}
    </div>
  </div>
  <div class="main">
    <header>
      <div class="titleline">
        <h2>{t(`settings.${page}`)}</h2>
        <!-- Reichweite: Automatik und Rechte stehen im Stand; der Spielstand trägt kein Schild (Laden ersetzt für alle);
             die Darstellung gilt nur im eigenen Browser -->
        {#if page === 'appearance'}<span class="scope" title={t('settings.scope.mineHint')}>{t('settings.scope.mine')}</span>
        {:else if page !== 'game'}<span class="scope" title={t('settings.scope.allHint')}>{t('settings.scope.all')}</span>{/if}
      </div>
      <button class="close" aria-label={t('gm.close')} title={t('gm.close')} onclick={close}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </header>
    <div class="body" role="tabpanel" id="settings-panel" aria-labelledby="settings-tab-{page}">
      {#if page === 'automation'}
        {#each ruleset.reactions as r (r.id)}
          {@const id = `auto-${r.id}`}
          {@const desc = tMaybe(`settings.automationHelp.${r.id}`)}
          <SettingRow {id} title={t(`settings.automationIds.${r.id}`)} description={desc}>
            <input class="switch" type="checkbox" role="switch" aria-labelledby="{id}-title" aria-describedby={desc ? `${id}-desc` : undefined}
              checked={settings.automation[r.id] !== false} onchange={(e) => setAutomation(r.id, e.currentTarget.checked)} />
          </SettingRow>
        {/each}
        <!-- Schalter der Oberfläche im selben Feld des Stands (11.7) -->
        <section aria-labelledby="group-notices">
          <h3 id="group-notices">{t('settings.notices')}</h3>
          <SettingRow id="notice-arrivals" title={t('settings.noticeArrivals')} description={t('settings.noticeArrivalsHelp')}>
            <input class="switch" type="checkbox" role="switch" aria-labelledby="notice-arrivals-title" aria-describedby="notice-arrivals-desc"
              checked={settings.automation[NOTICE_ARRIVALS] !== false} onchange={(e) => setAutomation(NOTICE_ARRIVALS, e.currentTarget.checked)} />
          </SettingRow>
        </section>
      {:else if page === 'permissions'}
        {#each groups as g (g.id)}
          {@const groupHelp = tMaybe(`settings.groupHelp.${g.id}`)}
          <section aria-labelledby="group-{g.id}">
            <h3 id="group-{g.id}">{t(`settings.groups.${g.id}`)}</h3>
            {#if groupHelp}<p class="note">{groupHelp}</p>{/if}
            {#each g.keys as key (key)}
              {@const id = `perm-${key}`}
              {@const desc = tMaybe(`permissionHelp.${key}`)}
              <SettingRow {id} title={t(`permissions.${key}`)} description={desc} changed={current(key) !== defaults[key]}>
                <select value={current(key)} aria-labelledby="{id}-title" aria-describedby={desc ? `${id}-desc` : undefined}
                  onchange={(e) => setPermission(key, e.currentTarget.value as PermissionValue)}>
                  {#each VALUES as v (v)}<option value={v}>{t(`settings.values.${v}`)}</option>{/each}
                </select>
              </SettingRow>
            {/each}
          </section>
        {/each}
        <section class="defaults">
          <SettingRow id="defaults" title={t('settings.defaults')} description={t('settings.defaultsHelp')}>
            <button aria-labelledby="defaults-title" aria-describedby="defaults-desc" disabled={Object.keys(overrides).length === 0} onclick={() => setOverrides({})}>{t('settings.restore')}</button>
          </SettingRow>
        </section>
      {:else if page === 'appearance'}
        <SettingRow id="effects" title={t('settings.effects')} description={t('settings.effectsHelp')}>
          <select value={effectLevel.level} aria-labelledby="effects-title" aria-describedby="effects-desc"
            onchange={(e) => (effectLevel.level = e.currentTarget.value as EffectLevel)}>
            {#each EFFECT_LEVELS as v (v)}<option value={v}>{t(`settings.levels.${v}`)}</option>{/each}
          </select>
        </SettingRow>
      {:else}
        <SettingRow id="export" title={t('settings.export')} description={t('settings.exportHelp')}>
          <button aria-labelledby="export-title" aria-describedby="export-desc" onclick={() => session.exportFile()}>{t('settings.exportButton')}</button>
        </SettingRow>
        <SettingRow id="import" title={t('settings.import')} description={t('settings.importHelp')} problem={problem ? text(problem) : undefined}>
          <button aria-labelledby="import-title" aria-describedby="import-desc" onclick={() => fileInput?.click()}>{t('settings.importButton')}</button>
          <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importFile} />
        </SettingRow>
        <section aria-labelledby="backups">
          <h3 id="backups" class="titleline">{t('settings.backups')} <span class="scope">{t('settings.scope.browser')}</span></h3>
          <p class="note">{t('settings.backupsHelp')}</p>
          {#each backups as b (b.id)}
            <SettingRow id="backup-{b.id}" title={when.format(b.at)} description={t(`settings.backupReasons.${b.reason}`)}>
              {#if confirm === b.id}
                <span class="ask">{t('settings.restoreConfirm')}</span>
                <button {@attach focus} onclick={() => (confirm = null)}>{t('reset.cancel')}</button>
                <button class="danger" onclick={() => restore(b.id)}>{t('settings.restore')}</button>
              {:else}
                <button onclick={() => (confirm = b.id)}>{t('settings.restore')}</button>
              {/if}
            </SettingRow>
          {:else}
            <p class="note">{t('settings.noBackups')}</p>
          {/each}
        </section>
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
  .titleline { display: flex; align-items: center; gap: 10px; }
  h2 { margin: 0; font-size: 17px; font-weight: 600; }
  .scope { font-size: 12px; font-weight: normal; padding: 1px 8px; border: 1px solid var(--pane-rule); border-radius: 999px; opacity: 0.8; }
  header .close { background: none; border: none; padding: 5px; line-height: 0; opacity: 0.75; }
  header .close:hover { background: var(--button-hover); opacity: 1; }
  .close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  .body { flex: 1; overflow: auto; padding: 4px 22px 18px; }
  .body button { padding: 5px 12px; }
  h3 { margin: 18px 0 2px; font-size: 14px; font-weight: 600; opacity: 0.85; }
  section:first-child h3 { margin-top: 10px; }
  .note { margin: 0 0 4px; }
  .defaults { margin-top: 14px; border-top: 1px solid var(--pane-rule); }
  .ask { font-size: 13px; }
  /* Schalter: Kästchen mit role="switch", nur anders gezeichnet */
  .switch { appearance: none; position: relative; width: 36px; height: 20px; margin: 0; border-radius: 10px; background: var(--switch-off); cursor: pointer; transition: background var(--glide); }
  .switch::before { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--ink); transition: transform var(--glide); }
  .switch:checked { background: var(--switch-on); }
  .switch:checked::before { transform: translateX(16px); }
  .switch:focus-visible { outline: 2px solid var(--accent-hint); outline-offset: 2px; }
</style>
