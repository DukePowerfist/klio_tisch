// Kartenbewegungen planen (11.2, Schritt 5g): welcher Fall welche Bewegung auslöst.

import { describe, expect, it } from 'vitest';
import { cssMs, FOLLOW_MS, planMove, planTurn, type Frame, type Timing } from '../../src/ui/motion';

const T: Timing = { glide: 300, flip: 350, shift: 350, shiftEase: 'ease' };
const OFF: Timing = { glide: 0, flip: 0, shift: 0, shiftEase: 'ease' };
const f = (p: Partial<Frame> = {}): Frame => ({ x: 0, y: 0, scale: 1, rotated: false, slot: 'deck#3', follow: null, ...p });

describe('Bewegung je Fall', () => {
  it('gleiche Lage: nichts zu tun, eine laufende Bewegung läuft weiter', () => {
    expect(planMove(f(), f(), T)).toBeNull();
    expect(planMove(f(), f({ slot: 'deck#2', follow: 'remote' }), T)).toBeNull();
  });

  it('folgt dem eigenen Zeiger: sofort, auch beim Greifen', () => {
    expect(planMove(f(), f({ x: 40, follow: 'own' }), T)).toEqual({ kind: 'jump' });
    expect(planMove(f({ follow: 'own' }), f({ x: 80, follow: 'own' }), T)).toEqual({ kind: 'jump' });
  });

  it('folgt einem fremden Zeiger: kurz und gleichmäßig nachgeführt', () => {
    expect(planMove(f({ follow: 'remote' }), f({ x: 5, follow: 'remote' }), T)).toEqual({ kind: 'follow', duration: FOLLOW_MS, easing: 'linear' });
  });

  it('losgelassen (bestätigt, abgelehnt, ohne Befehl, Frist abgelaufen): gleitet', () => {
    const glide = { kind: 'glide', duration: 300, easing: 'ease-out' };
    // bestätigt: anderer Platz
    expect(planMove(f({ x: 50, follow: 'own' }), f({ x: 200, slot: 'discard#0' }), T)).toEqual(glide);
    // zurück an den Ausgangsort: gleicher Platz, aber vorher dem Zeiger gefolgt
    expect(planMove(f({ x: 50, follow: 'own' }), f(), T)).toEqual(glide);
    expect(planMove(f({ x: 50, follow: 'remote' }), f(), T)).toEqual(glide);
  });

  it('im Stand bewegt (anderer Platz): gleitet', () => {
    expect(planMove(f(), f({ x: 200, slot: 'discard#0' }), T)).toEqual({ kind: 'glide', duration: 300, easing: 'ease-out' });
    // vom Stapel in die freie Ablage: Drehung und Größe gehen mit
    expect(planMove(f(), f({ x: 200, rotated: true, scale: 0.6, slot: 'free#center:0.2:0.3' }), T)?.kind).toBe('glide');
  });

  it('gleicher Platz, andere Lage: Ansichtswechsel mit Dauer und Kurve der Bögen', () => {
    expect(planMove(f(), f({ x: 120, scale: 0.555 }), T)).toEqual({ kind: 'shift', duration: 350, easing: 'ease' });
  });

  it('ohne Dauern (Bewegung reduziert): sofort; fremder Zeiger bleibt nachgeführt', () => {
    expect(planMove(f(), f({ x: 200, slot: 'discard#0' }), OFF)).toEqual({ kind: 'jump' });
    expect(planMove(f(), f({ x: 120 }), OFF)).toEqual({ kind: 'jump' });
    expect(planMove(f({ follow: 'remote' }), f({ x: 5, follow: 'remote' }), OFF)?.kind).toBe('follow');
  });
});

describe('Umklappen und Zeiten', () => {
  it('klappt nur bei Wechsel der Seite, nicht ohne Dauer', () => {
    expect(planTurn(false, true, T)).toEqual({ duration: 350, easing: 'ease-in-out' });
    expect(planTurn(true, true, T)).toBeNull();
    expect(planTurn(false, true, OFF)).toBeNull();
  });

  it('CSS-Zeiten in ms', () => {
    expect(cssMs('0.3s')).toBe(300);
    expect(cssMs(' 350ms ')).toBe(350);
    expect(cssMs('0s')).toBe(0);
    expect(cssMs('')).toBe(0);
  });
});
