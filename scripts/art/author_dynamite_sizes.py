"""
Authors the dynamite sizes' Blender sources (#145 first version; D7 #866 for the 12-row ladder of
D1 #860 and the GD lock of 25 Oct on #647, "types are verbs with their own stick colour, sparks
and decal; a rack socket with a slot per type and stock pips"): the charge rack that hangs on the
vehicle's `hull.rear` attach point, the planted prop of each size, and the crater decals a blast
leaves.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_dynamite_sizes.py

It writes art/blender/<id>/<id>.blend for vehicle-dynamite-rack, prop-dynamite-charge and
prop-blast-crater, or only the ids given after `--`, and each asset's placeholder sidecar
(art/placeholders/<id>.parts.json) from the same scene, so the export accepts the parts. Nothing
here is rigged (#51 acceptance 2); the wiring registers the ids through the art-id registry.

Conventions are author_platform.py's, whose piece builders and materials this reuses: 1 unit =
1 m, game right is +X, up is +Z, details stand out towards -Y. Each part is one mesh object named
for its part id, its origin the pivot the code draws it by.

- The type colours are the look rows' (src/features/dynamite-visuals/dynamiteLooks.json): every
  size of a type wears its `stick` colour on its charge bodies and its `spark` colour in its lamp
  glass, so the art and the rows never drift. Sizes 1 to 4 break (type 1), 5 to 8 go deep (type 2),
  9 to 12 are the biggest (type 3), per economy.json's blastingCharges.sizes.type.
- The rack (`vehicle-dynamite-rack`) is authored in its own frame with the attach point at the
  origin (K5: gear is drawn at its point's `atM`). The frame is `rack-frame` with three bays, one a
  type, each over a row of eight empty pip sockets; `slot-1` to `slot-3` are the types' bundles in
  their bays (the build shows a slot once a size of its type is open on the planet, and scales it
  with the Blast Radius band, #869); `pip-<type>-<n>` are the lit stock pips, one per charge of the
  type carried, up to the rack's eight slots; `wire-reel` and `plunger` are the remote detonator's
  (#153 amendment 2, the plunger of #866) on the arm side; `casing-nozzle` is the Blast Casing
  node's (#862), shown once owned, on the far side.
- The planted prop (`prop-dynamite-charge`) holds `planted-1` to `planted-12`, every one at the
  origin with its pivot at its centre, and `lamp-1` to `lamp-12`, the one glowing piece of each,
  kept apart so the fuse (sizes 1 to 6) or the armed light (7 to 12, remote) can blink. The ladder
  escalates by family, not only by scale: strapped sticks (1 to 3), a cradled bundle (4), crates of
  sticks (5, 6), galvanic kegs (7, 8), a riveted drum (9), the bomb (10), the caisson of two bombs
  under a yoke (11) and the spiked mine (12), every one inside its 1 m tile.
- The crater decals (`prop-blast-crater`) are 1 m discs facing the camera, pivot at the centre,
  authored in neutral greys and tinted by the build: `crater-1` a sooty star of cracks, `crater-2`
  a pit of concentric fissures, `crater-3` a shattered ring of slabs; `crater-cased-rim` a ring of
  riveted plates and `crater-cased-trim` its seam, which the Blast Casing look row tints in the
  laid grade's plate colour and its lining's trim (ticket 830). The crater edge sits at 0.84 of the
  disc's radius (DECAL_RIM_SHARE in chargeTypeLook.ts), so a decal scaled to the ground radius keeps
  its rim just outside the clearing.
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import asset_layout  # noqa: E402
import export_asset  # noqa: E402
from author_platform import (  # noqa: E402
    PALETTE,
    REPO_ROOT,
    box,
    build_part,
    cylinder,
    finish_piece,
    reset_scene,
    save_as,
    sphere,
    torus,
)

LOOKS_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'dynamite-visuals', 'dynamiteLooks.json')
RACK_ID = 'vehicle-dynamite-rack'
PROP_ID = 'prop-dynamite-charge'
CRATER_ID = 'prop-blast-crater'

# Base colour, roughness, emission strength (0 for none). The charge and spark colours of each type
# are added from the look rows at start-up (`add_type_materials`); the decals are neutral greys
# the build tints.
PALETTE.update({
    'fuse-cord': ((0.30, 0.24, 0.16), 0.8, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'crate-wood': ((0.40, 0.26, 0.13), 0.85, 0.0),
    'decal-bright': ((0.90, 0.90, 0.90), 0.8, 0.0),
    'decal-light': ((0.62, 0.62, 0.62), 0.85, 0.0),
    'decal-mid': ((0.36, 0.36, 0.36), 0.9, 0.0),
    'decal-dark': ((0.14, 0.14, 0.14), 0.95, 0.0),
})

# The platform's rivets are 3 cm; on parts this small they would swamp the brass.
SMALL_RIVET_RADIUS = 0.009

# Each planted size: its type (economy.json blastingCharges.sizes.type), its family and the
# family's measures, its lamp's place (X, Z) in the prop's frame, and the prop's rough extent
# (width, height) the rack scales it by.
SIZES = {
    1: dict(type=1, family='sticks', count=3, rows=1, stick=(0.036, 0.22), timer=(0.05, 0.105, 1),
            lamp=(0.07, 0.10), extent=(0.27, 0.28)),
    2: dict(type=1, family='sticks', count=4, rows=1, stick=(0.036, 0.24), timer=(0.065, 0.115, 1),
            lamp=(0.085, 0.11), extent=(0.36, 0.30)),
    3: dict(type=1, family='sticks', count=5, rows=1, stick=(0.036, 0.26), timer=(0.09, 0.125, 2),
            lamp=(0.11, 0.12), extent=(0.44, 0.33)),
    4: dict(type=1, family='cradle', count=4, rows=2, stick=(0.036, 0.28), timer=(0.0, 0.165, 2),
            lamp=(0.04, 0.17), extent=(0.45, 0.39)),
    5: dict(type=2, family='crate', crate=(0.48, 0.34, 0.38), ends=(3, 2), timer=(0.0, 0.235, 2),
            lamp=(0.04, 0.24), extent=(0.48, 0.46)),
    6: dict(type=2, family='crate', crate=(0.56, 0.38, 0.48), ends=(4, 3), timer=(-0.06, 0.285, 2),
            lamp=(-0.02, 0.29), extent=(0.56, 0.59)),
    7: dict(type=2, family='keg', radius=0.27, height=0.46, hoops=2,
            lamp=(0.0, 0.28), extent=(0.57, 0.63)),
    8: dict(type=2, family='keg', radius=0.31, height=0.52, hoops=3,
            lamp=(0.0, 0.31), extent=(0.65, 0.69)),
    9: dict(type=3, family='drum', radius=0.27, length=0.72, bands=2,
            lamp=(0.0, 0.305), extent=(0.77, 0.71)),
    10: dict(type=3, family='bomb', radius=0.30, length=0.30, bands=3,
             lamp=(0.0, 0.335), extent=(0.90, 0.78)),
    11: dict(type=3, family='caisson', radius=0.18, length=0.26, gap=0.40,
             lamp=(0.0, 0.44), extent=(0.76, 0.92)),
    12: dict(type=3, family='mine', radius=0.36, spikes=8, reach=0.46,
             lamp=(0.0, 0.40), extent=(0.92, 0.98)),
}
TYPES = sorted({spec['type'] for spec in SIZES.values()})
# The size whose model stands in each rack bay for its type: the sticks, a keg, the bomb.
SLOT_SIZE_OF_TYPE = {1: 2, 2: 7, 3: 10}


def main():
    add_type_materials(load_type_rows())
    for asset_id in requested_asset_ids():
        AUTHORS[asset_id]()


def requested_asset_ids():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return requested or list(AUTHORS)


# --- the look rows' colours ------------------------------------------------------------------------


def load_type_rows():
    with open(LOOKS_PATH, encoding='utf-8') as file:
        return json.load(file)['types']


def add_type_materials(rows):
    """One charge body colour and one glowing spark glass per type, from dynamiteLooks.json."""
    for row in rows:
        PALETTE['charge-%d' % row['type']] = (linear_of_hex(row['stick']), 0.55, 0.0)
        PALETTE['spark-%d' % row['type']] = (linear_of_hex(row['spark']), 0.2, 1.0)


def linear_of_hex(hex_colour):
    """`#rrggbb` (sRGB) to Blender's linear base colour."""
    return tuple(linear_of_channel(int(hex_colour[at:at + 2], 16) / 255.0) for at in (1, 3, 5))


def linear_of_channel(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def charge_material(spec):
    return 'charge-%d' % spec['type']


def spark_material(spec):
    return 'spark-%d' % spec['type']


# --- the placeholder sidecar ---------------------------------------------------------------------


def write_placeholder(asset_id, has_emissive):
    """The asset's placeholder sidecar from the scene just authored, laid out as the export lays it
    out, so `export_asset.py` accepts every part id (#52 "Placeholders")."""
    rules = asset_layout.load_rules()
    parts = export_asset.part_layouts_of(asset_id, rules, export_asset.part_objects())
    source = {'blend': 'art/blender/%s/%s.blend' % (asset_id, asset_id), 'sha256': None, 'blender': None}
    sidecar = asset_layout.build_sidecar(asset_id, parts, rules, source, has_emissive)
    asset_layout.write_sidecar(asset_layout.placeholder_path_of(asset_id), sidecar)


# --- the planted props -------------------------------------------------------------------------


def author_planted_charges():
    reset_scene()
    for size, spec in SIZES.items():
        build_part('planted-%d' % size, planted_pieces(spec, 1.0), at=(0.0, 0.0, 0.0), z_order=0)
        lamp_x, lamp_z = spec['lamp']
        build_part('lamp-%d' % size, lamp_pieces(spec, 1.0), at=(lamp_x, 0.0, lamp_z), z_order=1)
    write_placeholder(PROP_ID, has_emissive=True)
    save_as(PROP_ID)


def planted_pieces(spec, s):
    """The prop's body at scale `s` (1 planted, smaller on the rack), without its lamp."""
    return FAMILIES[spec['family']](spec, s)


def lamp_pieces(spec, s):
    """A brass socket on the prop's face with the glowing bulb in it, the only lit piece, in the
    type's spark colour."""
    return [
        cylinder('brass', 0.03 * s, 0.02 * s, (0.0, -0.075 * s, 0.0), 'Y'),
        sphere(spark_material(spec), 0.022 * s, (0.0, -0.088 * s, 0.0), flatten=0.7),
    ]


# --- families ------------------------------------------------------------------------------------


def strapped_sticks(spec, s):
    """Sizes 1 to 3: a row of sticks in brass straps with a clockwork timer."""
    radius, height = spec['stick']
    pieces = stick_rows(spec, radius, height, s)
    width = row_width(spec['count'], radius)
    pieces += straps(width + 0.03, 0.08 + 0.05 * (spec['rows'] - 1), height, s)
    pieces += timer_pieces(spec['timer'], s)
    return pieces


def cradled_bundle(spec, s):
    """Size 4: two rows of four sticks in an iron cradle, the timer box on top of the bundle."""
    radius, height = spec['stick']
    pieces = stick_rows(spec, radius, height, s)
    width = row_width(spec['count'], radius)
    pieces += straps(width + 0.03, 0.13, height, s)
    pieces += [
        box('dark-iron', scaled((width + 0.12, 0.16, 0.03), s), scaled((0.0, 0.0, -0.02 - height / 2 - 0.015), s)),
        box('iron', scaled((0.03, 0.14, height + 0.06), s), scaled((-(width + 0.12) / 2 + 0.015, 0.0, -0.02), s)),
        box('iron', scaled((0.03, 0.14, height + 0.06), s), scaled(((width + 0.12) / 2 - 0.015, 0.0, -0.02), s)),
    ]
    pieces += timer_pieces(spec['timer'], s, width=0.18)
    return pieces


def stick_crate(spec, s):
    """Sizes 5 and 6: a wooden crate with brass corners, the stick ends showing on its face."""
    width, depth, height = spec['crate']
    columns, rows = spec['ends']
    pieces = [box('crate-wood', scaled((width, depth, height), s), (0.0, 0.0, 0.0))]
    pieces += [box('iron', scaled((0.028, depth + 0.02, height + 0.02), s), scaled((x, 0.0, 0.0), s))
               for x in (-width / 4, width / 4)]
    pieces += [box('brass', scaled((0.05, 0.014, 0.05), s), scaled((x, -depth / 2 - 0.004, z), s))
               for x in (-width / 2 + 0.03, width / 2 - 0.03) for z in (-height / 2 + 0.03, height / 2 - 0.03)]
    pieces += stick_ends(spec, columns, rows, width, depth, height, s)
    pieces += timer_pieces(spec['timer'], s, width=0.16)
    if columns == 4:
        pieces += [sphere('brass', 0.05 * s, scaled((0.17, -0.02, height / 2 + 0.05), s), flatten=0.8),
                   cylinder('brass', 0.055 * s, 0.015 * s, scaled((0.17, -0.02, height / 2 + 0.008), s), 'Z')]
    return pieces


def galvanic_keg(spec, s):
    """Sizes 7 and 8: a powder keg in the type's paint and brass hoops, galvanic terminals on its lid."""
    radius, height = spec['radius'], spec['height']
    pieces = [
        cylinder(charge_material(spec), radius * s, height * s, (0.0, 0.0, 0.0), 'Z'),
        cylinder('dark-iron', radius * 0.96 * s, 0.024 * s, (0.0, 0.0, (height / 2 + 0.01) * s), 'Z'),
        cylinder('dark-iron', radius * 0.96 * s, 0.024 * s, (0.0, 0.0, -(height / 2 + 0.01) * s), 'Z'),
    ]
    for index in range(spec['hoops']):
        z = -height / 2 + height * (index + 1) / (spec['hoops'] + 1)
        pieces.append(hoop('brass', (radius + 0.004) * s, 0.013 * s, (0.0, 0.0, z * s)))
        pieces += [small_rivet(scaled((radius * math.sin(angle) * 0.92, -radius * math.cos(angle) * 0.92, z + 0.03), s), s)
                   for angle in (-0.5, 0.0, 0.5)]
    pieces += terminal_pieces((0.0, height / 2 + 0.02), radius, s)
    return pieces


def riveted_drum(spec, s):
    """Size 9: a riveted drum in the type's paint lying on chocks, brass end caps, a gauge on its face."""
    radius, length = spec['radius'], spec['length']
    pieces = [cylinder(charge_material(spec), radius * s, length * s, (0.0, 0.0, 0.0), 'X')]
    pieces += [cylinder('brass', (radius + 0.02) * s, 0.045 * s, ((x) * s, 0.0, 0.0), 'X')
               for x in (-(length / 2 - 0.02), length / 2 - 0.02)]
    pieces += [band('brass', (radius + 0.004) * s, 0.014 * s, (x * s, 0.0, 0.0))
               for x in (-length / 6, length / 6)]
    pieces += [small_rivet(scaled((x, -radius * 0.94, radius * 0.3), s), s)
               for x in stepped_between(-length / 2 + 0.08, length / 2 - 0.08, 7)]
    pieces += gauge_pieces((0.02, -radius, -0.02), s)
    pieces += chocks(length, radius, s)
    pieces += terminal_pieces((0.0, radius + 0.005), length / 2, s)
    return pieces


def riveted_bomb(spec, s):
    """Size 10: the bomb, a drum between two domes in three brass bands, a charge window glowing."""
    radius, length = spec['radius'], spec['length']
    pieces = bomb_body(spec, radius, length, (0.0, 0.0), s)
    pieces += chocks(length + radius, radius, s)
    pieces += terminal_pieces((0.0, radius + 0.005), (length + radius) / 2, s, posts=2)
    return pieces


def bomb_body(spec, radius, length, centre, s):
    """A bomb lying along X: a drum between two domes, three brass bands, rivets, a glowing window."""
    cx, cz = centre
    pieces = [cylinder(charge_material(spec), radius * s, length * s, scaled((cx, 0.0, cz), s), 'X')]
    pieces += [sphere(charge_material(spec), radius * s, scaled((cx + x, 0.0, cz), s)) for x in (-length / 2, length / 2)]
    pieces += [band('brass', (radius + 0.005) * s, 0.016 * s, scaled((cx + x, 0.0, cz), s))
               for x in (-length / 2, 0.0, length / 2)]
    pieces += [small_rivet(scaled((cx + x, -radius * 0.9, cz + radius * 0.4), s), s)
               for x in stepped_between(-length / 2 + 0.07, length / 2 - 0.07, 4)]
    pieces += [
        box('brass', scaled((0.2 * radius / 0.3, 0.02, 0.12 * radius / 0.3), s), scaled((cx, -radius + 0.004, cz), s)),
        box(spark_material(spec), scaled((0.16 * radius / 0.3, 0.02, 0.08 * radius / 0.3), s), scaled((cx, -radius - 0.004, cz), s)),
    ]
    return pieces


def bomb_caisson(spec, s):
    """Size 11: two bombs stacked in a brass yoke, one over the other, the terminals on the yoke."""
    radius, length, gap = spec['radius'], spec['length'], spec['gap']
    pieces = bomb_body(spec, radius, length, (0.0, -gap / 2), s)
    pieces += bomb_body(spec, radius, length, (0.0, gap / 2), s)
    half_width = length / 2 + radius + 0.03
    for x in (-half_width, half_width):
        pieces.append(box('brass', scaled((0.04, 0.12, gap + 2 * radius + 0.02), s), scaled((x, 0.0, 0.0), s)))
    pieces += [box('iron', scaled((2 * half_width + 0.04, 0.12, 0.04), s), scaled((0.0, 0.0, z), s))
               for z in (-gap / 2 - radius - 0.01, 0.0, gap / 2 + radius + 0.01)]
    pieces += [small_rivet(scaled((x, -0.062, z), s), s)
               for x in (-half_width, half_width) for z in (-gap / 2 - radius, 0.0, gap / 2 + radius)]
    pieces += chocks(length + radius, gap / 2 + radius, s)
    pieces += terminal_pieces((0.0, gap / 2 + radius + 0.03), half_width, s, posts=2)
    return pieces


def spiked_mine(spec, s):
    """Size 12: the mine, a sphere in the type's paint with brass meridians and iron spikes."""
    radius, spikes, reach = spec['radius'], spec['spikes'], spec['reach']
    pieces = [sphere(charge_material(spec), radius * s, (0.0, 0.0, 0.0))]
    pieces += [
        hoop('brass', (radius + 0.004) * s, 0.016 * s, (0.0, 0.0, 0.0)),
        band('brass', (radius + 0.004) * s, 0.016 * s, (0.0, 0.0, 0.0)),
        torus('brass', radius * 0.72 * s, 0.014 * s, (0.0, -radius * 0.66 * s, 0.0)),
    ]
    for index in range(spikes):
        angle = math.pi * 2 * index / spikes + math.pi / spikes
        pieces += spike_pieces(angle, radius, reach, s)
    pieces += [small_rivet(scaled((radius * 0.66 * math.cos(a), -radius * 0.7, radius * 0.66 * math.sin(a)), s), s)
               for a in stepped_between(0.0, math.pi * 2 * 7 / 8, 8)]
    pieces += [
        box('brass', scaled((0.16, 0.02, 0.1), s), scaled((0.0, -radius + 0.004, 0.0), s)),
        box(spark_material(spec), scaled((0.12, 0.02, 0.06), s), scaled((0.0, -radius - 0.004, 0.0), s)),
    ]
    pieces += chocks(radius * 1.4, radius, s)
    pieces += terminal_pieces((0.0, radius + 0.005), radius * 0.9, s, posts=2)
    return pieces


def spike_pieces(angle, radius, reach, s):
    """An iron spike out of the mine at `angle` in the XZ plane, with a brass collar at its root."""
    length = reach - radius + 0.04
    mid = radius + length / 2 - 0.04
    centre = scaled((mid * math.cos(angle), 0.0, mid * math.sin(angle)), s)
    collar = scaled(((radius + 0.01) * math.cos(angle), 0.0, (radius + 0.01) * math.sin(angle)), s)
    return [
        rod('dark-iron', 0.028 * s, length * s, centre, angle),
        rod('brass', 0.04 * s, 0.03 * s, collar, angle),
    ]


FAMILIES = {
    'sticks': strapped_sticks,
    'cradle': cradled_bundle,
    'crate': stick_crate,
    'keg': galvanic_keg,
    'drum': riveted_drum,
    'bomb': riveted_bomb,
    'caisson': bomb_caisson,
    'mine': spiked_mine,
}


# --- shared pieces -------------------------------------------------------------------------------


def stick_rows(spec, radius, height, s):
    """`rows` rows of `count` sticks in the type's colour with pale caps; the back row stands behind."""
    pieces = []
    pitch = radius * 2.35
    for row in range(spec['rows']):
        y = 0.0 + 0.055 * row
        offset = pitch / 2 if row % 2 else 0.0
        for x in stick_columns(spec['count'], pitch):
            pieces += [
                cylinder(charge_material(spec), radius * s, height * s, scaled((x + offset, y, -0.02), s), 'Z'),
                cylinder('dial', radius * s, 0.012 * s, scaled((x + offset, y, -0.02 - height / 2 - 0.004), s), 'Z'),
            ]
    return pieces


def stick_columns(count, pitch):
    return [(index - (count - 1) / 2) * pitch for index in range(count)]


def row_width(count, radius):
    return (count - 1) * radius * 2.35 + radius * 2


def straps(width, depth, height, s):
    """Two brass straps round the sticks, a rivet at each end."""
    pieces = []
    for z in (-0.02 - height * 0.32, -0.02 + height * 0.32):
        pieces.append(box('brass', scaled((width, depth, 0.022), s), scaled((0.0, 0.0, z), s)))
        pieces += [small_rivet(scaled((x, -depth / 2 - 0.002, z), s), s) for x in (-width / 2 + 0.03, width / 2 - 0.03)]
    return pieces


def timer_pieces(timer, s, width=0.13):
    """The clockwork timer of a fused size: an iron box, its dial(s) and the fuse cord's loop."""
    x, z, dials = timer
    pieces = [box('iron', scaled((width, 0.07, 0.07), s), scaled((x, -0.03, z), s))]
    for dial_x in dial_columns(dials, width):
        pieces += [
            cylinder('dial', 0.022 * s, 0.01 * s, scaled((x + dial_x, -0.068, z), s), 'Y'),
            box('dark-iron', scaled((0.003, 0.004, 0.018), s), scaled((x + dial_x, -0.074, z + 0.005), s)),
        ]
    pieces += [
        cylinder('fuse-cord', 0.004 * s, 0.08 * s, scaled((x - width / 2 - 0.035, -0.02, z + 0.005), s), 'X'),
        torus('fuse-cord', 0.018 * s, 0.004 * s, scaled((x - width / 2 - 0.085, -0.04, z), s)),
    ]
    return pieces


def dial_columns(dials, width):
    return [-width * 0.27] if dials == 1 else [-width * 0.3, 0.0]


def stick_ends(spec, columns, rows, width, depth, height, s):
    """The sticks seen end-on through the crate's face: discs in the type's colour with a pale cap."""
    pieces = []
    pitch_x, pitch_z = width / (columns + 1), height / (rows + 1)
    for column in range(columns):
        for row in range(rows):
            x = -width / 2 + pitch_x * (column + 1)
            z = -height / 2 + pitch_z * (row + 1)
            pieces += [
                cylinder(charge_material(spec), 0.032 * s, 0.02 * s, scaled((x, -depth / 2 - 0.006, z), s), 'Y'),
                cylinder('dial', 0.012 * s, 0.01 * s, scaled((x, -depth / 2 - 0.018, z), s), 'Y'),
            ]
    return pieces


def terminal_pieces(top, half_width, s, posts=2):
    """The galvanic terminal block of a remote size: brass posts and the lead wire paying out left."""
    x, z = top
    pieces = [box('dark-iron', scaled((0.16, 0.10, 0.06), s), scaled((x, -0.02, z + 0.03), s))]
    for post_x in ((-0.045, 0.045) if posts == 2 else (0.0,)):
        pieces += [
            cylinder('brass', 0.012 * s, 0.06 * s, scaled((x + post_x, -0.02, z + 0.08), s), 'Z'),
            sphere('brass', 0.016 * s, scaled((x + post_x, -0.02, z + 0.11), s), flatten=0.8),
        ]
    lead_length = half_width * 0.5 + 0.04
    pieces += [
        cylinder('copper', 0.004 * s, lead_length * s, scaled((x - 0.045 - lead_length / 2, -0.03, z + 0.1), s), 'X'),
        torus('copper', 0.02 * s, 0.004 * s, scaled((x - 0.045 - lead_length - 0.012, -0.03, z + 0.1), s)),
    ]
    return pieces


def gauge_pieces(centre, s):
    """A pressure gauge: pale dial in a brass ring with a dark needle, on the drum's face."""
    x, y, z = centre
    return [
        torus('brass', 0.055 * s, 0.01 * s, scaled((x, y - 0.01, z), s)),
        cylinder('dial', 0.05 * s, 0.012 * s, scaled((x, y - 0.006, z), s), 'Y'),
        box('dark-iron', scaled((0.004, 0.004, 0.035), s), scaled((x + 0.01, y - 0.016, z + 0.012), s), turn_y=math.radians(-35)),
    ]


def chocks(length, radius, s):
    """Two iron chocks a drum lies on, so the horizontal sizes stand on their tile."""
    return [box('dark-iron', scaled((0.14, 0.30, 0.06), s), scaled((x, 0.0, -radius - 0.03 + 0.012), s))
            for x in (-length / 3, length / 3)]


def hoop(material, major, minor, centre):
    """A ring round a vertical keg (its axis along Z)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=10, location=centre)
    return finish_piece(material, smooth=True)


def band(material, major, minor, centre):
    """A ring round a horizontal drum (its axis along X)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=10, location=centre, rotation=(0.0, math.pi / 2, 0.0))
    return finish_piece(material, smooth=True)


def small_rivet(centre, s=1.0):
    return sphere('brass', SMALL_RIVET_RADIUS * s, centre, flatten=0.6)


def scaled(values, s):
    return tuple(value * s for value in values)


def stepped_between(start, stop, count):
    return [start + (stop - start) * index / (count - 1) for index in range(count)]


def rod(material, radius, length, centre, angle):
    """A cylinder lying in the XZ plane along `angle` (0 along +X, counter-clockwise seen from -Y)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=length, location=centre,
                                        rotation=(0.0, math.pi / 2 - angle, 0.0))
    return finish_piece(material, smooth=True)


def polar(radius, angle, y=0.0):
    """A point in the XZ plane at `radius` and `angle` (0 along +X, counter-clockwise seen from -Y)."""
    return (radius * math.cos(angle), y, radius * math.sin(angle))


# --- the rack on hull.rear ---------------------------------------------------------------------

RACK_WIDTH = 0.42
RACK_HEIGHT = 0.30
RACK_BOTTOM = -0.16
BAY_CENTRES = {1: -0.135, 2: 0.0, 3: 0.135}
BAY_WIDTH = 0.12
# The bay's shelf, and the slot a type's bundle fits above it (width, height).
BAY_SHELF_Z = -0.06
SLOT_FIT = (0.105, 0.135)
PIPS_PER_TYPE = 8
PIP_PITCH = 0.0135
PIP_ROW_Z = -0.105
PIP_RADIUS = 0.0052
# The arm bolts the rack to the chassis, which is towards +X from hull.rear; the reel and the
# plunger hang there, the casing nozzle on the far side.
ARM_AT = (0.235, 0.02, 0.0)
REEL_AT = (0.27, 0.0, 0.1)
PLUNGER_AT = (0.27, 0.0, -0.075)
NOZZLE_AT = (-0.25, 0.0, 0.0)


def author_charge_rack():
    reset_scene()
    build_part('rack-frame', rack_frame_pieces(), at=(0.0, 0.0, 0.0), z_order=0)
    for type_number in TYPES:
        spec = SIZES[SLOT_SIZE_OF_TYPE[type_number]]
        s = slot_scale(spec)
        x, z = BAY_CENTRES[type_number], BAY_SHELF_Z + spec['extent'][1] * s / 2 + 0.004
        part = build_part('slot-%d' % type_number, planted_pieces(spec, s), at=(x, 0.0, z), z_order=1)
        part.modifiers['bevel'].width = max(0.002, 0.015 * s)
        for n in range(1, PIPS_PER_TYPE + 1):
            build_part('pip-%d-%d' % (type_number, n), pip_pieces(spec), at=pip_at(type_number, n), z_order=2)
    build_part('wire-reel', wire_reel_pieces(), at=REEL_AT, z_order=2)
    build_part('plunger', plunger_pieces(), at=PLUNGER_AT, z_order=2)
    build_part('casing-nozzle', casing_nozzle_pieces(), at=NOZZLE_AT, z_order=2)
    write_placeholder(RACK_ID, has_emissive=True)
    save_as(RACK_ID)


def slot_scale(spec):
    """A type's bundle fitted to its bay's slot."""
    width, height = spec['extent']
    return min(SLOT_FIT[0] / width, SLOT_FIT[1] / height)


def pip_at(type_number, n):
    x = BAY_CENTRES[type_number] + (n - (PIPS_PER_TYPE + 1) / 2) * PIP_PITCH
    return (x, 0.0, PIP_ROW_Z)


def pip_pieces(spec):
    """A lit stock pip: a brass socket ring with a dome of the type's spark glass."""
    return [
        cylinder('brass', PIP_RADIUS + 0.0015, 0.006, (0.0, -0.028, 0.0), 'Y'),
        sphere(spark_material(spec), PIP_RADIUS, (0.0, -0.033, 0.0), flatten=0.6),
    ]


def rack_frame_pieces():
    bottom, top = RACK_BOTTOM, RACK_BOTTOM + RACK_HEIGHT
    centre_z = (top + bottom) / 2
    half = RACK_WIDTH / 2
    pieces = [
        box('dark-iron', (RACK_WIDTH - 0.02, 0.03, RACK_HEIGHT - 0.02), (0.0, 0.03, centre_z)),
        box('brass', (0.014, 0.05, RACK_HEIGHT), (-half + 0.007, 0.0, centre_z)),
        box('brass', (0.014, 0.05, RACK_HEIGHT), (half - 0.007, 0.0, centre_z)),
        box('brass', (RACK_WIDTH, 0.05, 0.016), (0.0, 0.0, bottom + 0.008)),
        box('brass', (RACK_WIDTH, 0.05, 0.016), (0.0, 0.0, top - 0.008)),
        box('iron', (0.08, 0.03, 0.05), ARM_AT),
        box('dark-iron', (0.024, 0.024, 0.2), (REEL_AT[0] - 0.02, 0.012, REEL_AT[2] - 0.07)),
        box('brass', (0.03, 0.03, 0.02), (REEL_AT[0], -0.012, REEL_AT[2] - 0.16)),
        box('iron', (0.06, 0.03, 0.04), (NOZZLE_AT[0] + 0.03, 0.02, NOZZLE_AT[2] + 0.04)),
    ]
    # The bay dividers, each bay's shelf and the empty pip sockets under it.
    for x in (-0.0675, 0.0675):
        pieces.append(box('brass', (0.012, 0.045, RACK_HEIGHT - 0.03), (x, 0.0, centre_z)))
    for type_number in TYPES:
        x = BAY_CENTRES[type_number]
        pieces.append(box('brass', (BAY_WIDTH, 0.04, 0.008), (x, -0.004, BAY_SHELF_Z - 0.004)))
        pieces.append(box('iron', (BAY_WIDTH, 0.012, 0.03), (x, -0.012, PIP_ROW_Z)))
        for n in range(1, PIPS_PER_TYPE + 1):
            socket_x, _, socket_z = pip_at(type_number, n)
            pieces.append(cylinder('enamel', PIP_RADIUS + 0.001, 0.008, (socket_x, -0.02, socket_z), 'Y'))
    pieces += [small_rivet((x, -0.03, z)) for x in (-half + 0.007, half - 0.007) for z in (bottom + 0.03, top - 0.03)]
    pieces += [small_rivet((ARM_AT[0] + 0.02, -0.01, ARM_AT[2]))]
    return pieces


def wire_reel_pieces():
    """The detonator's galvanic wire reel: a copper-wound drum between brass flanges, a crank, and
    the wire running down to its socket on the frame."""
    return [
        cylinder('copper', 0.032, 0.04, (0.0, 0.0, 0.0), 'Y'),
        cylinder('brass', 0.046, 0.007, (0.0, -0.024, 0.0), 'Y'),
        cylinder('brass', 0.046, 0.007, (0.0, 0.024, 0.0), 'Y'),
        cylinder('dark-iron', 0.008, 0.07, (0.0, 0.0, 0.0), 'Y'),
        cylinder('brass', 0.005, 0.03, (0.03, -0.04, 0.0), 'X'),
        cylinder('brass', 0.005, 0.025, (0.045, -0.04, -0.0125), 'Z'),
        sphere('dark-iron', 0.008, (0.045, -0.04, -0.028)),
        cylinder('copper', 0.003, 0.13, (0.0, -0.034, -0.085), 'Z'),
    ]


def plunger_pieces():
    """The remote detonator's plunger box: an oak-and-brass box with the T-handle standing up."""
    return [
        box('crate-wood', (0.07, 0.06, 0.06), (0.0, 0.0, 0.0)),
        box('brass', (0.074, 0.064, 0.008), (0.0, 0.0, 0.034)),
        box('brass', (0.074, 0.064, 0.008), (0.0, 0.0, -0.034)),
        cylinder('dark-iron', 0.006, 0.07, (0.0, -0.005, 0.07), 'Z'),
        cylinder('brass', 0.008, 0.05, (0.0, -0.005, 0.105), 'X'),
        cylinder('copper', 0.0035, 0.025, (-0.02, -0.032, -0.01), 'Y'),
        small_rivet((0.025, -0.032, 0.0)),
        small_rivet((-0.025, -0.032, 0.0)),
    ]


def casing_nozzle_pieces():
    """The Blast Casing node's nozzle: a brass cone on a cement hose coiled against the frame."""
    return [
        cylinder('brass', 0.022, 0.05, (0.0, 0.0, 0.0), 'Z'),
        cylinder('brass', 0.012, 0.03, (0.0, 0.0, -0.04), 'Z'),
        sphere('dark-iron', 0.016, (0.0, -0.01, -0.058), flatten=0.5),
        torus('enamel', 0.028, 0.008, (0.0, -0.01, 0.06)),
        cylinder('enamel', 0.008, 0.05, (0.0, -0.01, 0.1), 'Z'),
        cylinder('iron', 0.026, 0.012, (0.0, 0.0, 0.03), 'Z'),
        small_rivet((0.0, -0.028, 0.03)),
    ]


# --- the crater decals ---------------------------------------------------------------------------

DECAL_RADIUS = 0.5
# Where the crater's edge sits on the disc: `DECAL_RIM_SHARE` in chargeTypeLook.ts.
DECAL_RIM = 0.42


def author_crater_decals():
    reset_scene()
    for part_id, pieces_of in DECALS.items():
        build_part(part_id, pieces_of(), at=(0.0, 0.0, 0.0), z_order=0)
    write_placeholder(CRATER_ID, has_emissive=False)
    save_as(CRATER_ID)


def breaking_crater_pieces():
    """Type 1: a sooty star of cracks out of a dark scorch, rubble flung to the rim."""
    pieces = [cylinder('decal-dark', 0.3, 0.01, (0.0, 0.0, 0.0), 'Y')]
    for index in range(7):
        angle = math.pi * 2 * index / 7 + 0.3
        pieces.append(box('decal-mid', (0.4, 0.008, 0.022 + 0.006 * (index % 2)), polar(0.28, angle, -0.004), turn_y=-angle))
    for index in range(9):
        angle = math.pi * 2 * index / 9 + 0.9
        pieces.append(sphere('decal-light', 0.02 + 0.012 * ((index * 7) % 3) / 2, polar(DECAL_RIM - 0.02 + 0.04 * (index % 2), angle, -0.006), flatten=0.5))
    return pieces


def deep_crater_pieces():
    """Type 2: a pit of concentric fissures, the floor dark, the rings breaking into short cracks."""
    pieces = [
        cylinder('decal-mid', DECAL_RIM + 0.03, 0.01, (0.0, 0.0, 0.0), 'Y'),
        cylinder('decal-dark', 0.24, 0.012, (0.0, -0.002, 0.0), 'Y'),
        torus('decal-dark', 0.32, 0.009, (0.0, -0.006, 0.0)),
        torus('decal-dark', DECAL_RIM, 0.011, (0.0, -0.006, 0.0)),
        torus('decal-light', 0.28, 0.006, (0.0, -0.007, 0.0)),
    ]
    for index in range(6):
        angle = math.pi * 2 * index / 6 + 0.5
        pieces.append(box('decal-dark', (0.18, 0.008, 0.018), polar(0.39, angle, -0.004), turn_y=-angle))
    return pieces


def biggest_crater_pieces():
    """Type 3: a shattered ring of slabs round a black pit, chunks between them."""
    pieces = [
        cylinder('decal-dark', 0.22, 0.012, (0.0, 0.0, 0.0), 'Y'),
        torus('decal-dark', 0.3, 0.012, (0.0, -0.004, 0.0)),
    ]
    for index in range(10):
        angle = math.pi * 2 * index / 10
        pieces.append(box('decal-light', (0.17, 0.012, 0.1 + 0.02 * (index % 3)), polar(DECAL_RIM, angle, -0.006), turn_y=-angle + math.pi / 2))
        pieces.append(sphere('decal-mid', 0.03, polar(DECAL_RIM + 0.03, angle + math.pi / 10, -0.008), flatten=0.5))
    return pieces


def cased_rim_pieces():
    """The lined crater's rim: a ring of riveted plates, neutral, tinted in the grade's plate colour."""
    pieces = []
    for index in range(12):
        angle = math.pi * 2 * index / 12
        pieces.append(box('decal-light', (0.19, 0.012, 0.11), polar(DECAL_RIM, angle, -0.006), turn_y=-angle + math.pi / 2))
        for along in (-0.06, 0.06):
            rivet_angle = angle + along / DECAL_RIM
            pieces.append(sphere('decal-bright', 0.012, polar(DECAL_RIM, rivet_angle, -0.013), flatten=0.5))
    pieces.append(torus('decal-mid', DECAL_RIM + 0.06, 0.008, (0.0, -0.008, 0.0)))
    return pieces


def cased_trim_pieces():
    """The lined crater's seam along the rim's inner edge, neutral, tinted in the lining's trim."""
    pieces = [torus('decal-light', DECAL_RIM - 0.065, 0.013, (0.0, -0.01, 0.0))]
    for index in range(12):
        angle = math.pi * 2 * index / 12 + math.pi / 12
        pieces.append(box('decal-mid', (0.03, 0.01, 0.014), polar(DECAL_RIM - 0.065, angle, -0.014), turn_y=-angle))
    return pieces


DECALS = {
    'crater-1': breaking_crater_pieces,
    'crater-2': deep_crater_pieces,
    'crater-3': biggest_crater_pieces,
    'crater-cased-rim': cased_rim_pieces,
    'crater-cased-trim': cased_trim_pieces,
}

AUTHORS = {
    RACK_ID: author_charge_rack,
    PROP_ID: author_planted_charges,
    CRATER_ID: author_crater_decals,
}

if __name__ == '__main__':
    main()
