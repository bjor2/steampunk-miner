"""
The review sheets cut from render_casing_driller.py's renders (ticket 393): each render flattened
on the review background and laid out in labelled rows, plus the states resampled to a 1080p
screen's 90 px/m at the default 12 m zoom (#39), the size the player sees the vehicle at. Needs
Pillow; run after the Blender render, which leaves its raw PNGs in build/ (removed here):

    python3 docs/art/casing-driller/sheet_casing_driller.py
"""

import os
import shutil

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
BACKGROUND = (18, 14, 13)
LABEL_COLOUR = (226, 196, 140)
LABEL_PX = 28
RENDER_PX_PER_M = 512
INGAME_PX_PER_M = 90
SHEETS = {
    'tiers': (('tier-1', 'tier 1'), ('tier-2', 'tier 2'), ('tier-3', 'tier 3')),
    'states': (
        ('state-drive', 'driving'),
        ('state-fly', 'flying: thrusters lit'),
        ('state-casing', 'setting a casing ring'),
        ('state-drill-right', 'drilling right'),
        ('state-drill-up', 'drilling up'),
        ('state-drill-left', 'drilling left'),
        ('state-drill-down', 'drilling down'),
    ),
    'turnaround': (
        ('turn-000', 'facing right'),
        ('turn-045', 'swivel 45'),
        ('turn-090', 'swivel 90'),
        ('turn-135', 'swivel 135'),
        ('turn-180', 'facing left'),
    ),
    'fitted': (('fitted', 'tier 3, every module mounted, folded'),),
}
COLUMNS = 4


def main():
    for sheet, renders in SHEETS.items():
        tiles = [labelled(flattened(name), label) for name, label in renders]
        image = laid_out(tiles)
        image.save(os.path.join(HERE, sheet + '.png'))
        if sheet == 'states':
            resampled(image).save(os.path.join(HERE, sheet + '.ingame.png'))
    shutil.rmtree(BUILD)


def flattened(name):
    raw = Image.open(os.path.join(BUILD, name + '.png')).convert('RGBA')
    background = Image.new('RGBA', raw.size, BACKGROUND + (255,))
    background.alpha_composite(raw)
    return background.convert('RGB')


def labelled(tile, label):
    canvas = Image.new('RGB', (tile.width, tile.height + LABEL_PX), BACKGROUND)
    canvas.paste(tile, (0, LABEL_PX))
    ImageDraw.Draw(canvas).text((8, 6), label, fill=LABEL_COLOUR)
    return canvas


def laid_out(tiles):
    columns = min(COLUMNS, len(tiles))
    rows = (len(tiles) + columns - 1) // columns
    width, height = tiles[0].size
    sheet = Image.new('RGB', (columns * width, rows * height), BACKGROUND)
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % columns) * width, (index // columns) * height))
    return sheet


def resampled(image):
    scale = INGAME_PX_PER_M / RENDER_PX_PER_M
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)


if __name__ == '__main__':
    main()
