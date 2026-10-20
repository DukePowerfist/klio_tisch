<script lang="ts">
  // Einstellungen der SL (7 „Abschaltbare Automatik“, 9.3): Automatik je Reaktion und Rechte der Spieler zur Laufzeit.
  // Gespeichert im Stand (settings), also für alle gleich; die Voreinstellung bleibt in permissions.yaml.
  import { permissionFor } from '../engine/permissions';
  import type { PermissionValue, TableState } from '../engine/types';
  import Modal from './Modal.svelte';
  import { submitOrSay } from './commands';
  import { ruleset, session } from './session.svelte';
  import { t } from './texts';
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
  <div class="buttons">
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
  .buttons { justify-content: space-between; margin-top: 16px; }
</style>
