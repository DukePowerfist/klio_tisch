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
  let node: string | TextTree | undefined = content.texts;
  for (const p of parts) node = typeof node === 'object' ? node[p] : undefined;
  return typeof node === 'string' ? node : undefined;
}
