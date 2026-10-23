// Kurz sichtbare Markierungen (11, 5x): ein erneuter Puls desselben Schlüssels verlängert ihn bis zu seinem Ende.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PULSE_MS, Pulse } from '../../src/ui/pulse.svelte';

describe('Pulse', () => {
  afterEach(() => vi.useRealTimers());

  it('verschwindet nach PULSE_MS', async () => {
    vi.useFakeTimers();
    const p = new Pulse<string>();
    p.add(['seat1']);
    expect(p.has('seat1')).toBe(true);
    await vi.advanceTimersByTimeAsync(PULSE_MS);
    expect(p.has('seat1')).toBe(false);
  });

  it('zwei Treffer kurz hintereinander: sichtbar bis zum Ende des zweiten', async () => {
    vi.useFakeTimers();
    const p = new Pulse<string>();
    p.add(['seat1', 'seat2']);
    await vi.advanceTimersByTimeAsync(400);
    p.add(['seat1']);
    await vi.advanceTimersByTimeAsync(PULSE_MS - 400);
    expect(p.has('seat1')).toBe(true);
    expect(p.has('seat2')).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(p.has('seat1')).toBe(false);
  });

  it('eigenes Ende (`until`): bleibt, solange ein anderer Puls desselben Schlüssels läuft', async () => {
    let first!: () => void;
    let second!: () => void;
    const p = new Pulse<string>();
    p.add(['seat1/dead'], new Promise<void>((r) => (first = r)));
    p.add(['seat1/dead'], new Promise<void>((r) => (second = r)));
    first();
    await Promise.resolve();
    expect(p.has('seat1/dead')).toBe(true);
    second();
    await Promise.resolve();
    expect(p.has('seat1/dead')).toBe(false);
  });
});
