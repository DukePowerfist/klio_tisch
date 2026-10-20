// Verbindung im Speicher für Tests (Schritt 2b): mehrere Teilnehmer, Abbrüche, verlorene Nachrichten.
// Zustellung asynchron und je Absender-Empfänger-Paar in Reihenfolge, wie bei einem Datenkanal.

import type { PeerId, Transport } from './transport';

type Member = { messageCbs: ((msg: unknown, from: PeerId) => void)[]; peerCbs: ((peers: PeerId[]) => void)[] };

export class MemoryNetwork {
  private members = new Map<PeerId, Member>();
  private queue: (() => void)[] = [];
  private counter = 0;
  /** Testhaken: true = Nachricht verwerfen */
  drop: (msg: unknown, from: PeerId, to: PeerId) => boolean = () => false;

  connect(): Transport {
    const self = `peer${++this.counter}`;
    const member: Member = { messageCbs: [], peerCbs: [] };
    this.members.set(self, member);
    this.announcePeers();
    const net = this;
    return {
      self,
      send(msg, to) {
        if (!net.members.has(self)) return;
        const targets = to ? [to] : [...net.members.keys()].filter((p) => p !== self);
        // Wie über das Netz: eine Kopie, keine geteilten Objekte
        const copy = JSON.parse(JSON.stringify(msg)) as unknown;
        for (const t of targets) {
          if (net.drop(msg, self, t)) continue;
          net.queue.push(() => net.members.get(t)?.messageCbs.forEach((cb) => cb(structuredClone(copy), self)));
        }
      },
      onMessage: (cb) => void member.messageCbs.push(cb),
      onPeers(cb) {
        member.peerCbs.push(cb);
        net.queue.push(() => cb(net.othersOf(self)));
      },
      leave: () => net.disconnect(self),
    };
  }

  /** Verbindung bricht ab (die anderen merken es). */
  disconnect(peer: PeerId): void {
    if (this.members.delete(peer)) this.announcePeers();
  }

  /** Alle anstehenden Nachrichten zustellen, auch die dabei neu entstehenden. */
  async flush(): Promise<void> {
    for (let rounds = 0; rounds < 1000; rounds++) {
      await new Promise((r) => setTimeout(r, 0));
      if (this.queue.length === 0) return;
      const batch = this.queue;
      this.queue = [];
      for (const deliver of batch) deliver();
    }
    throw new Error('Nachrichten kommen nicht zur Ruhe');
  }

  private othersOf(self: PeerId): PeerId[] {
    return [...this.members.keys()].filter((p) => p !== self);
  }

  private announcePeers(): void {
    for (const [id, m] of this.members) for (const cb of m.peerCbs) this.queue.push(() => cb(this.othersOf(id)));
  }
}
