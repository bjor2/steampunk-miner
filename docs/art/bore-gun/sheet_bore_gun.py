"""
The review sheets cut from render_bore_gun.py's renders (#362): each render flattened on the
review background, the arc and the rigs in grayscale, and the rigs resampled to a 1080p screen's
90 px/m at the default 12 m zoom (#39), the size the player sees the gun at. Needs Pillow; run
after the Blender render:

    python3 docs/art/bore-gun/sheet_bore_gun.py
"""

import os

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
BACKGROUND = (18, 14, 13)
RIG_PX_PER_M = 512
INGAME_PX_PER_M = 90
RENDERS = ('gun.arc', 'gun.three-quarter', 'rig.tier-1', 'rig.tier-3')


def main():
    for name in RENDERS:
        raw = Image.open(raw_path(name)).convert('RGBA')
        flatten(raw).save(output_path(name + '.png'))
        if not name.endswith('three-quarter'):
            ImageOps.grayscale(flatten(raw)).save(output_path(name + '-gray.png'))
        if name.startswith('rig.'):
            write_ingame(name, raw)
        os.remove(raw_path(name))


def write_ingame(name, raw):
    scale = INGAME_PX_PER_M / RIG_PX_PER_M
    size = (round(raw.width * scale), round(raw.height * scale))
    resampled = flatten(raw.resize(size, Image.LANCZOS))
    resampled.save(output_path(name + '.ingame.png'))
    ImageOps.grayscale(resampled).save(output_path(name + '.ingame-gray.png'))


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
