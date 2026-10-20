// Foto für den Bogen: verkleinern (höchstens 220 px, JPEG wie bisher), nach Inhalt benennen (8.4).

import { sha256Hex } from '../net/photos';

const MAX = 220;
const QUALITY = 0.75;

export async function preparePhoto(file: File): Promise<{ hash: string; blob: Blob }> {
  const bitmap = await createImageBitmap(file);
  const q = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * q), Math.round(bitmap.height * q));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  return { hash: await sha256Hex(new Uint8Array(await blob.arrayBuffer())), blob };
}
