"""
The review sheets of the star map's sprites (ticket 758): every shipped sprite from
public/assets/ui/ui-star-map/ on the review background, the 1x files at 4x nearest-neighbour and
the 2x files at 2x (so one CSS px is four image px on both sheets), and the planet's tint mask
filled with each planet palette's surface colour, as the chart tints it. Needs Pillow; run after
`npm run art:export -- ui-star-map`:

    python3 docs/art/star-map/sheet_star_map.py
"""

import glob
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SPRITES = os.path.join(REPO_ROOT, 'public', 'assets', 'ui', 'ui-star-map')
PALETTES = os.path.join(REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')
BACKGROUND = (27, 22, 19, 255)
PAD = 16


def main():
    ones = sorted(path for path in glob.glob(os.path.join(SPRITES, '*.png'))
                  if '@2x' not in path and '.tint' not in path)
    save_sheet([scaled(path, 4) for path in ones], 'sprites-1x.png')
    save_sheet([scaled(path.replace('.png', '@2x.png'), 2) for path in ones], 'sprites-2x.png')
    save_sheet([tinted_planet(colour) for colour in palette_surfaces()], 'tints.png')


def save_sheet(tiles, name):
    width = sum(tile.width for tile in tiles) + PAD * (len(tiles) + 1)
    height = max(tile.height for tile in tiles) + 2 * PAD
    sheet = Image.new('RGBA', (width, height), BACKGROUND)
    x = PAD
    for tile in tiles:
        sheet.alpha_composite(tile, (x, PAD))
        x += tile.width + PAD
    sheet.convert('RGB').save(os.path.join(HERE, name))


def scaled(path, scale):
    image = Image.open(path).convert('RGBA')
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def palette_surfaces():
    with open(PALETTES, encoding='utf8') as file:
        palettes = json.load(file)['palettes']
    return [palettes[key]['surface'] for key in sorted(palettes)]


def tinted_planet(hex_colour):
    """The 2x planet with its disc in `hex_colour` through the tint mask, as StarMapChart draws it."""
    planet = Image.open(os.path.join(SPRITES, 'ui-star-map-planet@2x.png')).convert('RGBA')
    mask = Image.open(os.path.join(SPRITES, 'ui-star-map-planet.tint@2x.png')).convert('RGBA').split()[3]
    colour = tuple(int(hex_colour[at:at + 2], 16) for at in (1, 3, 5)) + (255,)
    disc = Image.new('RGBA', planet.size, colour)
    disc.putalpha(mask)
    tinted = planet.copy()
    tinted.alpha_composite(disc)
    return tinted.resize((tinted.width * 2, tinted.height * 2), Image.NEAREST)


if __name__ == '__main__':
    main()
