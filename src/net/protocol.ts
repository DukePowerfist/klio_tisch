// Nachrichten zwischen Host und Clients (ARCHITEKTUR.md 8.2).
// `hello` und `reload` ändern ihr Format NIE: Nur so versteht auch ein veralteter Client die Aufforderung.

import { z } from 'zod';
import { SeatSchema, TextRefSchema } from '../engine/schemas';
import type { Actor, Rejection } from '../engine/types';

// ---------- eingefroren ----------

export const HelloMsg = z.object({
  t: z.literal('hello'),
  /** Build-Kennung der App (Git-Commit) */
  build: z.string().max(64),
  /** geheimer Wiederverbindungs-Schlüssel des Browsers, geht nur an den Host */
  key: z.string().min(16).max(128),
  /** gewünschter Platz beim ersten Beitritt; bekannte Schlüssel bekommen ihren alten Platz */
  want: z.union([SeatSchema, z.literal('spectator')]).nullable(),
  name: z.string().max(40),
});
export const ReloadMsg = z.object({ t: z.literal('reload'), build: z.string().max(64) });

// ---------- Client → Host ----------

const CommandMsg = z.object({ t: z.literal('cmd'), id: z.string().min(8).max(64), cmd: z.unknown() }).strict();
const ResyncMsg = z.object({ t: z.literal('resync') }).strict();
export const ToHost = z.union([HelloMsg, CommandMsg, ResyncMsg]);
export type ToHost = z.infer<typeof ToHost>;

// ---------- Host → Client ----------
// Stand und Ereignisse prüft der Client zusätzlich mit der Engine (parseState/parseEvent).

/** Rolle eines Clients: jede Rolle außer SL (die ist der Host selbst). */
export type Role = Exclude<Actor, { role: 'gm' }>;
const RoleSchema = z.union([
  z.object({ role: z.literal('player'), seat: SeatSchema }).strict(),
  z.object({ role: z.literal('spectator') }).strict(),
]) satisfies z.ZodType<Role>;

const EventsMsg = z.object({
  t: z.literal('events'),
  events: z.array(z.object({ seq: z.number().int().positive(), event: z.unknown() }).strict()).min(1),
}).strict();
export type ReceivedEvents = z.infer<typeof EventsMsg>['events'];

export const ToClient = z.union([
  ReloadMsg,
  z.object({ t: z.literal('welcome'), role: RoleSchema, state: z.unknown() }).strict(),
  z.object({ t: z.literal('denied'), reason: TextRefSchema }).strict(),
  z.object({ t: z.literal('state'), state: z.unknown() }).strict(),
  z.object({ t: z.literal('replaced') }).strict(),
  z.object({ t: z.literal('result'), id: z.string(), ok: z.boolean(), reason: TextRefSchema.exactOptional() }).strict(),
  EventsMsg,
]);
export type ToClient = z.infer<typeof ToClient>;

/** Antwort auf einen Befehl, wie sie gespeichert und bei Wiederholung erneut geschickt wird. */
export type CommandResult = { ok: true } | { ok: false; reason: Rejection['reason'] };
