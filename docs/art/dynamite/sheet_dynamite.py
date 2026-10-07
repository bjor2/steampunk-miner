"""
The review sheets cut from render_dynamite.py's renders (#145): each render flattened on the
review background, the rack and the ladder in grayscale, and the ladder resampled to a 1080p
screen's 90 px/m at the default 12 m zoom (#39), the size the player sees a planted charge at.
Needs Pillow; run after the Blender render:

    python3 docs/art/dynamite/sheet_dynamite.py
"""

import os

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
BACKGROUND = (18, 14, 13)
LADDER_PX_PER_M = 256
INGAME_PX_PER_M = 90


def main():
    for name in ('rack.front', 'rack.three-quarter', 'planted.ladder', 'planted.three-quarter'):
        raw = Image.open(raw_path(name)).convert('RGBA')
        flatten(raw).save(output_path(name + '.png'))
        if not name.endswith('three-quarter'):
            ImageOps.grayscale(flatten(raw)).save(output_path(name + '-gray.png'))
        if name == 'planted.ladder':
            write_ingame_ladder(raw)
        os.remove(raw_path(name))


def write_ingame_ladder(raw):
    scale = INGAME_PX_PER_M / LADDER_PX_PER_M
    size = (round(raw.width * scale), round(raw.height * scale))
    resampled = flatten(raw.resize(size, Image.LANCZOS))
    resampled.save(output_path('planted.ingame.png'))
    ImageOps.grayscale(resampled).save(output_path('planted.ingame-gray.png'))


def flatten(image):
    background = Image.new('RGBA', image.size, BACKGROUND + (255,))
    background.alpha_composite(image)
    return background.convert('RGB')


def raw_path(name):
    return os.path.join(HERE, name + '.raw.png')


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
