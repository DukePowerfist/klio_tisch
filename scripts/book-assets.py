# Doppelseiten des Regelbuchs aus den Vorlagen ausschneiden (ARCHITEKTUR.md 10.16, Schritt 5zk).
# Die Vorlagen sind Bildschirmfotos aus der Zeichen-App des Autors (2732 x 2048, mit Leiste und Seitenstreifen); sie
# liegen nicht im Repo. Mit diesem Skript lassen sich bessere Vorlagen jederzeit tauschen.
#
#   python3 scripts/book-assets.py <ordner mit kurzregeln1.jpg ...> public/assets/book
#
# Das Buch ist in jeder Vorlage dieselbe Zeichnung, nur anders groß und anders gelegen. Das Skript sucht den dunklen
# Einband, bringt jedes Bild auf dasselbe Maß (Einband 2000 px breit, an derselben Stelle der Leinwand), richtet es am
# Einband von Seite 3/4 aus und macht den weißen Hintergrund durchsichtig (ohne hellen Saum, siehe `transparent`). Lesebändchen und
# die Figuren der Einleitung liegen außerhalb des Einbands und bleiben im Rand der Leinwand erhalten.
# Braucht Python 3 mit Pillow.

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

# Vorlage -> Name der Doppelseite. Die Reihenfolge der Dateien folgt nicht den Seitenzahlen (6 und 7 sind vertauscht).
SPREADS = {
    'kurzregeln1.jpg': 'intro',
    'kurzregeln2.jpg': 'p01',
    'kurzregeln3.jpg': 'p03',
    'kurzregeln4.jpg': 'p05',
    'kurzregeln5.jpg': 'p07',
    'kurzregeln7.jpg': 'p09',
    'kurzregeln6.jpg': 'p11',
    'kurzregeln8.jpg': 'p13',
}
REFERENCE = 'kurzregeln3.jpg'   # daran werden die anderen ausgerichtet (schlichte Seiten, kein Bild am Rand)

BOOK_W = 2000                   # Einband auf der Leinwand, Breite
BOOK_H = 1450                   # Höhe bei dem gemessenen Seitenverhältnis 1,38
MARGIN = (30, 90, 30, 250)      # Rand links, oben, rechts, unten: Schlaufe und Ende des Bändchens, Figuren
CANVAS = (MARGIN[0] + BOOK_W + MARGIN[2], MARGIN[1] + BOOK_H + MARGIN[3])
BOOK = (MARGIN[0], MARGIN[1], MARGIN[0] + BOOK_W, MARGIN[1] + BOOK_H)

# Oberfläche der Zeichen-App in den Vorlagen: Seitenstreifen links, Leiste oben
CHROME_X, CHROME_Y = 330, 170
DARK = 70                       # Einband und Umrisse: Helligkeit darunter
PAD = 320                       # weißer Rand um die Vorlage, damit der Ausschnitt über das Bild hinausragen darf
SEARCH = 5                      # Ausrichten: Verschiebung bis +-5 px
RING = 70                       # dafür zählt nur der Rand des Einbands, nicht der Text
WHITE = 232                     # Hintergrund: alle Kanäle heller
BAND = 5                        # Breite des Bands am Hintergrund, in dem Mischfarben mit Weiß liegen
SOLID = 25                      # dort voll deckend: dunkelster Kanal bis hierher (Umriss, Einband, Bändchen)
RIM = 24                        # Streifen um den Rand des Einbands, in dem ein grauer Schein zum Hintergrund zählt
GREY = 24                       # grau heißt: Kanäle höchstens so weit auseinander
QUALITY = 84


def profile(mask, axis):
    """Zahl der gesetzten Pixel je Spalte (axis 0) bzw. Zeile (axis 1)"""
    w, h = mask.size
    if axis == 0:
        return [v * h / 255 for v in mask.resize((w, 1), Image.BOX).tobytes()]
    return [v * w / 255 for v in mask.resize((1, h), Image.BOX).tobytes()]


def cover(im):
    """Rechteck des Einbands in der Vorlage (links, oben, rechts, unten)"""
    part = im.crop((CHROME_X, CHROME_Y, im.width, im.height)).convert('L')
    dark = part.point(lambda v: 255 if v < DARK else 0)
    xs = [x for x, v in enumerate(profile(dark, 0)) if v > 250]
    ys = [y for y, v in enumerate(profile(dark, 1)) if v > 400]
    return (xs[0] + CHROME_X, ys[0] + CHROME_Y, xs[-1] + CHROME_X, ys[-1] + CHROME_Y)


def extract(im, box, shift=(0, 0)):
    """Vorlage auf die Leinwand bringen: Einband `box` liegt danach auf BOOK (Breite und senkrechte Mitte)"""
    l, t, r, b = box
    s = (r - l) / BOOK_W
    cy = (t + b) / 2
    x0 = l - MARGIN[0] * s + shift[0] * s
    y0 = cy - (MARGIN[1] + BOOK_H / 2) * s + shift[1] * s
    padded = Image.new('RGB', (im.width + 2 * PAD, im.height + 2 * PAD), 'white')
    padded.paste(im, (PAD, PAD))
    src = (x0 + PAD, y0 + PAD, x0 + PAD + CANVAS[0] * s, y0 + PAD + CANVAS[1] * s)
    return padded.resize(CANVAS, Image.LANCZOS, box=src)


def ring(canvas):
    """dunkle Pixel am Rand des Einbands (ohne Seiteninhalt), mit Platz zum Verschieben"""
    dark = canvas.convert('L').point(lambda v: 255 if v < DARK else 0)
    keep = Image.new('L', CANVAS, 0)
    d = ImageDraw.Draw(keep)
    d.rectangle((BOOK[0] - 20, BOOK[1] - 20, BOOK[2] + 20, BOOK[3] + 20), fill=255)
    d.rectangle((BOOK[0] + RING, BOOK[1] + RING, BOOK[2] - RING, BOOK[3] - RING), fill=0)
    return ImageChops.multiply(dark, keep)


def align(canvas, ref_ring):
    """Verschiebung (in px der Leinwand), mit der der Einband am besten auf dem der Bezugsseite liegt"""
    mine = ring(canvas)
    inner = (SEARCH, SEARCH, CANVAS[0] - SEARCH, CANVAS[1] - SEARCH)
    target = ref_ring.crop(inner)
    best = None
    for dy in range(-SEARCH, SEARCH + 1):
        for dx in range(-SEARCH, SEARCH + 1):
            moved = mine.crop((inner[0] + dx, inner[1] + dy, inner[2] + dx, inner[3] + dy))
            diff = ImageStat.Stat(ImageChops.difference(moved, target)).sum[0]
            if best is None or diff < best[0]:
                best = (diff, dx, dy)
    return best[1], best[2]


def transparent(canvas):
    """weißen Hintergrund entfernen, ohne hellen Saum: Hintergrund ist alles Helle außerhalb des Einbands und was von
    den Ecken aus erreichbar ist. Am Rand dazu liegt ein schmales Band aus Mischfarben (Umriss über Weiß, im Bild grau
    bis fast weiß); dort wird das Weiß herausgerechnet: je heller, desto durchsichtiger, die Farbe entsprechend dunkler."""
    r, g, b = canvas.split()
    low = ImageChops.darker(ImageChops.darker(r, g), b)
    light = low.point(lambda v: 255 if v > WHITE else 0)
    outside = Image.new('L', CANVAS, 255)
    ImageDraw.Draw(outside).rectangle((BOOK[0] + 12, BOOK[1] + 12, BOOK[2] - 12, BOOK[3] - 12), fill=0)
    bg = ImageChops.multiply(light, outside)
    # runde Ecken des Einbands: von den Ecken der Leinwand aus fluten, die Umrisslinie hält die Flut auf
    flood = light.copy()
    for c in [(0, 0), (CANVAS[0] - 1, 0), (0, CANVAS[1] - 1), (CANVAS[0] - 1, CANVAS[1] - 1)]:
        ImageDraw.floodfill(flood, c, 128)
    bg = ImageChops.lighter(bg, flood.point(lambda v: 255 if v == 128 else 0))
    # Band am Hintergrund: Deckkraft aus dem dunkelsten Kanal (SOLID und dunkler bleibt voll deckend)
    band = bg.filter(ImageFilter.MaxFilter(2 * BAND + 1))
    # Um den Einband liegt in manchen Vorlagen ein breiterer grauer Schein (Seite 11/12). Dazu zählt alles Graue ohne
    # Farbe im Streifen RIM um den Rand des Einbands, das mit dem Hintergrund zusammenhängt. Nur dort: die grauen
    # Felsen unter den Figuren der Einleitung liegen tiefer und bleiben, wie sie sind.
    high = ImageChops.lighter(ImageChops.lighter(r, g), b)
    grey = ImageChops.multiply(ImageChops.subtract(high, low).point(lambda v: 255 if v <= GREY else 0), low.point(lambda v: 255 if v > SOLID else 0))
    rim = Image.new('L', CANVAS, 0)
    d = ImageDraw.Draw(rim)
    d.rectangle((BOOK[0] - RIM, BOOK[1] - RIM, BOOK[2] + RIM, BOOK[3] + RIM), fill=255)
    d.rectangle((BOOK[0] + 2 * RIM, BOOK[1] + 2 * RIM, BOOK[2] - 2 * RIM, BOOK[3] - 2 * RIM), fill=0)
    reach = ImageChops.lighter(bg, ImageChops.multiply(grey, rim))
    ImageDraw.floodfill(reach, (0, 0), 128)
    band = ImageChops.lighter(band, reach.point(lambda v: 255 if v == 128 else 0))
    cover = low.point(lambda v: 255 if v <= SOLID else round(255 * (255 - v) / (255 - SOLID)))
    alpha = Image.composite(cover, Image.new('L', CANVAS, 255), band)
    alpha = ImageChops.multiply(alpha, ImageChops.invert(bg))
    # Farbe ohne das Weiß: c' = 255 - (255 - c) / Deckkraft
    def unmix(ch):
        px = bytes(max(0, 255 - (255 - c) * 255 // a) if 0 < a < 255 else c for c, a in zip(ch.tobytes(), alpha.tobytes()))
        return Image.frombytes('L', CANVAS, px)
    out = Image.merge('RGB', [unmix(ch) for ch in (r, g, b)]).convert('RGBA')
    out.putalpha(alpha)
    return out


def main(src, out):
    src, out = Path(src), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    ref = Image.open(src / REFERENCE).convert('RGB')
    ref_ring = ring(extract(ref, cover(ref)))
    for name, spread in SPREADS.items():
        im = Image.open(src / name).convert('RGB')
        box = cover(im)
        dx, dy = align(extract(im, box), ref_ring)
        page = transparent(extract(im, box, (dx, dy)))
        target = out / f'{spread}.webp'
        page.save(target, 'WEBP', quality=QUALITY, method=6)
        print(f'{name} -> {target.name}: Einband {box}, Maßstab {BOOK_W / (box[2] - box[0]):.3f}, '
              f'verschoben {dx},{dy}, {target.stat().st_size // 1024} KB')
    print(f'Leinwand {CANVAS[0]} x {CANVAS[1]}, Einband darin {BOOK}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__ or 'Aufruf: book-assets.py <vorlagen> <ziel>')
    main(sys.argv[1], sys.argv[2])
