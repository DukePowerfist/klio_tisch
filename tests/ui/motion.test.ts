// Kartenbewegungen planen (11.2, Schritt 5g): welcher Fall welche Bewegung auslöst.

import { describe, expect, it } from 'vitest';
import type { CardId } from '../../src/engine/types';
import { ARC_MAX, arcPoints, arrival, cssMs, cues, FOLLOW_MS, GLIDE_MAX, planMove, planTurn, STAGGER, STAGGER_MAX, SWAY_MAX, type Frame, type Glide, type Timing } from '../../src/ui/motion';

const T: Timing = { glide: 250, glideEase: 'ease-out', land: 80, flip: 350, hold: 150, shift: 350, shiftEase: 'ease' };
const OFF: Timing = { glide: 0, glideEase: 'ease-out', land: 0, flip: 0, hold: 0, shift: 0, shiftEase: 'ease' };
const glide = (m: ReturnType<typeof planMove>) => {
  expect(m?.kind).toBe('glide');
  return m as Glide;
};
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

  it('losgelassen: gleitet ohne Bogen und Drehung (pendelt schon), setzt am neuen Platz auf', () => {
    // bestätigt: anderer Platz, 150 Tischpunkte
    const g = glide(planMove(f({ x: 50, follow: 'own' }), f({ x: 200, slot: 'discard#0' }), T));
    expect(g).toMatchObject({ arc: 0, sway: 0, land: true, glow: false, lifted: true });
    expect(g.duration).toBe(Math.round((250 + 150 * 0.4) * 0.8));
    // zurück an den Ausgangsort: gleicher Platz, kein Aufsetzen
    expect(glide(planMove(f({ x: 50, follow: 'own' }), f(), T))).toMatchObject({ land: false, glow: false });
    // fremder Zug: länger, am Ziel Leuchten in der Farbe der Person; abgelehnt (zurück) ohne Leuchten
    const r = glide(planMove(f({ x: 50, follow: 'remote' }), f({ x: 200, slot: 'discard#0' }), T));
    expect(r).toMatchObject({ glow: true, lifted: true });
    expect(r.duration).toBe(Math.round((250 + 150 * 0.4) * 1.2));
    expect(glide(planMove(f({ x: 50, follow: 'remote' }), f(), T)).glow).toBe(false);
  });

  it('im Stand bewegt: Dauer nach Strecke und Auslöser, Bogen nach oben, Drehung nach Richtung', () => {
    const g = glide(planMove(f(), f({ x: 300, y: 400, slot: 'discard#0' }), T));
    expect(g).toMatchObject({ duration: 450, arc: ARC_MAX, land: true, glow: false, lifted: false });
    expect(g.sway).toBeCloseTo(2);
    expect(glide(planMove(f(), f({ x: -900, slot: 'discard#0' }), T)).sway).toBe(-SWAY_MAX);
    expect(glide(planMove(f(), f({ x: 100, slot: 'discard#0' }), T)).arc).toBeCloseTo(8);
    // gedeckelt, dann nach Auslöser
    expect(glide(planMove(f(), f({ x: 2000, slot: 'discard#0' }), T)).duration).toBe(GLIDE_MAX);
    expect(glide(planMove(f(), f({ x: 2000, slot: 'discard#0' }), T, 'own')).duration).toBe(GLIDE_MAX * 0.8);
    expect(glide(planMove(f(), f({ x: 2000, slot: 'discard#0' }), T, 'foreign')).duration).toBe(GLIDE_MAX * 1.2);
    // vom Stapel in die freie Ablage: Drehung und Größe gehen mit
    expect(planMove(f(), f({ x: 200, rotated: true, scale: 0.6, slot: 'free#center:0.2:0.3' }), T)?.kind).toBe('glide');
  });

  it('Nachrücken im Stapel (kurze Strecke): kein Bogen, kein Aufsetzen', () => {
    expect(glide(planMove(f(), f({ x: 0.4, y: 0.4, slot: 'deck#2' }), T))).toMatchObject({ arc: 0, sway: 0, land: false });
  });

  it('Bogen: Parabel, Scheitel in der Mitte, Enden auf der Linie', () => {
    const pts = arcPoints(40);
    expect(pts[0]!.y).toBeCloseTo(0);
    expect(pts[4]).toEqual({ offset: 0.5, y: -40 });
    expect(pts.at(-1)!.y).toBeCloseTo(0);
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

describe('Staffelung, Ziehen, Umklappen', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `H${i + 2}` as CardId);

  it('mehrere Karten: gestaffelt in Reihenfolge des Ereignisses, insgesamt höchstens 500 ms', () => {
    const c = cues([{ type: 'cardsMoved', cards: ids(3), from: { zone: 'deck' }, to: { zone: 'discard' } } as never]);
    expect([...c.values()].map((x) => x.delay)).toEqual([0, STAGGER, 2 * STAGGER]);
    const many = cues([{ type: 'cardsTurned', cards: ids(13), faceUp: true } as never]);
    expect(many.get('H14' as CardId)!.delay).toBe(STAGGER_MAX);
    expect(cues([{ type: 'cardDrawn', card: 'S5', from: 'deck', to: 'discard', faceUp: true, announce: true } as never]).get('S5' as CardId)).toEqual({ delay: 0, drawn: true });
  });

  it('gestaffelt gleiten nur Karten ohne Zeiger; ein gezogener Stapel landet gemeinsam', () => {
    const cue = { delay: 100, drawn: false };
    expect(glide(planMove(f(), f({ x: 200, slot: 'discard#2' }), T, null, cue)).delay).toBe(100);
    expect(glide(planMove(f({ x: 50, follow: 'own' }), f({ x: 200, slot: 'discard#2' }), T, 'own', cue)).delay).toBe(0);
  });

  it('Aufdecken nach einer Bewegung: erst landen, nach dem Ziehen noch innehalten; Zudecken unterwegs', () => {
    const g = glide(planMove(f(), f({ x: 150, slot: 'discard#0' }), T));
    expect(arrival(g, T)).toBe(g.duration + T.land);
    expect(planTurn(false, true, T, 400)).toEqual({ delay: 400, duration: 350, easing: 'ease-in-out' });
    expect(planTurn(false, true, T, 400, { delay: 0, drawn: true })!.delay).toBe(400 + T.hold);
    expect(planTurn(true, false, T, 400)!.delay).toBe(0);
  });

  it('Umklappen ohne Bewegung: sofort bzw. gestaffelt; nur bei Wechsel der Seite, nicht ohne Dauer', () => {
    expect(planTurn(false, true, T)).toEqual({ delay: 0, duration: 350, easing: 'ease-in-out' });
    expect(planTurn(false, true, T, 0, { delay: 100, drawn: false })!.delay).toBe(100);
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
