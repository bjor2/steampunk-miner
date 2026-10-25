"""
The review sheets cut from render_boiler_looks.py's renders (tickets 582, 810 and 873): every look
alone, the rig at tiers 1 and 3 with each look on the slot, each row resampled to a 1080p screen's
90 px/m at the default 12 m zoom (#39) and to a 360 px wide phone's 30 px/m over the same zoom
(the width the #576 ladder is judged at), the phone copy enlarged 8x with no smoothing so each
phone pixel shows. It also measures what the eye is asked to judge and writes readability.json:
how many phone pixels of the boiler's footprint each look changes against the one before it (at
the default zoom and at the closest, where the sweep spec judges a step), and the brightest pixel
of the drill nose against the brightest of the boiler for each look, lit and by glow alone (the
emission-only render, what the glow cap of #576 is about). Needs Pillow and numpy; run after the
Blender render, which leaves its raw PNGs in build/ (removed here):

    python3 docs/art/rig-look-boiler/sheet_boiler_looks.py
"""

import json
import os
import shutil

import numpy
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(HERE, 'build')
LOOKS_TABLE = os.path.join(HERE, 'boilerLooks.json')
VEHICLE_SIDECAR = os.path.join(REPO_ROOT, 'public', 'assets', 'vehicle', 'vehicle', 'vehicle.parts.json')
REPORT = os.path.join(HERE, 'readability.json')
BACKGROUND = (18, 14, 13)
LABEL_COLOUR = (226, 196, 140)
LABEL_PX = 28
RENDER_PX_PER_M = 512
INGAME_PX_PER_M = 90
# 360 CSS px across the default 12 m zoom (#39), the phone width the ladder is judged at.
PHONE_WIDTH_PX = 360
ZOOM_M = 12
PHONE_PX_PER_M = PHONE_WIDTH_PX / ZOOM_M
# The closest zoom (VIEW_SHORT_AXIS_MIN_M, 8 m), where the rig-look sweep spec judges one visible
# step (ticket 809: at least 16 pixels moved by 24 of 255).
CLOSEST_ZOOM_M = 8
PHONE_CLOSEST_PX_PER_M = PHONE_WIDTH_PX / CLOSEST_ZOOM_M
PHONE_ENLARGE = 8
# render_casing_driller.FRAME: (centre x, centre z), width, height in metres.
RIG_FRAME = ((0.05, 0.05), 2.1, 1.75)
RIG_TIERS = (1, 3)
GLOW_TIER = 1
# A phone pixel counts as changed when a channel moves by more than this (of 255).
CHANGED_THRESHOLD = 24
# Twenty-four looks (ticket 873) no longer fit one row.
SHEET_COLUMNS = 6


def main():
    table = read_json(LOOKS_TABLE)
    looks = [look['part'] for look in table['looks']]
    save_sheet('parts', [(part + '.front', part) for part in looks])
    for tier in RIG_TIERS:
        save_rig_sheets(tier, looks)
    save_sheet('glow', [('tier-%d.%s.glow' % (GLOW_TIER, part), part) for part in looks])
    write_report(table, looks)
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
    """Equal cells on a grid of SHEET_COLUMNS, row by row, each tile centred in its cell: the parts
    differ in size, the rig tiles do not."""
    width, height = max(tile.width for tile in tiles), max(tile.height for tile in tiles)
    columns = min(SHEET_COLUMNS, len(tiles))
    rows = (len(tiles) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * width, rows * height), BACKGROUND)
    for index, tile in enumerate(tiles):
        left = (index % columns) * width + (width - tile.width) // 2
        top = (index // columns) * height + (height - tile.height) // 2
        sheet.paste(tile, (left, top))
    return sheet


def resampled(image, px_per_m):
    scale = px_per_m / RENDER_PX_PER_M
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)


def enlarged(image):
    return image.resize((image.width * PHONE_ENLARGE, image.height * PHONE_ENLARGE), Image.NEAREST)


def sheet_path(name):
    return os.path.join(HERE, name + '.png')


# --- the measurements ------------------------------------------------------------------------------


def write_report(table, looks):
    sidecar = read_json(VEHICLE_SIDECAR)
    boiler = bounds_of_parts(sidecar, lambda part: part['id'] == table['replaces'])
    nose = bounds_of_parts(sidecar, lambda part: '-drill-' in part['id'] and part['tier'] == 1)
    lit = {'tier-%d' % tier: measured(tier, looks, boiler, nose) for tier in RIG_TIERS}
    glow = {part: brightest_of('tier-%d.%s.glow' % (GLOW_TIER, part), boiler, nose) for part in looks}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_about(table, lit, glow), file, indent=2)


def measured(tier, looks, boiler, nose):
    """Each step against the look before it (ticket 810: every step reads at 360 px), at the
    phone's px/m over the default zoom and over the closest zoom the sweep spec judges at."""
    rendered = {part: flattened('tier-%d.%s' % (tier, part)) for part in looks}
    phone = {part: resampled(image, PHONE_PX_PER_M) for part, image in rendered.items()}
    return {
        'phonePxPerM': PHONE_PX_PER_M,
        'boilerFootprintPx': stepped_pixels(phone, looks, boiler),
        'closestZoomPxPerM': PHONE_CLOSEST_PX_PER_M,
        'closestZoomBoilerFootprintPx': stepped_pixels(
            {part: resampled(image, PHONE_CLOSEST_PX_PER_M) for part, image in rendered.items()}, looks, boiler),
        'brightest': {part: brightest_of_image(image, boiler, nose) for part, image in phone.items()},
    }


def stepped_pixels(images, looks, bounds):
    """The boiler-footprint pixels each look changes against the look before it."""
    return {'%s->%s' % (before, after): changed_pixels(images[before], images[after], bounds)
            for before, after in zip(looks, looks[1:])}


def brightest_of(name, boiler, nose):
    return brightest_of_image(flattened(name), boiler, nose)


def brightest_of_image(image, boiler, nose):
    return {'nose': brightest_in(image, nose), 'boiler': brightest_in(image, boiler)}


def changed_pixels(base, step, bounds):
    box = pixel_box(bounds, base.size)
    before, after = pixels_in(base, box), pixels_in(step, box)
    changed = int((numpy.abs(before - after).max(axis=2) > CHANGED_THRESHOLD).sum())
    return {'changed': changed, 'of': int(before.shape[0] * before.shape[1])}


def brightest_in(image, bounds):
    return int(luminance(pixels_in(image, pixel_box(bounds, image.size))).max())


def pixels_in(image, box):
    return numpy.asarray(image.crop(box), dtype=numpy.int16)


def luminance(pixels):
    return numpy.rint(0.2126 * pixels[..., 0] + 0.7152 * pixels[..., 1] + 0.0722 * pixels[..., 2])


def pixel_box(bounds, size):
    """A metre rectangle of the vehicle frame as a pixel box of a phone-size rig render."""
    (centre_x, centre_z), width_m, height_m = RIG_FRAME
    px_per_m = size[0] / width_m
    left = (bounds[0] - (centre_x - width_m / 2)) * px_per_m
    right = (bounds[2] - (centre_x - width_m / 2)) * px_per_m
    top = ((centre_z + height_m / 2) - bounds[3]) * px_per_m
    bottom = ((centre_z + height_m / 2) - bounds[1]) * px_per_m
    return (int(left), int(top), int(right) + 1, int(bottom) + 1)


def bounds_of_parts(sidecar, chosen):
    """(min x, min z, max x, max z) in metres of the chosen parts, from the sidecar's layout."""
    boxes = [part_bounds(part) for part in sidecar['parts'] if chosen(part)]
    return (min(box[0] for box in boxes), min(box[1] for box in boxes),
            max(box[2] for box in boxes), max(box[3] for box in boxes))


def part_bounds(part):
    left = part['atM'][0] - part['pivotM'][0]
    bottom = part['atM'][1] - part['pivotM'][1]
    return (left, bottom, left + part['sizeM'][0], bottom + part['sizeM'][1])


def report_about(table, lit, glow):
    return {
        'about': 'Tickets 582, 810 and 873: at a 360 px wide phone (%g px/m over the 12 m zoom, and %g px/m over the '
                 'closest %g m zoom the sweep spec judges at), the pixels of the %s footprint that change between '
                 'each look and the one before it (a channel moving more than %d of 255), and the brightest '
                 'pixel (Rec. 709 luminance, 0-255) of the drill nose against the boiler for each look, the nose lit '
                 'as while drilling: under `lit` on the phone-size renders, under `glow` on the tier-%d '
                 'emission-only render at 512 px/m; written by sheet_boiler_looks.py. The nose must stay the '
                 'brightest glow.' % (PHONE_PX_PER_M, PHONE_CLOSEST_PX_PER_M, CLOSEST_ZOOM_M, table['replaces'],
                                      CHANGED_THRESHOLD, GLOW_TIER),
        'lit': lit,
        'glow': glow,
    }


if __name__ == '__main__':
    main()
