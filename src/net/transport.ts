// Verbindungsschicht (ARCHITEKTUR.md 8.1): gemeinsame Schnittstelle für alle Verbindungsarten.
// Ein Transport steht für die eigene Verbindung in einem Raum; die Peer-ID wechselt bei jeder Verbindung.

export type PeerId = string;

export interface Transport {
  readonly self: PeerId;
  /** an einen Peer oder (ohne `to`) an alle anderen */
  send(msg: unknown, to?: PeerId): void;
  onMessage(cb: (msg: unknown, from: PeerId) => void): void;
  /** aktuelle Liste der anderen Peers, bei jeder Änderung */
  onPeers(cb: (peers: PeerId[]) => void): void;
  leave(): void;
}
