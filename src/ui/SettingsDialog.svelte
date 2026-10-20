<script lang="ts">
  // Einstellungen der SL (7 „Abschaltbare Automatik“, 9.3): Automatik je Reaktion und Rechte der Spieler zur Laufzeit.
  // Gespeichert im Stand (settings), also für alle gleich; die Voreinstellung bleibt in permissions.yaml.
  import { permissionFor } from '../engine/permissions';
  import type { PermissionValue, TableState } from '../engine/types';
  import Modal from './Modal.svelte';
  import { submitOrSay } from './commands';
  import { ruleset, session } from './session.svelte';
  import { permissionLabel, t } from './texts';
  import { view } from './view.svelte';

  const VALUES: PermissionValue[] = ['allow', 'own', 'deny'];
  const defaults = ruleset.permissions.player;
  const settings = $derived(session.state!.settings);
  const close = () => (view.gmPanel = null);

  const current = (key: string) => permissionFor('player', key, ruleset.permissions, session.state as TableState<unknown>);

  function setAutomation(id: string, on: boolean) {
    void submitOrSay({ type: 'table.setSettings', automation: { ...settings.automation, [id]: on } });
  }

  /** Nur Abweichungen von der Voreinstellung werden gespeichert. */
  function setPermission(key: string, value: PermissionValue) {
    const { [key]: _, ...rest } = settings.permissionOverrides.player ?? {};
    const player = value === defaults[key] ? rest : { ...rest, [key]: value };
    void submitOrSay({ type: 'table.setSettings', permissionOverrides: { ...settings.permissionOverrides, player } });
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
      <span class:changed={current(key) !== defaults[key]}>{permissionLabel(key)}</span>
      <select value={current(key)} aria-label={permissionLabel(key)} onchange={(e) => setPermission(key, e.currentTarget.value as PermissionValue)}>
        {#each VALUES as v (v)}<option value={v}>{t(`settings.values.${v}`)}</option>{/each}
      </select>
    {/each}
  </div>
  <div class="row">
    <button disabled={Object.keys(settings.permissionOverrides.player ?? {}).length === 0} onclick={() => submitOrSay({ type: 'table.setSettings', permissionOverrides: { ...settings.permissionOverrides, player: {} } })}>{t('settings.defaults')}</button>
    <button onclick={close}>{t('settings.close')}</button>
  </div>
</Modal>

<style>
  b { display: block; margin: 4px 0 8px; }
  .check { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
  .note { font-size: 13px; opacity: 0.75; margin: 0 0 8px; }
  .perms { display: grid; grid-template-columns: 1fr auto; gap: 6px 14px; align-items: center; }
  .changed { color: var(--accent-hint); }
  select { background: var(--panel-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; font: inherit; }
  .row { display: flex; gap: 10px; justify-content: space-between; margin-top: 16px; }
</style>
