// Engine-Befehle (ARCHITEKTUR.md 6.2): Karten bewegen, umdrehen, Stapel mischen und ziehen,
// dazu die Tischbefehle (Spielerzahl, Einstellungen, Zurücksetzen), die jedes Regelwerk braucht.
// Alles Klio-Spezifische (welcher Stapel was tut) kommt als Einstellung aus zones.yaml.

import { z } from 'zod';
import { shuffled } from './rng';
import { CardIdSchema, CardSourceSchema as Source, CardTargetSchema as Target, PermissionValueSchema, PlayerNameSchema, PlayersSchema, SeatColorSchema, SeatSchema, suitOf } from './schemas';
import { dealStart } from './setup';
import { colorHolder, locate, seatVisible, zoneVisible, type ZoneTable } from './zones';
import type { AnchorId, CardId, CommandDef, Event, EngineEvent, Rejection, Ruleset, SeatId, TableState, TextRef, ZoneConfig, ZoneId } from './types';

export const reject = (key: string, params?: Record<string, string | number>): Rejection =>
  ({ rejected: true, reason: params ? { key, params } : { key } });

export const rejectWith = (reason: TextRef): Rejection => ({ rejected: true, reason });

export const isRejection = (x: unknown): x is Rejection => typeof x === 'object' && x !== null && 'rejected' in x;


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
const ResetCmd = z.object({ type: z.literal('table.reset'), includeCharacters: z.boolean() }).strict();
const PlayersCmd = z.object({ type: z.literal('table.setPlayers'), players: PlayersSchema }).strict();
const SeatCmd = z.object({
  type: z.literal('table.setSeat'),
  seat: SeatSchema,
  occupied: z.boolean(),
  name: PlayerNameSchema.optional(),
}).strict();
/** Person umsetzen oder zwei tauschen (8.7); Bögen, Karten und Farben bleiben am Platz */
const MoveSeatCmd = z.object({ type: z.literal('table.moveSeat'), from: SeatSchema, to: SeatSchema }).strict();
/** eigener Name und eigene Farbe (Schritt 5e); nur Angegebenes ändert sich, leerer Name = ohne Namen */
const SeatEditCmd = z.object({
  type: z.literal('seat.edit'),
  seat: SeatSchema,
  name: PlayerNameSchema.optional(),
  color: SeatColorSchema.optional(),
}).strict();
const SettingsCmd = z.object({
  type: z.literal('table.setSettings'),
  automation: z.record(z.string(), z.boolean()).optional(),
  permissionOverrides: z.object({ player: z.record(z.string(), PermissionValueSchema).optional(), spectator: z.record(z.string(), PermissionValueSchema).optional() }).strict().optional(),
}).strict();

type S = TableState<unknown>;

export function engineCommands(zones: ZoneTable, ruleset: Pick<Ruleset<unknown>, 'deck' | 'resetGame' | 'seatColors'>): Record<string, CommandDef<any, any>> {
  const { deck } = ruleset;
  const home = new Map(Object.entries(deck.start).flatMap(([zone, ids]) => (ids ?? []).map((id) => [id, zone] as const)));

  /** Zone muss existieren und sichtbar sein. */
  const zoneOf = (id: ZoneId, state: S): ZoneConfig | Rejection => {
    const zc = zones.get(id);
    if (!zc) return reject('reject.unknownZone');
    if (!zoneVisible(zc, state)) return reject('reject.hiddenSeat');
    return zc;
  };

  const anchorOwner = (a: AnchorId): SeatId[] => (a === 'center' ? [] : [a]);
  const zoneOwner = (id: ZoneId): SeatId[] => {
    const o = zones.get(id)?.owner;
    return o ? [o] : [];
  };
  const freeOwners = (cards: readonly CardId[], state: S): SeatId[] =>
    cards.flatMap((c) => {
      const p = state.freePos[c];
      return p ? anchorOwner(p.anchor) : [];
    });
  const topOf = (zc: ZoneConfig, state: S): CardId | undefined => state.zones[zc.id]?.at(-1);

  /** Oberste Karte des Stapels ziehen (Aktion „Ziehen“). */
  const draw = (zc: ZoneConfig, state: S): EngineEvent[] | Rejection => {
    const rule = zc.actions?.draw;
    if (!rule) return reject('reject.noAction');
    const target = zoneOf(rule.to, state);
    if (isRejection(target)) return target;
    const card = topOf(zc, state);
    if (!card) return [];
    return [{ type: 'cardDrawn', card, from: zc.id, to: rule.to, faceUp: rule.faceUp, announce: rule.announce }];
  };

  /** Oberste Karte umdrehen. */
  const flipTop = (zc: ZoneConfig, state: S): EngineEvent[] => {
    const card = topOf(zc, state);
    return card ? [{ type: 'cardsTurned', cards: [card], faceUp: !state.faceUp[card] }] : [];
  };

  const move: CommandDef<unknown, z.infer<typeof MoveCmd>> = {
    parse: (x) => MoveCmd.parse(x),
    permission: 'cards.move',
    owners: (cmd, state) => [
      ...('zone' in cmd.from ? zoneOwner(cmd.from.zone) : freeOwners(cmd.cards, state)),
      ...('zone' in cmd.to ? zoneOwner(cmd.to.zone) : anchorOwner(cmd.to.free.anchor)),
    ],
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

      const moved: EngineEvent = { type: 'cardsMoved', cards: cmd.cards, from: cmd.from, to: cmd.to };
      if (!('zone' in cmd.to)) {
        const a = cmd.to.free.anchor;
        if (a !== 'center' && !seatVisible(a, state)) return reject('reject.hiddenSeat');
        return [moved];
      }
      const zc = zoneOf(cmd.to.zone, state);
      if (isRejection(zc)) return zc;
      if (zc.capacity !== undefined) {
        const staying = (state.zones[zc.id] ?? []).filter((c) => !cmd.cards.includes(c)).length;
        if (staying + k > zc.capacity) return reject(`reject.capacity.${zc.template ?? zc.id}`, { max: zc.capacity });
      }
      const down = cmd.cards.filter((c) => !state.faceUp[c]);
      return zc.onDrop === 'faceUp' && down.length > 0 ? [moved, { type: 'cardsTurned', cards: down, faceUp: true }] : [moved];
    },
  };

  const cardFlip: CommandDef<unknown, z.infer<typeof CardFlipCmd>> = {
    parse: (x) => CardFlipCmd.parse(x),
    permission: 'card.flip',
    owners(cmd, state) {
      const where = locate(state, cmd.card);
      if (!where) return [];
      return 'zone' in where ? zoneOwner(where.zone) : freeOwners([cmd.card], state);
    },
    handle(cmd, state) {
      const where = locate(state, cmd.card);
      if (!where) return reject('reject.stale');
      if ('zone' in where) {
        const zc = zoneOf(where.zone, state);
        if (isRejection(zc)) return zc;
        const isTop = cmd.card === topOf(zc, state);
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
        const rest: CardId[] = [];
        for (const card of get(g.from)) {
          if (g.suit && suitOf(card) !== g.suit) {
            rest.push(card);
            continue;
          }
          const dest = g.to === 'home' ? home.get(card) : zc.id;
          if (!dest) return reject('reject.noHome');
          get(dest).push(card);
          receivers.add(dest);
        }
        next[g.from] = rest;
      }
      // Gemischt werden der mischende Stapel und jeder, der Karten bekommen hat (A31)
      for (const id of receivers) next[id] = shuffled(next[id]!, rng);
      return [{ type: 'zonesShuffled', shuffled: [...receivers], zones: next }];
    },
  };

  const reset: CommandDef<unknown, z.infer<typeof ResetCmd>> = {
    parse: (x) => ResetCmd.parse(x),
    permission: 'table.reset',
    backup: true, // Sicherung vorher (A34) legt der Host an, nicht die Engine
    handle(cmd, _state, _actor, rng) {
      const cards: EngineEvent = { type: 'cardsReset', zones: dealStart(deck, zones.keys(), rng) };
      const game: Event[] = cmd.includeCharacters ? (ruleset.resetGame?.() ?? []) : [];
      return [cards, ...game];
    },
  };

  const setPlayers: CommandDef<unknown, z.infer<typeof PlayersCmd>> = {
    parse: (x) => PlayersCmd.parse(x),
    permission: 'table.setPlayers',
    handle: (cmd, state) => (cmd.players === state.settings.players ? [] : [{ type: 'settingsChanged', settings: { ...state.settings, players: cmd.players } }]),
  };

  // Platz belegen oder freigeben. Belegt beim Beitritt der Host (als SL), freigeben kann die SL jederzeit (8.2).
  // Ein freier Platz behält den Namen als „zuletzt dort“ (8.7); wer ihn neu belegt, bringt seinen Namen mit oder keinen.
  const setSeat: CommandDef<unknown, z.infer<typeof SeatCmd>> = {
    parse: (x) => SeatCmd.parse(x),
    permission: 'table.setSeat',
    handle(cmd, state) {
      if (cmd.occupied) {
        if (!seatVisible(cmd.seat, state)) return reject('reject.hiddenSeat');
        if (state.seats[cmd.seat].occupied) return reject('reject.seatTaken');
      }
      // die Farbe gehört zum Platz und bleibt beim Wechsel der Person
      const { color, name: last } = state.seats[cmd.seat];
      const name = cmd.occupied ? cmd.name : last;
      const info = { occupied: cmd.occupied, ...(name ? { name } : {}), ...(color ? { color } : {}) };
      return [{ type: 'seatsChanged', seats: { ...state.seats, [cmd.seat]: info } }];
    },
  };

  // Person auf einen anderen Platz setzen (8.7): ist das Ziel frei, wandert sie dorthin und der alte Platz merkt sich
  // sie als „zuletzt“; ist es besetzt, tauschen beide. Nur Personen wechseln, Farben bleiben am Platz. Die Schlüssel
  // der Browser führt der Host nach. Ausgeblendetes `from` nur auf einen freien Platz, sonst landete der andere dort.
  const moveSeat: CommandDef<unknown, z.infer<typeof MoveSeatCmd>> = {
    parse: (x) => MoveSeatCmd.parse(x),
    permission: 'table.setSeat',
    handle(cmd, state) {
      if (cmd.from === cmd.to) return reject('reject.invalid');
      const from = state.seats[cmd.from];
      const to = state.seats[cmd.to];
      if (!from.occupied) return reject('reject.seatFree');
      if (!seatVisible(cmd.to, state)) return reject('reject.hiddenSeat');
      if (to.occupied && !seatVisible(cmd.from, state)) return reject('reject.hiddenSeat');
      const seat = (occupied: boolean, name: string | undefined, color: string | undefined) =>
        ({ occupied, ...(name ? { name } : {}), ...(color ? { color } : {}) });
      return [{
        type: 'seatsChanged',
        seats: {
          ...state.seats,
          [cmd.to]: seat(true, from.name, to.color),
          [cmd.from]: to.occupied ? seat(true, to.name, from.color) : seat(false, from.name, from.color),
        },
      }];
    },
  };

  // Name und Farbe des eigenen Platzes (5e). Jede Farbe höchstens an einem Platz, auch an ausgeblendeten.
  const seatEdit: CommandDef<unknown, z.infer<typeof SeatEditCmd>> = {
    parse: (x) => SeatEditCmd.parse(x),
    permission: 'seat.edit',
    owners: (cmd) => [cmd.seat],
    handle(cmd, state) {
      const info = { ...state.seats[cmd.seat] };
      if (cmd.name !== undefined) {
        if (!info.occupied) return reject('reject.seatFree');
        const name = cmd.name.trim();
        if (name) info.name = name;
        else delete info.name;
      }
      if (cmd.color !== undefined) {
        if (!ruleset.seatColors.includes(cmd.color)) return reject('reject.unknownColor');
        if (colorHolder(state, cmd.color, ruleset.seatColors, cmd.seat)) return reject('reject.colorTaken');
        info.color = cmd.color;
      }
      return [{ type: 'seatsChanged', seats: { ...state.seats, [cmd.seat]: info } }];
    },
  };

  const setSettings: CommandDef<unknown, z.infer<typeof SettingsCmd>> = {
    parse: (x) => SettingsCmd.parse(x),
    permission: 'table.setSettings',
    handle: (cmd, state) => [{
      type: 'settingsChanged',
      settings: {
        ...state.settings,
        automation: cmd.automation ?? state.settings.automation,
        permissionOverrides: cmd.permissionOverrides ?? state.settings.permissionOverrides,
      },
    }],
  };

  return {
    'cards.move': move, 'card.flip': cardFlip, 'zone.flip': zoneFlip, 'zone.draw': zoneDraw, 'zone.shuffle': zoneShuffle,
    'table.reset': reset, 'table.setPlayers': setPlayers, 'table.setSeat': setSeat, 'table.moveSeat': moveSeat, 'seat.edit': seatEdit, 'table.setSettings': setSettings,
  };
}
