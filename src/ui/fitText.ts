// Textgröße messen statt schätzen (ARCHITEKTUR.md 10): so groß wie vorgesehen, kleiner, wenn es nicht passt.

export const SHEET_FONT = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const MIN = 9;
let ctx: CanvasRenderingContext2D | null = null;

/** Schriftgröße, bei der `text` in `width` Pixel passt (höchstens `base`, mindestens 9). */
export function fitFontSize(text: string, width: number, base: number): number {
  if (!text) return base;
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return base;
  ctx.font = `${base}px ${SHEET_FONT}`;
  const w = ctx.measureText(text).width;
  return w <= width ? base : Math.max(MIN, Math.floor((base * width) / w * 10) / 10);
}
