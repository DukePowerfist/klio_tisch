// Nachrichten zwischen Host und Clients (ARCHITEKTUR.md 8.2).
// `hello` und `reload` ändern ihr Format NIE: Nur so versteht auch ein veralteter Client die Aufforderung.

import { z } from 'zod';
import { PhotoHashSchema, PlayerNameSchema, SeatSchema, TextRefSchema } from '../engine/schemas';
import type { Actor, Rejection } from '../engine/types';
import { PhotoDataSchema } from './photos';

// ---------- eingefroren ----------

export const HelloMsg = z.object({
  t: z.literal('hello'),
  /** Build-Kennung der App (Git-Commit) */
  build: z.string().max(64),
  /** geheimer Wiederverbindungs-Schlüssel des Browsers, geht nur an den Host */
  key: z.string().min(16).max(128),
  /** Relikt (eingefroren): seit Schritt 4a immer null; neue Browser treten als Zuschauer bei und wählen per `claim` */
  want: z.union([SeatSchema, z.literal('spectator')]).nullable(),
  name: z.string().max(40),
});
export const ReloadMsg = z.object({ t: z.literal('reload'), build: z.string().max(64) });

// ---------- Client → Host ----------

/** ID einer Nachricht, die beantwortet und bei Bedarf mit derselben ID erneut geschickt wird */
const MsgId = z.string().min(8).max(64);
const CommandMsg = z.object({ t: z.literal('cmd'), id: MsgId, cmd: z.unknown() }).strict();
const ResyncMsg = z.object({ t: z.literal('resync') }).strict();
/** Zuschauer möchte einen freien Platz nehmen (nach dem Beitritt); Antwort wie bei Befehlen per `result` mit derselben ID. */
const ClaimMsg = z.object({ t: z.literal('claim'), id: MsgId, seat: SeatSchema, name: PlayerNameSchema }).strict();
/** Foto hochladen (vor dem Befehl, der es einträgt); Antwort per `result`. Fotos fragen Clients einzeln an (8.4). */
const PhotoPutMsg = z.object({ t: z.literal('photo'), id: MsgId, hash: PhotoHashSchema, data: PhotoDataSchema }).strict();
const PhotoGetMsg = z.object({ t: z.literal('photoGet'), hash: PhotoHashSchema }).strict();
export const ToHost = z.union([HelloMsg, CommandMsg, ResyncMsg, ClaimMsg, PhotoPutMsg, PhotoGetMsg]);
export type ToHost = z.infer<typeof ToHost>;

// ---------- Host → Client ----------
// Stand und Ereignisse prüft der Client zusätzlich mit der Engine (parseState/parseEvent).

/** Rolle eines Clients: jede Rolle außer SL (die ist der Host selbst). */
export type Role = Exclude<Actor, { role: 'gm' }>;
export const RoleSchema = z.union([
  z.object({ role: z.literal('player'), seat: SeatSchema }).strict(),
  z.object({ role: z.literal('spectator') }).strict(),
]) satisfies z.ZodType<Role>;

const EventsMsg = z.object({
  t: z.literal('events'),
  events: z.array(z.object({ seq: z.number().int().positive(), event: z.unknown() }).strict()).min(1),
  /** ID des Befehls, der die Ereignisse ausgelöst hat (damit der Absender seine Anzeige abschließen kann) */
  cause: z.string().exactOptional(),
}).strict();
export type ReceivedEvents = z.infer<typeof EventsMsg>['events'];

export const ToClient = z.union([
  ReloadMsg,
  z.object({ t: z.literal('welcome'), role: RoleSchema, state: z.unknown() }).strict(),
  z.object({ t: z.literal('denied'), reason: TextRefSchema }).strict(),
  /** vollständiger Stand: Antwort auf `resync` oder (mit Anlass) nach dem Ersetzen durch die SL */
  z.object({ t: z.literal('state'), state: z.unknown(), reason: z.string().max(40).exactOptional() }).strict(),
  z.object({ t: z.literal('replaced') }).strict(),
  z.object({ t: z.literal('result'), id: z.string(), ok: z.boolean(), reason: TextRefSchema.exactOptional() }).strict(),
  EventsMsg,
  z.object({ t: z.literal('photo'), hash: PhotoHashSchema, data: PhotoDataSchema }).strict(),
]);
export type ToClient = z.infer<typeof ToClient>;

/** Antwort auf einen Befehl, wie sie gespeichert und bei Wiederholung erneut geschickt wird. */
export type CommandResult = { ok: true } | { ok: false; reason: Rejection['reason'] };
/** Ablehnung ohne genaueren Grund (nicht verbunden, unbekannt, unzulässig) */
export const INVALID: CommandResult = { ok: false, reason: { key: 'reject.invalid' } };
