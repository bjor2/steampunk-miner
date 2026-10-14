"""
The review sheets cut from render_upgrade_workshop.py's raw renders (ticket 395): the hangar with
its add-ons at 1080p's density, the same in grayscale, at the #173 reference phone (a short side of
390 CSS px) at the default 12 m zoom, and as a silhouette, ink on parchment from the render's
coverage alone; and the idle frames side by side as one strip. Needs Pillow; run after the
Blender render:

    python3 docs/art/upgrade-workshop/sheet_upgrade_workshop.py
"""

import glob
import os

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
DESKTOP_PX_PER_M = 90
PHONE_PX_PER_M = 390 / 12
BACKGROUND = (18, 14, 13)
PARCHMENT, INK = 235, 20
STRIP_GAP_PX = 12


def main():
    raw = Image.open(output_path('host.desktop.raw.png')).convert('RGBA')
    write_host_variants(raw)
    write_silhouette(raw)
    os.remove(output_path('host.desktop.raw.png'))
    write_idle_strip()


def write_host_variants(raw):
    flatten(raw).save(output_path('host.desktop.png'))
    ImageOps.grayscale(flatten(raw)).save(output_path('host.desktop-gray.png'))
    scale = PHONE_PX_PER_M / DESKTOP_PX_PER_M
    phone = flatten(raw.resize((round(raw.width * scale), round(raw.height * scale)), Image.LANCZOS))
    phone.save(output_path('host.phone.png'))
    ImageOps.grayscale(phone).save(output_path('host.phone-gray.png'))


def write_silhouette(raw):
    coverage = raw.getchannel('A').point(lambda a: 255 if a > 128 else 0)
    silhouette = Image.new('L', raw.size, PARCHMENT)
    silhouette.paste(Image.new('L', raw.size, INK), mask=coverage)
    silhouette.save(output_path('host.silhouette.png'))


def write_idle_strip():
    paths = sorted(glob.glob(output_path('idle.*.raw.png')))
    frames = [flatten(Image.open(path).convert('RGBA')) for path in paths]
    width = sum(frame.width for frame in frames) + STRIP_GAP_PX * (len(frames) - 1)
    strip = Image.new('RGB', (width, frames[0].height), (235, 228, 214))
    left = 0
    for frame in frames:
        strip.paste(frame, (left, 0))
        left += frame.width + STRIP_GAP_PX
    strip.save(output_path('idle.motion.png'))
    for path in paths:
        os.remove(path)


def flatten(image):
    background = Image.new('RGBA', image.size, BACKGROUND + (255,))
    background.alpha_composite(image)
    return background.convert('RGB')


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
