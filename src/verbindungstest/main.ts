// Verbindungstest (ARCHITEKTUR.md 12, Schritt 0).
// Eigenständige Seite: Raum beitreten, Mitspieler sehen, eine Karte gemeinsam bewegen.
// Zeigt an, an welcher Stelle eine Verbindung scheitert, und erzeugt einen Bericht zum Kopieren.
// Bewusst eigenständig (nutzt Trystero direkt, nicht net/trystero.ts): Als Diagnosewerkzeug soll es auch
// funktionieren, wenn an der eigentlichen App etwas kaputt ist.

import { getRelaySockets, joinRoom, selfId } from '@trystero-p2p/nostr';
import { connectionKind, type ConnectionKind } from '../net/connection-kind';
import { createRoomLink, formatHash, parseHash, type RoomLink } from '../net/room-link';
import { roomConfig } from '../net/trystero-config';
import { isCardPos, moveTo, newer, type CardPos } from './card-sync';

const BUILD = __BUILD_ID__;
const RELAYS_EXPECTED = 5;
const NAME_KEY = 'klio.verbindungstest.name';
const SEND_INTERVAL_MS = 60;

type Hello = { name: string; build: string };
type PeerInfo = { name: string; build: string | null; kind: ConnectionKind; rttMs: number | null; since: number };

const KIND_TEXT: Record<ConnectionKind, string> = {
  lokal: 'direkt (selbes Netz)',
  internet: 'direkt (über Internet)',
  weitergeleitet: 'über Weiterleitung',
  unbekannt: 'wird ermittelt …',
};

const app = document.getElementById('app')!;
const startedAt = Date.now();
const logLines: string[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function log(text: string): void {
  const t = ((Date.now() - startedAt) / 1000).toFixed(1).padStart(6);
  logLines.push(`${t} s  ${text}`);
  const box = document.getElementById('log');
  if (box) {
    box.textContent = logLines.join('\n');
    box.scrollTop = box.scrollHeight;
  }
}

function storedName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

// ---------- Kopf und Name ----------

app.append(
  el('h1', {}, 'Verbindungstest'),
  el('p', { className: 'muted' }, 'Prüft, ob sich eure Browser direkt miteinander verbinden können. Alle öffnen denselben Link; dann sollte jeder die anderen sehen und die Karte gemeinsam bewegen können.'),
);

const nameInput = el('input', { value: storedName(), placeholder: 'Dein Name', maxLength: 30 });
nameInput.addEventListener('change', () => localStorage.setItem(NAME_KEY, nameInput.value.trim()));
app.append(el('section', {}, el('h2', {}, 'Name'), el('div', { className: 'row' }, nameInput)));

// ---------- Raum ----------

const link = parseHash(location.hash);
if (!link) {
  const create = el('button', {}, 'Neuen Testraum erstellen');
  create.onclick = () => {
    localStorage.setItem(NAME_KEY, nameInput.value.trim());
    location.hash = formatHash(createRoomLink());
    location.reload();
  };
  const hint = location.hash.length > 1
    ? el('p', { className: 'bad' }, 'Dieser Link ist unvollständig. Bitte den ganzen Link noch einmal kopieren.')
    : el('p', { className: 'muted' }, 'Eine Person erstellt den Raum und schickt den Link an alle anderen.');
  app.append(el('section', {}, el('h2', {}, 'Raum'), hint, el('div', { className: 'row' }, create)));
} else {
  start(link);
}

app.append(el('footer', {}, `Build ${BUILD}`));

// ---------- Test im Raum ----------

function start(link: RoomLink): void {
  const self = selfId;
  const peers = new Map<string, PeerInfo>();
  let card: CardPos = { x: 0.5, y: 0.5, clock: 0, by: '' };

  // Raum-Abschnitt mit Einladungslink
  const url = location.href;
  const copyLink = el('button', {}, 'Link kopieren');
  copyLink.onclick = () => copy(url, copyLink, 'Link kopieren');
  app.append(el('section', {},
    el('h2', {}, 'Einladungslink'),
    el('div', { className: 'row' }, el('span', { className: 'link', textContent: url }), copyLink),
    el('p', { className: 'muted' }, 'Nur an Mitspieler schicken. Wer den Link hat, kommt in den Raum.'),
  ));

  // Status
  const relayLine = el('p');
  const hintLine = el('p');
  const peerBody = el('tbody');
  app.append(el('section', {},
    el('h2', {}, 'Status'),
    relayLine,
    el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Mitspieler'), el('th', {}, 'Verbindung'), el('th', {}, 'Antwortzeit'))), peerBody),
    hintLine,
  ));

  // Spielfläche
  const cardEl = el('div', { id: 'card' }, el('span', {}, 'A', el('small', {}, 'Herz')));
  const board = el('div', { id: 'board' }, cardEl);
  const movedBy = el('p', { className: 'muted' }, 'Zieh die Karte. Bei den anderen sollte sie mitwandern.');
  app.append(el('section', {}, el('h2', {}, 'Karte'), board, movedBy));

  // Protokoll und Bericht
  const copyReport = el('button', {}, 'Bericht kopieren');
  copyReport.onclick = () => copy(report(), copyReport, 'Bericht kopieren');
  app.append(el('section', {},
    el('div', { className: 'row' }, el('h2', { className: 'grow' }, 'Protokoll'), copyReport),
    el('pre', { id: 'log' }),
  ));

  log(`Build ${BUILD}, eigene Kennung ${self.slice(0, 6)}`);
  log('Trete Raum bei …');

  const room = joinRoom(roomConfig(link), link.room, {
    onJoinError: (e) => joinError(e.error),
  });

  // Fehler je Art nur einmal melden, Trystero wiederholt sie bei jedem Versuch.
  const seenErrors = new Set<string>();
  function joinError(error: string): void {
    if (seenErrors.has(error)) return;
    seenErrors.add(error);
    log(error.includes('password')
      ? 'Jemand mit anderem Passwort ist im selben Raum. Ist bei einem der Links das Ende abgeschnitten?'
      : `Fehler beim Beitritt: ${error}`);
  }

  const helloAction = room.makeAction<Hello>('hello', {
    onMessage: (data, { peerId }) => {
      const p = peers.get(peerId);
      if (!p || typeof data?.name !== 'string' || typeof data?.build !== 'string') return;
      p.name = data.name.slice(0, 30) || 'ohne Namen';
      p.build = data.build;
      log(`${p.name} hat sich gemeldet${data.build !== BUILD ? ` – andere Version (${data.build})` : ''}`);
      renderPeers();
    },
  });

  const cardAction = room.makeAction<CardPos>('card', {
    onMessage: (data, { peerId }) => {
      if (!isCardPos(data) || data.by !== peerId) return;
      const next = newer(card, data);
      if (next !== card) {
        card = next;
        renderCard();
      }
    },
  });

  const hello = (): Hello => ({ name: nameInput.value.trim(), build: BUILD });

  room.onPeerJoin = (peerId) => {
    peers.set(peerId, { name: `Unbekannt (${peerId.slice(0, 6)})`, build: null, kind: 'unbekannt', rttMs: null, since: Date.now() });
    log(`Verbindung zu ${peerId.slice(0, 6)} hergestellt`);
    void helloAction.send(hello(), { target: peerId });
    if (card.clock > 0) void cardAction.send(card, { target: peerId });
    renderPeers();
    void measure(peerId);
  };

  room.onPeerLeave = (peerId) => {
    const p = peers.get(peerId);
    peers.delete(peerId);
    log(`${p?.name ?? peerId.slice(0, 6)} hat den Raum verlassen`);
    renderPeers();
  };

  nameInput.addEventListener('change', () => void helloAction.send(hello()));

  // Karte ziehen
  let dragging = false;
  let lastSent = 0;
  let pendingSend: ReturnType<typeof setTimeout> | null = null;

  const sendCard = (): void => {
    pendingSend = null;
    lastSent = Date.now();
    void cardAction.send(card);
  };

  const placeFromPointer = (ev: PointerEvent): void => {
    const r = board.getBoundingClientRect();
    card = moveTo(card, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, self);
    renderCard();
    const wait = SEND_INTERVAL_MS - (Date.now() - lastSent);
    if (wait <= 0) sendCard();
    else pendingSend ??= setTimeout(sendCard, wait);
  };

  cardEl.onpointerdown = (ev) => {
    dragging = true;
    cardEl.setPointerCapture(ev.pointerId);
    cardEl.classList.add('dragging');
  };
  cardEl.onpointermove = (ev) => {
    if (dragging) placeFromPointer(ev);
  };
  cardEl.onpointerup = cardEl.onpointercancel = () => {
    if (!dragging) return;
    dragging = false;
    cardEl.classList.remove('dragging');
    if (pendingSend) clearTimeout(pendingSend);
    sendCard();
  };

  function renderCard(): void {
    cardEl.style.left = `${card.x * 100}%`;
    cardEl.style.top = `${card.y * 100}%`;
    if (card.clock === 0) return;
    const who = card.by === self ? 'dir' : (peers.get(card.by)?.name ?? card.by.slice(0, 6));
    movedBy.textContent = `Zuletzt bewegt von ${who}.`;
  }

  function renderPeers(): void {
    peerBody.replaceChildren();
    if (peers.size === 0) {
      peerBody.append(el('tr', {}, el('td', { className: 'muted', colSpan: 3 }, 'Noch niemand verbunden.')));
      return;
    }
    for (const p of peers.values()) {
      const kindCls = p.kind === 'unbekannt' ? 'muted' : 'ok';
      const versionWarn = p.build && p.build !== BUILD ? el('div', { className: 'warn' }, 'Andere Version – bitte beide die Seite neu laden.') : '';
      peerBody.append(el('tr', {},
        el('td', {}, p.name, versionWarn),
        el('td', { className: kindCls }, KIND_TEXT[p.kind]),
        el('td', {}, p.rttMs === null ? '–' : `${p.rttMs} ms`),
      ));
    }
  }

  async function measure(peerId: string): Promise<void> {
    const p = peers.get(peerId);
    const pc = room.getPeers()[peerId];
    if (!p || !pc) return;
    try {
      const kind = await connectionKind(pc);
      if (kind !== p.kind) log(`${p.name}: ${KIND_TEXT[kind]}`);
      p.kind = kind;
      p.rttMs = Math.round(await room.ping(peerId));
    } catch {
      // Peer gerade weg; onPeerLeave räumt auf.
    }
    renderPeers();
  }

  // Laufende Anzeige
  let lastRelayOpen = -1;
  const tick = (): void => {
    const sockets = Object.values(getRelaySockets() as Record<string, WebSocket>);
    const open = sockets.filter((s) => s.readyState === WebSocket.OPEN).length;
    if (open !== lastRelayOpen) {
      log(`Vermittlung: ${open} von ${RELAYS_EXPECTED} Diensten erreichbar`);
      lastRelayOpen = open;
    }
    relayLine.className = open === 0 ? 'bad' : open < 3 ? 'warn' : 'ok';
    relayLine.textContent = `Vermittlung: ${open} von ${RELAYS_EXPECTED} Diensten erreichbar`;

    const age = Date.now() - startedAt;
    if (open === 0 && age > 10_000) {
      hintLine.className = 'bad';
      hintLine.textContent = 'Keine Vermittlung erreichbar. Möglicherweise blockiert ein Werbeblocker, eine Firewall oder das Netzwerk (z. B. Firmen-WLAN) die Verbindung.';
    } else if (peers.size === 0 && age > 30_000) {
      hintLine.className = 'warn';
      hintLine.textContent = 'Noch niemand gefunden. Haben die anderen genau denselben Link geöffnet? Wenn ja, bitte den Bericht kopieren und schicken.';
    } else {
      hintLine.textContent = '';
    }
  };
  tick();
  setInterval(tick, 1000);
  setInterval(() => peers.forEach((_, id) => void measure(id)), 3000);
  renderPeers();
  renderCard();

  function report(): string {
    const sockets = getRelaySockets() as Record<string, WebSocket>;
    const lines = [
      'Verbindungstest Klio-Kartentisch',
      `Build: ${BUILD}`,
      `Browser: ${navigator.userAgent}`,
      `Name: ${nameInput.value.trim() || '(leer)'}`,
      `Dauer: ${Math.round((Date.now() - startedAt) / 1000)} s`,
      'Vermittlung:',
      ...Object.entries(sockets).map(([u, s]) => `  ${u}: ${s.readyState === WebSocket.OPEN ? 'erreichbar' : 'nicht erreichbar'}`),
      'Mitspieler:',
      ...(peers.size === 0 ? ['  keine'] : [...peers.values()].map((p) => `  ${p.name}: ${KIND_TEXT[p.kind]}, ${p.rttMs ?? '–'} ms, Build ${p.build ?? '?'}`)),
      'Protokoll:',
      ...logLines.map((l) => `  ${l}`),
    ];
    return lines.join('\n');
  }
}

function copy(text: string, button: HTMLButtonElement, label: string): void {
  navigator.clipboard.writeText(text).then(
    () => { button.textContent = 'Kopiert'; },
    () => { button.textContent = 'Kopieren nicht möglich'; },
  );
  setTimeout(() => { button.textContent = label; }, 1500);
}
