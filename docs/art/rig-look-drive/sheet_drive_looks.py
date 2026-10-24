"""
The review sheets cut from render_drive_looks.py's renders (tickets 731 and 811): every look alone,
the rig at tiers 1 and 3 bare and with each look on the slot, each row resampled to a 1080p screen's
90 px/m at the default 12 m zoom (#39) and to a 360 px wide phone's 30 px/m over the same zoom
(the width the #576 ladder is judged at), the phone copy enlarged 8x with no smoothing so each
phone pixel shows. It also measures what the eye is asked to judge and writes readability.json:
how many phone pixels of the look box (the table's `lookBoxM`: the undercarriage's footprint plus
the pod's belly the LK3 stacks rise over) change between each look and the one before it (and
between the bare rig and the base look, which should be none), at the default zoom and at the
closest, where the sweep spec judges a step, and the brightest pixel of the drill nose against the
brightest of the look box and of the rest of the rig for each look, lit and by glow alone (the
emission-only render, what the glow cap of #576 is about). Needs Pillow and numpy; run after the
Blender render, which leaves its raw PNGs in build/ (removed here):

    python3 docs/art/rig-look-drive/sheet_drive_looks.py
"""

import json
import os
import shutil

import numpy
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(HERE, 'build')
LOOKS_TABLE = os.path.join(HERE, 'driveLooks.json')
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
BARE = 'rig'
# A phone pixel counts as changed when a channel moves by more than this (of 255).
CHANGED_THRESHOLD = 24


def main():
    table = read_json(LOOKS_TABLE)
    looks = [look['part'] for look in table['looks']]
    save_sheet('parts', [(part + '.front', part) for part in looks])
    for tier in RIG_TIERS:
        save_rig_sheets(tier, [BARE] + looks)
    save_sheet('glow', [('tier-%d.%s.glow' % (GLOW_TIER, part), part) for part in [BARE] + looks])
    write_report(table, looks)
    shutil.rmtree(BUILD)


def read_json(path):
    with open(path, encoding='utf8') as file:
        return json.load(file)


def save_sheet(name, renders):
    laid_out([labelled(flattened(render), label) for render, label in renders]).save(sheet_path(name))


def save_rig_sheets(tier, tiles_wanted):
    tiles = [(flattened('tier-%d.%s' % (tier, part)), part) for part in tiles_wanted]
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
    """Side by side in equal cells, each tile centred: the parts differ in size, the rig tiles do not."""
    width, height = max(tile.width for tile in tiles), max(tile.height for tile in tiles)
    sheet = Image.new('RGB', (len(tiles) * width, height), BACKGROUND)
    for index, tile in enumerate(tiles):
        sheet.paste(tile, (index * width + (width - tile.width) // 2, (height - tile.height) // 2))
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
    track = tuple(table['lookBoxM'])
    look = (tuple(table['windowM']), tuple(table['stackBoxM']))
    nose = bounds_of_parts(sidecar, lambda part: '-drill-' in part['id'] and part['tier'] == 1)
    lit = {'tier-%d' % tier: measured(tier, looks, track, look, nose) for tier in RIG_TIERS}
    glow = {part: brightest_of('tier-%d.%s.glow' % (GLOW_TIER, part), look, nose) for part in [BARE] + looks}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_about(table, lit, glow), file, indent=2)


def measured(tier, looks, track, look, nose):
    """Each look against the one before it (ticket 811: every step reads at 360 px), at the phone's
    px/m over the default zoom and over the closest zoom the sweep spec judges at."""
    rendered = {part: flattened('tier-%d.%s' % (tier, part)) for part in [BARE] + looks}
    phone = {part: resampled(image, PHONE_PX_PER_M) for part, image in rendered.items()}
    closest = {part: resampled(image, PHONE_CLOSEST_PX_PER_M) for part, image in rendered.items()}
    return {
        'phonePxPerM': PHONE_PX_PER_M,
        'lookBoxPx': stepped_pixels(phone, looks, track),
        'closestZoomPxPerM': PHONE_CLOSEST_PX_PER_M,
        'closestZoomLookBoxPx': stepped_pixels(closest, looks, track),
        'brightest': {part: brightest_of_image(image, look, nose) for part, image in phone.items()},
    }


def stepped_pixels(images, looks, bounds):
    """The look-box pixels each look changes against the look before it, the bare rig first."""
    return {'%s -> %s' % (before, after): changed_pixels(images[before], images[after], bounds)
            for before, after in zip([BARE] + looks, looks)}


def brightest_of(name, look, nose):
    return brightest_of_image(flattened(name), look, nose)


def brightest_of_image(image, look, nose):
    """The look's boxes are the undercarriage window and the belly strip the stacks rise through:
    the headlamp's lens, lit at every look, stays out of them."""
    nose_box = pixel_box(nose, image.size)
    track = max(brightest_in(image, pixel_box(bounds, image.size)) for bounds in look)
    return {'nose': brightest_in(image, nose_box), 'track': track, 'restOfRig': brightest_outside(image, nose_box)}


def changed_pixels(base, step, bounds):
    box = pixel_box(bounds, base.size)
    before, after = pixels_in(base, box), pixels_in(step, box)
    changed = int((numpy.abs(before - after).max(axis=2) > CHANGED_THRESHOLD).sum())
    return {'changed': changed, 'of': int(before.shape[0] * before.shape[1])}


def brightest_in(image, box):
    return int(luminance(pixels_in(image, box)).max())


def brightest_outside(image, box):
    pixels = luminance(numpy.asarray(image, dtype=numpy.int16))
    pixels[box[1]:box[3], box[0]:box[2]] = 0
    return int(pixels.max())


def pixels_in(image, box):
    return numpy.asarray(image.crop(box), dtype=numpy.int16)


def luminance(pixels):
    return numpy.rint(0.2126 * pixels[..., 0] + 0.7152 * pixels[..., 1] + 0.0722 * pixels[..., 2])


def pixel_box(bounds, size):
    """A metre rectangle of the vehicle frame as a pixel box of a rig render of that size."""
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
        'about': 'Tickets 731 and 811: at a 360 px wide phone (%g px/m over the 12 m zoom, and %g px/m over the '
                 'closest %g m zoom the sweep spec judges at), the pixels of the drive look box %s (the '
                 'undercarriage and the pod\'s belly the stacks rise over) that change from each look to the next '
                 '(a channel moving more than %d of 255; the bare rig to the base look should change none), and the '
                 'brightest pixel (Rec. 709 luminance, 0-255) of the drill nose against the look (the undercarriage '
                 'window %s and the belly strip %s the stacks rise through, clear of the lit headlamp) and the rest '
                 'of the rig for each look, the nose lit as while drilling: under `lit` on the phone-size renders, under '
                 '`glow` on the tier-%d emission-only render at 512 px/m; written by sheet_drive_looks.py. The nose '
                 'must stay the brightest glow.' % (PHONE_PX_PER_M, PHONE_CLOSEST_PX_PER_M, CLOSEST_ZOOM_M,
                                                    table['lookBoxM'], CHANGED_THRESHOLD, table['windowM'],
                                                    table['stackBoxM'], GLOW_TIER),
        'lit': lit,
        'glow': glow,
    }


if __name__ == '__main__':
    main()
