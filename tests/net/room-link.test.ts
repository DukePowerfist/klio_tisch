import { describe, expect, it } from 'vitest';
import { createRoomLink, formatHash, parseHash } from '../../src/net/room-link';

describe('Einladungslink', () => {
  it('Hin- und Rückweg ergeben denselben Raum', () => {
    const link = createRoomLink();
    expect(parseHash(formatHash(link))).toEqual(link);
  });

  it('Raum und Geheimnis sind je 128 Bit zufällig und verschieden', () => {
    const a = createRoomLink();
    const b = createRoomLink();
    expect(a.room).toHaveLength(22);
    expect(a.secret).toHaveLength(22);
    expect(a.room).not.toBe(a.secret);
    expect(a).not.toEqual(b);
  });

  it('nutzt nur URL-sichere Zeichen', () => {
    const allOnes = createRoomLink((b) => b.fill(0xff));
    expect(allOnes.room).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    '',
    '#',
    '#nurraum',
    '#abc.def',
    `#${'a'.repeat(22)}`,
    `#${'a'.repeat(22)}.${'b'.repeat(21)}`,
    `#${'a'.repeat(22)}.${'b'.repeat(22)}.x`,
    `#${'a'.repeat(22)}.${'b'.repeat(21)}=`,
  ])('lehnt unvollständige oder fremde Links ab: %s', (hash) => {
    expect(parseHash(hash)).toBeNull();
  });
});
