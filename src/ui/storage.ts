// Speicher im Browser (ARCHITEKTUR.md 4): IndexedDB für Spielstand und Fotos.
// Stand und Host-Daten werden in einer Transaktion geschrieben (8.2).

import type { HostStore, Saved } from '../net/host';

const DB = 'klio-tisch';
const VERSION = 1;
const SAVED = 'saved';
const PHOTOS = 'photos';

/** Eine Verbindung für alle, erst bei Bedarf geöffnet. */
let connection: Promise<IDBDatabase> | undefined;
const database = (): Promise<IDBDatabase> => (connection ??= open());

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAVED)) db.createObjectStore(SAVED);
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('abgebrochen'));
  });
}

/** Vorerst ein Spielstand; je Raum getrennte Stände kommen mit Schritt 4. */
const SLOT = 'main';

export class IdbStore<G> implements HostStore<G> {
  async load(): Promise<Saved<G> | null> {
    const db = await database();
    return ((await request(db.transaction(SAVED).objectStore(SAVED).get(SLOT))) as Saved<G> | undefined) ?? null;
  }

  async save(saved: Saved<G>): Promise<void> {
    const db = await database();
    const tx = db.transaction(SAVED, 'readwrite');
    tx.objectStore(SAVED).put(saved, SLOT);
    await done(tx);
  }
}

/** Fotos, benannt nach ihrem Hash (8.4). */
export class PhotoStore {
  private urls = new Map<string, string>();

  async put(hash: string, blob: Blob): Promise<void> {
    const db = await database();
    const tx = db.transaction(PHOTOS, 'readwrite');
    tx.objectStore(PHOTOS).put(blob, hash);
    await done(tx);
  }

  /** Objekt-URL zum Anzeigen; null, wenn das Foto (noch) fehlt. */
  async url(hash: string): Promise<string | null> {
    const known = this.urls.get(hash);
    if (known) return known;
    const db = await database();
    const blob = (await request(db.transaction(PHOTOS).objectStore(PHOTOS).get(hash))) as Blob | undefined;
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urls.set(hash, url);
    return url;
  }
}
