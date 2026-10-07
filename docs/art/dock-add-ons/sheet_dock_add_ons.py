"""
The review sheets cut from render_dock_add_ons.py's pad render (#197a): the planet 20 dock with
the add-ons at 1080p's density, the same at the #173 reference phone at the 12 m zoom and the 20 m
zoom-out, the desktop and phone sheets in grayscale, and the silhouette, ink on parchment, from the
render's coverage so no shading helps. Needs Pillow; run after the Blender render:

    python3 docs/art/dock-add-ons/sheet_dock_add_ons.py
"""

import os

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
DESKTOP_PX_PER_M = 90
DEVICE_PX_PER_M = {'phone': 390 / 12, 'phone-zoomout': 390 / 20}
BACKGROUND = (18, 14, 13)
PARCHMENT, INK = 235, 20


def main():
    raw = Image.open(os.path.join(HERE, 'pad-p20.desktop.raw.png')).convert('RGBA')
    write_pad_variants(raw)
    write_silhouette(raw)
    os.remove(os.path.join(HERE, 'pad-p20.desktop.raw.png'))


def write_pad_variants(raw):
    flatten(raw).save(output_path('pad-p20.desktop.png'))
    ImageOps.grayscale(flatten(raw)).save(output_path('pad-p20.desktop-gray.png'))
    for device, px_per_m in DEVICE_PX_PER_M.items():
        scale = px_per_m / DESKTOP_PX_PER_M
        size = (round(raw.width * scale), round(raw.height * scale))
        resampled = flatten(raw.resize(size, Image.LANCZOS))
        resampled.save(output_path('pad-p20.%s.png' % device))
        ImageOps.grayscale(resampled).save(output_path('pad-p20.%s-gray.png' % device))


def write_silhouette(raw):
    coverage = raw.getchannel('A').point(lambda a: 255 if a > 128 else 0)
    silhouette = Image.new('L', raw.size, PARCHMENT)
    silhouette.paste(Image.new('L', raw.size, INK), mask=coverage)
    silhouette.save(output_path('pad-p20.silhouette.png'))


def flatten(image):
    background = Image.new('RGBA', image.size, BACKGROUND + (255,))
    background.alpha_composite(image)
    return background.convert('RGB')


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
