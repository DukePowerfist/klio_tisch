<script lang="ts">
  // Aufdruck auf dem Filz: Wortmarke, Überschriften mit Strichen, Raute unter dem Zielwert. Liegt unter allen Zonen,
  // nimmt keine Klicks an. Maße in Tischpunkten ab der Ecke des Filzes; die Striche sind auf die deutschen Texte
  // abgestimmt (längere Überschriften brauchen größere Lücken).
  import type { Layout } from './layout';
  import { t } from './texts';

  let { layout }: { layout: Layout } = $props();

  /** Abstand des Rahmens vom Filzrand und Abstand der Striche von den Seiten */
  const RIM = 20;
  const SIDE = 72;
  /** Wortmarke: Grundlinie, Länge der Striche daneben und Lücke für „KLIO“ */
  const WORD_Y = 55;
  const WORD_RULE = 76;
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
</script>

<svg class="felt-markings" viewBox="0 0 {middle.w} {middle.h}" aria-hidden="true">
  <rect class="rim" x={RIM} y={RIM} width={middle.w - 2 * RIM} height={middle.h - 2 * RIM} rx="38" />
  <path class="rule" d="M {mid - WORD_GAP / 2 - WORD_RULE} {WORD_Y - 7} h {WORD_RULE} m {WORD_GAP} 0 h {WORD_RULE}" />
  <text class="wordmark" x={mid} dx={center(7)} y={WORD_Y}>KLIO</text>
  <text class="subtitle" x={mid} dx={center(2.7)} y={WORD_Y + 19}>{t('zones.feltTable')}</text>
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
