"""
Lays the jump drive's review renders (render_jump_drive.py, in build/) out into the committed
sheets: `sheet.png` at the render's 768 px/m, and `sheet.ingame.png` at 90 px/m, about what a
1080p screen shows at the default 12 m zoom. Pillow, outside Blender (its Python has no PIL).

    python3 docs/art/jump-drive/sheet_jump_drive.py
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
RENDERS = (
    'jump-drive.front.png',
    'over-coal-cart.png',
    'over-bunker-tender.png',
    'over-riveted-tender.png',
    'over-guild-tender.png',
)
RENDER_PX_PER_M = 768
INGAME_PX_PER_M = 90
GAP = 16
BACKGROUND = (18, 14, 13, 255)


def main():
    images = [Image.open(os.path.join(BUILD, name)).convert('RGBA') for name in RENDERS]
    sheet = row_of(images)
    sheet.save(os.path.join(HERE, 'sheet.png'))
    scale = INGAME_PX_PER_M / RENDER_PX_PER_M
    small = [image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS) for image in images]
    row_of(small, gap=4).save(os.path.join(HERE, 'sheet.ingame.png'))


def row_of(images, gap=GAP):
    width = sum(image.width for image in images) + gap * (len(images) + 1)
    height = max(image.height for image in images) + 2 * gap
    sheet = Image.new('RGBA', (width, height), BACKGROUND)
    x = gap
    for image in images:
        sheet.alpha_composite(image, (x, height - gap - image.height))
        x += image.width + gap
    return sheet


if __name__ == '__main__':
    main()
