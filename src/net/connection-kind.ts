// Welcher Weg trägt eine bestehende WebRTC-Verbindung?
// Grundlage: Kandidatentypen des gewählten Kandidatenpaars (getStats).

export type ConnectionKind = 'lokal' | 'internet' | 'weitergeleitet' | 'unbekannt';

export function classifyCandidates(local: string | undefined, remote: string | undefined): ConnectionKind {
  if (!local || !remote) return 'unbekannt';
  if (local === 'relay' || remote === 'relay') return 'weitergeleitet';
  if (local === 'host' && remote === 'host') return 'lokal';
  return 'internet';
}

type StatsEntry = { type: string; id: string; [key: string]: unknown };

export function connectionKindFromStats(stats: Iterable<StatsEntry>): ConnectionKind {
  const byId = new Map<string, StatsEntry>();
  for (const s of stats) byId.set(s.id, s);

  let pair: StatsEntry | undefined;
  for (const s of byId.values()) {
    if (s.type === 'transport' && typeof s.selectedCandidatePairId === 'string') {
      pair = byId.get(s.selectedCandidatePairId);
      if (pair) break;
    }
  }
  // Firefox liefert kein selectedCandidatePairId, markiert das Paar aber direkt.
  pair ??= [...byId.values()].find((s) => s.type === 'candidate-pair' && s.selected === true);
  pair ??= [...byId.values()].find((s) => s.type === 'candidate-pair' && s.nominated === true && s.state === 'succeeded');
  if (!pair) return 'unbekannt';

  const local = byId.get(String(pair.localCandidateId))?.candidateType;
  const remote = byId.get(String(pair.remoteCandidateId))?.candidateType;
  return classifyCandidates(typeof local === 'string' ? local : undefined, typeof remote === 'string' ? remote : undefined);
}

export async function connectionKind(pc: RTCPeerConnection): Promise<ConnectionKind> {
  const report = await pc.getStats();
  return connectionKindFromStats([...report.values()] as StatsEntry[]);
}
