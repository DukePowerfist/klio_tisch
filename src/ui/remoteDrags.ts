// Was die anderen gerade tun (ARCHITEKTUR.md 8.3, Schritt 5b): gezogene Karten, die dem Zeiger folgen,
// und angewählte Stapel. Reine Logik ohne Svelte; die Zeit kommt von außen (testbar).

import { arrivingCards } from './motion';
import type { CardId, EngineEvent, Event, TableState, ZoneId } from '../engine/types';
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
  /** Greifpunkt wie gemeldet: gleiche Karten mit anderem `grab` sind ein neuer Zug */
  grab: PointerPos | null;
  since: number;
  /** abgelegt: wartet bis dahin auf das Ereignis zu diesem Befehl */
  held?: { until: number; cause: string };
};

export class RemoteDrags {
  private tracked = new Map<PeerId, Tracked>();
  private opened = new Map<PeerId, { zone: ZoneId; who: Who; since: number }>();
  private seen: string[] = [];
  /** vom Stand beendete Züge: Meldungen mit denselben Karten und demselben Greifpunkt beleben sie nicht wieder */
  private released = new Map<PeerId, { cards: CardId[]; grab: PointerPos | null }>();
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
    // Sperre endet mit dem Zug: losgelassen, andere Karten, neuer Greifpunkt oder gegangen
    for (const [peer, r] of this.released) {
      const p = others.get(peer);
      if (!p || !sameDrag(r, p)) this.released.delete(peer);
    }
    for (const [peer, p] of others) {
      if (!p.drag.length || !p.at || this.released.has(peer)) continue;
      const t = this.tracked.get(peer);
      if (t && !t.held && sameDrag(t, p)) {
        // unverändert (nur ein anderer hat sich gemeldet): keine neue Liste, sonst prüft der Tisch alle Karten neu
        if (t.last === p.at) continue;
        t.last = p.at;
      } else this.tracked.set(peer, { cards: p.drag, who: p.who, start: p.grab ?? p.at, last: p.at, grab: p.grab, since: now });
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

  /** Neuer Stand mit Ereignissen (`cause` = auslösender Befehl, `moved` aus `movedCards`). Der Stand ist die Wahrheit:
   *  Jeder Zug mit einer bewegten Karte endet, gehalten oder nicht, auch wenn „losgelassen“ noch nicht da war.
   *  Gehaltene Züge zu `cause` enden ebenfalls (ihre Karten liegen jetzt am Ziel). */
  confirmed(cause: string | undefined, moved: readonly CardId[]): void {
    if (cause) this.seen = [...this.seen.slice(1 - SEEN), cause];
    for (const [peer, t] of this.tracked) {
      const hit = t.cards.some((c) => moved.includes(c));
      if (!hit && !(cause && t.held?.cause === cause)) continue;
      // nicht gehalten: die letzte Meldung zeigt noch den Zug und käme bei der nächsten Aktualisierung wieder
      if (hit && !t.held) this.released.set(peer, { cards: t.cards, grab: t.grab });
      this.tracked.delete(peer);
      this.dragsChanged = true;
    }
  }

  /** Abgelaufene Haltefristen beenden (Bewegung abgelehnt). */
  expire(now: number): void {
    for (const [peer, t] of this.tracked) {
      if (!t.held || t.held.until > now) continue;
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

/** Karten, deren Zone oder freie Lage sich durch die Ereignisse ändert (`prev` = Stand davor). Beim Mischen zählen nur
 *  Karten, die aus einer anderen Zone kommen: Im selben Stapel verschiebt sich eine Karte kaum, ein Zug darf weiterlaufen. */
export function movedCards(events: readonly Event[], prev: TableState<unknown> | null): CardId[] {
  const out = new Set<CardId>();
  for (const event of events) {
    const e = event as EngineEvent;
    switch (e.type) {
      case 'cardsMoved':
        for (const c of e.cards) out.add(c);
        break;
      case 'cardDrawn':
        out.add(e.card);
        break;
      case 'zonesShuffled':
        for (const c of arrivingCards(e.zones, prev)) out.add(c);
        break;
      case 'cardsReset':
        for (const c of Object.values(e.zones).flat()) out.add(c);
        break;
    }
  }
  return [...out];
}

const same = (a: readonly CardId[], b: readonly CardId[]) => a.length === b.length && a.every((c, i) => c === b[i]);
/** Zeigerlage nach Inhalt (Meldungen werden jedes Mal neu eingelesen) */
function samePos(a: PointerPos | null, b: PointerPos | null): boolean {
  if (!a || !b) return a === b;
  const anchor = (p: PointerPos) => ('card' in p ? `card:${p.card}` : 'zone' in p ? `zone:${p.zone}` : `anchor:${p.anchor}`);
  return anchor(a) === anchor(b) && a.x === b.x && a.y === b.y;
}
/** derselbe Zug: dieselben Karten, derselbe Greifpunkt */
const sameDrag = (t: { cards: readonly CardId[]; grab: PointerPos | null }, p: PresenceInfo) => same(t.cards, p.drag) && samePos(t.grab, p.grab);
