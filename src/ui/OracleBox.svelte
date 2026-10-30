<script lang="ts">
  // Kartenschachtel des Orakels (Schritt 5zb, ARCHITEKTUR.md 10.12): die Schachtel des Spieldecks, ragt unter Kreuz vom
  // unteren Bildschirmrand herein. Die zwei Karten des letzten Orakels stecken gerade darin, die hintere ragt weiter
  // heraus; auf jedem Rand ein Wort, rechts daneben klein und blass Wert und Symbol der Karte (5ze, 11.13). Ein Bild für die Schachtel: Die Karten liegen darüber, sind
  // aber auf die Fläche über der Öffnung und die Daumenkerbe zugeschnitten (Maske), so scheinen sie darin zu stecken.
  // Auf kleinen Bildschirmen größer, damit die Wörter mindestens 12 px groß sind (S3); ausgewichen wird immer mit dem
  // größten Maßstab (T1, layout.ts).
  // Auf- und zuklappen (5zh, 11.14): zu ragen nur die Oberkanten heraus (`closed`), ohne Wort und Zeichen, auch vor dem
  // ersten Orakel; offen oder zu steht im Stand und gilt für alle.
  // Mit Recht ein Knopf: Klick auf die geschlossene Schachtel zieht ein neues Orakel, auf die offene schließt sie. Mit dem
  // Ereignis bei allen: Öffnen = die Schachtel wackelt, dann schiebt sich die hintere Karte heraus, danach die vordere,
  // Wort und Zeichen erst mit dem Steigen (sonst stünden sie vorab in der Daumenkerbe); Schließen = die Karten sinken bis
  // auf die Kanten, danach ohne Wort; ein neues Orakel bei offener Schachtel sinkt erst, dann wie Öffnen. „Aus“ springt.
  // Laden, Beitreten, Wiederherstellen: ohne Ereignis, also ohne Ablauf (wie die Laterne).
  import { tick, untrack } from 'svelte';
  import content from 'virtual:klio-content';
  import { suitOf } from '../engine/schemas';
  import { timing } from './animator.svelte';
  import { submitOrSay } from './commands';
  import { HAND_FONT, handFont } from './fonts';
  import { oracleRect, oracleScale, type Layout } from './layout';
  import { shadowCss, shadowOver, stackHeight } from './light';
  import { oracleCards, oracleText, type OracleCard, type OracleDraw } from './oracle';
  import { session } from './session.svelte';
  import { isRed, rankLabel, SUIT_SYMBOL, t } from './texts';

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
  const current = $derived(oracleCards(session.state?.game.oracle ?? null));
  const open = $derived(session.state?.game.oracleOpen ?? false);
  /** gezeigte Karten und gezeigt offen: folgen dem Stand ohne laufenden Ablauf, sonst setzt ihn der Ablauf (der Stand
   *  ist schon neu, bevor das Ereignis ankommt). Offen heißt auch: mit Wort und Zeichen. */
  let shown = $state<OracleCard[]>(untrack(() => current));
  let shownOpen = $state(untrack(() => open));
  let running = 0;
  /** Endzustand des laufenden Ablaufs: dorthin springt er, wenn ein neuer beginnt */
  let target: { cards: OracleCard[]; open: boolean } | null = null;
  $effect(() => {
    const now = { cards: current, open };
    untrack(() => {
      if (running) return;
      shown = now.cards;
      shownOpen = now.open;
    });
  });

  const label = $derived(shownOpen && shown.length
    ? t(may ? 'gm.oracleClose' : 'gm.oracleShows', { words: oracleText(shown) })
    : t(may ? 'gm.oracleDraw' : 'gm.oracleClosed'));
  /** flacher Schatten wie ein Stapel, nur unter der Vorderseite (ab der Öffnung) */
  const body = $derived({ x: rect.x, y: rect.y + O.opening * scale, w: rect.w, h: rect.h - O.opening * scale });
  const shadow = $derived(shadowCss(shadowOver(flame, body, stackHeight(1))));

  /** Maske der Karten in ihrer Hülle (oben ABOVE höher als das Bild): alles über der Öffnung, dazu die Kerbe */
  const [n0, n1, depth] = O.notch;
  const top = O.opening + ABOVE;
  const clip = `path('M0 0 H${W} V${top} H0 Z M${n0} ${top} A${(n1 - n0) / 2} ${depth} 0 0 0 ${n1} ${top} Z')`;
  /** Oberkante der Karten in der Hülle: hintere `out[0]`, vordere `out[1]` über der Öffnung */
  const cardTop = (out: number) => top - out;
  /** so weit sinkt eine Karte beim Schließen, bis nur noch ihre Oberkante herausragt */
  const sunk = (i: number) => `0 ${O.out[i]! - O.closed[i]!}px`;
  const [bx, by, bw, bh] = O.band;
  const [ix, iy, iw, ih] = O.index;

  let shakeEl: HTMLDivElement;
  let cardsEl: HTMLDivElement;
  const cardEls = () => [...cardsEl.querySelectorAll<HTMLElement>('[data-oracle-card]')];
  const tagged = (a: Animation, id: string) => ((a.id = id), a);
  const done = (as: Animation[]) => Promise.all(as.map((a) => a.finished.catch(() => undefined)));

  /** Ablauf zum Ereignis: neues Orakel (`next`) bzw. Schachtel schließen (`null`). Ein neues Ereignis mitten im Ablauf
   *  springt ans Ende des alten und beginnt dann. */
  async function play(next: OracleCard[] | null): Promise<void> {
    const run = ++running;
    for (const a of [...shakeEl.getAnimations(), ...cardsEl.getAnimations({ subtree: true })]) a.cancel();
    if (target) ({ cards: shown, open: shownOpen } = target);
    target = next ? { cards: next, open: true } : { cards: shown, open: false };
    const end = target;
    const stale = () => run !== running;
    const finish = () => {
      if (stale()) return;
      ({ cards: shown, open: shownOpen } = end);
      target = null;
      running = 0;
    };
    const ms = timing();
    await tick();
    if (stale()) return;
    if (!next && !shownOpen) return finish();
    if (next ? !ms.oracleShake && !ms.oracleSink && !ms.oracleRise : !ms.oracleClose) return finish();
    // offen: die Karten sinken bis auf die Kanten, beim Schließen langsamer als vor einem neuen Orakel
    if (shownOpen) {
      const sink = cardEls().map((el, i) => tagged(el.animate([{ translate: '0 0' }, { translate: sunk(i) }],
        next ? { duration: ms.oracleSink, easing: 'ease-in', fill: 'forwards' } : { duration: ms.oracleClose, easing: 'ease-in-out', fill: 'forwards' }), SINK));
      await done(sink);
      if (stale()) return;
      shownOpen = false;
      await tick();
      if (stale()) return;
      for (const a of sink) a.cancel();
    }
    if (!next) return finish();
    shown = next;
    await done([tagged(shakeEl.animate([{ rotate: '0deg' }, { rotate: '-4deg' }, { rotate: '3.5deg' }, { rotate: '-2deg' }, { rotate: '1deg' }, { rotate: '0deg' }], { duration: ms.oracleShake, easing: 'ease-in-out' }), SHAKE)]);
    if (stale()) return;
    // Wort und Zeichen erst jetzt; hintere zuerst, die vordere versetzt
    shownOpen = true;
    await tick();
    if (stale()) return;
    const rise = cardEls().map((el, i) => tagged(el.animate([{ translate: sunk(i) }, { translate: '0 0' }], { duration: ms.oracleRise, delay: i * ms.oracleRise * 0.6, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' }), RISE));
    await done(rise);
    finish();
  }

  $effect(() => session.onEvents((events) => {
    let last: OracleDraw[] | null | undefined;
    for (const e of events) {
      if (e.type === 'oracleDrawn') last = e.oracle as OracleDraw[];
      else if (e.type === 'oracleClosed') last = null;
    }
    if (last !== undefined) {
      const next = last && oracleCards(last);
      untrack(() => void play(next));
    }
  }));

  // die Wörter stehen in der mitgelieferten Handschrift (F7)
  $effect(() => void handFont());

  let sending = false;
  async function shake(e: MouseEvent): Promise<void> {
    // zweiter Klick eines Doppelklicks oder Befehl unterwegs: nicht noch einmal ziehen
    if (e.detail > 1 || sending) return;
    sending = true;
    await submitOrSay({ type: open ? 'gm.oracleClose' : 'gm.oracle' });
    sending = false;
  }
</script>

<!-- mit Recht ein Knopf (Klasse `control`: kein Verschieben, kein Doppelklick-Zoom), sonst ein Bild mit Beschriftung -->
<svelte:element this={may ? 'button' : 'div'} class="oracle" class:control={may} role={may ? undefined : 'img'} aria-label={label} title={may ? label : undefined}
  onclick={may ? shake : undefined} data-oracle-box data-oracle-open={shownOpen}
  style:left="{rect.x}px" style:top="{rect.y}px" style:width="{rect.w}px" style:height="{rect.h}px"
  style:rotate="{O.tilt}deg" style:transform-origin="50% {layout.oracle.bottom - rect.y}px">
  <div class="inner" style:width="{W}px" style:height="{H}px" style:scale={scale}>
    <!-- Platz samt herausragender Karten: dem weicht die Meldung aus (das Knopfrechteck enthält die Karten nicht) -->
    <div class="reach" style:top="{O.opening - O.out[0]!}px" style:height="{H - O.opening + O.out[0]!}px" data-toast-avoid></div>
    <div class="shake" bind:this={shakeEl} style:transform-origin="50% {H}px">
      <div class="shadow" style:top="{O.opening}px" style:box-shadow={shadow}></div>
      <img class="box" src={boxImage} alt="" draggable="false" />
      <div class="cards" bind:this={cardsEl} style:top="{-ABOVE}px" style:width="{W}px" style:height="{H + ABOVE}px" style:clip-path={clip}>
        <!-- immer zwei Karten; zu stecken sie bis auf die Oberkante drin, ohne Wort und Zeichen -->
        {#each [0, 1] as i (i)}
          {@const drawn = shownOpen ? shown[i] : undefined}
          <div class="card" data-oracle-card={i} style:left="{(W - CW) / 2}px" style:top="{cardTop(O.out[i]!)}px" style:width="{CW}px" style:height="{CH}px" style:background-image="url({cardImage})" style:translate={shownOpen ? undefined : sunk(i)}>
            {#if drawn}
              <span class="word" style:left="{bx}px" style:top="{by}px" style:width="{bw}px" style:height="{bh}px" style:font-size="{O.word}px" style:font-family={HAND_FONT}>{drawn.word}</span>
              <!-- Wert und Symbol wie die Ecke der Karten des Decks; die Beschriftung der Schachtel nennt die Karte -->
              <span class="index" class:red={isRed(drawn.card)} aria-hidden="true" data-oracle-index style:left="{ix}px" style:top="{iy}px" style:width="{iw}px" style:height="{ih}px" style:font-size="{O.indexSize}px">{rankLabel(drawn.card)}<br />{SUIT_SYMBOL[suitOf(drawn.card)]}</span>
            {/if}
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
  /* zwei Zeilen wie die Ecke (Card.svelte), aber klein und blass; das Symbol verdeckt den rechten Nagel (11.13) */
  .index { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; font-family: Georgia, serif; line-height: 0.95; color: var(--card-black); opacity: 0.6; white-space: nowrap; }
  .index.red { color: var(--card-red); }
  .word { position: absolute; display: flex; align-items: center; justify-content: center; color: var(--sheet-ink); line-height: 1; white-space: nowrap; overflow: hidden; }
</style>
