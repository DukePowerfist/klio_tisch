// Speicher im Browser (ARCHITEKTUR.md 4): IndexedDB für Spielstand und Fotos.
// Stand und Host-Daten werden in einer Transaktion geschrieben (8.2).

import type { Backup, BackupInfo, BackupStore, HostStore, Saved } from '../net/host';

const DB = 'klio-tisch';
const VERSION = 2; // 2: Sicherungen
const SAVED = 'saved';
const PHOTOS = 'photos';
const BACKUPS = 'backups';
/** so viele automatische Sicherungen bleiben (A34) */
const KEEP_BACKUPS = 5;

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
      if (!db.objectStoreNames.contains(BACKUPS)) db.createObjectStore(BACKUPS, { keyPath: 'id' });
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

/** Ein Spielstand je Browser (eine Kampagne); umziehen geht über Export und Import (8.2). */
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

/** Fotos, benannt nach ihrem Hash (8.4); Anzeige und Austausch in photos.svelte.ts. */
export class PhotoStore {
  async get(hash: string): Promise<Blob | null> {
    const db = await database();
    return ((await request(db.transaction(PHOTOS).objectStore(PHOTOS).get(hash))) as Blob | undefined) ?? null;
  }

  async put(hash: string, blob: Blob): Promise<void> {
    const db = await database();
    const tx = db.transaction(PHOTOS, 'readwrite');
    tx.objectStore(PHOTOS).put(blob, hash);
    await done(tx);
  }
}

/** Automatische Sicherungen des Stands (A34), die letzten KEEP_BACKUPS. */
export class IdbBackups<G> implements BackupStore<G> {
  async add(backup: Backup<G>): Promise<void> {
    const db = await database();
    const tx = db.transaction(BACKUPS, 'readwrite');
    const store = tx.objectStore(BACKUPS);
    store.put(backup);
    const all = (await request(store.getAll())) as Backup<G>[];
    for (const old of all.sort((a, b) => b.at - a.at).slice(KEEP_BACKUPS)) store.delete(old.id);
    await done(tx);
  }

  async list(): Promise<BackupInfo[]> {
    const db = await database();
    const all = (await request(db.transaction(BACKUPS).objectStore(BACKUPS).getAll())) as Backup<G>[];
    return all.sort((a, b) => b.at - a.at).map(({ id, at, reason }) => ({ id, at, reason }));
  }

  async get(id: string): Promise<Backup<G> | null> {
    const db = await database();
    return ((await request(db.transaction(BACKUPS).objectStore(BACKUPS).get(id))) as Backup<G> | undefined) ?? null;
  }
}
