import { describe, expect, it } from 'vitest';
import { classifyCandidates, connectionKindFromStats } from '../../src/net/connection-kind';

describe('Verbindungsweg', () => {
  it.each([
    ['host', 'host', 'lokal'],
    ['srflx', 'host', 'internet'],
    ['host', 'prflx', 'internet'],
    ['srflx', 'srflx', 'internet'],
    ['relay', 'host', 'weitergeleitet'],
    ['srflx', 'relay', 'weitergeleitet'],
    [undefined, 'host', 'unbekannt'],
  ] as const)('%s + %s → %s', (local, remote, expected) => {
    expect(classifyCandidates(local, remote)).toBe(expected);
  });

  const candidates = [
    { type: 'local-candidate', id: 'L1', candidateType: 'host' },
    { type: 'local-candidate', id: 'L2', candidateType: 'srflx' },
    { type: 'remote-candidate', id: 'R1', candidateType: 'srflx' },
  ];

  it('folgt dem gewählten Paar des Transports (Chrome)', () => {
    const stats = [
      ...candidates,
      { type: 'candidate-pair', id: 'P1', localCandidateId: 'L1', remoteCandidateId: 'R1', state: 'failed' },
      { type: 'candidate-pair', id: 'P2', localCandidateId: 'L2', remoteCandidateId: 'R1', state: 'succeeded' },
      { type: 'transport', id: 'T', selectedCandidatePairId: 'P2' },
    ];
    expect(connectionKindFromStats(stats)).toBe('internet');
  });

  it('nutzt das als gewählt markierte Paar (Firefox)', () => {
    const stats = [
      ...candidates,
      { type: 'candidate-pair', id: 'P2', localCandidateId: 'L2', remoteCandidateId: 'R1', selected: true },
    ];
    expect(connectionKindFromStats(stats)).toBe('internet');
  });

  it('ohne gewähltes Paar: unbekannt', () => {
    expect(connectionKindFromStats(candidates)).toBe('unbekannt');
  });
});
