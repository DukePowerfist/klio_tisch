# klio_tisch

Gemeinsamer Kartentisch für das Rollenspiel Klio, im Browser, mit direkter Verbindung zwischen den Mitspielern.

Noch im Bau. Online: https://dukepowerfist.github.io/klio_tisch/

- `npm install` – Abhängigkeiten installieren
- `npm run dev` – lokal starten
- `npm test` – Tests
- `npm run build` – Typprüfung und Build nach `dist/`

Der Verbindungstest liegt unter `verbindungstest.html`.

Der Filz folgt dem Spielablauf: oben die drei Schwierigkeitsstapel, mittig Zielwert, Deck und Ablage, unten Gefahr und Fortschritt mit dem Kreuzvorrat. Die Laterne beleuchtet den Probenbereich von links, auf der Seite des eigenen Bogens. Positionen und Größen stehen in `content/klio/layouts.yaml`, die aufgedruckten Markierungen in `src/ui/FeltMarkings.svelte`. Frei abgelegte Karten behalten beim Laden ihre gespeicherte Filzposition.

Lizenz: MIT für den Programmcode (siehe `LICENSE`). Spielinhalte sind davon ausgenommen.

Bildquellen: Das Bild auf der Kartenschachtel und der Rückseite der Spielkarten (`public/assets/cards/oracle-box.webp`, `public/assets/cards/back.webp`) stammt von der folgenden Quelle und wurde im Sinne der CC0 (Creative Commons Zero) adaptiert: Renshawe. *Panoramic View of the Crater Lake National Park, Oregon*, ca. 1914, topographische Lithographie, Washington D.C., Department of the Interior. Die Adaption (Reiseweg, Flugzeug, Schriftzug „K.L.I.O.“) fällt nicht unter die MIT-Lizenz.

Der Charakterbogen (`public/assets/sheet/paper-m.jpg`, `public/assets/sheet/paper-w.jpg`) stammt aus „Klio Charakterbogen 2.2“ des Klio-Autors und fällt nicht unter die MIT-Lizenz.

Das Regelbuch (`public/assets/book/`) zeigt die Kurzregeln des Klio-Autors, mit seiner Erlaubnis; aus seinen Vorlagen ausgeschnitten mit `scripts/book-assets.py`. Es fällt nicht unter die MIT-Lizenz.

Bilder des Tisches (`public/assets/table/`: Holz und Laterne) sind mit ChatGPT erzeugt und bearbeitet (Freistellen, Vergrößern mit Real-ESRGAN, Leuchtmaske; `scripts/table-assets.py`). Auch sie fallen nicht unter die MIT-Lizenz.

Expeditionsblatt und Orakelkarten (`public/assets/sheet/expedition.webp`, `public/assets/cards/oracle.webp`) sind mit einem Bildgenerator erzeugt (Expeditionsblatt danach retuschiert) und fallen ebenfalls nicht unter die MIT-Lizenz. Die Handschrift darauf ist „Patrick Hand“ von Patrick Wagesreiter unter der SIL Open Font License 1.1 (`public/assets/fonts/patrick-hand-OFL.txt`).
