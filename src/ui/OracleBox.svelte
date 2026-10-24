<script lang="ts">
  // Kartenschachtel des Orakels (Schritt 5zb, ARCHITEKTUR.md 10.12): die Schachtel des Spieldecks, ragt unter Kreuz vom
  // unteren Bildschirmrand herein. Die zwei Karten des letzten Orakels stecken gerade darin, die hintere ragt weiter
  // heraus; auf jedem Rand ein Wort, ohne Farbe und Wert. Ein Bild für die Schachtel: Die Karten liegen darüber, sind
  // aber auf die Fläche über der Öffnung und die Daumenkerbe zugeschnitten (Maske), so scheinen sie darin zu stecken.
  // Auf kleinen Bildschirmen größer, damit die Wörter mindestens 12 px groß sind (S3); ausgewichen wird immer mit dem
  // größten Maßstab (T1, layout.ts).
  // Mit Recht ein Knopf: Klick zieht ein neues Orakel. Mit dem Ereignis bei allen: die alten Karten sinken hinein, die
  // Schachtel wackelt, dann schiebt sich die hintere Karte heraus, danach die vordere; „Aus“ wechselt nur die Wörter.
  // Laden, Beitreten, Wiederherstellen: ohne Ereignis, also ohne Ablauf (wie die Laterne).
  import { tick, untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { timing } from './animator.svelte';
  import { submitOrSay } from './commands';
  import { HAND_FONT, handFont } from './fonts';
  import { oracleRect, oracleScale, type Layout } from './layout';
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
  /** Kennungen der Animationen (Tests) */
  const SINK = 'oracle-sink';
  const SHAKE = 'oracle-shake';
  const RISE = 'oracle-rise';

  const may = $derived(session.can({ type: 'gm.oracle' }));
  const scale = $derived(oracleScale(O, fitScale));
  const rect = $derived(oracleRect(O, layout.oracle, scale));
  type Draw = { suit: 'H' | 'S' | 'C'; rank: string };
  const wordsOf = (o: readonly Draw[] | null) => (o ? o.map((d) => content.expedition.oracle[d.suit][d.rank as '2']) : []);
  const current = $derived(wordsOf(session.state?.game.oracle ?? null));
  /** gezeigte Wörter: folgen dem Stand, während des Ablaufs erst nach dem Sinken */
  let shown = $state<string[]>(untrack(() => current));
  let running = 0;
  $effect(() => {
    const now = current;
    untrack(() => {
      if (!running) shown = now;
    });
  });

  const names = $derived(shown.length ? shown.join(', ') : t('gm.oracleNone'));
  const label = $derived(t(may ? 'gm.oracleDraw' : 'gm.oracleShows', { words: names }));
  /** flacher Schatten wie ein Stapel, nur unter der Vorderseite (ab der Öffnung) */
  const body = $derived({ x: rect.x, y: rect.y + O.opening * scale, w: rect.w, h: rect.h - O.opening * scale });
  const shadow = $derived(shadowCss(shadowOver(flame, body, stackHeight(1))));

  /** Maske der Karten in ihrer Hülle (oben ABOVE höher als das Bild): alles über der Öffnung, dazu die Kerbe */
  const [n0, n1, depth] = O.notch;
  const top = O.opening + ABOVE;
  const clip = `path('M0 0 H${W} V${top} H0 Z M${n0} ${top} A${(n1 - n0) / 2} ${depth} 0 0 0 ${n1} ${top} Z')`;
  /** Oberkante der Karten in der Hülle: hintere `out[0]`, vordere `out[1]` über der Öffnung */
  const cardTop = (out: number) => top - out;
  /** so weit sinkt eine Karte, bis sie ganz in der Schachtel steckt */
  const sunk = (i: number) => `0 ${O.out[i]! + 2}px`;
  const [bx, by, bw, bh] = O.band;

  let shakeEl: HTMLDivElement;
  let cardsEl: HTMLDivElement;
  const cardEls = () => [...cardsEl.querySelectorAll<HTMLElement>('[data-oracle-card]')];
  const tagged = (a: Animation, id: string) => ((a.id = id), a);
  const done = (as: Animation[]) => Promise.all(as.map((a) => a.finished.catch(() => undefined)));

  /** Ablauf zum Ereignis; ein neues Orakel mitten im Ablauf springt ans Ende des alten und beginnt neu */
  async function draw(next: string[]): Promise<void> {
    const run = ++running;
    for (const a of [...shakeEl.getAnimations(), ...cardsEl.getAnimations({ subtree: true })]) a.finish();
    const ms = timing();
    const stale = () => run !== running;
    if (!ms.oracleShake && !ms.oracleSink && !ms.oracleRise) {
      shown = next;
      if (!stale()) running = 0;
      return;
    }
    // alte Karten sinken in die Schachtel und bleiben dort, bis die neuen herauskommen
    const old = cardEls().map((el, i) => tagged(el.animate([{ translate: '0 0' }, { translate: sunk(i) }], { duration: ms.oracleSink, easing: 'ease-in', fill: 'forwards' }), SINK));
    await done(old);
    if (stale()) return;
    shown = next;
    await tick();
    if (stale()) return;
    const hold = cardEls().map((el, i) => el.animate([{ translate: sunk(i) }, { translate: sunk(i) }], { duration: 1, fill: 'forwards' }));
    for (const a of old) a.cancel();
    await done([tagged(shakeEl.animate([{ rotate: '0deg' }, { rotate: '-4deg' }, { rotate: '3.5deg' }, { rotate: '-2deg' }, { rotate: '1deg' }, { rotate: '0deg' }], { duration: ms.oracleShake, easing: 'ease-in-out' }), SHAKE)]);
    if (stale()) return;
    // hintere zuerst, die vordere versetzt
    const rise = cardEls().map((el, i) => tagged(el.animate([{ translate: sunk(i) }, { translate: '0 0' }], { duration: ms.oracleRise, delay: i * ms.oracleRise * 0.6, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' }), RISE));
    for (const a of hold) a.cancel();
    await done(rise);
    if (!stale()) running = 0;
  }

  $effect(() => session.onEvents((events) => {
    let last: Draw[] | null = null;
    for (const e of events) if (e.type === 'oracleDrawn') last = e.oracle as Draw[];
    if (last) {
      const next = wordsOf(last);
      untrack(() => void draw(next));
    }
  }));

  // die Wörter stehen in der mitgelieferten Handschrift (F7)
  $effect(() => void handFont());

  let sending = false;
  async function shake(e: MouseEvent): Promise<void> {
    // zweiter Klick eines Doppelklicks oder Befehl unterwegs: nicht noch einmal ziehen
    if (e.detail > 1 || sending) return;
    sending = true;
    await submitOrSay({ type: 'gm.oracle' });
    sending = false;
  }
</script>

<!-- mit Recht ein Knopf (Klasse `control`: kein Verschieben, kein Doppelklick-Zoom), sonst ein Bild mit Beschriftung -->
<svelte:element this={may ? 'button' : 'div'} class="oracle" class:control={may} role={may ? undefined : 'img'} aria-label={label} title={may ? label : undefined}
  onclick={may ? shake : undefined} data-oracle-box
  style:left="{rect.x}px" style:top="{rect.y}px" style:width="{rect.w}px" style:height="{rect.h}px"
  style:rotate="{O.tilt}deg" style:transform-origin="50% {layout.oracle.bottom - rect.y}px">
  <div class="inner" style:width="{W}px" style:height="{H}px" style:scale={scale}>
    <!-- Platz samt herausragender Karten: dem weicht die Meldung aus (das Knopfrechteck enthält die Karten nicht) -->
    <div class="reach" style:top="{O.opening - O.out[0]!}px" style:height="{H - O.opening + O.out[0]!}px" data-toast-avoid></div>
    <div class="shake" bind:this={shakeEl} style:transform-origin="50% {H}px">
      <div class="shadow" style:top="{O.opening}px" style:box-shadow={shadow}></div>
      <img class="box" src={boxImage} alt="" draggable="false" />
      <div class="cards" bind:this={cardsEl} style:top="{-ABOVE}px" style:width="{W}px" style:height="{H + ABOVE}px" style:clip-path={clip}>
        {#each shown as word, i (i)}
          <div class="card" data-oracle-card={i} style:left="{(W - CW) / 2}px" style:top="{cardTop(O.out[i]!)}px" style:width="{CW}px" style:height="{CH}px" style:background-image="url({cardImage})">
            <span class="word" style:left="{bx}px" style:top="{by}px" style:width="{bw}px" style:height="{bh}px" style:font-size="{O.word}px" style:font-family={HAND_FONT}>{word}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</svelte:element>

<style>
  /* über den Zonen und ihren Karten, knapp unter frei liegenden Karten und dem Licht, wie das Blatt */
  .oracle { position: absolute; z-index: 19990; padding: 0; border: 0; background: none; display: block; }
  div.oracle { pointer-events: none; }
  button.oracle { cursor: pointer; }
  button.oracle:focus:not(:focus-visible) { outline: none; }
  /* ein Gegenstand, kein Knopf: gibt beim Drücken nicht nach, sie wackelt ja ohnehin (wie die Laterne) */
  button.oracle:active { scale: none; }
  .inner { position: absolute; left: 0; top: 0; transform-origin: 0 0; transition: translate var(--hover) ease-out; }
  .shake { position: absolute; inset: 0; }
  .reach { position: absolute; left: 0; right: 0; pointer-events: none; }
  @media (hover: hover) {
    /* Hinweis „schütteln“: hebt sich leicht, nur mit Recht */
    button.oracle:hover .inner { translate: 0 -3px; }
  }
  .shadow { position: absolute; left: 3px; right: 3px; bottom: 0; border-radius: 6px; }
  .box { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; pointer-events: none; }
  .cards { position: absolute; left: 0; pointer-events: none; }
  /* mit Recht zählen auch die herausragenden Karten zum Knopf (die Maske schneidet auch die Trefferfläche zu) */
  button.oracle .cards { pointer-events: auto; }
  .card { position: absolute; background-size: 100% 100%; }
  .word { position: absolute; display: flex; align-items: center; justify-content: center; color: var(--sheet-ink); line-height: 1; white-space: nowrap; overflow: hidden; }
</style>
