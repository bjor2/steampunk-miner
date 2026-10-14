"""
Lays the service station's raw renders (build/, from render_service_station.py) out into the
committed review sheets beside this file (ticket 398). Blender's Python has no PIL, so this runs in
the system python3 with Pillow.

    python3 docs/art/service-station/sheet_service_station.py

- front.png, three-quarter.png: the building alone on a dusk backdrop.
- dock.png: on the pad with the casing driller parked at the rest point, at 1080p's 90 px/m.
- dock.phone.png, dock.phone-gray.png: the same at a phone's 32.5 px/m (390 CSS px over the
  12 m zoom), in colour and grayscale, to check the three bays still read.
- idle.motion.png: the four idle poses side by side (ore a quarter pitch further each, the arcs
  and sparks lit, flipped or dark) as stationIdleMotion.ts poses them.
"""

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
DUSK = (28, 18, 32, 255)
DESKTOP_PX_PER_M = 90
PHONE_PX_PER_M = 32.5
IDLE_FRAMES = 4
GAP = 12


def main():
    for name in ('front', 'three-quarter', 'dock'):
        on_dusk(raw(name)).save(os.path.join(HERE, name + '.png'))
    write_phone_sheets()
    write_idle_strip()


def raw(name):
    return Image.open(os.path.join(BUILD, name + '.png')).convert('RGBA')


def on_dusk(image):
    backdrop = Image.new('RGBA', image.size, DUSK)
    backdrop.alpha_composite(image)
    return backdrop.convert('RGB')


def write_phone_sheets():
    dock = on_dusk(raw('dock'))
    scale = PHONE_PX_PER_M / DESKTOP_PX_PER_M
    phone = dock.resize((round(dock.width * scale), round(dock.height * scale)), Image.LANCZOS)
    phone.save(os.path.join(HERE, 'dock.phone.png'))
    phone.convert('L').save(os.path.join(HERE, 'dock.phone-gray.png'))


def write_idle_strip():
    frames = [on_dusk(raw('idle-%d' % index)) for index in range(IDLE_FRAMES)]
    width, height = frames[0].size
    strip = Image.new('RGB', (IDLE_FRAMES * width + (IDLE_FRAMES - 1) * GAP, height + 28), DUSK[:3])
    draw = ImageDraw.Draw(strip)
    for index, frame in enumerate(frames):
        left = index * (width + GAP)
        strip.paste(frame, (left, 28))
        draw.text((left + 8, 8), 'pose %d: ore +%d/4 pitch' % (index + 1, index), fill=(230, 214, 180))
    strip.save(os.path.join(HERE, 'idle.motion.png'))


if __name__ == '__main__':
    main()
