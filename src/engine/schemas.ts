// Zod-Schemas für die Grundbausteine der Engine; Regelwerke bauen darauf auf.

import { z } from 'zod';
import { FORMAT } from './setup';
import { RANKS, SEATS, SUITS, type CardId, type EngineEvent, type RankId, type SeatId, type SuitId, type TableState, type TextRef } from './types';

export const SuitSchema = z.enum(SUITS);
export const RankSchema = z.enum(RANKS);
export const SeatSchema = z.enum(SEATS);
export const CardIdSchema = z.custom<CardId>((x) => typeof x === 'string' && /^[HSCD](10|[2-9JQKA])$/.test(x), 'keine Karte');
export const PermissionValueSchema = z.enum(['allow', 'deny', 'own']);

/** Farbe und Rang aus der Karten-ID (`H10` → `H`, `10`). */
export const suitOf = (card: CardId): SuitId => card[0] as SuitId;
export const rankOf = (card: CardId): RankId => card.slice(1) as RankId;

const FACE: Partial<Record<RankId, number>> = { J: 11, Q: 12, K: 13, A: 14 };
/** Vergleichswert: 2–10, B=11, D=12, K=13, A=14 */
export const rankValue = (rank: RankId): number => FACE[rank] ?? Number(rank);

// ---------- Lage, Einstellungen, Stand, Ereignisse ----------
// Damit Clients einen empfangenen Stand und empfangene Ereignisse prüfen können (6.3).

const AnchorSchema = z.union([z.literal('center'), SeatSchema]);
/** Fotos heißen nach dem SHA-256 ihres Inhalts (8.4) */
export const PhotoHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const FreePosSchema = z.object({ anchor: AnchorSchema, x: z.number().finite(), y: z.number().finite() }).strict();
export const CardSourceSchema = z.union([z.object({ zone: z.string() }).strict(), z.object({ free: z.literal(true) }).strict()]);
export const CardTargetSchema = z.union([z.object({ zone: z.string() }).strict(), z.object({ free: FreePosSchema }).strict()]);
export const PlayersSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const Overrides = z.record(z.string(), PermissionValueSchema);

const TableSettingsSchema = z.object({
  players: PlayersSchema,
  /** je Reaktion an oder aus (fehlend heißt an); dazu Schalter der Oberfläche mit Punkt im Namen, etwa
   *  `notice.arrivals` (Meldung bei Kommen und Gehen, 11.7), die `dispatch` nicht liest */
  automation: z.record(z.string(), z.boolean()),
  permissionOverrides: z.object({ player: Overrides.exactOptional(), spectator: Overrides.exactOptional() }).strict(),
}).strict();

export const SeatColorSchema = z.string().regex(/^[a-z]{1,20}$/);
/** Höchstlänge eines Spielernamens: Stand, Befehle, Nachrichten und Eingabefelder */
export const PLAYER_NAME_MAX = 40;
export const PlayerNameSchema = z.string().max(PLAYER_NAME_MAX);
const SeatInfo = z.object({ occupied: z.boolean(), name: PlayerNameSchema.exactOptional(), color: SeatColorSchema.exactOptional() }).strict();
const SeatsSchema = z.object(Object.fromEntries(SEATS.map((s) => [s, SeatInfo])) as Record<SeatId, typeof SeatInfo>).strict();

const Zones = z.record(z.string(), z.array(CardIdSchema));

/** Stand prüfen; den Spielteil prüft das Regelwerk (`parseGame`). */
export function tableStateSchema<G>(parseGame: (x: unknown) => G): z.ZodType<TableState<G>> {
  return z.object({
    format: z.literal(FORMAT),
    ruleset: z.object({ id: z.string(), version: z.string() }).strict(),
    seq: z.number().int().nonnegative(),
    zones: Zones,
    free: z.array(CardIdSchema),
    freePos: z.record(z.string(), FreePosSchema),
    faceUp: z.record(z.string(), z.boolean()),
    seats: SeatsSchema,
    settings: TableSettingsSchema,
    lamp: z.boolean(),
    game: z.unknown().transform((x) => parseGame(x)),
  }).strict() as unknown as z.ZodType<TableState<G>>;
}

const engineEvents = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cardsMoved'), cards: z.array(CardIdSchema).min(1), from: CardSourceSchema, to: CardTargetSchema }).strict(),
  z.object({ type: z.literal('cardsTurned'), cards: z.array(CardIdSchema).min(1), faceUp: z.boolean() }).strict(),
  z.object({ type: z.literal('zonesShuffled'), shuffled: z.array(z.string()), zones: Zones }).strict(),
  z.object({ type: z.literal('cardDrawn'), card: CardIdSchema, from: z.string(), to: z.string(), faceUp: z.boolean(), announce: z.boolean() }).strict(),
  z.object({ type: z.literal('settingsChanged'), settings: TableSettingsSchema }).strict(),
  z.object({ type: z.literal('seatsChanged'), seats: SeatsSchema }).strict(),
  z.object({ type: z.literal('lampChanged'), lit: z.boolean(), by: z.union([z.literal('gm'), z.literal('spectator'), SeatSchema]) }).strict(),
  z.object({ type: z.literal('cardsReset'), zones: Zones }).strict(),
]);
// Die Zod-Typen sind etwas weiter (string statt CardId-Vorlage); die Prüfung selbst ist dieselbe.
export const EngineEventSchema = engineEvents as unknown as z.ZodType<EngineEvent>;
/** Namen aller Engine-Ereignisse, aus dem Schema abgeleitet */
export const ENGINE_EVENTS: ReadonlySet<string> = new Set(engineEvents.options.map((o) => o.shape.type.value));

export const TextRefSchema = z.object({ key: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])).exactOptional() }).strict() satisfies z.ZodType<TextRef>;
