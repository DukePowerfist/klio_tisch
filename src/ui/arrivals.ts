// Wer ist da (ARCHITEKTUR.md 11.7, Schritt 5l): Anwesenheit je Platz aus den Zeigermeldungen der anderen und den
// Plätzen im Stand. Rein und ohne DOM; die Zeit kommt von außen, die Zeitgeber hält session.svelte.ts.
// Grundsatz: „weg“ und „wieder da“ nur für Plätze, die dieser Browser seit dem eigenen Laden anwesend gesehen hat;
// alles davor wird still übernommen.

import { SEATS, type SeatId, type TableState } from '../engine/types';
import type { PresenceInfo } from '../net/presence';
import type { PeerId } from '../net/transport';

/** Schalter „Meldung bei Kommen und Gehen“ im vorhandenen `settings.automation` (fehlend heißt an); der Punkt hält
 *  ihn von den IDs der Reaktionen fern (11.7) */
export const NOTICE_ARRIVALS = 'notice.arrivals';

/** so lange darf eine Verbindung abreißen, ohne dass der Tisch etwas zeigt (Nutzer 2026-10-21) */
export const AWAY_MS = 5000;

type Seats = TableState<unknown>['seats'];
type Who = PresenceInfo['who'];

export type ArrivalSignal =
  /** Platz belegt (Protokoll sofort, auch wenn die Person noch nicht verbunden ist) */
  | { type: 'seated'; seat: SeatId }
  /** Platz freigegeben (nicht beim Umsetzen auf einen freien Platz) */
  | { type: 'freed'; seat: SeatId }
  /** neu angekommen bzw. nach „weg“ wieder da; `peer`: dessen Zeiger (null: man selbst); `self`: man selbst */
  | { type: 'arrived'; seat: SeatId; how: 'new' | 'back'; peer: PeerId | null; self: boolean }
  /** seit `AWAY_MS` nicht mehr verbunden */
  | { type: 'left'; seat: SeatId };

type SeatState = {
  occupied: boolean;
  /** seit dem eigenen Laden anwesend gesehen */
  seen: boolean;
  /** wird als „nicht da“ gezeigt */
  away: boolean;
  /** ohne Zeigermeldung seit (null: anwesend oder nicht belegt) */
  since: number | null;
  /** neu belegt, wartet bis zu diesem Zeitpunkt auf die erste Zeigermeldung */
  pending: number | null;
};

const fresh = (occupied: boolean): SeatState => ({ occupied, seen: false, away: false, since: null, pending: null });
const isSeat = (who: Who | undefined): who is SeatId => who !== undefined && who !== 'gm' && who !== 'spectator';

export class Arrivals {
  private seats = new Map<SeatId, SeatState>();
  /** zuletzt gemeldete Rolle je Peer */
  private peers = new Map<PeerId, Who>();

  /** `seats`: Plätze beim eigenen Laden bzw. beim Betreten des Raums; `self`: eigener Platz */
  constructor(seats: Seats, private self: SeatId | null, now: number) {
    for (const s of SEATS) {
      const st = fresh(seats[s].occupied);
      // Anfangszustand: gilt als anwesend; ohne Zeigermeldung nach AWAY_MS still „nicht da“
      if (st.occupied && s !== self) st.since = now;
      this.seats.set(s, st);
    }
  }

  /** Platz anwesend (bzw. noch nicht als „nicht da“ gezeigt); der eigene immer */
  present(seat: SeatId): boolean {
    return seat === this.self || !this.seat(seat).away;
  }

  /** Neue Zeigermeldungen der anderen (alle verbundenen Peers). */
  presence(others: ReadonlyMap<PeerId, Pick<PresenceInfo, 'who'>>, now: number): ArrivalSignal[] {
    const before = this.peers;
    const after = new Map([...others].map(([p, info]) => [p, info.who] as const));
    this.peers = after;
    const out: ArrivalSignal[] = [];
    for (const s of SEATS) {
      const had = [...before].filter(([, w]) => w === s).map(([p]) => p);
      const has = [...after].filter(([, w]) => w === s).map(([p]) => p);
      // Wechsel der Rolle desselben Peers (Zuschauer → Platz, Umsetzen, Tausch): kein „wieder da“, kein „weg“
      const movedIn = has.every((p) => before.has(p) && before.get(p) !== s);
      const movedOut = had.every((p) => after.has(p) && after.get(p) !== s);
      if (had.length === 0 && has.length > 0) out.push(...this.gained(s, has[0]!, movedIn));
      else if (had.length > 0 && has.length === 0) this.lost(s, movedOut, now);
    }
    return out;
  }

  /** Neuer Stand: belegte und freie Plätze mit den bisher bekannten vergleichen (`seatsChanged`, auch ein ganz
   *  ersetzter Stand). */
  seatsChanged(next: Seats, now: number): ArrivalSignal[] {
    const out: ArrivalSignal[] = [];
    const taken = SEATS.filter((s) => !this.seat(s).occupied && next[s].occupied);
    for (const s of SEATS) {
      if (this.seat(s).occupied === next[s].occupied) continue;
      const st = fresh(next[s].occupied);
      this.seats.set(s, st);
      if (!st.occupied) {
        // Umsetzen auf einen freien Platz gibt einen frei und belegt einen anderen: kein „frei“ im Protokoll
        if (taken.length === 0) out.push({ type: 'freed', seat: s });
        continue;
      }
      out.push({ type: 'seated', seat: s });
      const peer = this.peerAt(s);
      if (s === this.self || peer !== null) out.push(this.arrive(s, 'new', peer));
      else st.pending = now + AWAY_MS;
    }
    return out;
  }

  /** Eigener Platz geändert (Rolle vom Host). */
  setSelf(seat: SeatId | null, now: number): ArrivalSignal[] {
    const old = this.self;
    if (seat === old) return [];
    this.self = seat;
    // alter Platz noch belegt (Tausch): dort sitzt jetzt jemand anderes, still neu beginnen
    if (old && this.seat(old).occupied && this.peerAt(old) === null) this.seats.set(old, { ...fresh(true), since: now });
    if (seat && this.seat(seat).pending !== null) return [this.arrive(seat, 'new', null)];
    if (seat) Object.assign(this.seat(seat), { seen: true, away: false, since: null });
    return [];
  }

  /** Fristen ablaufen lassen. */
  tick(now: number): ArrivalSignal[] {
    const out: ArrivalSignal[] = [];
    for (const [s, st] of this.seats) {
      if (!st.occupied || s === this.self) continue;
      // umgesetzt, aber nicht verbunden: nur der neue Name, danach still „nicht da“
      if (st.pending !== null && now >= st.pending) Object.assign(st, { pending: null, away: true, seen: false });
      if (st.since !== null && now >= st.since + AWAY_MS) {
        st.since = null;
        st.away = true;
        if (st.seen) out.push({ type: 'left', seat: s });
      }
    }
    return out;
  }

  /** nächster Zeitpunkt, zu dem `tick` etwas ändern kann (null: keiner) */
  nextDeadline(): number | null {
    const times = [...this.seats.values()].flatMap((st) => [st.pending, st.since === null ? null : st.since + AWAY_MS]);
    const due = times.filter((t): t is number => t !== null);
    return due.length ? Math.min(...due) : null;
  }

  private seat(s: SeatId): SeatState {
    return this.seats.get(s)!;
  }

  private peerAt(s: SeatId): PeerId | null {
    for (const [p, w] of this.peers) if (isSeat(w) && w === s) return p;
    return null;
  }

  private gained(s: SeatId, peer: PeerId, movedIn: boolean): ArrivalSignal[] {
    const st = this.seat(s);
    if (!st.occupied || s === this.self) return [];
    if (st.pending !== null) return [this.arrive(s, 'new', peer)];
    const back = st.seen && st.away && !movedIn;
    // erstes Erscheinen seit dem Laden, Rollenwechsel und kurzer Abbruch: still
    Object.assign(st, { seen: true, away: false, since: null });
    return back ? [{ type: 'arrived', seat: s, how: 'back', peer, self: false }] : [];
  }

  private lost(s: SeatId, movedOut: boolean, now: number): void {
    const st = this.seat(s);
    if (!st.occupied || s === this.self) return;
    st.since = now;
    // Rolle gewechselt (Tausch, Umsetzen): hier sitzt jetzt jemand anderes, still neu beginnen
    if (movedOut) st.seen = false;
  }

  private arrive(s: SeatId, how: 'new' | 'back', peer: PeerId | null): ArrivalSignal {
    Object.assign(this.seat(s), { seen: true, away: false, since: null, pending: null });
    return { type: 'arrived', seat: s, how, peer, self: s === this.self };
  }
}
