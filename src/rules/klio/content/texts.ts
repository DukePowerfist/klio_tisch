// Texte nachschlagen: Schlüssel in texts.de.yaml oder Texte an den Trumpf-Wegen (`source.<id>.why`).
// Gemeinsam für Oberfläche und Tests.

import type { TextTree } from './schema';
import type { KlioContent } from './validate';

export function resolveText(content: KlioContent, key: string): string | undefined {
  const parts = key.split('.');
  if (parts[0] === 'source') {
    const src = content.trumpSources.trumpSources.find((s) => s.id === parts[1]);
    return src?.text[parts[2] as 'why' | 'levelWhy'];
  }
  return lookup(content.texts, parts);
}

/** Schlüssel dürfen selbst Punkte enthalten (Rechte wie `cards.move`): fehlt ein Teil, gilt der Rest als ein Schlüssel. */
function lookup(node: string | TextTree | undefined, parts: string[]): string | undefined {
  if (parts.length === 0) return typeof node === 'string' ? node : undefined;
  if (typeof node !== 'object') return undefined;
  const next = node[parts[0]!];
  if (next !== undefined) return lookup(next, parts.slice(1));
  const flat = node[parts.join('.')];
  return typeof flat === 'string' ? flat : undefined;
}
