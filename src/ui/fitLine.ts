// Einzeilige Beschriftung an ihre Breite anpassen: Namen im Kopfband der Trumpfkarte, „Trumpf wählen“ der Geisterkarte.
// Die Größen in theme.css und den Komponenten sind an den Schriften des Entwicklungsrechners ausgemessen; die
// Systemschrift und die Serifenschrift (--trump-serif) fallen je Rechner anders aus und laufen teils deutlich breiter
// (DejaVu unter Linux, Georgia unter Windows). Statt abzuschneiden, wird die Schrift dann schrittweise kleiner.

import type { Attachment } from 'svelte/attachments';

/** `text`: der gezeigte Text (ändert er sich, wird neu gemessen); `min`: kleinste Schriftgröße in px */
export const fitLine = (_text: string, min: number): Attachment<HTMLElement> => (el) => {
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && size > min) el.style.fontSize = `${(size -= 0.25)}px`;
};
