<script lang="ts">
  // Trumpfkarte (10.20, Schritt 5zo): Kopfband in den Attributfarben, je Attribut ein Segment mit seinem Namen (bei
  // drei Attributen „JEDES ATTRIBUT“ über allen), rechts die Eckmarke mit der Stufe. Dazu je Stufe ein Rahmenbild:
  // I einfache Linie, II Doppellinie, III kräftige Doppellinie mit Ecken. Farben und Linienstärken sind
  // Gestaltungswerte (theme.css). Kartenkörper (5zp): leichter Papierton, Name und Stufe in Serifenschrift.
  import type { Trump } from '../rules/klio/blocks';
  import { t } from './texts';

  let { trump, size = 'slot' }: { trump: Trump; size?: 'slot' | 'list' | 'large' } = $props();

  const count = $derived(trump.attributes.length);

  // Im Feld: Text höchstens bis SLOT_MIN verkleinern (in halben Pixeln); passt er dann noch nicht, läuft er unten
  // weich aus. Der volle Text steht in der Großansicht. In der Liste und der Großansicht bleibt er immer ganz.
  const SLOT_MAX = 10.5;
  const SLOT_MIN = 9;
  let body = $state<HTMLDivElement>();
  let cut = $state(false);
  $effect(() => {
    if (!body || size !== 'slot') return;
    void trump.text;
    let f = SLOT_MAX;
    body.style.fontSize = `${f}px`;
    while (body.scrollHeight > body.clientHeight + 1 && f > SLOT_MIN) body.style.fontSize = `${(f -= 0.5)}px`;
    cut = body.scrollHeight > body.clientHeight + 1;
  });
</script>

<div class="tcard {size} l{trump.level} a{count}">
  <div class="in">
    <div class="tg">
      <div class="segs">
        {#each trump.attributes as a (a)}
          <span class="seg" style:background="var(--attr-{a})">{count === 3 ? '' : t(`attributes.${a}`).toUpperCase()}</span>
        {/each}
        {#if count === 3}<span class="all">{t('trumps.allAttributes')}</span>{/if}
      </div>
      <b>{t(`numerals.${trump.level}`)}</b>
    </div>
    <div class="tn">{trump.name}</div>
    <div class="tr" class:cut bind:this={body}>{trump.text}</div>
  </div>
</div>

<style>
  /* Maße je Größe: --bw Außenlinie, --fp Abstand bis zur Innenlinie, --hh Höhe des Kopfbands, --tab Breite der Eckmarke */
  .tcard { --bw: var(--trump-line); --fp: 2px; --hh: 19px; --tab: 21px; --rad: var(--radius-m); --lf: 9.5px; --nf: 11.5px;
    position: relative; width: 100%; height: 100%; box-sizing: border-box; display: flex; border: var(--bw) solid var(--trump-ink); border-radius: var(--rad); padding: var(--fp); background: linear-gradient(var(--trump-paper-top), var(--trump-paper-bottom)); overflow: hidden; font-family: system-ui, sans-serif; color: var(--sheet-ink); }
  .in { position: relative; flex: 1; min-width: 0; box-sizing: border-box; display: flex; flex-direction: column; border: 1px solid transparent; border-radius: calc(var(--rad) - var(--fp) - 1px); overflow: hidden; }
  .l2 .in, .l3 .in { border-color: var(--trump-ink); }
  .l3 { --bw: var(--trump-line-3); }
  /* Ecken der Stufe III: vier kleine Flächen über den Ecken der Innenlinie */
  .l3::after { content: ''; position: absolute; inset: calc(var(--fp) - 1.5px); pointer-events: none; --c: calc(var(--fp) + 4px); border-radius: 2px;
    background: linear-gradient(var(--trump-ink), var(--trump-ink)) 0 0 / var(--c) var(--c) no-repeat, linear-gradient(var(--trump-ink), var(--trump-ink)) 100% 0 / var(--c) var(--c) no-repeat,
      linear-gradient(var(--trump-ink), var(--trump-ink)) 0 100% / var(--c) var(--c) no-repeat, linear-gradient(var(--trump-ink), var(--trump-ink)) 100% 100% / var(--c) var(--c) no-repeat; }
  .tg { flex: none; height: var(--hh); display: flex; color: #fff; font-size: var(--lf); font-weight: 700; letter-spacing: 0.06em; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35); }
  .segs { position: relative; flex: 1; min-width: 0; display: flex; }
  .seg { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden; }
  .a1 .seg { justify-content: flex-start; padding: 0 5px; }
  .all { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; white-space: nowrap; }
  .tg b { flex: none; width: var(--tab); display: flex; align-items: center; justify-content: center; background: var(--trump-ink); border-left: 1px solid rgba(255, 255, 255, 0.55); font-family: var(--trump-serif); font-size: var(--nf); letter-spacing: 0.02em; text-shadow: none; }
  .tn { flex: none; font-family: var(--trump-serif); font-weight: 700; font-size: 13.5px; line-height: 1.15; padding: 4px 19px 0 5px; }
  .tr { flex: 1; min-height: 0; overflow: hidden; line-height: 1.24; padding: 3px 5px; }
  .tr.cut { -webkit-mask-image: linear-gradient(#000 calc(100% - 26px), transparent calc(100% - 2px)); mask-image: linear-gradient(#000 calc(100% - 26px), transparent calc(100% - 2px)); }
  .slot { box-shadow: var(--trump-shadow); }
  .slot.a2 { --lf: 7.2px; }
  .slot.a3 { --lf: 8.6px; }
  .list { --fp: 3px; --hh: 24px; --tab: 28px; --lf: 11px; --nf: 14px; height: auto; min-height: 150px; }
  .list.a1 .seg { padding: 0 8px; }
  .list .tn { font-size: 16px; padding: 6px 9px 0; }
  .list .tr { font-size: 13px; line-height: 1.22; padding: 4px 9px 8px; overflow: visible; }
  .large { --bw: calc(var(--trump-line) + 0.5px); --fp: 5px; --hh: 36px; --tab: 44px; --lf: 14px; --nf: 20px; --rad: var(--radius-win); width: min(420px, 90vw); height: auto; min-height: 300px; }
  .large.l3 { --bw: calc(var(--trump-line-3) + 1px); }
  .large.a1 .seg { padding: 0 12px; }
  .large .tn { font-size: 26px; padding: 12px 16px 0; }
  .large .tr { font-size: 19px; line-height: 1.35; padding: 8px 16px 18px; overflow: visible; }
</style>
