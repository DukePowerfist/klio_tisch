// Verbindung und Speicher im Arbeitsspeicher für Tests (Schritt 2b): mehrere Teilnehmer, Abbrüche,
// verlorene Nachrichten, fehlschlagendes Speichern.
// Zustellung asynchron und je Absender-Empfänger-Paar in Reihenfolge, wie bei einem Datenkanal.

import { backupInfo, KEEP_BACKUPS, type Backup, type BackupStore, type HostStore, type Saved } from './host';
import type { PhotoBank } from './photos';
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
    return {
      self,
      send: (msg, to) => {
        if (!this.members.has(self)) return;
        // Wie über das Netz: serialisiert, beim Empfang je Empfänger eine eigene Kopie
        const json = JSON.stringify(msg);
        for (const t of to ? [to] : this.othersOf(self)) {
          if (this.drop(msg, self, t)) continue;
          this.queue.push(() => this.members.get(t)?.messageCbs.forEach((cb) => cb(JSON.parse(json), self)));
        }
      },
      onMessage: (cb) => void member.messageCbs.push(cb),
      onPeers: (cb) => {
        member.peerCbs.push(cb);
        this.queue.push(() => cb(this.othersOf(self)));
      },
      leave: () => this.disconnect(self),
    };
  }

  /** Verbindung bricht ab (die anderen merken es). */
  disconnect(peer: PeerId): void {
    if (this.members.delete(peer)) this.announcePeers();
  }

  /** Eine Runde zustellen (auch was dabei neu entsteht, kommt in die nächste); gibt die Anzahl zurück. */
  async deliver(): Promise<number> {
    await new Promise((r) => setTimeout(r, 0));
    const batch = this.queue;
    this.queue = [];
    for (const d of batch) d();
    return batch.length;
  }

  private othersOf(self: PeerId): PeerId[] {
    return [...this.members.keys()].filter((p) => p !== self);
  }

  private announcePeers(): void {
    for (const [id, m] of this.members) for (const cb of m.peerCbs) this.queue.push(() => cb(this.othersOf(id)));
  }
}

/** Speicher im Arbeitsspeicher; `failNext` lässt das nächste Speichern fehlschlagen. */
export class MemoryStore<G> implements HostStore<G> {
  saved: Saved<G> | null = null;
  failNext = false;
  async load() {
    return this.saved ? structuredClone(this.saved) : null;
  }
  async save(saved: Saved<G>) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Speichern fehlgeschlagen');
    }
    this.saved = structuredClone(saved);
  }
}

/** Foto-Ablage im Arbeitsspeicher. */
export class MemoryPhotoBank implements PhotoBank {
  photos = new Map<string, Uint8Array>();
  async get(hash: string) {
    return this.photos.get(hash) ?? null;
  }
  async put(hash: string, bytes: Uint8Array) {
    this.photos.set(hash, bytes);
  }
}

/** Sicherungen im Arbeitsspeicher, die letzten KEEP_BACKUPS. */
export class MemoryBackups<G> implements BackupStore<G> {
  backups: Backup<G>[] = [];
  async add(b: Backup<G>) {
    this.backups = [structuredClone(b), ...this.backups].slice(0, KEEP_BACKUPS);
  }
  async list() {
    return this.backups.map(backupInfo);
  }
  async get(id: string) {
    return structuredClone(this.backups.find((b) => b.id === id) ?? null);
  }
}
