// Fotos über das Netz (ARCHITEKTUR.md 8.4): nach Inhalt benannt (SHA-256), einmalig übertragen.
// Im Spielkanal als Base64; Trystero teilt große Nachrichten selbst in Stücke.

import { z } from 'zod';

/** Foto-Ablage eines Browsers (Host und Clients); Inhalt als Bytes. */
export interface PhotoBank {
  get(hash: string): Promise<Uint8Array | null>;
  put(hash: string, bytes: Uint8Array): Promise<void>;
}

/** Base64 eines Fotos; verkleinerte Fotos sind meist unter 64 KB, die Grenze lässt Luft */
export const PhotoDataSchema = z.string().max(400_000).regex(/^[A-Za-z0-9+/]*={0,2}$/);

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** Empfangenes Foto entpacken; null, wenn der Inhalt nicht zum Namen passt. */
export async function unpackPhoto(hash: string, data: string): Promise<Uint8Array | null> {
  const bytes = fromBase64(data);
  return (await sha256Hex(bytes)) === hash ? bytes : null;
}
