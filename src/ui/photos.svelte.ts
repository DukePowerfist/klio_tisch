// Fotos im Browser (ARCHITEKTUR.md 8.4): Ablage in IndexedDB, Anzeige über Objekt-URLs.
// Fehlt ein Foto, fragt der Client es beim Host an; der Host gibt seine Fotos aus derselben Ablage heraus.

import type { PhotoBank } from '../net/photos';
import { PhotoStore } from './storage';

const TYPE = 'image/jpeg';

class Photos implements PhotoBank {
  /** Hash → Objekt-URL der vorhandenen Fotos */
  urls = $state<Record<string, string>>({});
  /** fehlendes Foto anfragen (nur als Client gesetzt) */
  request: ((hash: string) => void) | null = null;
  private store = new PhotoStore();
  private looking = new Set<string>();

  async get(hash: string): Promise<Uint8Array | null> {
    const blob = await this.store.get(hash);
    return blob && new Uint8Array(await blob.arrayBuffer());
  }

  async put(hash: string, data: Uint8Array | Blob): Promise<void> {
    const blob = data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>], { type: TYPE });
    await this.store.put(hash, blob);
    this.show(hash, blob);
  }

  /** Foto soll angezeigt werden: aus der Ablage, sonst beim Host anfragen. */
  async want(hash: string): Promise<void> {
    if (this.urls[hash] || this.looking.has(hash)) return;
    this.looking.add(hash);
    const blob = await this.store.get(hash);
    if (blob) this.show(hash, blob);
    else this.request?.(hash);
    this.looking.delete(hash);
  }

  private show(hash: string, blob: Blob): void {
    if (!this.urls[hash]) this.urls[hash] = URL.createObjectURL(blob);
  }
}

export const photos = new Photos();
