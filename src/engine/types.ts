// Engine: allgemeiner Kartentisch (ARCHITEKTUR.md 6). Kennt Klio nicht.
// Typen und Grundkonstanten; Zod-Schemas dazu in schemas.ts.

// ---------- Karten ----------

export const SUITS = ['H', 'S', 'C', 'D'] as const; // Herz, Pik, Kreuz, Karo
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type SuitId = (typeof SUITS)[number];
export type RankId = (typeof RANKS)[number];
/** z. B. `H10`, `SQ`, `DA`. Anzeige (B/D/K/A, Farbnamen) kommt aus den Texten. */
export type CardId = `${SuitId}${RankId}`;

export type DeckConfig = {
  /** Startaufteilung; jede Karte genau einmal. Reihenfolge wird beim Aufbau gemischt.
   *  Die Startzone ist zugleich der Heimatstapel der Karte für `gather … to: home`. */
  start: Partial<Record<ZoneId, CardId[]>>;
};

// ---------- Plätze, Zonen, Anker ----------

export const SEATS = ['seat1', 'seat2', 'seat3', 'seat4'] as const;
export type SeatId = (typeof SEATS)[number];

/** Tischzonen (`deck`) oder je Platz erzeugte Zonen (`seat1.damage`). */
export type ZoneId = string;

/** Bereich, an dem frei liegende Karten hängen (6.1, A32). */
export type AnchorId = 'center' | SeatId;

export type GatherRule = {
  from: ZoneId;
  suit?: SuitId;
  /** fehlt: in den mischenden Stapel; `home`: in den Heimatstapel der Karte */
  to?: 'home';
};

export type DrawRule = { to: ZoneId; faceUp: boolean; announce: boolean };

export type ZoneActions = {
  shuffle?: { gather?: GatherRule[] };
  draw?: DrawRule;
  /** `top`: oberste Karte umdrehen (an jedem Stapel, seit 5o auch am Kreuz, F4) */
  flip?: 'top';
};

export type ZoneConfig = {
  id: ZoneId;
  /** Vorlage: erzeugt `seat1.<id>` … `seat4.<id>` mit `owner` */
  perSeat?: boolean;
  /** gesetzt für erzeugte Platz-Zonen: Besitzer und Vorlage (`damage` für `seat1.damage`) */
  owner?: SeatId;
  template?: ZoneId;
  /** aufgefächert (alle Karten greifbar) oder Stapel (nur oberste) */
  fanned?: boolean;
  capacity?: number;
  onDrop?: 'faceUp';
  actions?: ZoneActions;
};

// ---------- Zustand ----------

export type FreePos = { anchor: AnchorId; x: number; y: number };

export type PermissionValue = 'allow' | 'deny' | 'own';
export type PermissionOverrides = Partial<Record<'player' | 'spectator', Record<string, PermissionValue>>>;

export type TableSettings = {
  players: 1 | 2 | 3 | 4;
  /** abschaltbare Reaktionen, Schlüssel = Reaction.id */
  automation: Record<string, boolean>;
  permissionOverrides: PermissionOverrides;
};

export type TableState<G> = {
  format: number;
  ruleset: { id: string; version: string };
  seq: number;
  /** einzige Quelle für „welche Karte liegt wo“; unten → oben */
  zones: Record<ZoneId, CardId[]>;
  /** frei liegende Karten; Reihenfolge = Stapelhöhe */
  free: CardId[];
  freePos: Partial<Record<CardId, FreePos>>;
  faceUp: Partial<Record<CardId, boolean>>;
  /** `color`: gewählte Farbe (Kennung aus `Ruleset.seatColors`); fehlt sie, gilt die Voreinstellung des Platzes */
  seats: Record<SeatId, { occupied: boolean; name?: string; color?: string }>;
  settings: TableSettings;
  /** Laterne in der Tischmitte brennt (Schritt 5n, 11.9); gilt für alle am Tisch */
  lamp: boolean;
  game: G;
};

// ---------- Wer handelt ----------

export type Actor =
  | { role: 'gm' }
  | { role: 'player'; seat: SeatId }
  | { role: 'spectator' };

// ---------- Befehle ----------

/** Woher Karten kommen: aus einer Zone oder frei. Voraussetzung für `cards.move` (6.2). */
export type CardSource = { zone: ZoneId } | { free: true };
export type CardTarget = { zone: ZoneId } | { free: FreePos };

/** Regelwerk-Befehle haben dieselbe Hülle; `type` und Inhalt legt das Regelwerk fest. */
export type Command = { type: string };

// ---------- Ereignisse ----------

export type EngineEvent =
  | { type: 'cardsMoved'; cards: CardId[]; from: CardSource; to: CardTarget }
  | { type: 'cardsTurned'; cards: CardId[]; faceUp: boolean }
  /** neuer Inhalt jeder betroffenen Zone, auch der geleerten; die gemischten sind danach ganz verdeckt */
  | { type: 'zonesShuffled'; shuffled: ZoneId[]; zones: Record<ZoneId, CardId[]> }
  | { type: 'cardDrawn'; card: CardId; from: ZoneId; to: ZoneId; faceUp: boolean; announce: boolean }
  | { type: 'settingsChanged'; settings: TableSettings }
  | { type: 'seatsChanged'; seats: TableState<unknown>['seats'] }
  /** Laterne angezündet oder gelöscht; `by` = wer (für das Protokoll) */
  | { type: 'lampChanged'; lit: boolean; by: 'gm' | 'spectator' | SeatId }
  /** alle Karten zurück auf ihre (neu gemischten) Startplätze, verdeckt, nichts frei */
  | { type: 'cardsReset'; zones: Record<ZoneId, CardId[]> };

export type Event = { type: string };
export type EngineEventOf<T extends EngineEvent['type']> = Extract<EngineEvent, { type: T }>;

/** Bestätigtes Ereignis mit fortlaufender Nummer (8.2: Lücke → Stand neu anfordern). */
export type SequencedEvent = { seq: number; event: Event };

// ---------- Regelwerk-Schnittstelle (7) ----------

export interface Rng {
  /** gleichverteilt in [0, n) */
  int(n: number): number;
}

export type Rejection = { rejected: true; reason: TextRef };
/** Angenommen: neuer Stand und alle Ereignisse samt Nummer (Befehl + Reaktionen). */
export type DispatchResult<G> = { state: TableState<G>; events: SequencedEvent[] } | Rejection;

/** Verweis auf einen Text in texts.de.yaml samt Platzhaltern. */
export type TextRef = { key: string; params?: Record<string, string | number> };

export type CommandDef<G, C extends Command = Command> = {
  /** Prüft Form und Werte des Befehls (Zod); wirft bei ungültiger Eingabe */
  parse(input: unknown): C;
  /** Rechteschlüssel aus permissions.yaml */
  permission: string;
  /** vor dem Ausführen sichert der Host den Stand (A34), z. B. beim Zurücksetzen */
  backup?: true;
  /** Plätze, denen das Betroffene gehört (für `own`); leer oder fehlt: gehört niemandem */
  owners?(cmd: C, state: TableState<G>): SeatId[];
  /** Prüfen und in Ereignisse übersetzen; ablehnen mit Grund */
  handle(cmd: C, state: TableState<G>, actor: Actor, rng: Rng): Event[] | Rejection;
};

export type EventDef<G, E extends Event = Event> = {
  parse(input: unknown): E;
  apply(state: TableState<G>, event: E): TableState<G>;
};

export type Reaction<G> = {
  /** Schlüssel für settings.automation */
  id: string;
  /** sieht den neuen Stand und das auslösende Ereignis; liefert Folgeereignisse */
  react(state: TableState<G>, event: Event, rng: Rng): Event[];
};

export type PermissionTable = {
  gm: 'all';
  player: Record<string, PermissionValue>;
  spectator: 'none' | Record<string, PermissionValue>;
};

export type Migration = {
  /** formt Format `from` in `from + 1` um (die neue Nummer setzt die Engine) */
  from: number;
  migrate(stored: unknown): unknown;
};

export interface Ruleset<G> {
  id: string;
  version: string;
  initialGame(rng: Rng): G;
  /** Spielteil eines empfangenen oder geladenen Stands prüfen (Zod); wirft bei Fehlern */
  parseGame(input: unknown): G;
  /** Zusatz-Ereignisse für „Zurücksetzen inkl. Spielinhalten“ (Klio: Charaktere) */
  resetGame?(): Event[];
  /** Fotos, auf die der Spielteil verweist (Hash); gehören in eine Sicherungsdatei */
  photosOf?(game: G): string[];
  deck: DeckConfig;
  zones: ZoneConfig[];
  commands: Record<string, CommandDef<G, any>>;
  events: Record<string, EventDef<G, any>>;
  reactions: Reaction<G>[];
  permissions: PermissionTable;
  migrations: Migration[];
  /** wählbare Farben der Plätze (Kennungen); die ersten vier sind die Voreinstellung von Platz 1–4 */
  seatColors: string[];
}
