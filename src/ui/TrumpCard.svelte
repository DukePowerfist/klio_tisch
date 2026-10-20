<script lang="ts">
  // Trumpfkarte wie bisher: Attributfarben (Verlauf bei mehreren), Stufe als römische Zahl und Rahmenstärke.
  import type { Trump } from '../rules/klio/blocks';
  import { t } from './texts';

  let { trump, size = 'slot' }: { trump: Trump; size?: 'slot' | 'list' | 'large' } = $props();

  const COLOR = { K: '#a8412d', V: '#2d5aa8', P: '#7a3aa0' } as const;
  const BORDER = [0, 2, 3.5, 5];

  const colors = $derived(trump.attributes.map((a) => COLOR[a]));
  const fill = $derived(colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : `linear-gradient(${colors[0]}, ${colors[0]})`);
  const label = $derived(trump.attributes.length === 3 ? t('trumps.allAttributes') : trump.attributes.map((a) => t(`attributes.${a}`).toUpperCase()).join(' · '));

  // Text verkleinern, bis er passt (wie bisher, in halben Pixeln bis 7 px)
  let body = $state<HTMLDivElement>();
  $effect(() => {
    if (!body || size !== 'slot') return;
    void trump.text;
    let f = 11.5;
    body.style.fontSize = `${f}px`;
    while (body.scrollHeight > body.clientHeight + 1 && f > 7) body.style.fontSize = `${(f -= 0.5)}px`;
  });
</script>

<div class="tcard {size}" style:--tc={fill} style:--bw="{BORDER[trump.level]}px">
  <div class="tg"><span>{label}</span><b>{t(`trumps.levels.${trump.level}`)}</b></div>
  <div class="tn">{trump.name}</div>
  <div class="tr" bind:this={body}>{trump.text}</div>
</div>

<style>
  .tcard { position: relative; width: 100%; height: 100%; box-sizing: border-box; border: var(--bw) solid transparent; border-radius: 8px; background: linear-gradient(#fffdf7, #fffdf7) padding-box, var(--tc) border-box; overflow: hidden; font-family: system-ui, sans-serif; color: #1b1b1b; display: flex; flex-direction: column; }
  .tg { background: var(--tc); color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35); }
  .tg b { font-size: 12px; letter-spacing: 0.02em; }
  .tn { font-weight: 700; font-size: 13.5px; line-height: 1.15; padding: 4px 22px 0 6px; }
  .tr { padding: 3px 6px 5px; line-height: 1.22; flex: 1; min-height: 0; overflow: hidden; }
  .list { height: auto; min-height: 150px; }
  .list .tg { font-size: 11px; } .list .tg b { font-size: 14px; }
  .list .tn { font-size: 16px; padding: 6px 9px 0; }
  .list .tr { font-size: 13px; padding: 4px 9px 8px; }
  .large { width: min(420px, 90vw); height: auto; min-height: 300px; border-radius: 14px; }
  .large .tg { font-size: 14px; padding: 6px 12px; } .large .tg b { font-size: 20px; }
  .large .tn { font-size: 26px; padding: 12px 16px 0; }
  .large .tr { font-size: 19px; line-height: 1.35; padding: 8px 16px 18px; }
</style>
