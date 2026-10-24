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

Bilder des Tisches (`public/assets/table/`: Holz und Laterne) sind mit ChatGPT erzeugt und bearbeitet (Freistellen, Vergrößern mit Real-ESRGAN, Leuchtmaske; `scripts/table-assets.py`). Auch sie fallen nicht unter die MIT-Lizenz.
