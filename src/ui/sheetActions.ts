// Aktionen zum ganzen Bogen (10.1): Foto wählen und ablegen (Fotofeld am Bogen und Menü am Namensschild),
// Charakter als Datei speichern und laden (Menü am Namensschild).

import type { SeatId } from '../engine/types';
import { sheetOf } from '../rules/klio/events';
import { characterFileName, readCharacter, writeCharacter } from './characterFile';
import { sayIfRejected, submitOrSay } from './commands';
import { saveFile } from './files';
import { preparePhoto } from './photo';
import { photos } from './photos.svelte';
import { seatNames } from './seatNames';
import { session } from './session.svelte';
import { t } from './texts';
import { view } from './view.svelte';

/** Foto verkleinern, nach Inhalt benennen, ablegen (bzw. zum Host bringen), dann am Bogen eintragen */
export async function setPhoto(seat: SeatId, file: File): Promise<void> {
  const prepared = await preparePhoto(file).catch(() => null);
  if (!prepared) return view.say(t('sheet.photoUnreadable'), true);
  const stored = await session.addPhoto(prepared.hash, prepared.bytes);
  if (!sayIfRejected(stored)) return;
  const cmd = { type: 'sheet.setPhoto', seat, photo: { hash: prepared.hash, type: 'image/jpeg' } };
  await submitOrSay(cmd);
}

/** Dateiauswahl ohne festes Dateifeld (z. B. aus dem Menü) */
function pickFile(accept: string, then: (file: File) => unknown): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void then(file);
  };
  input.click();
}

/** Dateiauswahl öffnen und das gewählte Bild als Foto setzen */
export const pickPhoto = (seat: SeatId): void => pickFile('image/*', (file) => setPhoto(seat, file));

/** Bogen als Charakterdatei speichern, mit Foto, sofern es in diesem Browser liegt */
export async function exportCharacter(seat: SeatId): Promise<void> {
  const table = session.state;
  if (!table) return;
  const sheet = sheetOf(table, seat);
  const photo = sheet.photo ? await photos.get(sheet.photo.hash) : null;
  saveFile(characterFileName(seatNames(table, seat).character), writeCharacter(sheet, photo));
}

/** Charakterdatei wählen und den Bogen damit ersetzen; das Foto kommt vorher in die Ablage bzw. zum Host */
export const importCharacter = (seat: SeatId): void =>
  pickFile('application/json,.json', async (file) => {
    const r = await readCharacter(await file.text());
    if (!sayIfRejected(r)) return;
    if (r.photo) {
      const stored = await session.addPhoto(r.photo.hash, r.photo.bytes);
      if (!sayIfRejected(stored)) return;
    }
    const cmd = { type: 'sheet.import', seat, sheet: r.sheet };
    await submitOrSay(cmd);
  });
