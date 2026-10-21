import { afterEach, describe, expect, it, vi } from 'vitest';
import { Confirm } from '../../src/ui/confirm.svelte';

describe('Bestätigen durch zweiten Klick', () => {
  afterEach(() => vi.useRealTimers());

  it('ohne Grund zur Rückfrage sofort', () => {
    expect(new Confirm().click(false)).toBe(true);
  });

  it('erster Klick macht scharf, zweiter innerhalb der Frist führt aus', () => {
    vi.useFakeTimers();
    const c = new Confirm();
    expect(c.click(true)).toBe(false);
    expect(c.armed).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(c.click(true)).toBe(true);
    expect(c.armed).toBe(false);
  });

  it('nach Ablauf der Frist wieder von vorn', () => {
    vi.useFakeTimers();
    const c = new Confirm();
    c.click(true);
    vi.advanceTimersByTime(3600);
    expect(c.armed).toBe(false);
    expect(c.click(true)).toBe(false);
  });
});
