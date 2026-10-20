// Speicher im Browser (ARCHITEKTUR.md 4): IndexedDB für Spielstand und Fotos.
// Stand und Host-Daten werden in einer Transaktion geschrieben (8.2).

import { backupInfo, KEEP_BACKUPS, type Backup, type BackupInfo, type BackupStore, type HostStore, type Saved } from '../net/host';

const DB = 'klio-tisch';
const VERSION = 3; // 3: Sicherungen (Übersicht und Stand getrennt)
const SAVED = 'saved';
const PHOTOS = 'photos';
/** Übersicht der Sicherungen (klein) und ihr Stand (groß), getrennt: Auflisten liest nur die Übersicht */
const BACKUPS = 'backups';
const BACKUP_STATES = 'backupStates';

/** Eine Verbindung für alle, erst bei Bedarf geöffnet. */
let connection: Promise<IDBDatabase> | undefined;
const database = (): Promise<IDBDatabase> => (connection ??= open());

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion === 2) db.deleteObjectStore(BACKUPS); // Zwischenstand: Sicherungen samt Stand in einem Speicher
      if (!db.objectStoreNames.contains(SAVED)) db.createObjectStore(SAVED);
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
      if (!db.objectStoreNames.contains(BACKUPS)) db.createObjectStore(BACKUPS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BACKUP_STATES)) db.createObjectStore(BACKUP_STATES);
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
    const tx = db.transaction([BACKUPS, BACKUP_STATES], 'readwrite');
    const infos = tx.objectStore(BACKUPS);
    const states = tx.objectStore(BACKUP_STATES);
    infos.put(backupInfo(backup));
    states.put(backup.state, backup.id);
    const all = newestFirst((await request(infos.getAll())) as BackupInfo[]);
    for (const old of all.slice(KEEP_BACKUPS)) {
      infos.delete(old.id);
      states.delete(old.id);
    }
    await done(tx);
  }

  async list(): Promise<BackupInfo[]> {
    const db = await database();
    return newestFirst((await request(db.transaction(BACKUPS).objectStore(BACKUPS).getAll())) as BackupInfo[]);
  }

  async get(id: string): Promise<Backup<G> | null> {
    const db = await database();
    const tx = db.transaction([BACKUPS, BACKUP_STATES]);
    const [info, state] = await Promise.all([request(tx.objectStore(BACKUPS).get(id)), request(tx.objectStore(BACKUP_STATES).get(id))]);
    return info && state ? { ...(info as BackupInfo), state: state as Backup<G>['state'] } : null;
  }
}

const newestFirst = (list: BackupInfo[]): BackupInfo[] => list.sort((a, b) => b.at - a.at);
