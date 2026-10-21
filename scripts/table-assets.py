# Bilder für Holztisch und Laterne aufbereiten (ARCHITEKTUR.md 11.9, Schritt 5n).
# Die Originale liegen nicht im Repo; mit diesem Skript lässt sich ein besseres Original jederzeit tauschen.
#
#   python3 scripts/table-assets.py <laterne.png> <holz.png> public/assets/table
#
# Laterne: Sturmlaterne von oben, quadratisch, auf gleichmäßig grauem Hintergrund (ohne Flamme, ohne Schatten).
# Holz: Tischplatte von oben, 16:9. Vorher am besten vierfach mit Real-ESRGAN vergrößern, etwa
#   realesrgan-ncnn-vulkan -i holz.png -o holz-x4.png -n realesrgan-x4plus
# Braucht Python 3 mit Pillow. Mittelpunkte und Radien der Leuchtmaske sind für die Laterne vom 2026-10-21 gemessen
# (Bild 1254 x 1254); bei einem anderen Bild neu messen.

import math
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

LAMP_PX = 512                 # Kantenlänge der Laterne (auf dem Tisch 104 TP, also knapp fünffach)
WOOD_PX = (3520, 1980)        # Tisch 1760 x 990 TP, zweifach
WOOD_BRIGHTNESS = 1.25        # aus der Musterseite, ins Bild eingerechnet (kein filter im Browser)
WOOD_SATURATION = 0.95
GRAIN = 0.35                  # Anteil des feinen Korns, das die Vergrößerung glattgebügelt hat

# Leuchtmaske, gemessen im Original (1254 x 1254)
CHIMNEY = (630, 572, 84)      # Kamin: Mitte, Radius
CAP = (628, 577, 160, 235)    # Lüftungslöcher: Ring um den Deckel
GLASS = (625, 595, 290, 425)  # Glasring


def lamp(src, out):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    # grauen Hintergrund von den Ecken aus fluten; die schwarze Umrisslinie hält die Flut auf
    key = im.copy()
    for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(key, c, (255, 0, 255), thresh=22)
    kp = key.load()
    alpha = Image.new('L', (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            if kp[x, y] == (255, 0, 255):
                ap[x, y] = 0
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = im.convert('RGBA')
    rgba.putalpha(alpha)
    rgba.resize((LAMP_PX, LAMP_PX), Image.LANCZOS).save(f'{out}/laterne.webp', quality=88, method=6)

    # Leuchtmaske (Alpha): Kamin voll, Lüftungslöcher voll, Glas (ohne Draht und Messing) etwa halb
    s = w / 1254
    ip = im.load()
    m = Image.new('L', (w, h), 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            r, g, b = ip[x, y]
            lum = (r + g + b) / 3
            if math.hypot(x - CHIMNEY[0] * s, y - CHIMNEY[1] * s) < CHIMNEY[2] * s:
                v = 255 if lum < 90 else 150
            elif CAP[2] * s < math.hypot(x - CAP[0] * s, y - CAP[1] * s) < CAP[3] * s and lum < 32:
                v = 255
            elif GLASS[2] * s < math.hypot(x - GLASS[0] * s, y - GLASS[1] * s) < GLASS[3] * s and lum > 95 and max(r, g, b) - min(r, g, b) < 60:
                v = 120
            else:
                v = 0
            mp[x, y] = v
    m = m.filter(ImageFilter.GaussianBlur(3))
    mask = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    mask.putalpha(m)
    mask.resize((LAMP_PX, LAMP_PX), Image.LANCZOS).save(f'{out}/laterne-licht.webp', quality=90, method=6)
    print('Flamme (Anteil im Bild):', round(CHIMNEY[0] / 1254, 4), round(CHIMNEY[1] / 1254, 4))


def wood(src, out):
    im = Image.open(src).convert('RGB').resize(WOOD_PX, Image.LANCZOS)
    # feines, waagrecht gestrecktes Korn gegen den gemalten Eindruck der Vergrößerung
    random.seed(7)
    noise = Image.effect_noise((WOOD_PX[0] // 4, WOOD_PX[1]), 40).resize(WOOD_PX, Image.BICUBIC)
    noise = noise.filter(ImageFilter.GaussianBlur(0.6)).convert('RGB')
    im = Image.blend(im, ImageChops.overlay(im, noise), GRAIN)
    im = ImageEnhance.Brightness(im).enhance(WOOD_BRIGHTNESS)
    im = ImageEnhance.Color(im).enhance(WOOD_SATURATION)
    im.save(f'{out}/holz.webp', quality=82, method=6)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print('Aufruf: python3 scripts/table-assets.py <laterne.png> <holz.png> <public/assets/table>')
        sys.exit(1)
    lamp(sys.argv[1], sys.argv[3])
    wood(sys.argv[2], sys.argv[3])
