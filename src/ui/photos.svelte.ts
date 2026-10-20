// Fotos im Browser (ARCHITEKTUR.md 8.4): Ablage in IndexedDB, Anzeige über Objekt-URLs.
// Host und Client nutzen dieselbe Ablage (PhotoBank); das Anfragen beim Host übernimmt die Sitzung.

import type { PhotoBank } from '../net/photos';
import { PhotoStore } from './storage';

class Photos implements PhotoBank {
  /** Hash → Objekt-URL der vorhandenen Fotos */
  urls = $state<Record<string, string>>({});
  private store = new PhotoStore();

  async get(hash: string): Promise<Uint8Array | null> {
    const blob = await this.store.get(hash);
    return blob && new Uint8Array(await blob.arrayBuffer());
  }

  async put(hash: string, bytes: Uint8Array): Promise<void> {
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
    await this.store.put(hash, blob);
    this.show(hash, blob);
  }

  /** Foto aus der Ablage zum Anzeigen bereitstellen; false, wenn es hier fehlt. */
  async load(hash: string): Promise<boolean> {
    if (this.urls[hash]) return true;
    const blob = await this.store.get(hash);
    if (blob) this.show(hash, blob);
    return !!blob;
  }

  private show(hash: string, blob: Blob): void {
    if (!this.urls[hash]) this.urls[hash] = URL.createObjectURL(blob);
  }
}

export const photos = new Photos();
