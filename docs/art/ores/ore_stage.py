"""
The stage the ore art is authored, baked and reviewed on (#144): a grid of 1 m cells in the #52
frame (metric, game right +X, game up +Z, Y is depth; a feature at negative Y stands proud of the
tile face at y = 0), each cell on its band's rock, seen by an orthographic camera at -Y the way the
game sees it. The ladder prototype's stage (docs/art/ore-ladder/ladder_scene.py) is reused for the
scene reset, the lamp rig, the cameras, the renders and the image post; this module adds the grid,
the planet palettes, the deep-ambient rig and the per-cell luma report.
"""

import json
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LADDER = os.path.normpath(os.path.join(HERE, '..', 'ore-ladder'))
for folder in (HERE, LADDER):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import atlas_layout as layout  # noqa: E402
import ladder_scene as ladder  # noqa: E402
import ore_materials as materials  # noqa: E402
import ore_shapes as shapes  # noqa: E402

REPO_ROOT = ladder.REPO_ROOT
ART_DIRECTION_PATH = os.path.join(REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')

CELL_M = 1.0
PITCH_M = 1.1
PX_PER_M = 256
CLOSEUP_PX_PER_M = 480
IN_GAME_DOWNSAMPLE = ladder.IN_GAME_DOWNSAMPLE
SAMPLES = 32
THREADS = 4
PEAK_FRAME = ladder.PEAK_FRAME
BAND_COUNT = 5
GRADES = (1, 2, 3, 4, 5)
# The grade's rock: G1 on band 1 up to G5 on band 5, the way the ladder prototype staged it.
BAND_OF_GRADE = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}
PALETTES = ('palette.planet_1', 'palette.planet_2', 'palette.heat')
DEFAULT_PALETTE = 'palette.planet_1'


# --- scene -----------------------------------------------------------------------------------------


def reset_scene():
    scene = ladder.reset_scene()
    scene.cycles.samples = SAMPLES
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = THREADS
    return scene


def add_lamp_rig(ambient):
    """`shallow`: the game's headlamp and fill. `deep`: the fill alone, dimmed, as band 5 looks."""
    if ambient == 'shallow':
        return ladder.add_lamp_rig()
    fill = bpy.data.lights.new('deep-fill', 'AREA')
    fill.energy = 35.0
    fill.size = 8.0
    fill.color = materials.linear_of_hex('#aab4c8')
    ladder.aim_light(ladder.link_object(bpy.data.objects.new('deep-fill', fill), (0, -3.5, 0.6)), (0.0, 1.0, -0.15))
    key = bpy.data.lights.new('deep-key', 'SUN')
    key.energy = 0.6
    key.color = materials.linear_of_hex('#ffe9c8')
    return ladder.aim_light(ladder.link_object(bpy.data.objects.new('deep-key', key), (0, -4, 3)), (0.35, 0.8, -0.45))


def collection_named(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(objects, collection):
    for obj in objects:
        for other in list(obj.users_collection):
            other.objects.unlink(obj)
        collection.objects.link(obj)


# --- host rock -------------------------------------------------------------------------------------


def palette_of(palette_id):
    with open(ART_DIRECTION_PATH, encoding='utf-8') as file:
        return json.load(file)['palettes'][palette_id]


def band_colour_hex(band, palette_id=DEFAULT_PALETTE):
    """The planet's band colour, surface to deep, mixed in display values like bandPalette.ts."""
    palette = palette_of(palette_id)
    return materials.mix_hex(palette['surface'], palette['deep'], (band - 1) / (BAND_COUNT - 1))


def add_rock_slab(name, centre, rock_hex):
    """A 1 m cell of rock, 0.25 m thick behind the face at y = 0, in the `stage` collection."""
    cx, cz = centre
    slab = shapes.add_cube(name, CELL_M, (cx, 0.125, cz), scale=(1.0, 0.25, 1.0))
    shapes.assign(slab, materials.rock_material(name + '-rock', rock_hex))
    move_to_collection([slab], collection_named('stage'))
    return slab


# --- cameras and renders ---------------------------------------------------------------------------


def frame_grid(columns, rows, px_per_m=PX_PER_M, centre=(0.0, 0.0)):
    """Frames `columns` x `rows` cells on the pitch, centred on `centre`."""
    cx, cz = centre
    scene = bpy.context.scene
    camera = ladder.scene_camera()
    camera.data.type = 'ORTHO'
    width, height = columns * PITCH_M, rows * PITCH_M
    camera.data.ortho_scale = max(width, height)
    camera.location = (cx, -6.0, cz)
    camera.rotation_euler = (np.pi / 2, 0.0, 0.0)
    scene.render.resolution_x = round(width * px_per_m)
    scene.render.resolution_y = round(height * px_per_m)
    scene.render.resolution_percentage = 100
    return width, height


def cell_centre(column, row, columns, rows):
    """Column 0 at the left, row 0 at the top, the grid centred on the origin."""
    x = (column - (columns - 1) / 2) * PITCH_M
    z = ((rows - 1) / 2 - row) * PITCH_M
    return x, z


def render_to(path, frame=PEAK_FRAME):
    return ladder.render_frame_to(path, frame)


save_blend = ladder.save_blend
read_pixels = ladder.read_pixels
write_png = ladder.write_png
luma_of = ladder.luma_of
write_grayscale = ladder.write_grayscale
write_downsampled = ladder.write_downsampled
blink = ladder.blink
add_point_light = ladder.add_point_light


# --- luma report -----------------------------------------------------------------------------------


def report_grid_luma(png_path, columns, rows, labels, dst_json, px_per_m=PX_PER_M):
    """
    Per cell: mean luma of the ore area (the central 0.7 m) and of the rock margin (the outer
    0.1 m), the peak, and the contrast between them, as the ladder prototype measured. `labels`
    gives one id per (row, column). The order check is per row: ore luma rises along the row.
    """
    luma = luma_of(read_pixels(png_path))
    cells = []
    for row in range(rows):
        for column in range(columns):
            cells.append(cell_luma_row(luma, column, row, columns, rows, labels[row][column], px_per_m))
    report = {'pxPerMetre': px_per_m, 'cells': cells,
              'oreLumaRisesAlongEveryRow': rises_along_every_row(cells, columns, rows, 'oreLuma'),
              'bodyLumaRisesAlongEveryRow': rises_along_every_row(cells, columns, rows, 'bodyLuma')}
    with open(dst_json, 'w', encoding='utf-8', newline='\n') as file:
        file.write(layout.json_text_of(report))
    return report


def rises_along_every_row(cells, columns, rows, key):
    """Whether the measure climbs with the grade along every variant row; None if it was not measured."""
    if any(key not in cell for cell in cells):
        return None
    return all(a[key] < b[key] for r in range(rows)
               for a, b in zip(cells[r * columns:(r + 1) * columns], cells[r * columns + 1:(r + 1) * columns]))


def cell_luma_row(luma, column, row, columns, rows, label, px_per_m):
    px = px_per_m
    left = (column * PITCH_M + (PITCH_M - CELL_M) / 2) * px
    top = (row * PITCH_M + (PITCH_M - CELL_M) / 2) * px
    cell = luma[round(top):round(top + CELL_M * px), round(left):round(left + CELL_M * px)]
    inset = round(0.15 * px)
    ore = cell[inset:-inset, inset:-inset]
    margin = cell.copy()
    margin[round(0.1 * px):-round(0.1 * px), round(0.1 * px):-round(0.1 * px)] = np.nan
    ore_luma, rock_luma = float(ore.mean()), float(np.nanmean(margin))
    contrast = (max(ore_luma, rock_luma) + 0.05) / (min(ore_luma, rock_luma) + 0.05)
    row = {'id': label, 'oreLuma': round(ore_luma, 4), 'rockLuma': round(rock_luma, 4),
           'orePeakLuma': round(float(ore.max()), 4), 'contrast': round(contrast, 2)}
    mask = mask_of_tile(label, cell.shape[0])
    if mask is not None and mask.any():
        body_luma = float(cell[mask].mean())
        row['bodyLuma'] = round(body_luma, 4)
        row['bodyContrast'] = round((body_luma + 0.05) / (rock_luma + 0.05), 2)
        row['coverage'] = round(float(mask.mean()), 3)
    return row


def mask_of_tile(cell_id, px):
    """The baked albedo's alpha, scaled to the sheet's cell, so body luma is measured on the ore alone."""
    path = os.path.join(REPO_ROOT, 'art', 'build', 'ores', cell_id + '.albedo.png')
    if not os.path.isfile(path):
        return None
    image = bpy.data.images.load(path, check_existing=False)
    image.scale(px, px)
    pixels = np.empty(px * px * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(px, px, 4)[::-1, :, 3] > 0.5
