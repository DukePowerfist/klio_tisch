// Host-Modus über WebRTC (ARCHITEKTUR.md 8.1, 8.6): Trystero mit Nostr-Vermittlung.
// Ein Raum, mehrere Kanäle (Spielnachrichten, flüchtige Anzeige wie Mauszeiger).

import { joinRoom, selfId, type Room } from '@trystero-p2p/nostr';
import type { RoomLink } from './room-link';
import { roomConfig } from './trystero-config';
import type { PeerId, Transport } from './transport';

export class TrysteroRoom {
  private room: Room;
  private peers: PeerId[] = [];
  private peerCbs: ((peers: PeerId[]) => void)[] = [];

  constructor(link: RoomLink, onError?: (error: string) => void) {
    this.room = joinRoom(roomConfig(link), link.room, { onJoinError: (e) => onError?.(e.error) });
    this.room.onPeerJoin = (p) => this.setPeers([...this.peers.filter((x) => x !== p), p]);
    this.room.onPeerLeave = (p) => this.setPeers(this.peers.filter((x) => x !== p));
  }

  /** Ein Kanal des Raums als Transport; `name` höchstens 12 Zeichen. */
  channel(name: string): Transport {
    const action = this.room.makeAction<never>(name);
    return {
      self: selfId,
      send: (msg, to) => void action.send(msg as never, to ? { target: to } : {}),
      onMessage: (cb) => {
        const previous = action.onMessage;
        action.onMessage = (data, ctx) => {
          void previous?.(data, ctx);
          cb(data, ctx.peerId);
        };
      },
      onPeers: (cb) => {
        this.peerCbs.push(cb);
        cb([...this.peers]);
      },
      leave: () => void this.room.leave(),
    };
  }

  leave(): void {
    void this.room.leave();
  }

  private setPeers(peers: PeerId[]): void {
    this.peers = peers;
    for (const cb of this.peerCbs) cb([...peers]);
  }
}
