// Allein spielen bzw. Bildschirmfreigabe wie bisher (8.1): ein Raum ohne andere Teilnehmer.

import type { Transport } from './transport';

export function localTransport(): Transport {
  return {
    self: 'local',
    send: () => {},
    onMessage: () => {},
    onPeers: (cb) => cb([]),
    leave: () => {},
  };
}
