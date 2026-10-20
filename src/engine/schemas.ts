// Zod-Schemas für die Grundbausteine der Engine; Regelwerke bauen darauf auf.

import { z } from 'zod';
import { RANKS, SEATS, SUITS, type CardId, type RankId } from './types';

export const SuitSchema = z.enum(SUITS);
export const RankSchema = z.enum(RANKS);
export const SeatSchema = z.enum(SEATS);
export const CardIdSchema = z.custom<CardId>((x) => typeof x === 'string' && /^[HSCD](10|[2-9JQKA])$/.test(x), 'keine Karte');
export const PermissionValueSchema = z.enum(['allow', 'deny', 'own']);

const FACE: Partial<Record<RankId, number>> = { J: 11, Q: 12, K: 13, A: 14 };
/** Vergleichswert: 2–10, B=11, D=12, K=13, A=14 */
export const rankValue = (rank: RankId): number => FACE[rank] ?? Number(rank);
