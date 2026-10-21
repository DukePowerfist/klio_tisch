// Aktionen zum ganzen Bogen (10.1): Foto wählen und ablegen. Genutzt vom Fotofeld am Bogen und vom Menü am Namensschild.

import type { SeatId } from '../engine/types';
import { submitOrSay } from './commands';
import { preparePhoto } from './photo';
import { session } from './session.svelte';
import { t, text } from './texts';
import { view } from './view.svelte';

/** Foto verkleinern, nach Inhalt benennen, ablegen (bzw. zum Host bringen), dann am Bogen eintragen */
export async function setPhoto(seat: SeatId, file: File): Promise<void> {
  const prepared = await preparePhoto(file).catch(() => null);
  if (!prepared) return view.say(t('sheet.photoUnreadable'), true);
  const stored = await session.addPhoto(prepared.hash, prepared.bytes);
  if (!stored.ok) return view.say(text(stored.reason), true);
  const cmd = { type: 'sheet.setPhoto', seat, photo: { hash: prepared.hash, type: 'image/jpeg' } };
  await submitOrSay(cmd);
}

/** Dateiauswahl öffnen und das gewählte Bild als Foto setzen (ohne festes Dateifeld, z. B. aus dem Menü) */
export function pickPhoto(seat: SeatId): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void setPhoto(seat, file);
  };
  input.click();
}
