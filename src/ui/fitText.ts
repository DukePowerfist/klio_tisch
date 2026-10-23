// Textgröße messen statt schätzen (ARCHITEKTUR.md 10): so groß wie vorgesehen, kleiner, wenn es nicht passt.

export const SHEET_FONT = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const MIN = 9;
let ctx: CanvasRenderingContext2D | null = null;

/** Schriftgröße, bei der `text` in `width` Pixel passt (höchstens `base`, mindestens 9); `cut`: passt auch in der
 *  kleinsten Größe nicht, das Feld schneidet ab (5z, Feldfenster). `weight` wie in CSS, etwa 600 für halbfett. */
export function fitText(text: string, width: number, base: number, weight: number | 'normal' = 'normal'): { size: number; cut: boolean } {
  if (!text) return { size: base, cut: false };
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return { size: base, cut: false };
  ctx.font = `${weight} ${base}px ${SHEET_FONT}`;
  const w = ctx.measureText(text).width;
  if (w <= width) return { size: base, cut: false };
  return { size: Math.max(MIN, Math.floor((base * width) / w * 10) / 10), cut: (w * MIN) / base > width };
}
