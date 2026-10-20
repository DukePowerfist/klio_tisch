// Engine-Ereignisse auf den Stand anwenden. Arbeitet auf einer Kopie (dispatch/replay klonen vorher).

import type { CardId, EngineEvent, TableState } from './types';

export const ENGINE_EVENTS = new Set<string>(['cardsMoved', 'cardsTurned', 'zonesShuffled', 'cardDrawn', 'settingsChanged', 'seatsChanged', 'cardsReset']);

export function isEngineEvent(e: { type: string }): e is EngineEvent {
  return ENGINE_EVENTS.has(e.type);
}

function remove(list: CardId[], cards: readonly CardId[]): CardId[] {
  return list.filter((c) => !cards.includes(c));
}

export function applyEngineEvent<G>(s: TableState<G>, e: EngineEvent): TableState<G> {
  switch (e.type) {
    case 'cardsMoved': {
      if ('zone' in e.from) s.zones[e.from.zone] = remove(s.zones[e.from.zone] ?? [], e.cards);
      else {
        s.free = remove(s.free, e.cards);
        for (const c of e.cards) delete s.freePos[c];
      }
      if ('zone' in e.to) {
        // Auch beim Ablegen in dieselbe Zone: oben drauf (wie bisher)
        s.zones[e.to.zone] = [...remove(s.zones[e.to.zone] ?? [], e.cards), ...e.cards];
      } else {
        s.free = [...remove(s.free, e.cards), ...e.cards];
        for (const c of e.cards) s.freePos[c] = { ...e.to.free };
      }
      return s;
    }
    case 'cardsTurned':
      for (const c of e.cards) s.faceUp[c] = e.faceUp;
      return s;
    case 'zonesShuffled':
      for (const [zone, cards] of Object.entries(e.zones)) s.zones[zone] = [...cards];
      for (const zone of e.shuffled) for (const c of e.zones[zone] ?? []) s.faceUp[c] = false;
      return s;
    case 'cardDrawn':
      s.zones[e.from] = remove(s.zones[e.from] ?? [], [e.card]);
      s.zones[e.to] = [...(s.zones[e.to] ?? []), e.card];
      s.faceUp[e.card] = e.faceUp;
      return s;
    case 'settingsChanged':
      s.settings = structuredClone(e.settings);
      return s;
    case 'seatsChanged':
      s.seats = structuredClone(e.seats);
      return s;
    case 'cardsReset':
      s.zones = structuredClone(e.zones);
      s.free = [];
      s.freePos = {};
      s.faceUp = {};
      return s;
  }
}
