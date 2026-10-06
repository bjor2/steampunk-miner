"""
The cross-family review sheets of #151 section 4 (#144): the ladder of every family sorted by
grade on a planet palette's rock (`ladder.<palette>.png`, for the grayscale blind-order test on
every palette, `palette.heat` included), the mining-hit frame of every family and grade (the
drill tip on the cell, the grade's particle count bursting out, `mining-hit.png`) and the
sell-bay presentation per grade (loose pile, sacks, a crate with straw, a brass display case, a
lit pedestal under glass; `sell-bay.g<grade>.png`). Cells are built by the same builders as the
family files (author_ores.py), variant 0, so the sheets show the shipped marks. Headless:

    BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
      -P docs/art/ores/render_sheets.py -- [ladder|hits|sell ...] [--palette <id>]
"""

import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

import atlas_layout as layout  # noqa: E402
import author_ores as author  # noqa: E402
import ore_grades as grades  # noqa: E402
import ore_shapes as shapes  # noqa: E402
import ore_stage as stage  # noqa: E402

SHEET_DIR = author.SHEET_DIR
COLUMNS = len(stage.GRADES)
HIT_SEED = 1442
SELL_COLUMNS = 3
WOOD_HEX = '#3b2a1c'
JUTE_HEX = '#a88a5c'
STRAW_HEX = '#d2b55a'
BRASS_HEX = '#c9a24b'
VELVET_HEX = '#2a2436'
STONE_HEX = '#2c2a2e'
STEEL_HEX = '#9aa3ad'
DUST_HEX = '#8a7a66'


def main():
    given = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    palettes = [given[given.index('--palette') + 1]] if '--palette' in given else list(stage.PALETTES)
    jobs = [arg for arg in given if not arg.startswith('--') and arg not in palettes] or ['ladder', 'hits', 'sell']
    looks = layout.load_looks()
    if 'ladder' in jobs:
        for palette_id in palettes:
            render_ladder(looks, palette_id)
    if 'hits' in jobs:
        render_mining_hits(looks)
    if 'sell' in jobs:
        for grade in stage.GRADES:
            render_sell_bay(looks, grade)


def sheet_path(name):
    os.makedirs(SHEET_DIR, exist_ok=True)
    return os.path.join(SHEET_DIR, name)


# --- the ladder on every palette --------------------------------------------------------------------------


def render_ladder(looks, palette_id):
    families = looks['families']
    stage.reset_scene()
    stage.add_lamp_rig('shallow')
    labels = []
    for row, family in enumerate(families):
        labels.append([])
        for grade in stage.GRADES:
            centre = stage.cell_centre(grade - 1, row, COLUMNS, len(families))
            author.build_cell(family, 0, grade, centre, palette_id)
            labels[-1].append(layout.cell_id_of({'familyId': family['id'], 'variant': 0, 'grade': grade}))
    stage.frame_grid(COLUMNS, len(families))
    name = 'ladder.%s' % palette_id.split('.')[-1]
    sheet = stage.render_to(sheet_path(name + '.png'))
    report = stage.report_grid_luma(sheet, COLUMNS, len(families), labels, sheet_path(name + '.luma.json'))
    print('rendered %s: order holds on every row: %s' % (name, report['oreLumaRisesAlongEveryRow']))


# --- mining-hit frames ------------------------------------------------------------------------------------


def render_mining_hits(looks):
    families = looks['families']
    stage.reset_scene()
    stage.add_lamp_rig('shallow')
    for row, family in enumerate(families):
        for grade in stage.GRADES:
            centre = stage.cell_centre(grade - 1, row, COLUMNS, len(families))
            author.build_cell(family, 0, grade, centre)
            add_mining_hit(family, grade, centre, looks)
    stage.frame_grid(COLUMNS, len(families))
    stage.render_to(sheet_path('mining-hit.png'))
    print('rendered mining-hit')


def add_mining_hit(family, grade, centre, looks):
    """The drill tip biting the cell's left edge and the grade's particles thrown from the bite."""
    cx, cz = centre
    rng = random.Random('%d:%s:%d' % (HIT_SEED, family['id'], grade))
    steel = grades.materials.surface_material('drill-steel', STEEL_HEX, metallic=0.9, roughness=0.35)
    bite = (cx - 0.5, -0.1, cz + rng.uniform(-0.15, 0.15))
    tip = shapes.add_cone('drill-tip', 0.14, 0.42, (bite[0] - 0.14, bite[1], bite[2]),
                          rotation=shapes.Vector((1.0, 0.0, 0.0)).to_track_quat('Z', 'Y').to_euler(), sides=12)
    shapes.assign(tip, steel)
    count = looks['grades']['hitParticles'][grade - 1]
    colour = grades.core_hex(family) if grade >= looks['grades']['emissiveFromGrade'] else DUST_HEX
    strength = 3.0 if grade >= looks['grades']['emissiveFromGrade'] else 0.0
    spark = grades.glow_material('spark-%s-g%d' % (family['id'], grade), colour, strength) if strength else \
        grades.materials.surface_material('chip-%s' % family['id'], colour, roughness=0.9)
    for i in range(count):
        angle = rng.uniform(-1.1, 1.1)
        reach = rng.uniform(0.08, 0.42)
        location = (bite[0] + math.cos(angle) * reach, -0.12 - rng.uniform(0, 0.1), bite[2] + math.sin(angle) * reach)
        shapes.assign(shapes.add_icosphere('spark-%d' % i, rng.uniform(0.008, 0.02), location, subdivisions=1,
                                           scale=(1.0 + reach * 2, 1.0, 1.0), rotation=(0, -angle, 0)), spark)
    if grade >= 4:
        flash = shapes.add_icosphere('hit-flash', 0.05 + 0.02 * grade, (bite[0] + 0.05, -0.14, bite[2]), subdivisions=2)
        shapes.assign(flash, grades.glow_material('flash-%s' % family['id'], '#ffffff', 4.0))


# --- the sell bay ------------------------------------------------------------------------------------------


def render_sell_bay(looks, grade):
    families = looks['families']
    rows = math.ceil(len(families) / SELL_COLUMNS)
    stage.reset_scene()
    stage.add_lamp_rig('shallow')
    for at, family in enumerate(families):
        centre = stage.cell_centre(at % SELL_COLUMNS, at // SELL_COLUMNS, SELL_COLUMNS, rows)
        add_sell_floor(centre)
        PRESENTATIONS[grade](family, centre, looks)
    stage.frame_grid(SELL_COLUMNS, rows)
    stage.render_to(sheet_path('sell-bay.g%d.png' % grade))
    print('rendered sell-bay g%d' % grade)


def add_sell_floor(centre):
    cx, cz = centre
    floor = shapes.add_cube('bay-floor', 1.0, (cx, 0.125, cz), scale=(1.05, 0.25, 1.05))
    shapes.assign(floor, grades.materials.rock_material('bay-floor-wood', WOOD_HEX, bump_strength=0.15))


def add_ore_marks(family, grade, centre, looks, scale=1.0):
    objects = author.build_cell(family, 0, grade, centre, with_rock=False, with_light=grade == 5)
    for obj in objects:
        if obj.type != 'LIGHT':
            obj.scale = tuple(axis * scale for axis in obj.scale)
            obj.location = (centre[0] + (obj.location.x - centre[0]) * scale, obj.location.y, centre[1] + (obj.location.z - centre[1]) * scale)
    return objects


def loose_pile(family, centre, looks):
    cx, cz = centre
    mound = shapes.add_icosphere('pile', 0.42, (cx, 0.05, cz - 0.05), subdivisions=2, scale=(1.0, 0.5, 0.8))
    shapes.assign(mound, grades.materials.rock_material('pile-rock', stage.band_colour_hex(1), bump_strength=0.5))
    add_ore_marks(family, 1, centre, looks)


def sacks(family, centre, looks):
    cx, cz = centre
    jute = grades.materials.surface_material('jute', JUTE_HEX, roughness=0.95)
    for i, (dx, dz) in enumerate(((-0.22, -0.08), (0.22, -0.12))):
        sack = shapes.add_icosphere('sack-%d' % i, 0.26, (cx + dx, -0.05, cz + dz), subdivisions=2, scale=(1.0, 0.8, 1.15))
        shapes.assign(shapes.subdivide(sack), jute)
        tie = shapes.add_torus('sack-tie-%d' % i, 0.09, 0.025, (cx + dx, -0.05, cz + dz + 0.3), rotation=(math.pi / 2, 0, 0))
        shapes.assign(tie, jute)
    add_ore_marks(family, 2, (cx, cz + 0.05), looks, scale=0.8)


def crate_with_straw(family, centre, looks):
    cx, cz = centre
    wood = grades.materials.surface_material('crate-wood', '#6b4a2a', roughness=0.85)
    straw = grades.materials.surface_material('straw', STRAW_HEX, roughness=0.8)
    for i, (dx, dz, sx, sz) in enumerate(((0, -0.42, 0.92, 0.08), (0, 0.42, 0.92, 0.08), (-0.42, 0, 0.08, 0.92), (0.42, 0, 0.08, 0.92))):
        plank = shapes.add_cube('plank-%d' % i, 1.0, (cx + dx, -0.06, cz + dz), scale=(sx, 0.12, sz))
        shapes.assign(plank, wood)
    rng = random.Random('straw:' + family['id'])
    for i in range(14):
        angle = rng.uniform(0, math.tau)
        start = (cx + rng.uniform(-0.3, 0.3), -0.02, cz + rng.uniform(-0.3, 0.3))
        end = (start[0] + math.cos(angle) * 0.25, -0.02, start[2] + math.sin(angle) * 0.25)
        shapes.assign(shapes.add_tube('straw-%d' % i, [start, end], 0.008, resolution=1), straw)
    add_ore_marks(family, 3, centre, looks, scale=0.75)


def brass_display_case(family, centre, looks):
    cx, cz = centre
    brass = grades.materials.surface_material('case-brass', BRASS_HEX, metallic=0.9, roughness=0.45)
    velvet = grades.materials.surface_material('case-velvet', VELVET_HEX, roughness=1.0)
    glass = grades.materials.surface_material('case-glass', '#dfe8f0', roughness=0.05, transmission=0.95, ior=1.5)
    base = shapes.add_cube('case-base', 1.0, (cx, 0.02, cz), scale=(0.9, 0.1, 0.9))
    shapes.assign(base, velvet)
    for i, (dx, dz, sx, sz) in enumerate(((0, -0.45, 0.92, 0.04), (0, 0.45, 0.92, 0.04), (-0.45, 0, 0.04, 0.92), (0.45, 0, 0.04, 0.92))):
        shapes.assign(shapes.add_cube('case-rail-%d' % i, 1.0, (cx + dx, -0.14, cz + dz), scale=(sx, 0.28, sz)), brass)
    pane = shapes.add_cube('case-pane', 1.0, (cx, -0.27, cz), scale=(0.92, 0.01, 0.92))
    shapes.assign(pane, glass)
    add_ore_marks(family, 4, centre, looks, scale=0.7)


def lit_pedestal(family, centre, looks):
    cx, cz = centre
    stone = grades.materials.surface_material('pedestal', STONE_HEX, roughness=0.6)
    glass = grades.materials.surface_material('dome-glass', '#dfe8f0', roughness=0.03, transmission=0.96, ior=1.5)
    pedestal = shapes.add_cube('pedestal', 1.0, (cx, 0.0, cz - 0.4), scale=(0.7, 0.3, 0.16))
    shapes.assign(pedestal, stone)
    dome = shapes.add_icosphere('dome', 0.4, (cx, -0.1, cz + 0.05), subdivisions=3, scale=(1.0, 0.7, 1.0))
    shapes.assign(dome, glass)
    add_ore_marks(family, 5, (cx, cz + 0.05), looks, scale=0.6)
    stage.add_point_light('pedestal-lamp', (cx, -0.6, cz + 0.6), '#fff1dc', 18.0)


PRESENTATIONS = {1: loose_pile, 2: sacks, 3: crate_with_straw, 4: brass_display_case, 5: lit_pedestal}

if __name__ == '__main__':
    main()
