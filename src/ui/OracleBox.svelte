<script lang="ts">
  // Kartenschachtel des Orakels (Schritt 5zb, ARCHITEKTUR.md 10.12): die Schachtel des Spieldecks, ragt unter Kreuz vom
  // unteren Bildschirmrand herein. Die zwei Karten des letzten Orakels stecken gerade darin, die hintere ragt weiter
  // heraus; auf jedem Rand ein Wort, ohne Farbe und Wert. Ein Bild für die Schachtel: Die Karten liegen darüber, sind
  // aber auf die Fläche über der Öffnung und die Daumenkerbe zugeschnitten (Maske), so scheinen sie darin zu stecken.
  // Auf kleinen Bildschirmen größer, damit die Wörter mindestens 12 px groß sind (S3); ausgewichen wird immer mit dem
  // größten Maßstab (T1, layout.ts).
  import content from 'virtual:klio-content';
  import { oracleRect, oracleScale, type Layout } from './layout';
  import { HAND_FONT } from './fonts';
  import { shadowCss, shadowOver, stackHeight } from './light';
  import { session } from './session.svelte';
  import { t } from './texts';

  let { layout, fitScale, flame }: { layout: Layout; fitScale: number; flame: Layout['lamp']['flame'] | null } = $props();

  const O = content.layouts.middle.oracle;
  const [W, H] = O.size;
  const base = import.meta.env.BASE_URL;
  const boxImage = `${base}assets/cards/oracle-box.webp`;
  const cardImage = `${base}assets/cards/oracle.webp`;
  const [CW, CH] = content.layouts.card;
  /** Raum über dem Bild für die herausragenden Karten (in Bildpunkten der Schachtel, TP bei Maßstab 1) */
  const ABOVE = 40;

  const scale = $derived(oracleScale(O, fitScale));
  const rect = $derived(oracleRect(O, layout.oracle, scale));
  const oracle = $derived(session.state?.game.oracle ?? null);
  const words = $derived(oracle ? oracle.map((d) => content.expedition.oracle[d.suit][d.rank]) : []);
  const label = $derived(t('gm.oracleShows', { words: words.length ? words.join(', ') : t('gm.oracleNone') }));
  /** flacher Schatten wie ein Stapel, nur unter der Vorderseite (ab der Öffnung) */
  const body = $derived({ x: rect.x, y: rect.y + O.opening * scale, w: rect.w, h: rect.h - O.opening * scale });
  const shadow = $derived(shadowCss(shadowOver(flame, body, stackHeight(1))));

  /** Maske der Karten in ihrer Hülle (oben ABOVE höher als das Bild): alles über der Öffnung, dazu die Kerbe */
  const [n0, n1, depth] = O.notch;
  const top = O.opening + ABOVE;
  const clip = `path('M0 0 H${W} V${top} H0 Z M${n0} ${top} A${(n1 - n0) / 2} ${depth} 0 0 0 ${n1} ${top} Z')`;
  /** Oberkante der Karten in der Hülle: hintere `out[0]`, vordere `out[1]` über der Öffnung */
  const cardTop = (out: number) => top - out;
  const [bx, by, bw, bh] = O.band;
</script>

<div class="oracle" role="img" aria-label={label} data-oracle-box data-toast-avoid
  style:left="{rect.x}px" style:top="{rect.y}px" style:width="{rect.w}px" style:height="{rect.h}px">
  <div class="inner" style:width="{W}px" style:height="{H}px" style:scale={scale}>
    <div class="shadow" style:top="{O.opening}px" style:box-shadow={shadow}></div>
    <img class="box" src={boxImage} alt="" draggable="false" />
    <div class="cards" style:top="{-ABOVE}px" style:width="{W}px" style:height="{H + ABOVE}px" style:clip-path={clip}>
      {#each words as word, i (i)}
        <div class="card" data-oracle-card={i} style:left="{(W - CW) / 2}px" style:top="{cardTop(O.out[i]!)}px" style:width="{CW}px" style:height="{CH}px" style:background-image="url({cardImage})">
          <span class="word" style:left="{bx}px" style:top="{by}px" style:width="{bw}px" style:height="{bh}px" style:font-size="{O.word}px" style:font-family={HAND_FONT}>{word}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  /* über den Zonen, unter frei liegenden Karten und dem Licht, wie das Blatt */
  .oracle { position: absolute; z-index: 6; pointer-events: none; }
  .inner { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .shadow { position: absolute; left: 3px; right: 3px; bottom: 0; border-radius: 6px; }
  .box { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; }
  .cards { position: absolute; left: 0; }
  .card { position: absolute; background-size: 100% 100%; }
  .word { position: absolute; display: flex; align-items: center; justify-content: center; color: var(--sheet-ink); line-height: 1; white-space: nowrap; overflow: hidden; }
</style>
