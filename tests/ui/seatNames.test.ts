import { describe, expect, it } from 'vitest';
import { seatNames } from '../../src/ui/seatNames';
import { fresh, run, withSheet } from '../helpers';

describe('Namen am Platz', () => {
  it('Charakter, Person und wer zuletzt dort saß (8.7)', () => {
    let s = run(fresh(), { type: 'table.setSeat', seat: 'seat2', occupied: true, name: 'Ida' }).state;
    s = withSheet(s, 'seat2', (b) => (b.name = 'Hilda'));
    expect(seatNames(s, 'seat2')).toMatchObject({ character: 'Hilda', person: 'Ida', label: 'Hilda · Ida', free: false, last: '' });
    const freed = run(s, { type: 'table.setSeat', seat: 'seat2', occupied: false }).state;
    // die Person zählt nur am besetzten Platz; Schild und Dock bleiben wie bisher
    expect(seatNames(freed, 'seat2')).toMatchObject({ character: 'Hilda', person: '', label: 'Hilda', plate: 'Spieler 2', free: true, last: 'Ida' });
    expect(seatNames(fresh(), 'seat3')).toMatchObject({ character: 'Spieler 3', free: true, last: '' });
  });
});
