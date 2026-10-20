// Was die anderen gerade tun (ARCHITEKTUR.md 8.3, Schritt 5b): gezogene Karten, die dem Zeiger folgen,
// und angewählte Stapel. Reine Logik ohne Svelte; die Zeit kommt von außen (testbar).

import type { CardId, ZoneId } from '../engine/types';
import type { PeerId } from '../net/transport';
import type { PointerPos, PresenceInfo } from '../net/presence';

/** Wie lange eine abgelegte Karte auf das Ereignis vom Host wartet, bevor sie zurückgleitet */
export const HOLD_MS = 1000;
/** so viele zuletzt bestätigte Befehls-IDs merken (das Ereignis kann vor der Zeigermeldung ankommen) */
const SEEN = 20;

export type Who = PresenceInfo['who'];

/** Karten, die jemand zieht: Versatz = Zeiger jetzt − Zeiger beim Greifen (beides als Anker + Anteil) */
export type RemoteDrag = { cards: CardId[]; who: Who; start: PointerPos; last: PointerPos };

type Tracked = RemoteDrag & {
  since: number;
  /** abgelegt: wartet bis dahin auf das Ereignis zu diesem Befehl */
  held?: { until: number; cause: string };
};

export class RemoteDrags {
  private tracked = new Map<PeerId, Tracked>();
  private opened = new Map<PeerId, { zone: ZoneId; who: Who; since: number }>();
  private seen: string[] = [];
  /** seit dem letzten `takeChanges` geändert */
  private dragsChanged = false;
  private openChanged = false;

  /** Neue Lage der anderen (vollständig). */
  update(others: ReadonlyMap<PeerId, PresenceInfo>, now: number): void {
    for (const [peer, t] of this.tracked) {
      // gehaltene Karten lösen nur Ereignis oder Frist
      if (t.held) continue;
      const p = others.get(peer);
      if (p?.drag.length && p.at) continue;
      // losgelassen: mit Befehl auf das Ereignis warten (sofern es nicht schon da war), sonst sofort zurück
      if (p?.dropped && !this.seen.includes(p.dropped)) t.held = { until: now + HOLD_MS, cause: p.dropped };
      else this.tracked.delete(peer);
      this.dragsChanged = true;
    }
    for (const [peer, p] of others) {
      if (!p.drag.length || !p.at) continue;
      const t = this.tracked.get(peer);
      if (t && !t.held && same(t.cards, p.drag)) t.last = p.at;
      else this.tracked.set(peer, { cards: p.drag, who: p.who, start: p.grab ?? p.at, last: p.at, since: now });
      this.dragsChanged = true;
    }

    for (const peer of this.opened.keys()) {
      if (others.get(peer)?.open) continue;
      this.opened.delete(peer);
      this.openChanged = true;
    }
    for (const [peer, p] of others) {
      if (!p.open || this.opened.get(peer)?.zone === p.open) continue;
      this.opened.set(peer, { zone: p.open, who: p.who, since: now });
      this.openChanged = true;
    }
  }

  /** Ereignisse zu einem Befehl sind angekommen: dazu abgelegte Karten liegen jetzt am Ziel. */
  confirmed(cause: string): void {
    this.seen = [...this.seen.slice(1 - SEEN), cause];
    this.release((t) => t.held?.cause === cause);
  }

  /** Abgelaufene Haltefristen beenden (Bewegung abgelehnt). */
  expire(now: number): void {
    this.release((t) => !!t.held && t.held.until <= now);
  }

  private release(done: (t: Tracked) => boolean): void {
    for (const [peer, t] of this.tracked) {
      if (!done(t)) continue;
      this.tracked.delete(peer);
      this.dragsChanged = true;
    }
  }

  /** nächste ablaufende Haltefrist (für den Zeitgeber) */
  nextExpiry(): number | null {
    let next: number | null = null;
    for (const t of this.tracked.values()) if (t.held && (next === null || t.held.until < next)) next = t.held.until;
    return next;
  }

  /** Was hat sich seit dem letzten Aufruf geändert? Setzt die Merker zurück. */
  takeChanges(): { drags: boolean; open: boolean } {
    const changes = { drags: this.dragsChanged, open: this.openChanged };
    this.dragsChanged = this.openChanged = false;
    return changes;
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
