<script lang="ts">
  import type { Layout } from './layout';
  import { t } from './texts';

  let { layout }: { layout: Layout } = $props();

  const middle = $derived(layout.middle);
  const difficultyY = $derived(layout.zones['diamonds_easy']!.y - middle.y - 38);
  const resistanceY = $derived(layout.resistTitle.y - middle.y + 7);
  const target = $derived(layout.zones['display']!);
  const targetX = $derived(target.x - middle.x + target.w / 2);
  const targetY = $derived(target.y - middle.y + target.h / 2);
</script>

<svg class="felt-markings" viewBox="0 0 {middle.w} {middle.h}" aria-hidden="true">
  <rect class="rim" x="20" y="20" width={middle.w - 40} height={middle.h - 40} rx="38" />
  <path class="rule" d="M {middle.w / 2 - 144} 48 h 76 m 136 0 h 76" />
  <text class="wordmark" x={middle.w / 2} y="55">KLIO</text>
  <text class="subtitle" x={middle.w / 2} y="74">{t('zones.tableTitle')}</text>
  <path class="rule" d="M 72 {difficultyY} H 238 M {middle.w - 238} {difficultyY} H {middle.w - 72}" />
  <text class="heading" x={middle.w / 2} y={difficultyY + 4}>{t('zones.difficultyTitle')}</text>
  <path class="target" d="M {targetX} {targetY - 17} l 11 17 -11 17 -11 -17 Z" />
  <path class="rule" d="M 220 {resistanceY} H {middle.w - 72}" />
  <path class="ornament" d="M {middle.w / 2 - 6} {middle.h - 44} l 6 -6 6 6 -6 6 Z" />
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
