<script lang="ts">
  // Charakterbogen, Haut „Papier“ (Schritt 3b füllt Felder, Trümpfe und Knöpfe).
  import content from 'virtual:klio-content';
  import type { KlioSheet } from '../rules/klio/state';
  import { SHEET_W, type SheetBox } from './layout';

  let { box, sheet }: { box: SheetBox; sheet: KlioSheet } = $props();

  const [imgW, imgH] = content.skinPaper.size;
  const k = $derived((SHEET_W * box.scale) / imgW);
  const image = $derived(`${import.meta.env.BASE_URL}assets/${content.skinPaper.images[sheet.variant]}`);
</script>

<div class="sheet" class:dead={sheet.dead} data-sheet={box.seat} style:left="{box.x}px" style:top="{box.y}px" style:width="{box.w}px" style:height="{box.h}px" style:opacity={box.opacity}>
  <div class="paper" style:width="{imgW}px" style:height="{imgH}px" style:transform="scale({k})" style:background-image="url({image})"></div>
</div>

<style>
  .sheet { position: absolute; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5); background: #fff; transition: left 0.35s, top 0.35s, width 0.35s, height 0.35s, opacity 0.35s; }
  .paper { position: absolute; left: 0; top: 0; transform-origin: 0 0; background: center / 100% 100% no-repeat; transition: transform 0.35s; }
</style>
