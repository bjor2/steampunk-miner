"""
The review sheets cut from render_fuel_tender.py's renders (tickets 758, 813 and 874): every wagon
of the ladder alone, the rig at tiers 1 and 3 bare and with each wagon at the hitch, six tiles a
row, each sheet resampled to a 1080p screen's 90 px/m at the default 12 m zoom (#39) and to a 360
px wide phone's 30 px/m over the same zoom (the width the #576 ladder is judged at), the phone copy
enlarged 8x with no smoothing so each phone pixel shows. It also measures what the eye is asked to judge and writes readability.json: how many
phone pixels of the wagon's footprint change between each step and the one before it, at the
default zoom and at the closest, where the rig-look sweep spec judges a step (ticket 813), and the
brightest pixel of the drill nose against the brightest of the wagon for each step (the wagon has
no glow of its own; the tail's tint is the vehicle look's). Needs Pillow and numpy; run after the
Blender render, which leaves its raw PNGs in build/ (removed here):

    python3 docs/art/fuel-tender/sheet_fuel_tender.py
"""

import json
import os
import shutil

import numpy
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(HERE, 'build')
LADDER_TABLE = os.path.join(REPO_ROOT, 'src', 'data', 'vehicle', 'fuelTender.json')
VEHICLE_SIDECAR = os.path.join(REPO_ROOT, 'public', 'assets', 'vehicle', 'vehicle', 'vehicle.parts.json')
WAGON_SIDECAR = os.path.join(REPO_ROOT, 'public', 'assets', 'vehicle', 'vehicle-fuel-tank', 'vehicle-fuel-tank.parts.json')
REPORT = os.path.join(HERE, 'readability.json')
BACKGROUND = (18, 14, 13)
LABEL_COLOUR = (226, 196, 140)
LABEL_PX = 28
RENDER_PX_PER_M = 512
INGAME_PX_PER_M = 90
PHONE_WIDTH_PX = 360
ZOOM_M = 12
PHONE_PX_PER_M = PHONE_WIDTH_PX / ZOOM_M
# The closest zoom (VIEW_SHORT_AXIS_MIN_M, 8 m), where the rig-look sweep spec judges one visible
# step as at least 16 changed pixels of the slot's crop (#157; the LK5 steps of ticket 813).
CLOSEST_ZOOM_M = 8
PHONE_CLOSEST_PX_PER_M = PHONE_WIDTH_PX / CLOSEST_ZOOM_M
PHONE_ENLARGE = 8
# render_fuel_tender.RIG_FRAME: (centre x, centre z), width, height in metres.
RIG_FRAME = ((-0.25, 0.05), 2.7, 1.75)
RIG_TIERS = (1, 3)
BARE = 'rig'
CHANGED_THRESHOLD = 24
# Tiles a row on every sheet: seventeen wagons in one row would be 24,000 px wide (ticket 874).
TILES_A_ROW = 6


def main():
    table = read_json(LADDER_TABLE)
    parts = [step['part'] for step in table['steps']]
    save_sheet('parts', [(part + '.front', part) for part in parts])
    for tier in RIG_TIERS:
        save_rig_sheets(tier, [BARE] + parts)
    write_report(table, parts)
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
    width, height = max(tile.width for tile in tiles), max(tile.height for tile in tiles)
    columns = min(len(tiles), TILES_A_ROW)
    rows = -(-len(tiles) // columns)
    sheet = Image.new('RGB', (columns * width, rows * height), BACKGROUND)
    for index, tile in enumerate(tiles):
        column, row = index % columns, index // columns
        sheet.paste(tile, (column * width + (width - tile.width) // 2, row * height + (height - tile.height) // 2))
    return sheet


def resampled(image, px_per_m):
    scale = px_per_m / RENDER_PX_PER_M
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)


def enlarged(image):
    return image.resize((image.width * PHONE_ENLARGE, image.height * PHONE_ENLARGE), Image.NEAREST)


def sheet_path(name):
    return os.path.join(HERE, name + '.png')


# --- the measurements ------------------------------------------------------------------------------


def write_report(table, parts):
    vehicle = read_json(VEHICLE_SIDECAR)
    hitch = next(point['atM'] for point in vehicle['attach'] if point['id'] == table['attach'])
    footprint = wagon_footprint(read_json(WAGON_SIDECAR), hitch)
    nose = bounds_of_parts(vehicle, lambda part: '-drill-' in part['id'] and part['tier'] == 1)
    report = {
        'footprintM': footprint,
        'phonePxPerM': PHONE_PX_PER_M,
        'closestZoomPxPerM': PHONE_CLOSEST_PX_PER_M,
        'changedThreshold': CHANGED_THRESHOLD,
        'tiers': {'tier-%d' % tier: measured(tier, parts, footprint, nose) for tier in RIG_TIERS},
    }
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report, file, indent=2)


def wagon_footprint(sidecar, hitch):
    """The union of every wagon's box in the vehicle frame."""
    boxes = []
    for part in sidecar['parts']:
        x0 = hitch[0] + part['atM'][0] - part['pivotM'][0]
        z0 = hitch[1] + part['atM'][1] - part['pivotM'][1]
        boxes.append((x0, z0, x0 + part['sizeM'][0], z0 + part['sizeM'][1]))
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def bounds_of_parts(sidecar, keep):
    boxes = []
    for part in sidecar['parts']:
        if not keep(part):
            continue
        x0 = part['atM'][0] - part['pivotM'][0]
        z0 = part['atM'][1] - part['pivotM'][1]
        boxes.append((x0, z0, x0 + part['sizeM'][0], z0 + part['sizeM'][1]))
    return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]


def measured(tier, parts, footprint, nose):
    rendered = {name: flattened('tier-%d.%s' % (tier, name)) for name in [BARE] + parts}
    phone = {name: pixels(resampled(image, PHONE_PX_PER_M)) for name, image in rendered.items()}
    closest = {name: pixels(resampled(image, PHONE_CLOSEST_PX_PER_M)) for name, image in rendered.items()}
    full = {name: pixels(image) for name, image in rendered.items()}
    brightest = {part: {'nose': int(crop(full[part], nose, RENDER_PX_PER_M).max()),
                        'wagon': int(crop(full[part], footprint, RENDER_PX_PER_M).max())} for part in parts}
    return {'footprintPhonePx': footprint_pixels(phone[BARE], footprint, PHONE_PX_PER_M),
            'changedPhonePx': stepped_pixels(phone, parts, footprint, PHONE_PX_PER_M),
            'footprintClosestZoomPx': footprint_pixels(closest[BARE], footprint, PHONE_CLOSEST_PX_PER_M),
            'changedClosestZoomPx': stepped_pixels(closest, parts, footprint, PHONE_CLOSEST_PX_PER_M),
            'brightest': brightest}


def footprint_pixels(rows, footprint, px_per_m):
    cropped = crop(rows, footprint, px_per_m)
    return int(cropped.shape[0] * cropped.shape[1])


def stepped_pixels(images, parts, footprint, px_per_m):
    """The footprint pixels each step changes against the step before it (the bare rig first)."""
    changed = {}
    before = BARE
    for part in parts:
        changed[part] = int(changed_pixels(crop(images[before], footprint, px_per_m), crop(images[part], footprint, px_per_m)))
        before = part
    return changed


def pixels(image):
    return numpy.asarray(image.convert('RGB')).astype(numpy.int16)


def crop(rows, box, px_per_m):
    """A metres box in the vehicle frame cut from a render framed on RIG_FRAME, rows top-down."""
    (cx, cz), width, height = RIG_FRAME
    left, top = cx - width / 2, cz + height / 2
    x0, x1 = int((box[0] - left) * px_per_m), int((box[2] - left) * px_per_m) + 1
    y0, y1 = int((top - box[3]) * px_per_m), int((top - box[1]) * px_per_m) + 1
    return rows[max(y0, 0):y1, max(x0, 0):x1]


def changed_pixels(before, after):
    height, width = min(before.shape[0], after.shape[0]), min(before.shape[1], after.shape[1])
    delta = numpy.abs(before[:height, :width] - after[:height, :width]).max(axis=2)
    return (delta > CHANGED_THRESHOLD).sum()


if __name__ == '__main__':
    main()
