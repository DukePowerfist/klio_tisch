// Flüchtige Anzeige (ARCHITEKTUR.md 8.3): Mauszeiger mit Namen, gerade gezogene Karten, angewählter Stapel.
// Eigener Kanal, direkt an alle, nichts wird gespeichert. Die Markierung ist nur ein Hinweis, keine Sperre.

import { z } from 'zod';
import { CardIdSchema, FreePosSchema, PlayerNameSchema, SeatSchema } from '../engine/schemas';
import type { PeerId, Transport } from './transport';

const frac = { x: z.number().finite(), y: z.number().finite() };
/** Lage des Zeigers, Anteil 0–1 im Rechteck des Ankers: frei liegende Karte, Bogen bzw. Spielbereich (wie bei
 *  frei liegenden Karten) oder Tischzone. Nur flüchtig; der gespeicherte Stand nutzt weiter `FreePosSchema`. */
export const PointerPosSchema = z.union([
  FreePosSchema,
  z.object({ zone: z.string().max(40), ...frac }).strict(),
  z.object({ card: CardIdSchema, ...frac }).strict(),
]);
export type PointerPos = z.infer<typeof PointerPosSchema>;

export const PresenceMsg = z.object({
  /** für Farbe und Beschriftung */
  who: z.union([z.literal('gm'), z.literal('spectator'), SeatSchema]),
  name: PlayerNameSchema,
  /** Anker + Anteil, damit sie in jeder Ansicht passt; null = nicht über dem Tisch */
  at: PointerPosSchema.nullable(),
  drag: z.array(CardIdSchema).max(52),
  /** wo der Zeiger beim Greifen war (die erste Meldung kommt wegen der Bündelung erst nach etwas Bewegung) */
  grab: PointerPosSchema.nullable(),
  /** nach dem Loslassen: ID des abgeschickten Befehls (die anderen warten kurz auf dessen Ereignis); bis zum nächsten Greifen */
  dropped: z.string().max(64).nullable(),
  /** Stapel mit offenem Menü */
  open: z.string().max(40).nullable(),
}).strict();
export type PresenceInfo = z.infer<typeof PresenceMsg>;

/** höchstens so oft wird die eigene Lage gesendet (die letzte kommt immer an) */
export const PRESENCE_MS = 50;

export class Presence {
  private others = new Map<PeerId, PresenceInfo>();
  private peers: PeerId[] = [];
  private mine: PresenceInfo | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sentAt = 0;

  constructor(private transport: Transport, private onChange: (others: ReadonlyMap<PeerId, PresenceInfo>) => void) {
    transport.onMessage((msg, from) => {
      const p = PresenceMsg.safeParse(msg);
      if (!p.success) return;
      // wer verbunden ist, bleibt bis `onPeers` ihn entfernt; was die Felder bedeuten, entscheidet die Anzeige
      this.others.set(from, p.data);
      this.onChange(this.others);
    });
    transport.onPeers((peers) => {
      // Neue sehen den eigenen Zeiger sofort, nicht erst bei der nächsten Bewegung
      const added = peers.filter((p) => !this.peers.includes(p));
      this.peers = peers;
      if (this.mine) for (const p of added) transport.send(this.mine, p);
      for (const p of this.others.keys()) if (!peers.includes(p)) this.others.delete(p);
      this.onChange(this.others);
    });
  }

  /** Eigene Lage melden; gebündelt auf höchstens eine Nachricht je PRESENCE_MS. */
  set(info: PresenceInfo): void {
    this.mine = info;
    this.timer ??= setTimeout(() => this.flush(), Math.max(0, this.sentAt + PRESENCE_MS - Date.now()));
  }

  close(): void {
    clearTimeout(this.timer);
    this.timer = undefined; // sonst plant `set` nie wieder
  }

  private flush(): void {
    this.timer = undefined;
    this.sentAt = Date.now();
    if (this.mine) this.transport.send(this.mine);
  }
}
