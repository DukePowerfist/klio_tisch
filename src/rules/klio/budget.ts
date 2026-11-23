// Zähler für das Kartenbudget einer Aktion (Schritt 6a; Regelwerk 2.2, S. 6 f., 8, 13).
// Zählt die Karten, die für die Aktion vom Deck gezogen werden, und sperrt hart:
//   Deck: Budget noch nicht eingestellt (jede Aktion beginnt bei 0), aufgebraucht oder ♣ vom Deck gezogen (außer mit Vorteil); danach geht es nur über die Notizen weiter.
//   Forschungsnotizen der handelnden Person: bei Nachteil.
// Vorteil und Nachteil zusammen heben sich auf. Ist die Automatik „budget“ aus, zählt und sperrt nichts.

import { z } from 'zod';
import { reject } from '../../engine/commands';
import { SeatSchema, suitOf } from '../../engine/schemas';
import { seatVisible, type ZoneTable } from '../../engine/zones';
import type { CardId, CardSource, CardTarget, Command, CommandDef, EngineEventOf, Event, Reaction, Rejection, SeatId, TableState, ZoneId } from '../../engine/types';
import type { KlioEvent } from './events';
import { BUDGET_MAX, type Budget, type KlioState } from './state';

export const BUDGET_REACTION = 'budget';
export const DECK: ZoneId = 'deck';
export const NOTES = 'notes';

type S = TableState<KlioState>;

/** Vorteil oder Nachteil wirkt nur allein (beides zusammen: regulär) */
export const hasAdvantage = (b: Budget): boolean => b.advantage && !b.disadvantage;
export const hasDisadvantage = (b: Budget): boolean => b.disadvantage && !b.advantage;
/** Budget noch nicht eingestellt: Jede Aktion beginnt bei 0, man zählt hoch. Bis dahin ist das Deck gesperrt. (Budget 0
 *  nach dem Regelwerk, S. 6 – eine einzige Karte mit Nachteil – stellt man als 1 mit N ein.) */
export const budgetUnset = (b: Budget): boolean => b.left === 0 && b.drawn === 0;

const counting = (s: S): boolean => s.game.budget.active && s.settings.automation[BUDGET_REACTION] !== false;

/** Ziehen für die Aktion: vom Deck auf den Tisch (Ablage, Auslage, freier Tisch). Nicht mitgezählt: zurück aufs Deck
 *  und auf einen Bogen (Forschungsnotiz nach einem Fehlschlag, Schadenskarte). */
export function isActionDraw(zones: ZoneTable, from: CardSource | ZoneId, to: CardTarget | ZoneId): boolean {
  const fromZone = typeof from === 'string' ? from : 'zone' in from ? from.zone : null;
  if (fromZone !== DECK) return false;
  const toZone = typeof to === 'string' ? to : 'zone' in to ? to.zone : null;
  if (toZone === null) return true;
  return toZone !== DECK && !zones.get(toZone)?.owner;
}

/** Grund, warum das Deck gerade gesperrt ist; `k` Karten sollen gezogen werden */
export function deckBlock(b: Budget, k = 1): Rejection | undefined {
  if (budgetUnset(b)) return reject('reject.budget.unset');
  if (b.left <= 0) return reject('reject.budget.empty');
  if (b.club && !hasAdvantage(b)) return reject('reject.budget.club');
  if (k > b.left) return reject('reject.budget.tooMany', { n: b.left });
  return undefined;
}

/** Sperre für Befehle, die das Regelwerk je nach Stand verbietet (`Ruleset.guard`) */
export function budgetGuard(zones: ZoneTable) {
  return (cmd: Command, state: S): Rejection | undefined => {
    if (!counting(state)) return undefined;
    const b = state.game.budget;
    if (cmd.type === 'zone.draw') {
      const zone = (cmd as Command & { zone: ZoneId }).zone;
      const to = zones.get(zone)?.actions?.draw?.to;
      return to !== undefined && isActionDraw(zones, zone, to) ? deckBlock(b) : undefined;
    }
    if (cmd.type !== 'cards.move') return undefined;
    const move = cmd as Command & { cards: CardId[]; from: CardSource; to: CardTarget };
    if (isActionDraw(zones, move.from, move.to)) return deckBlock(b, move.cards.length);
    // Notizen der handelnden Person bei Nachteil; Umsortieren innerhalb der Notizen bleibt erlaubt
    if (hasDisadvantage(b) && b.seat && 'zone' in move.from) {
      const zc = zones.get(move.from.zone);
      const intoSame = 'zone' in move.to && move.to.zone === move.from.zone;
      if (zc?.template === NOTES && zc.owner === b.seat && !intoSame) return reject('reject.budget.notes');
    }
    return undefined;
  };
}

/** Ereignis für gezogene Karten; sperren sie das Deck (aufgebraucht oder ♣ ohne Vorteil), steht der Grund dabei */
function spent(b: Budget, cards: CardId[]): KlioEvent {
  const after: Budget = { ...b, left: Math.max(0, b.left - cards.length), drawn: b.drawn + cards.length, club: b.club || cards.some((c) => suitOf(c) === 'C') };
  const code = deckBlock(after)?.reason.key;
  const lock = code === 'reject.budget.empty' ? 'empty' : code === 'reject.budget.club' ? 'club' : undefined;
  return lock ? { type: 'budgetSpent', cards, lock } : { type: 'budgetSpent', cards };
}

/** Zählt Karten, die für die Aktion vom Deck gezogen werden; beim Zurücksetzen des Tisches endet die Aktion. */
export function budgetReaction(zones: ZoneTable): Reaction<KlioState> {
  return {
    id: BUDGET_REACTION,
    react(state, event: Event): KlioEvent[] {
      if (!state.game.budget.active) return [];
      if (event.type === 'cardsReset') return [{ type: 'budgetStopped' }];
      if (event.type === 'cardDrawn') {
        const e = event as EngineEventOf<'cardDrawn'>;
        return isActionDraw(zones, e.from, e.to) ? [spent(state.game.budget, [e.card])] : [];
      }
      if (event.type === 'cardsMoved') {
        const e = event as EngineEventOf<'cardsMoved'>;
        return isActionDraw(zones, e.from, e.to) ? [spent(state.game.budget, e.cards)] : [];
      }
      return [];
    },
  };
}

// ---------- Befehle ----------

const Left = z.number().int().min(0).max(BUDGET_MAX);
const StartCmd = z.object({ type: z.literal('budget.start'), seat: SeatSchema, left: Left.optional() }).strict();
const SetCmd = z.object({
  type: z.literal('budget.set'),
  seat: SeatSchema.optional(),
  left: Left.optional(),
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
}).strict();
const StopCmd = z.object({ type: z.literal('budget.stop') }).strict();

/** handelnde Person (für `own`): Ändern und Beenden dürfen sie und die SL */
const acting = (state: S): SeatId[] => (state.game.budget.seat ? [state.game.budget.seat] : []);

export function budgetCommands(): Record<string, CommandDef<KlioState, any>> {
  // Einschalten: Spieler für sich selbst, die SL für jeden Platz
  const start: CommandDef<KlioState, z.infer<typeof StartCmd>> = {
    parse: (x) => StartCmd.parse(x),
    permission: 'budget.start',
    owners: (cmd) => [cmd.seat],
    handle(cmd, state) {
      if (!seatVisible(cmd.seat, state)) return reject('reject.hiddenSeat');
      if (state.game.budget.active) return reject('reject.budget.active');
      return [{ type: 'budgetStarted', seat: cmd.seat, left: cmd.left ?? 0 }];
    },
  };

  // Budget, Vorteil, Nachteil und handelnde Person ändern; nur Geändertes kommt ins Ereignis
  const set: CommandDef<KlioState, z.infer<typeof SetCmd>> = {
    parse: (x) => SetCmd.parse(x),
    permission: 'budget.edit',
    owners: (cmd, state) => [...acting(state), ...(cmd.seat ? [cmd.seat] : [])],
    handle(cmd, state) {
      const b = state.game.budget;
      if (!b.active) return reject('reject.budget.inactive');
      if (cmd.seat && !seatVisible(cmd.seat, state)) return reject('reject.hiddenSeat');
      const changes: Omit<Extract<KlioEvent, { type: 'budgetChanged' }>, 'type'> = {};
      if (cmd.seat !== undefined && cmd.seat !== b.seat) changes.seat = cmd.seat;
      if (cmd.left !== undefined && cmd.left !== b.left) changes.left = cmd.left;
      if (cmd.advantage !== undefined && cmd.advantage !== b.advantage) changes.advantage = cmd.advantage;
      if (cmd.disadvantage !== undefined && cmd.disadvantage !== b.disadvantage) changes.disadvantage = cmd.disadvantage;
      return Object.keys(changes).length ? [{ type: 'budgetChanged', ...changes }] : [];
    },
  };

  const stop: CommandDef<KlioState, z.infer<typeof StopCmd>> = {
    parse: (x) => StopCmd.parse(x),
    permission: 'budget.edit',
    owners: (_cmd, state) => acting(state),
    handle: (_cmd, state) => (state.game.budget.active ? [{ type: 'budgetStopped', drawn: state.game.budget.drawn }] : []),
  };

  return { 'budget.start': start, 'budget.set': set, 'budget.stop': stop };
}
