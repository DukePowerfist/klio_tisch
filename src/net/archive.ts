// Sicherung als Datei (ARCHITEKTUR.md 8.2 „Sicherung“): Stand, Plätze, Raum und die Fotos selbst.
// Für einen Geräte- oder Browserwechsel der SL; die Datei wird beim Einlesen vollständig geprüft.

import { z } from 'zod';
import { PhotoHashSchema } from '../engine/schemas';
import type { Engine } from '../engine/dispatch';
import type { HostData, Saved } from './host';
import { PhotoDataSchema, toBase64, unpackPhoto } from './photos';
import { RoleSchema } from './protocol';

const APP = 'klio-tisch';
const VERSION = 1;

const RoomPart = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const ArchiveSchema = z.object({
  app: z.literal(APP),
  version: z.literal(VERSION),
  exportedAt: z.string(),
  state: z.unknown(),
  /** Plätze und Raum; gemerkte Antworten gehören nicht dazu */
  host: z.object({
    keys: z.record(z.string(), RoleSchema),
    room: z.object({ room: RoomPart, secret: RoomPart }).strict().exactOptional(),
  }).strict(),
  photos: z.record(PhotoHashSchema, PhotoDataSchema),
}).strict();

export type Photos = Map<string, Uint8Array>;

export function writeArchive<G>(saved: Saved<G>, photos: Photos, now = new Date()): string {
  const { keys, room } = saved.host;
  return JSON.stringify({
    app: APP,
    version: VERSION,
    exportedAt: now.toISOString(),
    state: saved.state,
    host: { keys, ...(room ? { room } : {}) },
    photos: Object.fromEntries([...photos].map(([hash, bytes]) => [hash, toBase64(bytes)])),
  });
}

/** Datei einlesen und prüfen; wirft bei fremden, beschädigten oder unpassenden Dateien. */
export async function readArchive<G>(engine: Engine<G>, text: string): Promise<{ saved: Saved<G>; photos: Photos }> {
  const a = ArchiveSchema.parse(JSON.parse(text));
  const photos: Photos = new Map();
  for (const [hash, data] of Object.entries(a.photos)) {
    const bytes = await unpackPhoto(hash, data);
    if (!bytes) throw new Error(`Foto ${hash.slice(0, 8)} passt nicht zu seinem Namen`);
    photos.set(hash, bytes);
  }
  const host: HostData = { keys: a.host.keys, answered: {}, ...(a.host.room ? { room: a.host.room } : {}) };
  return { saved: { state: engine.parseState(a.state), host }, photos };
}
