// Was die anderen gerade tun (ARCHITEKTUR.md 8.3, Schritt 5b): gezogene Karten, die dem Zeiger folgen,
// und angewählte Stapel. Reine Logik ohne Svelte; die Zeit kommt von außen (testbar).

import type { CardId, FreePos, ZoneId } from '../engine/types';
import type { PeerId } from '../net/transport';
import type { PresenceInfo } from '../net/presence';

/** Wie lange eine abgelegte Karte auf das Ereignis vom Host wartet, bevor sie zurückgleitet */
export const HOLD_MS = 1000;

export type Who = PresenceInfo['who'];

/** Karten, die jemand zieht: Versatz = Zeiger jetzt − Zeiger beim Greifen (beides als Anker + Anteil) */
export type RemoteDrag = { cards: CardId[]; who: Who; start: FreePos; last: FreePos };

type Tracked = RemoteDrag & {
  since: number;
  /** abgelegt: wartet bis dahin auf das Ereignis; Lage der Karten beim Ablegen */
  heldUntil?: number;
  heldAt?: string;
};

export class RemoteDrags {
  private tracked = new Map<PeerId, Tracked>();
  private opened = new Map<PeerId, { zone: ZoneId; who: Who; since: number }>();

  /** `where(cards)` beschreibt die Lage der Karten im Stand; ändert sie sich, ist die Bewegung angekommen. */
  constructor(private where: (cards: CardId[]) => string) {}

  /** Neue Lage der anderen (vollständig). */
  update(others: ReadonlyMap<PeerId, PresenceInfo>, now: number): void {
    for (const [peer, t] of this.tracked) {
      const p = others.get(peer);
      if (p?.drag.length && p.at && !t.heldUntil) continue;
      if (!t.heldUntil) {
        // losgelassen: mit Befehl auf das Ereignis warten, sonst sofort zurück
        if (p?.dropped) Object.assign(t, { heldUntil: now + HOLD_MS, heldAt: this.where(t.cards) });
        else this.tracked.delete(peer);
      }
    }
    for (const [peer, p] of others) {
      if (!p.drag.length || !p.at) continue;
      const t = this.tracked.get(peer);
      if (t && !t.heldUntil && same(t.cards, p.drag)) t.last = p.at;
      else this.tracked.set(peer, { cards: p.drag, who: p.who, start: p.grab ?? p.at, last: p.at, since: now });
    }

    for (const peer of this.opened.keys()) if (!others.get(peer)?.open) this.opened.delete(peer);
    for (const [peer, p] of others) {
      if (p.open && this.opened.get(peer)?.zone !== p.open) this.opened.set(peer, { zone: p.open, who: p.who, since: now });
    }
  }

  /** Stand hat sich geändert: abgelegte Karten, deren Lage sich geändert hat, sind angekommen. */
  stateChanged(): void {
    for (const [peer, t] of this.tracked) if (t.heldUntil && this.where(t.cards) !== t.heldAt) this.tracked.delete(peer);
  }

  /** Abgelaufene Haltefristen beenden (Bewegung abgelehnt); ergibt, ob sich etwas geändert hat. */
  expire(now: number): boolean {
    let changed = false;
    for (const [peer, t] of this.tracked) {
      if (t.heldUntil !== undefined && t.heldUntil <= now) changed = this.tracked.delete(peer);
    }
    return changed;
  }

  /** nächste ablaufende Haltefrist (für den Zeitgeber) */
  nextExpiry(): number | null {
    const times = [...this.tracked.values()].flatMap((t) => (t.heldUntil === undefined ? [] : [t.heldUntil]));
    return times.length ? Math.min(...times) : null;
  }

  /** Gezogene Karten; greifen zwei dieselbe Karte, gilt, wer sie zuerst gemeldet hat. */
  drags(): RemoteDrag[] {
    const taken = new Set<CardId>();
    const out: RemoteDrag[] = [];
    for (const t of [...this.tracked.values()].sort((a, b) => a.since - b.since)) {
      const cards = t.cards.filter((c) => !taken.has(c));
      cards.forEach((c) => taken.add(c));
      if (cards.length) out.push({ cards, who: t.who, start: t.start, last: t.last });
    }
    return out;
  }

  /** Angewählte Stapel → wer; wählen mehrere denselben, gilt die zuletzt gemeldete Person. */
  openZones(): Map<ZoneId, Who> {
    const sorted = [...this.opened.values()].sort((a, b) => a.since - b.since);
    return new Map(sorted.map((o) => [o.zone, o.who]));
  }
}

const same = (a: readonly CardId[], b: readonly CardId[]) => a.length === b.length && a.every((c, i) => c === b[i]);
