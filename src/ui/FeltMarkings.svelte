<script lang="ts">
  // Aufdruck auf dem Filz: Rahmen mit der Wortmarke in seiner oberen Linie, Überschriften mit Strichen, Raute unter dem Zielwert. Liegt unter allen Zonen,
  // nimmt keine Klicks an. Maße in Tischpunkten ab der Ecke des Filzes; die Striche sind auf die deutschen Texte
  // abgestimmt (längere Überschriften brauchen größere Lücken).
  import type { Layout } from './layout';
  import { t } from './texts';

  let { layout }: { layout: Layout } = $props();

  /** Abstand des Rahmens vom Filzrand und Abstand der Striche von den Seiten */
  const RIM = 20;
  const SIDE = 72;
  /** Rundung der Ecken des Rahmens */
  const RIM_R = 38;
  /** Wortmarke: steht mittig auf der oberen Rahmenlinie, die für „KLIO“ eine Lücke lässt; Grundlinie so, dass die
   *  Großbuchstaben (etwa 18 hoch) auf der Linie zentriert sind */
  const WORD_Y = RIM + 9;
  const WORD_GAP = 136;
  /** Überschrift „Schwierigkeit“: Abstand über den Karo-Stapeln, Lücke der Striche für den Text */
  const DIFFICULTY_ABOVE = 38;
  const DIFFICULTY_GAP = 224;
  /** Strich hinter „Widerstände“: Höhe unter der Oberkante des Titels, Beginn ab dem Filzrand */
  const RESIST_DOWN = 7;
  const RESIST_FROM = 220;
  /** SVG rechnet den Buchstabenabstand auch hinter dem letzten Zeichen mit: um die Hälfte nach rechts, dann sitzt
   *  der Text mittig (gleiche Werte wie im CSS unten) */
  const center = (spacing: number) => spacing / 2;

  const middle = $derived(layout.middle);
  const mid = $derived(middle.w / 2);
  const difficultyY = $derived(layout.zones['diamonds_easy']!.y - middle.y - DIFFICULTY_ABOVE);
  const resistanceY = $derived(layout.resistTitle.y - middle.y + RESIST_DOWN);
  const target = $derived(layout.zones['display']!);
  const targetX = $derived(target.x - middle.x + target.w / 2);
  const targetY = $derived(target.y - middle.y + target.h / 2);
  /** Rahmen als Pfad, beginnt rechts der Lücke und läuft im Uhrzeigersinn bis links der Lücke */
  const rim = $derived.by(() => {
    const [x0, y0, x1, y1, r] = [RIM, RIM, middle.w - RIM, middle.h - RIM, RIM_R];
    const arc = (x: number, y: number) => `A ${r} ${r} 0 0 1 ${x} ${y}`;
    return `M ${mid + WORD_GAP / 2} ${y0} H ${x1 - r} ${arc(x1, y0 + r)} V ${y1 - r} ${arc(x1 - r, y1)} H ${x0 + r} ${arc(x0, y1 - r)} V ${y0 + r} ${arc(x0 + r, y0)} H ${mid - WORD_GAP / 2}`;
  });
</script>

<svg class="felt-markings" viewBox="0 0 {middle.w} {middle.h}" aria-hidden="true">
  <path class="rim" d={rim} />
  <text class="wordmark" x={mid} dx={center(7)} y={WORD_Y}>KLIO</text>
  <text class="subtitle" x={mid} dx={center(2.7)} y={WORD_Y + 14}>{t('zones.feltTable')}</text>
  <path class="rule" d="M {SIDE} {difficultyY} H {mid - DIFFICULTY_GAP / 2} M {mid + DIFFICULTY_GAP / 2} {difficultyY} H {middle.w - SIDE}" />
  <text class="heading" x={mid} dx={center(2)} y={difficultyY + 4}>{t('zones.feltDifficulty')}</text>
  <path class="target" d="M {targetX} {targetY - 17} l 11 17 -11 17 -11 -17 Z" />
  <path class="rule" d="M {RESIST_FROM} {resistanceY} H {middle.w - SIDE}" />
  <path class="ornament" d="M {mid - 6} {middle.h - 44} l 6 -6 6 6 -6 6 Z" />
</svg>

<style>
  .felt-markings { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; color: var(--felt-print); }
  .rim, .rule, .target, .ornament { fill: none; stroke: currentColor; stroke-width: 1; }
  .rim { opacity: 0.26; }
  .rule { opacity: 0.4; }
  .target { opacity: 0.25; }
  .ornament { opacity: 0.45; }
  text { fill: currentColor; text-anchor: middle; }
  .wordmark { font-family: Georgia, serif; font-size: 26px; letter-spacing: 7px; }
  .subtitle { font-size: 8px; letter-spacing: 2.7px; opacity: 0.65; }
  .heading { font-size: 11px; font-weight: 600; letter-spacing: 2px; opacity: 0.85; }
</style>
