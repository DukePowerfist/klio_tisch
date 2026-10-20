// Einladungslink: …/#<raum>.<geheimnis> (ARCHITEKTUR.md 8.2, Raumschutz).
// Beides zufällig und lang; das Geheimnis steht im Fragment und geht nie an einen Server.

export type RoomLink = { room: string; secret: string };

const BYTES = 16; // 128 Bit je Teil
const PART = /^[A-Za-z0-9_-]{22}$/;

export function createRoomLink(random: (bytes: Uint8Array<ArrayBuffer>) => void = (b) => crypto.getRandomValues(b)): RoomLink {
  return { room: randomPart(random), secret: randomPart(random) };
}

export function formatHash(link: RoomLink): string {
  return `#${link.room}.${link.secret}`;
}

export function parseHash(hash: string): RoomLink | null {
  const [room, secret, ...rest] = hash.replace(/^#/, '').split('.');
  if (rest.length > 0 || !room || !secret) return null;
  if (!PART.test(room) || !PART.test(secret)) return null;
  return { room, secret };
}

function randomPart(random: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const bytes = new Uint8Array(BYTES);
  random(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
