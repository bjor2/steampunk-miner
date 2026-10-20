"""
The review sheets cut from render_drill_type_looks.py's renders (ticket 622): the six looks alone,
the rig at tiers 1 and 3 bare and with each look on the slot, each row resampled to a 1080p
screen's 90 px/m at the default 12 m zoom (#39) and to a 360 px wide phone's 30 px/m over the same
zoom (the width the #308 close-out judges the types at), the phone copy enlarged 8x with no
smoothing so each phone pixel shows. It also measures what the eye is asked to judge and writes
readability.json: how many phone pixels of the drill window change between bare and each look and
between every pair of looks (#623's sweep asks that each type differs from bare and from the
others), and the brightest pixel of the drill nose against the brightest of the rest of the rig
for each look, lit and by glow alone (the emission-only render, what the glow cap of #576 is
about). Needs Pillow and numpy; run after the Blender render, which leaves its raw PNGs in build/
(removed here):

    python3 docs/art/rig-look-drill-type/sheet_drill_type_looks.py
"""

import json
import os
import shutil

import numpy
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
LOOKS_TABLE = os.path.join(HERE, 'drillTypeLooks.json')
REPORT = os.path.join(HERE, 'readability.json')
BACKGROUND = (18, 14, 13)
LABEL_COLOUR = (226, 196, 140)
LABEL_PX = 28
RENDER_PX_PER_M = 512
INGAME_PX_PER_M = 90
# 360 CSS px across the default 12 m zoom (#39), the phone width the looks are judged at.
PHONE_WIDTH_PX = 360
ZOOM_M = 12
PHONE_PX_PER_M = PHONE_WIDTH_PX / ZOOM_M
PHONE_ENLARGE = 8
TILES_PER_ROW = 4
# render_casing_driller.FRAME: (centre x, centre z), width, height in metres.
RIG_FRAME = ((0.05, 0.05), 2.1, 1.75)
RIG_TIERS = (1, 3)
GLOW_TIER = 1
# The drill window in the vehicle frame (min x, min z, max x, max z): from the head's back to past
# the longest look, as tall as the widest; the rest of the rig is everything outside it.
DRILL_WINDOW_M = (0.45, -0.55, 1.15, 0.55)
# A phone pixel counts as changed when a channel moves by more than this (of 255).
CHANGED_THRESHOLD = 24


def main():
    table = read_json(LOOKS_TABLE)
    looks = [look['look'] for look in table['looks']]
    with_parts = [look['look'] for look in table['looks'] if look['parts']]
    save_sheet('parts', [(part + '.front', part) for part in with_parts])
    for tier in RIG_TIERS:
        save_rig_sheets(tier, looks)
    save_sheet('glow', [('tier-%d.%s.glow' % (GLOW_TIER, part), part) for part in looks])
    write_report(looks)
    shutil.rmtree(BUILD)


def read_json(path):
    with open(path, encoding='utf8') as file:
        return json.load(file)


def save_sheet(name, renders):
    laid_out([labelled(flattened(render), label) for render, label in renders]).save(sheet_path(name))


def save_rig_sheets(tier, looks):
    tiles = [(flattened('tier-%d.%s' % (tier, part)), part) for part in looks]
    laid_out([labelled(tile, label) for tile, label in tiles]).save(sheet_path('tier-%d' % tier))
    ingame = [labelled(resampled(tile, INGAME_PX_PER_M), label) for tile, label in tiles]
    laid_out(ingame).save(sheet_path('tier-%d.ingame' % tier))
    phone = [labelled(enlarged(resampled(tile, PHONE_PX_PER_M)), label) for tile, label in tiles]
    laid_out(phone).save(sheet_path('tier-%d.phone' % tier))


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
    """Tiles in rows of TILES_PER_ROW, each cell as big as the biggest tile."""
    width = max(tile.width for tile in tiles)
    height = max(tile.height for tile in tiles)
    rows = (len(tiles) + TILES_PER_ROW - 1) // TILES_PER_ROW
    columns = min(len(tiles), TILES_PER_ROW)
    sheet = Image.new('RGB', (columns * width, rows * height), BACKGROUND)
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % TILES_PER_ROW) * width, (index // TILES_PER_ROW) * height))
    return sheet


def resampled(image, px_per_m):
    scale = px_per_m / RENDER_PX_PER_M
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)


def enlarged(image):
    return image.resize((image.width * PHONE_ENLARGE, image.height * PHONE_ENLARGE), Image.NEAREST)


def sheet_path(name):
    return os.path.join(HERE, name + '.png')


# --- the measurements ------------------------------------------------------------------------------


def write_report(looks):
    lit = {'tier-%d' % tier: measured(tier, looks) for tier in RIG_TIERS}
    glow = {part: brightest_of_image(flattened('tier-%d.%s.glow' % (GLOW_TIER, part))) for part in looks}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_about(lit, glow), file, indent=2)


def measured(tier, looks):
    phone = {part: resampled(flattened('tier-%d.%s' % (tier, part)), PHONE_PX_PER_M) for part in looks}
    return {
        'phonePxPerM': PHONE_PX_PER_M,
        'drillWindowPx': window_pixels(phone[looks[0]].size),
        'changedFromBare': {part: changed_pixels(phone[looks[0]], phone[part]) for part in looks[1:]},
        'changedBetween': pair_changes(phone, looks[1:]),
        'brightest': {part: brightest_of_image(image) for part, image in phone.items()},
    }


def pair_changes(phone, looks):
    return {'%s vs %s' % (first, second): changed_pixels(phone[first], phone[second])
            for index, first in enumerate(looks) for second in looks[index + 1:]}


def brightest_of_image(image):
    box = pixel_box(DRILL_WINDOW_M, image.size)
    inside = luminance(pixels_in(image, box))
    everything = luminance(numpy.asarray(image, dtype=numpy.int16))
    outside = everything.copy()
    outside[box[1]:box[3], box[0]:box[2]] = 0
    return {'nose': int(inside.max()), 'restOfRig': int(outside.max())}


def changed_pixels(base, step):
    box = pixel_box(DRILL_WINDOW_M, base.size)
    before, after = pixels_in(base, box), pixels_in(step, box)
    return int((numpy.abs(before - after).max(axis=2) > CHANGED_THRESHOLD).sum())


def window_pixels(size):
    box = pixel_box(DRILL_WINDOW_M, size)
    return (box[2] - box[0]) * (box[3] - box[1])


def pixels_in(image, box):
    return numpy.asarray(image.crop(box), dtype=numpy.int16)


def luminance(pixels):
    return numpy.rint(0.2126 * pixels[..., 0] + 0.7152 * pixels[..., 1] + 0.0722 * pixels[..., 2])


def pixel_box(bounds, size):
    """A metre rectangle of the vehicle frame as a pixel box of a rig render of this size."""
    (centre_x, centre_z), width_m, height_m = RIG_FRAME
    px_per_m = size[0] / width_m
    left = (bounds[0] - (centre_x - width_m / 2)) * px_per_m
    right = (bounds[2] - (centre_x - width_m / 2)) * px_per_m
    top = ((centre_z + height_m / 2) - bounds[3]) * px_per_m
    bottom = ((centre_z + height_m / 2) - bounds[1]) * px_per_m
    return (max(0, int(left)), max(0, int(top)), min(size[0], int(right) + 1), min(size[1], int(bottom) + 1))


def report_about(lit, glow):
    return {
        'about': 'Ticket 622: at a 360 px wide phone (%g px/m over the 12 m zoom), the pixels of the drill window '
                 '(%s m in the vehicle frame) that change between the bare rig and each look and between each pair '
                 'of looks (a channel moving more than %d of 255), and the brightest pixel (Rec. 709 luminance, '
                 '0-255) inside the drill window against the brightest of the rest of the rig for each look, the '
                 'nose lit as while drilling: under `lit` on the phone-size renders, under `glow` on the tier-%d '
                 'emission-only render at 512 px/m; written by sheet_drill_type_looks.py. The nose must stay the '
                 'brightest glow.' % (PHONE_PX_PER_M, list(DRILL_WINDOW_M), CHANGED_THRESHOLD, GLOW_TIER),
        'lit': lit,
        'glow': glow,
    }


if __name__ == '__main__':
    main()
