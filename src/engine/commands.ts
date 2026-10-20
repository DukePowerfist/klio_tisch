// Engine-Befehle (ARCHITEKTUR.md 6.2): Karten bewegen, umdrehen, Stapel mischen und ziehen.
// Alles Klio-Spezifische (welcher Stapel was tut) kommt als Einstellung aus zones.yaml.

import { z } from 'zod';
import { shuffled } from './rng';
import { locate, zoneVisible, type ZoneTable } from './zones';
import {
  SEATS, type AnchorId, type CardId, type CommandDef, type DeckConfig, type EngineEvent, type Rejection,
  type SeatId, type TableState, type ZoneConfig, type ZoneId,
} from './types';

export const reject = (key: string, params?: Record<string, string | number>): Rejection =>
  ({ rejected: true, reason: params ? { key, params } : { key } });

const CardIdSchema = z.string().regex(/^[HSCD](10|[2-9JQKA])$/) as unknown as z.ZodType<CardId>;
const Anchor = z.enum(['center', ...SEATS] as [AnchorId, ...AnchorId[]]);
const FreePosSchema = z.object({ anchor: Anchor, x: z.number().finite(), y: z.number().finite() }).strict();
const Source = z.union([z.object({ zone: z.string() }).strict(), z.object({ free: z.literal(true) }).strict()]);
const Target = z.union([z.object({ zone: z.string() }).strict(), z.object({ free: FreePosSchema }).strict()]);

const MoveCmd = z.object({
  type: z.literal('cards.move'),
  cards: z.array(CardIdSchema).min(1).max(52).refine((c) => new Set(c).size === c.length, 'Karte doppelt'),
  from: Source,
  to: Target,
}).strict();
const CardFlipCmd = z.object({ type: z.literal('card.flip'), card: CardIdSchema }).strict();
const ZoneCmd = <T extends string>(type: T) => z.object({ type: z.literal(type), zone: z.string() }).strict();
const ZoneFlipCmd = ZoneCmd('zone.flip');
const ZoneShuffleCmd = ZoneCmd('zone.shuffle');
const ZoneDrawCmd = ZoneCmd('zone.draw');

type S = TableState<unknown>;

export function engineCommands(zones: ZoneTable, deck: DeckConfig): Record<string, CommandDef<any, any>> {
  const home = new Map(deck.cards.map((c) => [c.id, c.home]));
  const suitOf = new Map(deck.cards.map((c) => [c.id, c.suit]));

  /** Zone muss existieren und sichtbar sein. */
  const zoneOf = (id: ZoneId, state: S): ZoneConfig | Rejection => {
    const zc = zones.get(id);
    if (!zc) return reject('reject.unknownZone');
    if (!zoneVisible(zc, state)) return reject('reject.hiddenSeat');
    return zc;
  };
  const isRejection = (x: unknown): x is Rejection => typeof x === 'object' && x !== null && 'rejected' in x;

  const anchorOwner = (a: AnchorId): SeatId[] => (a === 'center' ? [] : [a]);
  const zoneOwner = (id: ZoneId): SeatId[] => {
    const o = zones.get(id)?.owner;
    return o ? [o] : [];
  };

  /** Oberste Karte des Stapels ziehen (Aktion „Ziehen“). */
  const draw = (zc: ZoneConfig, state: S): EngineEvent[] | Rejection => {
    const rule = zc.actions?.draw;
    if (!rule) return reject('reject.noAction');
    const target = zoneOf(rule.to, state);
    if (isRejection(target)) return target;
    const cards = state.zones[zc.id] ?? [];
    const card = cards[cards.length - 1];
    if (!card) return [];
    return [{ type: 'cardDrawn', card, from: zc.id, to: rule.to, faceUp: rule.faceUp, announce: rule.announce }];
  };

  /** Oberste Karte umdrehen. */
  const flipTop = (zc: ZoneConfig, state: S): EngineEvent[] => {
    const cards = state.zones[zc.id] ?? [];
    const card = cards[cards.length - 1];
    return card ? [{ type: 'cardsTurned', cards: [card], faceUp: !state.faceUp[card] }] : [];
  };

  const move: CommandDef<unknown, z.infer<typeof MoveCmd>> = {
    parse: (x) => MoveCmd.parse(x),
    permission: 'cards.move',
    owners(cmd, state) {
      const from = 'zone' in cmd.from ? zoneOwner(cmd.from.zone) : cmd.cards.flatMap((c) => {
        const p = state.freePos[c];
        return p ? anchorOwner(p.anchor) : [];
      });
      const to = 'zone' in cmd.to ? zoneOwner(cmd.to.zone) : anchorOwner(cmd.to.free.anchor);
      return [...from, ...to];
    },
    handle(cmd, state) {
      const k = cmd.cards.length;
      // Voraussetzung: Die Karten liegen noch dort, wo der Absender sie gesehen hat (6.2).
      if ('zone' in cmd.from) {
        const zc = zoneOf(cmd.from.zone, state);
        if (isRejection(zc)) return zc;
        const cards = state.zones[zc.id] ?? [];
        const topSegment = cards.slice(-k).join() === cmd.cards.join();
        const singleFanned = k === 1 && !!zc.fanned && cards.includes(cmd.cards[0]!);
        if (!topSegment && !singleFanned) return reject('reject.stale');
      } else if (!cmd.cards.every((c) => state.free.includes(c))) {
        return reject('reject.stale');
      }

      const events: EngineEvent[] = [];
      if ('zone' in cmd.to) {
        const zc = zoneOf(cmd.to.zone, state);
        if (isRejection(zc)) return zc;
        if (zc.capacity !== undefined) {
          const staying = (state.zones[zc.id] ?? []).filter((c) => !cmd.cards.includes(c)).length;
          if (staying + k > zc.capacity) return reject(`reject.capacity.${zc.id.split('.').pop()}`, { max: zc.capacity });
        }
        events.push({ type: 'cardsMoved', cards: cmd.cards, from: cmd.from, to: cmd.to });
        const down = cmd.cards.filter((c) => !state.faceUp[c]);
        if (zc.onDrop === 'faceUp' && down.length > 0) events.push({ type: 'cardsTurned', cards: down, faceUp: true });
      } else {
        const a = cmd.to.free.anchor;
        if (a !== 'center' && SEATS.indexOf(a) >= state.settings.players) return reject('reject.hiddenSeat');
        events.push({ type: 'cardsMoved', cards: cmd.cards, from: cmd.from, to: cmd.to });
      }
      return events;
    },
  };

  const cardFlip: CommandDef<unknown, z.infer<typeof CardFlipCmd>> = {
    parse: (x) => CardFlipCmd.parse(x),
    permission: 'card.flip',
    owners(cmd, state) {
      const where = locate(state, cmd.card);
      if (!where) return [];
      if ('zone' in where) return zoneOwner(where.zone);
      const p = state.freePos[cmd.card];
      return p ? anchorOwner(p.anchor) : [];
    },
    handle(cmd, state) {
      const where = locate(state, cmd.card);
      if (!where) return reject('reject.stale');
      if ('zone' in where) {
        const zc = zoneOf(where.zone, state);
        if (isRejection(zc)) return zc;
        const cards = state.zones[zc.id] ?? [];
        const isTop = where.index === cards.length - 1;
        if (!isTop && !zc.fanned) return reject('reject.stale');
        // Kreuz: Doppelklick auf eine verdeckte Karte wirkt wie Ziehen
        if (zc.actions?.cardDoubleClick?.faceDown === 'draw' && !state.faceUp[cmd.card] && isTop) return draw(zc, state);
      }
      return [{ type: 'cardsTurned', cards: [cmd.card], faceUp: !state.faceUp[cmd.card] }];
    },
  };

  const zoneFlip: CommandDef<unknown, z.infer<typeof ZoneFlipCmd>> = {
    parse: (x) => ZoneFlipCmd.parse(x),
    permission: 'card.flip',
    owners: (cmd) => zoneOwner(cmd.zone),
    handle(cmd, state) {
      const zc = zoneOf(cmd.zone, state);
      if (isRejection(zc)) return zc;
      const flip = zc.actions?.flip;
      if (flip === 'top') return flipTop(zc, state);
      if (flip === 'draw') return draw(zc, state);
      return reject('reject.noAction');
    },
  };

  const zoneDraw: CommandDef<unknown, z.infer<typeof ZoneDrawCmd>> = {
    parse: (x) => ZoneDrawCmd.parse(x),
    permission: 'zone.draw',
    owners: (cmd) => zoneOwner(cmd.zone),
    handle(cmd, state) {
      const zc = zoneOf(cmd.zone, state);
      return isRejection(zc) ? zc : draw(zc, state);
    },
  };

  const zoneShuffle: CommandDef<unknown, z.infer<typeof ZoneShuffleCmd>> = {
    parse: (x) => ZoneShuffleCmd.parse(x),
    permission: 'zone.shuffle',
    owners: (cmd) => zoneOwner(cmd.zone),
    handle(cmd, state, _actor, rng) {
      const zc = zoneOf(cmd.zone, state);
      if (isRejection(zc)) return zc;
      const rule = zc.actions?.shuffle;
      if (!rule) return reject('reject.noAction');

      // Einsammeln: Einträge der Reihe nach, jede Karte nur vom ersten passenden (7, gather)
      const next: Record<ZoneId, CardId[]> = {};
      const get = (id: ZoneId) => (next[id] ??= [...(state.zones[id] ?? [])]);
      const receivers = new Set<ZoneId>([zc.id]);
      get(zc.id);
      for (const g of rule.gather ?? []) {
        const from = get(g.from);
        const taken = from.filter((c) => !g.suit || suitOf.get(c) === g.suit);
        next[g.from] = from.filter((c) => !taken.includes(c));
        for (const card of taken) {
          const dest = g.to === 'home' ? home.get(card) : zc.id;
          if (!dest) return reject('reject.noHome');
          get(dest).push(card);
          receivers.add(dest);
        }
      }
      // Gemischt werden der mischende Stapel und jeder, der Karten bekommen hat (A31)
      for (const id of receivers) next[id] = shuffled(next[id]!, rng);
      const faceDown = [...receivers].flatMap((id) => next[id]!);
      return [{ type: 'zonesShuffled', shuffled: [...receivers], zones: next, faceDown }];
    },
  };

  return { 'cards.move': move, 'card.flip': cardFlip, 'zone.flip': zoneFlip, 'zone.draw': zoneDraw, 'zone.shuffle': zoneShuffle };
}
