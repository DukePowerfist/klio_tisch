// Textgröße messen statt schätzen (ARCHITEKTUR.md 10): so groß wie vorgesehen, kleiner, wenn es nicht passt.

export const SHEET_FONT = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const MIN = 9;
let ctx: CanvasRenderingContext2D | null = null;
type Weight = number | 'normal';

/** Breite von `text` in der Bogenschrift; null ohne Canvas */
export function textWidth(text: string, size: number, weight: Weight = 'normal'): number | null {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.font = `${weight} ${size}px ${SHEET_FONT}`;
  return ctx.measureText(text).width;
}

/** Schriftgröße, bei der `text` in `width` Pixel passt (höchstens `base`, mindestens 9); `cut`: passt auch in der
 *  kleinsten Größe nicht, das Feld schneidet ab (5z, Feldfenster). `weight` wie in CSS, etwa 600 für halbfett. */
export function fitText(text: string, width: number, base: number, weight: Weight = 'normal'): { size: number; cut: boolean } {
  if (!text) return { size: base, cut: false };
  const w = textWidth(text, base, weight);
  if (w === null) return { size: base, cut: false };
  if (w <= width) return { size: base, cut: false };
  return { size: Math.max(MIN, Math.floor((base * width) / w * 10) / 10), cut: (w * MIN) / base > width };
}

/** Mehrzeiliger Text in fester Höhe (5zb, 10.12, T2): größter Faktor `k` zwischen `min` und 1, bei dem der Inhalt von
 *  `el` nicht höher ist als `el` (gemessen über `scrollHeight`). `apply` setzt den Faktor (etwa als CSS-Variable der
 *  Schriftgröße). Passt es auch bei `min` nicht (etwa ohne die mitgelieferte Schrift), wird ausnahmsweise weiter
 *  verkleinert statt abgeschnitten, höchstens bis `min / 2`. */
export function fitBlock(el: HTMLElement, apply: (k: number) => void, min: number): number {
  const fits = (k: number) => {
    apply(k);
    return el.scrollHeight <= el.clientHeight + 0.5;
  };
  if (fits(1)) return 1;
  let [lo, hi] = fits(min) ? [min, 1] : [min / 2, min];
  if (hi === min && !fits(lo)) return lo;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  apply(lo);
  return lo;
}
