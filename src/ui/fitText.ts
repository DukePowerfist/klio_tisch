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
