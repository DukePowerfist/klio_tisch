// Einmalige Übernahme der Inhalte aus der alten Datei (ARCHITEKTUR.md 12, Schritt 1).
// Liest nur die Datenliterale (Trümpfe, Tabellen, Namen, Positionen) und schreibt YAML.
// Danach sind die YAML-Dateien die Quelle; dieses Skript bleibt zur Nachvollziehbarkeit.
//
//   node scripts/extract-legacy.mjs "Kartentisch (3).html" content/klio public/assets

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { Document, isScalar, visit } from 'yaml';

const [htmlPath, contentDir, assetsDir] = process.argv.slice(2);
if (!htmlPath || !contentDir || !assetsDir) {
  console.error('Aufruf: node scripts/extract-legacy.mjs <alte.html> <content/klio> <public/assets>');
  process.exit(1);
}
const html = readFileSync(htmlPath, 'utf8');

/** Literal nach `const NAME=` mit passenden Klammern ausschneiden und isoliert auswerten. */
function literal(name) {
  const start = html.indexOf(`const ${name}=`);
  if (start < 0) throw new Error(`${name} nicht gefunden`);
  let i = start + `const ${name}=`.length;
  const open = html[i];
  if (open !== '[' && open !== '{') throw new Error(`${name}: kein Literal`);
  let depth = 0;
  let quote = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const src = html.slice(start + `const ${name}=`.length, i + 1);
  // Nur Literale: leerer Kontext, keine Variablen, kurzer Zeitrahmen.
  return vm.runInNewContext(`(${src})`, Object.create(null), { timeout: 1000 });
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const byRank = (list, map = (x) => x) => {
  if (list.length !== 13) throw new Error(`13 Einträge erwartet, ${list.length} gefunden`);
  return Object.fromEntries(list.map((x, i) => [RANKS[i], map(x)]));
};
const gendered = (s) => {
  const [m, w] = s.split('|');
  return w === undefined ? m : { m, w };
};

const slug = (name) =>
  name
    .toLowerCase()
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Kurze Listen und Objekte aus reinen Werten in eine Zeile schreiben, z. B. `{ x: 1, y: 2 }`. */
function toYaml(data) {
  const doc = new Document(data);
  const short = (node) => node.items.every((it) => isScalar(it) || (isScalar(it.key) && isScalar(it.value))) && JSON.stringify(node.toJSON()).length <= 90;
  visit(doc, {
    Seq(_, node) { if (short(node)) node.flow = true; },
    Map(_, node) { if (short(node)) node.flow = true; },
  });
  return doc.toString({ lineWidth: 0 });
}

const write = (file, header, data) => {
  const path = join(contentDir, file);
  writeFileSync(path, `${header}\n${toYaml(data)}`);
  console.log(`geschrieben: ${path}`);
};
const HEAD = (what) => `# ${what}\n# Aus „Kartentisch (3).html“ übernommen (scripts/extract-legacy.mjs), wortgetreu.\n`;

mkdirSync(join(contentDir, 'skins'), { recursive: true });

// ---------- Trümpfe ----------
const trumps = literal('TRUMPS').map(([category, at, level, name, text]) => ({
  id: slug(name),
  category,
  attributes: [...at],
  level,
  name,
  text,
}));
const ids = new Set(trumps.map((t) => t.id));
if (ids.size !== trumps.length) throw new Error('Trumpf-IDs nicht eindeutig');
write('trumps.yaml', HEAD('Trümpfe. `id` ist fest und ändert sich nie, auch wenn der Name korrigiert wird.'), trumps);

// ---------- Zufallstabellen ----------
const TB = literal('TB');
write(
  'tables.yaml',
  HEAD('Zufallstabellen für den Bogen. Je Tabelle Herz (H) und Pik (S), je Kartenwert ein Eintrag; m/w = er/sie-Form.'),
  Object.fromEntries(Object.entries(TB).map(([key, [hearts, spades]]) => [key, { H: byRank(hearts, gendered), S: byRank(spades, gendered) }])),
);

// ---------- Expedition und Orakel ----------
const EX = literal('EX');
const OR = literal('OR');
write('expedition.yaml', HEAD('Expedition (4 Tabellen, Reihenfolge wie in der alten Datei) und Orakel (Herz, Pik, Kreuz je Kartenwert).'), {
  expedition: EX.map(([prompt, entries]) => ({ prompt, entries })),
  oracle: { H: byRank(OR[0]), S: byRank(OR[1]), C: byRank(OR[2]) },
});

// ---------- Namen ----------
write('names.yaml', HEAD('Namenslisten (Auswahl des Vorgängers, keine Spielinhalte).'), {
  first: { m: literal('NM'), w: literal('NF') },
  last: literal('NL'),
});

// ---------- Kartenaufteilung ----------
const CFG_ZONE = { kE: 'diamonds_easy', kM: 'diamonds_medium', kH: 'diamonds_hard', cl: 'clubs', rest: 'deck' };
const rangeOf = (suit, ranks) => ranks.map((r) => suit + r);
const OLD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CFG = {
  kE: rangeOf('D', ['2', '3', '4', '5', '6']),
  kM: rangeOf('D', ['7', '8', '9', '10']),
  kH: rangeOf('D', ['J', 'Q', 'K', 'A']),
  cl: rangeOf('C', OLD_RANKS.slice(1)),
  rest: ['HA', 'SA', 'CA', ...rangeOf('H', OLD_RANKS.slice(1)), ...rangeOf('S', OLD_RANKS.slice(1))],
};
// Gegenprobe: genau diese Aufteilung steht so in der alten Datei.
if (!html.includes("const CFG={kE:range('D',['2','3','4','5','6']),kM:range('D',['7','8','9','10']),kH:range('D',['J','Q','K','A']),")) {
  throw new Error('Kartenaufteilung in der alten Datei hat sich geändert');
}
write('deck.yaml', '# Startaufteilung der 52 Karten. Heimatstapel einer Karte = ihre Startzone.\n', {
  start: Object.fromEntries(Object.entries(CFG).map(([k, v]) => [CFG_ZONE[k], v])),
});

// ---------- Haut „Papier“: Positionen in Bildkoordinaten (662 × 936) ----------
const FD = literal('FD');
const ATTR = { a0: 'K', a1: 'V', a2: 'P' };
const fieldKey = (k) => {
  if (k in ATTR) return `attributes.${ATTR[k]}`;
  if (k === 'nam') return 'name';
  if (k === 'sh') return 'scars.heart';
  if (k === 'sp') return 'scars.spade';
  const n = Number(k.slice(1));
  switch (k[0]) {
    case 't': return n < 5 ? `strengths.text.${n}` : `weaknesses.${n - 5}`;
    case 'c': return `strengths.improved.${n}`;
    case 's': return `weaknessMarks.${n}`;
    case 'l': return `lamps.${n}`;
    case 'e': return `experiences.${n}`;
    case 'g': return `gear.text.${n}`;
  }
  throw new Error(`unbekanntes Feld ${k}`);
};
const FONT = { n: 22, t: 17 };
const fields = {};
for (const [type, k, x, y, w, h] of FD) {
  if (type === 'c') {
    fields[fieldKey(k)] = { x, y, size: w ?? 20 };
    continue;
  }
  const font = k[0] === 'g' ? 14 : k === 'nam' ? 21 : FONT[type];
  fields[fieldKey(k)] = { x, y, w, h, font };
  if (k[0] === 'g') {
    // Streichknopf rechts neben dem Rüstzeug, wie bisher (13 px, mittig zur Zeile)
    fields[`gear.struck.${k.slice(1)}`] = { x: x + w + 3 + 6.5, y: y + h / 2, size: 13 };
  }
}
fields.photo = { x: 62, y: 74, w: 70, h: 82 };
[28, 186, 344, 503].forEach((x, j) => (fields[`trumps.${j}`] = { x, y: 690, w: 128, h: 152 }));
fields.dead = { x: 0, y: 0, w: 662, h: 936 };

// Bogenzonen standen bisher in 380er-Koordinaten; umgerechnet in Bildkoordinaten.
const K = 662 / 380;
const box380 = (x, y, w, h) => ({ x: +(x * K).toFixed(1), y: +(y * K).toFixed(1), w: +(w * K).toFixed(1), h: +(h * K).toFixed(1) });
write('skins/paper.yaml', '# Haut „Papier“: Bogenbild je Variante, Lage jedes Felds und jeder Bogenzone in Bildkoordinaten.\n# Aus „Kartentisch (3).html“ übernommen (scripts/extract-legacy.mjs).\n', {
  size: [662, 936],
  images: { m: 'sheet/paper-m.jpg', w: 'sheet/paper-w.jpg' },
  fields,
  zones: {
    damage: box380(298, 72, 80, 112),
    notes: box380(36, 250, 160, 112),
    collect: box380(343, 262, 34, 108),
  },
});

// ---------- Ansichten ----------
const LY = literal('LY');
const ZONE = { kE: 'diamonds_easy', kM: 'diamonds_medium', kH: 'diamonds_hard', out: 'display', rest: 'deck', disc: 'discard', cdG: 'danger', cdF: 'progress', cl: 'clubs' };
const view = (v) => ({
  zones: Object.fromEntries(Object.entries(v.z).map(([k, p]) => [ZONE[k], p])),
  menu: v.rm,
  resistTitle: v.wt,
});
write('layouts.yaml', '# Ansichten: Tischgröße, Form der Tischzonen, Lage in Draufsicht und Rollenansicht.\n# Werte aus „Kartentisch (3).html“ übernommen (scripts/extract-legacy.mjs).\n', {
  board: [1760, 990],
  card: [80, 112],
  freeCardScale: 0.6,
  shapes: {
    deck: { w: 80, h: 112 },
    discard: { w: 80, h: 112 },
    display: { w: 80, h: 112 },
    diamonds_easy: { w: 48, h: 68, scale: 0.6, growOnOpen: true },
    diamonds_medium: { w: 48, h: 68, scale: 0.6, growOnOpen: true },
    diamonds_hard: { w: 48, h: 68, scale: 0.6, growOnOpen: true },
    clubs: { w: 48, h: 68, scale: 0.6, growOnOpen: true },
    danger: { w: 330, h: 70, scale: 0.6, fanX: 26 },
    progress: { w: 330, h: 70, scale: 0.6, fanX: 26 },
    'seat.damage': { scale: 1 },
    'seat.notes': { scale: 1, fanX: 40 },
    'seat.collect': { scale: 0.4, fanY: 12 },
  },
  overview: { ...view(LY.over), sheets: { margin: 14, gap: 14, scaleUpTo2Players: 1.2, scaleFrom3Players: 0.9 } },
  role: { ...view(LY.role), sheets: { own: { x: 14, y: 10, scale: 'fit' }, others: { x: 745, gap: 8, bottomMargin: 10, scale: 0.85, opacity: 0.88 }, panel: { x: 735, y: 10 } } },
});

// ---------- Bogenbilder ----------
const imgs = [...html.matchAll(/\.sf\.v([01])\{background-image:url\(data:image\/jpeg;base64,([A-Za-z0-9+/=]+)\)\}/g)];
if (imgs.length !== 2) throw new Error(`2 Bogenbilder erwartet, ${imgs.length} gefunden`);
mkdirSync(join(assetsDir, 'sheet'), { recursive: true });
for (const [, v, b64] of imgs) {
  const path = join(assetsDir, 'sheet', `paper-${v === '0' ? 'm' : 'w'}.jpg`);
  writeFileSync(path, Buffer.from(b64, 'base64'));
  console.log(`geschrieben: ${path}`);
}
