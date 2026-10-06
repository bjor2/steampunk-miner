"""
The review sheets cut from render_shops.py's pair render (#174): the dock pair at 1080p's
density, the same at the #173 reference phone (a short side of 390 CSS px) at the default 12 m
zoom and the 20 m zoom-out, the phone and desktop sheets in grayscale, and the silhouette pair,
black on parchment, taken from the render's coverage so no shading helps. A TV sheet would only
upsample this render (the TV's 180 px/m is above the render's 90 and below the bake's 256), so
the TV check is #175's dock screenshot. Needs Pillow; run after the Blender render:

    python3 docs/art/shops/sheet_shops.py
"""

import os

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
DESKTOP_PX_PER_M = 90
DEVICE_PX_PER_M = {'phone': 390 / 12, 'phone-zoomout': 390 / 20}
BACKGROUND = (18, 14, 13)
PARCHMENT, INK = 235, 20


def main():
    raw = Image.open(os.path.join(HERE, 'pair.desktop.raw.png')).convert('RGBA')
    write_pair_variants(raw)
    write_silhouette_pair(raw)
    os.remove(os.path.join(HERE, 'pair.desktop.raw.png'))


def write_pair_variants(raw):
    flatten(raw).save(output_path('pair.desktop.png'))
    ImageOps.grayscale(flatten(raw)).save(output_path('pair.desktop-gray.png'))
    for device, px_per_m in DEVICE_PX_PER_M.items():
        scale = px_per_m / DESKTOP_PX_PER_M
        size = (round(raw.width * scale), round(raw.height * scale))
        resampled = flatten(raw.resize(size, Image.LANCZOS))
        resampled.save(output_path('pair.%s.png' % device))
        ImageOps.grayscale(resampled).save(output_path('pair.%s-gray.png' % device))


def write_silhouette_pair(raw):
    coverage = raw.getchannel('A').point(lambda a: 255 if a > 128 else 0)
    silhouette = Image.new('L', raw.size, PARCHMENT)
    silhouette.paste(Image.new('L', raw.size, INK), mask=coverage)
    silhouette.save(output_path('pair.silhouette.png'))


def flatten(image):
    background = Image.new('RGBA', image.size, BACKGROUND + (255,))
    background.alpha_composite(image)
    return background.convert('RGB')


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
