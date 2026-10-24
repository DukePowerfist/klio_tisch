// Mitgelieferte Handschrift für Expeditionsblatt und Orakelkarten (Schritt 5zb, F7, ARCHITEKTUR.md 10.12):
// „Patrick Hand“ (SIL Open Font License, public/assets/fonts/), auf jedem System gleich, damit Messen und Tests für
// alle gelten. Über die FontFace-API geladen, weil der Pfad am Basispfad hängt (wie Holz und Filz in Board.svelte).

/** Schriftfamilie samt Ersatz, falls sie nicht lädt */
export const HAND_FONT = '"Patrick Hand", "Segoe Print", "Comic Sans MS", cursive';

let loaded: Promise<void> | null = null;

/** Schrift einmal laden; erfüllt sich auch, wenn sie nicht lädt (dann gilt der Ersatz) */
export function handFont(): Promise<void> {
  if (loaded) return loaded;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return (loaded = Promise.resolve());
  const face = new FontFace('Patrick Hand', `url(${import.meta.env.BASE_URL}assets/fonts/patrick-hand.woff2) format("woff2")`, { display: 'block' });
  document.fonts.add(face);
  loaded = face.load().then(() => undefined, () => undefined);
  return loaded;
}
