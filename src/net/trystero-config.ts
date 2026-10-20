// Einzige Stelle für die Trystero-Einrichtung (ARCHITEKTUR.md 8.6).
// Version fest in package.json (@trystero-p2p/nostr, ohne ^).
//
// Vermittlungsweg: Nostr. Trystero wählt aus seiner eingebauten Liste
// öffentlicher Relais 5 Stück aus, abhängig von APP_ID. Alle Teilnehmer mit
// derselben APP_ID und Version nutzen also dieselben Relais.
//
// APP_ID nie ändern: Sie bestimmt die Relais-Auswahl und den Raumnamensraum.
// Eine Änderung trennt alte und neue Clients voneinander.

import type { JoinRoomConfig } from '@trystero-p2p/nostr';
import type { RoomLink } from './room-link';

export const APP_ID = 'klio-tisch';

export function roomConfig(link: RoomLink): JoinRoomConfig {
  return { appId: APP_ID, password: link.secret };
}
