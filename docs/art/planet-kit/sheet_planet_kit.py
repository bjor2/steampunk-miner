"""
The contact sheets cut from render_planet_kit.py's raw renders (ticket 825): the rig at tiers 1 and
3 bare and with the kit tools fitted, at rest and acting, and the Assay & Exchange bare and with
each merchant's frontage, each row at a 1080p screen's 90 px/m over the default 12 m zoom (#39) and
at a 360 px wide phone's 30 px/m over the same zoom, the phone copy enlarged 4x with no smoothing so
each phone pixel shows; the socket parts and frontages alone; and readability.json: how many phone
pixels each tool changes against the bare rig and each frontage against the bare station, the
numbers behind "reads at 360 px and 1280+". Needs Pillow and numpy; run after the Blender render,
which leaves its raw PNGs in build/ (removed here):

    python3 docs/art/planet-kit/sheet_planet_kit.py
"""

import json
import os
import shutil

import numpy
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
REPORT = os.path.join(HERE, 'readability.json')
BACKGROUND = (18, 14, 13)
LABEL_COLOUR = (226, 196, 140)
LABEL_PX = 24
GAP = 16
RIG_RENDER_PX_PER_M = 512
DESKTOP_PX_PER_M = 90
# 360 CSS px across the default 12 m zoom (#39), the phone width the kit is judged at.
PHONE_PX_PER_M = 360 / 12
PHONE_ENLARGE = 4
# A phone pixel counts as changed when a channel moves by more than this (of 255).
CHANGED_THRESHOLD = 24
RIG_TIERS = (1, 3)
SOCKET_ASSETS = ('vehicle-item-scree-plough', 'vehicle-item-damp-flask', 'vehicle-item-shard-tongs', 'vehicle-item-vent-vane')
FRONTAGES = ['platform-merchant-%d' % place for place in range(1, 6)]
CRATE = 'prop-cache-crate'


def main():
    rig_rows = [('tier-%d %s' % (tier, look), raw('rig.tier-%d.%s' % (tier, look)), RIG_RENDER_PX_PER_M)
                for tier in RIG_TIERS for look in ('bare', 'rest', 'acting')]
    station_rows = [('station bare', raw('station.bare'), DESKTOP_PX_PER_M)]
    station_rows += [(asset, raw('station.%s' % asset), DESKTOP_PX_PER_M) for asset in FRONTAGES]
    for name, rows in (('rig', rig_rows), ('merchants', station_rows)):
        save_sheet('%s.desktop' % name, [(label, at_density(image, source, DESKTOP_PX_PER_M)) for label, image, source in rows])
        save_sheet('%s.phone' % name, [(label, enlarged(at_density(image, source, PHONE_PX_PER_M))) for label, image, source in rows])
    save_sheet('parts', [(asset, raw('%s.front' % asset)) for asset in SOCKET_ASSETS + (CRATE,)])
    save_sheet('frontages', [(asset, raw('%s.front' % asset)) for asset in FRONTAGES])
    write_report()
    shutil.rmtree(BUILD)


def raw(name):
    return Image.open(os.path.join(BUILD, name + '.png')).convert('RGBA')


def at_density(image, source_px_per_m, px_per_m):
    scale = px_per_m / source_px_per_m
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)


def enlarged(image):
    return image.resize((image.width * PHONE_ENLARGE, image.height * PHONE_ENLARGE), Image.NEAREST)


def flatten(image):
    background = Image.new('RGBA', image.size, BACKGROUND + (255,))
    background.alpha_composite(image)
    return background.convert('RGB')


def save_sheet(name, cells):
    """The cells side by side on the dark backdrop, each labelled, in colour and in grey."""
    images = [flatten(image) for _, image in cells]
    width = sum(image.width for image in images) + GAP * (len(images) + 1)
    height = max(image.height for image in images) + LABEL_PX + GAP * 2
    sheet = Image.new('RGB', (width, height), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    left = GAP
    for (label, _), image in zip(cells, images):
        sheet.paste(image, (left, GAP + LABEL_PX))
        draw.text((left, GAP), label, fill=LABEL_COLOUR)
        left += image.width + GAP
    sheet.save(os.path.join(HERE, name + '.png'))
    sheet.convert('L').save(os.path.join(HERE, name + '-gray.png'))


def changed_pixels(before, after):
    a = numpy.asarray(flatten(before)).astype(int)
    b = numpy.asarray(flatten(after)).astype(int)
    return int((numpy.abs(a - b).max(axis=2) > CHANGED_THRESHOLD).sum())


def write_report():
    """Phone pixels each fitted look changes on the rig, and each frontage changes on the station."""
    report = {'phonePxPerM': PHONE_PX_PER_M, 'changedThreshold': CHANGED_THRESHOLD, 'rig': {}, 'merchants': {}}
    for tier in RIG_TIERS:
        bare = at_density(raw('rig.tier-%d.bare' % tier), RIG_RENDER_PX_PER_M, PHONE_PX_PER_M)
        for look in ('rest', 'acting'):
            fitted = at_density(raw('rig.tier-%d.%s' % (tier, look)), RIG_RENDER_PX_PER_M, PHONE_PX_PER_M)
            report['rig']['tier-%d.%s' % (tier, look)] = {'phonePixelsChanged': changed_pixels(bare, fitted),
                                                           'rigPhonePixels': opaque_pixels(bare)}
    bare = at_density(raw('station.bare'), DESKTOP_PX_PER_M, PHONE_PX_PER_M)
    for asset in FRONTAGES:
        fitted = at_density(raw('station.%s' % asset), DESKTOP_PX_PER_M, PHONE_PX_PER_M)
        report['merchants'][asset] = {'phonePixelsChanged': changed_pixels(bare, fitted)}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report, file, indent=2)
        file.write('\n')


def opaque_pixels(image):
    return int((numpy.asarray(image.getchannel('A')) > 128).sum())


if __name__ == '__main__':
    main()
