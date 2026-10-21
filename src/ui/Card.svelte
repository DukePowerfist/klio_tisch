<script lang="ts">
  // Eine Spielkarte. Lage, Drehung und Größe kommen von außen (layouts.yaml). Drei Ebenen (11.4): `.card` trägt die
  // Endlage, `.lift` Anheben und Stoß, `.inner` das Umklappen; die Bewegung dorthin plant motion.ts.
  import { untrack } from 'svelte';
  import { suitOf } from '../engine/schemas';
  import type { CardId } from '../engine/types';
  import { appear, cause, cue, cut, events, fade, move, revealed, strike, Tilt, timing, turn } from './animator.svelte';
  import { arrival, planMove, planTurn, type Frame } from './motion';
  import { isRed, rankLabel, SUIT_SYMBOL } from './texts';

  let { card, x, y, scale, rotated, z, faceUp, size, slot = '', dragging = false, pending = false, mark, still = false }: {
    card: CardId; x: number; y: number; scale: number; rotated: boolean; z: number; faceUp: boolean;
    size: { w: number; h: number };
    /** Platz im Stand (`CardPlace.slot`) */
    slot?: string;
    dragging?: boolean; pending?: boolean;
    /** Farbe, wenn jemand anderes die Karte gerade zieht; sie folgt dann dessen Zeiger (8.3) */
    mark?: string | undefined;
    /** ohne Animation (Vorschau) */
    still?: boolean;
  } = $props();

  /** angehoben: selbst oder von jemand anderem gezogen */
  const lifted = $derived(dragging || !!mark);
  const suit = $derived(SUIT_SYMBOL[suitOf(card)]);
  const rank = $derived(rankLabel(card));
  // gedreht: um die linke obere Ecke drehen und um die Kartenhöhe nach rechts schieben (wie bisher). Immer derselbe
  // Aufbau, damit Lage, Drehung und Größe beim Übergang einzeln mitgehen (11.4)
  const transform = $derived(`translate(${rotated ? x + size.h * scale : x}px, ${y}px) rotate(${rotated ? 90 : 0}deg) scale(${scale})`);

  let el: HTMLDivElement;
  let lift: HTMLDivElement;
  let inner: HTMLDivElement;
  const tilt = new Tilt(() => lift);
  /** Farbe der Person, die die Karte zuletzt gezogen hat: Leuchten am Ziel nach dem Loslassen */
  let lastMark = $state<string | undefined>();
  /** zuletzt gezeigt (nicht reaktiv): Ausgangspunkt der nächsten Bewegung; `arrives`: Zeitpunkt, zu dem eine gerade
   *  begonnene Bewegung am Ziel ist (Aufdecken wartet darauf) */
  let shown: { frame: Frame; transform: string; faceUp: boolean; arrives: number } | null = null;
  $effect(() => {
    const frame: Frame = { x, y, scale, rotated, slot, follow: dragging ? 'own' : mark ? 'remote' : null };
    const to = transform;
    untrack(() => {
      let arrives = shown?.arrives ?? 0;
      if (shown && !still) {
        const t = timing();
        const motion = planMove(shown.frame, frame, t, cause(), cue(card));
        move(el, lift, shown.transform, motion, z);
        if (motion?.kind === 'glide') arrives = performance.now() + arrival(motion, t);
        if (frame.follow) tilt.track(x);
        else if (shown.frame.follow) tilt.release();
      }
      if (mark) lastMark = mark;
      shown = { frame, transform: to, faceUp: shown?.faceUp ?? faceUp, arrives };
    });
  });
  // Abheben und Stoß kommen aus den Ereignissen, auch wenn sich die Lage nicht ändert (nach den Bewegungen oben)
  $effect(() => {
    void events.seen;
    untrack(() => {
      const c = still ? undefined : cue(card);
      if (c?.cut) cut(el, lift, c.cut, z, Number(slot.split('#')[1] ?? 0), size.w * scale);
      if (c?.strike !== undefined) strike(el, lift, c.strike);
    });
  });
  $effect(() => () => tilt.stop());
  $effect(() => {
    const up = faceUp;
    untrack(() => {
      if (shown && shown.faceUp !== up && !still) {
        const arrive = Math.max(0, Math.round(shown.arrives - performance.now()));
        const t = timing();
        const plan = planTurn(shown.faceUp, up, t, arrive, cue(card));
        const spin = turn(inner, lift, up, plan);
        // Stufe „Aus“: mit der neuen Seite einblenden
        if (!plan) fade(el, t.fade);
        if (up) revealed(card, spin);
      }
      if (shown) shown.faceUp = up;
    });
  });
  // Rückseite: Bild mit eigenem Rand und abgerundeten Ecken (public/assets/cards)
  const back = `url(${import.meta.env.BASE_URL}assets/cards/back.webp)`;
</script>

<div bind:this={el} transition:appear={{ still }} class="card" class:dragging class:pending class:red={isRed(card)} class:marked={!!mark} style:--mark={mark} style:--glow-c={lastMark} style:width="{size.w}px" style:height="{size.h}px" style:transform style:z-index={lifted ? 400000 + z : z} data-card={card}>
  <div bind:this={lift} class="lift">
  <div bind:this={inner} class="inner" class:down={!faceUp}>
    <div class="face front">
      <div class="corner">{rank}<br />{suit}</div>
      <div class="pip">{suit}</div>
      <div class="corner bottom">{rank}<br />{suit}</div>
      <div class="glint"></div>
    </div>
    <div class="face back" style:background-image={back}><div class="glint"></div></div>
  </div>
  </div>
</div>

<style>
  .card { --lift: 0 8px 18px rgba(0, 0, 0, 0.5); position: absolute; left: 0; top: 0; transform-origin: 0 0; touch-action: none; user-select: none; cursor: grab; }
  .card.dragging { cursor: grabbing; }
  .card.pending { opacity: 0.8; }
  /* Anheben: etwas größer, Schatten des Flugs (::before) darunter, Leuchten nach fremdem Zug (::after) darüber */
  .lift { position: relative; width: 100%; height: 100%; perspective: 600px; transition: scale var(--grab) ease-out; }
  .lift::before, .lift::after { content: ''; position: absolute; inset: 0; border-radius: 7px; opacity: 0; pointer-events: none; transition: opacity var(--grab); }
  .lift::before { box-shadow: var(--lift); }
  .lift::after { box-shadow: 0 0 0 3px var(--glow-c, transparent), 0 0 14px 2px var(--glow-c, transparent); }
  .dragging .lift, .marked .lift { scale: 1.04; }
  .dragging .lift::before, .marked .lift::before { opacity: 1; }
  .inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
  .inner.down { rotate: y 180deg; }
  .face { position: absolute; inset: 0; border-radius: 7px; backface-visibility: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55); box-sizing: border-box; }
  .marked .face { box-shadow: 0 0 0 3px var(--mark); }
  .front { background: var(--card); color: var(--card-black); }
  .red .front { color: var(--card-red); }
  .back { transform: rotateY(180deg); background: center / 100% 100% no-repeat; }
  .corner { position: absolute; left: 6px; top: 4px; font: 700 16px/1.05 Georgia, serif; text-align: center; }
  .corner.bottom { left: auto; top: auto; right: 6px; bottom: 4px; transform: rotate(180deg); }
  .pip { position: absolute; inset: 0; display: grid; place-items: center; font-size: 46px; }
  /* Glanz beim Umklappen: schräger heller Streifen, läuft über die Fläche (animator.svelte.ts) */
  .glint { position: absolute; inset: 0; border-radius: inherit; opacity: 0; pointer-events: none; background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.45) 50%, transparent 65%) 100% 0 / 300% 100% no-repeat; }
</style>
