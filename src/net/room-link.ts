// Einladungslink: …/#<raum>.<geheimnis> (ARCHITEKTUR.md 8.2, Raumschutz).
// Beides zufällig und lang; das Geheimnis steht im Fragment und geht nie an einen Server.

import { z } from 'zod';

export type RoomLink = { room: string; secret: string };

const BYTES = 16; // 128 Bit je Teil
const PART = /^[A-Za-z0-9_-]{22}$/;
/** Raum im gespeicherten Stand bzw. in einer Sicherungsdatei */
export const RoomLinkSchema = z.object({ room: z.string().regex(PART), secret: z.string().regex(PART) }).strict();

export function createRoomLink(random: (bytes: Uint8Array<ArrayBuffer>) => void = (b) => crypto.getRandomValues(b)): RoomLink {
  return { room: randomToken(random), secret: randomToken(random) };
}

export const sameRoom = (a: RoomLink | null | undefined, b: RoomLink | null | undefined): boolean =>
  !!a && !!b && a.room === b.room && a.secret === b.secret;

export function formatHash(link: RoomLink): string {
  return `#${link.room}.${link.secret}`;
}

export function parseHash(hash: string): RoomLink | null {
  const [room, secret, ...rest] = hash.replace(/^#/, '').split('.');
  if (rest.length > 0 || !room || !secret) return null;
  if (!PART.test(room) || !PART.test(secret)) return null;
  return { room, secret };
}

/** 128 Bit Zufall, URL-sicher (22 Zeichen). */
export function randomToken(random: (bytes: Uint8Array<ArrayBuffer>) => void = (b) => crypto.getRandomValues(b)): string {
  const bytes = new Uint8Array(BYTES);
  random(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
