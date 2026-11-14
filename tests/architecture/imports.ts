// Relative Importe aus Quelltext lesen; für die Schichtgrenzen und die Importe der Vite-Konfiguration.

/** Ziele aller relativen Importe: `import … from`, `export … from`, `import('…')` und `import '…'` (nur Wirkung) */
export function relativeImports(source: string): string[] {
  const re = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|import\s*['"](\.[^'"]+)['"]/g;
  return [...source.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3]!);
}
