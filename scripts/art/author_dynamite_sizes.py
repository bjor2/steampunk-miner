"""
Authors the first version of the dynamite sizes' Blender sources (#145, for the #153 design and
the #143 ladder): the charge rack that hangs on the vehicle's `hull.rear` attach point with one
stick model per size and the galvanic wire reel, and the planted prop of each size.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_dynamite_sizes.py

It writes art/blender/<id>/<id>.blend for vehicle-dynamite-rack and prop-dynamite-charge, or
only the ids given after `--`. From then on those files are the sources (#52): change the art in
Blender and re-export, rather than editing this script. Nothing here is rigged (#51 acceptance 2),
nothing is exported or registered yet (the wiring, #215, does that through the art-id registry).

Conventions are author_platform.py's, whose piece builders and materials this reuses: 1 unit =
1 m, game right is +X, up is +Z, details stand out towards -Y. Each part is one mesh object named
for its part id, its origin the pivot the code draws it by.

- The rack (`vehicle-dynamite-rack`) is authored in its own frame with the attach point at the
  origin (K5: gear is drawn at its point's `atM`, nothing baked into the vehicle frame). The frame
  is `rack-frame`, the ten sizes are `stick-1` to `stick-10` on five shelves, two a shelf, bottom
  row first, and `wire-reel` is the detonator's reel on the arm side, so the build can show each
  size as it unlocks (#153 section 5) and the reel from P22 (#153 amendment 2).
- The planted prop (`prop-dynamite-charge`) holds `planted-1` to `planted-10`, every one at the
  origin with its pivot at its centre like today's charge, so the build draws the planted size at
  the charge's tile, and `lamp-1` to `lamp-10`, the one glowing piece of each, kept apart so the
  fuse (sizes 1 to 6) or the armed light (sizes 7 to 10, remote) can blink.
- The ladder escalates by family, not only by scale: strapped sticks (1 to 3), a cradled bundle (4),
  crates of sticks (5, 6), galvanic kegs (7, 8), a riveted drum (9) and the riveted bomb (10). The
  rack's sticks are the same models scaled to their shelf, so the rack reads as the ladder.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from author_platform import (  # noqa: E402
    PALETTE,
    box,
    build_part,
    cylinder,
    finish_piece,
    reset_scene,
    save_as,
    sphere,
    torus,
)

# Base colour, roughness, emission strength (0 for none); dynamite red reads against brass and iron.
PALETTE.update({
    'charge-red': ((0.62, 0.11, 0.07), 0.55, 0.0),
    'fuse-cord': ((0.30, 0.24, 0.16), 0.8, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'fuse-glow': ((1.0, 0.16, 0.08), 0.2, 1.0),
    'crate-wood': ((0.40, 0.26, 0.13), 0.85, 0.0),
    'charge-window': ((1.0, 0.30, 0.10), 0.2, 0.8),
})

SIZE_COUNT = 10
# The platform's rivets are 3 cm; on parts this small they would swamp the brass.
SMALL_RIVET_RADIUS = 0.009

# Each planted size: its family and the family's measures, its lamp's place (X, Z) in the prop's
# frame, and the prop's rough extent (width, height) the rack scales it by.
SIZES = {
    1: dict(family='sticks', count=3, rows=1, stick=(0.036, 0.22), timer=(0.05, 0.105, 1),
            lamp=(0.07, 0.10), extent=(0.27, 0.28)),
    2: dict(family='sticks', count=4, rows=1, stick=(0.036, 0.24), timer=(0.065, 0.115, 1),
            lamp=(0.085, 0.11), extent=(0.36, 0.30)),
    3: dict(family='sticks', count=5, rows=1, stick=(0.036, 0.26), timer=(0.09, 0.125, 2),
            lamp=(0.11, 0.12), extent=(0.44, 0.33)),
    4: dict(family='cradle', count=4, rows=2, stick=(0.036, 0.28), timer=(0.0, 0.165, 2),
            lamp=(0.04, 0.17), extent=(0.45, 0.39)),
    5: dict(family='crate', crate=(0.48, 0.34, 0.38), ends=(3, 2), timer=(0.0, 0.235, 2),
            lamp=(0.04, 0.24), extent=(0.48, 0.46)),
    6: dict(family='crate', crate=(0.56, 0.38, 0.48), ends=(4, 3), timer=(-0.06, 0.285, 2),
            lamp=(-0.02, 0.29), extent=(0.56, 0.59)),
    7: dict(family='keg', radius=0.27, height=0.46, hoops=2,
            lamp=(0.0, 0.28), extent=(0.57, 0.63)),
    8: dict(family='keg', radius=0.31, height=0.52, hoops=3,
            lamp=(0.0, 0.31), extent=(0.65, 0.69)),
    9: dict(family='drum', radius=0.27, length=0.72, bands=2,
            lamp=(0.0, 0.305), extent=(0.77, 0.71)),
    10: dict(family='bomb', radius=0.30, length=0.30, bands=3,
             lamp=(0.0, 0.335), extent=(0.90, 0.78)),
}
# The rack's slot a size's miniature fits (width, height), growing with the size so the rack
# reads as the ladder; two slots a shelf.
RACK_SLOTS = {
    1: (0.050, 0.044), 2: (0.057, 0.051), 3: (0.064, 0.058), 4: (0.071, 0.066), 5: (0.078, 0.074),
    6: (0.086, 0.083), 7: (0.094, 0.092), 8: (0.103, 0.102), 9: (0.113, 0.112), 10: (0.125, 0.124),
}


def main():
    for asset_id in requested_asset_ids():
        AUTHORS[asset_id]()


def requested_asset_ids():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return requested or list(AUTHORS)


# --- the planted props -------------------------------------------------------------------------


def author_planted_charges():
    reset_scene()
    for size, spec in SIZES.items():
        build_part('planted-%d' % size, planted_pieces(spec, 1.0), at=(0.0, 0.0, 0.0), z_order=0)
        lamp_x, lamp_z = spec['lamp']
        build_part('lamp-%d' % size, lamp_pieces(1.0), at=(lamp_x, 0.0, lamp_z), z_order=1)
    save_as('prop-dynamite-charge')


def planted_pieces(spec, s):
    """The prop's body at scale `s` (1 planted, smaller on the rack), without its lamp."""
    return FAMILIES[spec['family']](spec, s)


def lamp_pieces(s):
    """A brass socket on the prop's face with the glowing bulb in it, the only lit piece."""
    return [
        cylinder('brass', 0.03 * s, 0.02 * s, (0.0, -0.075 * s, 0.0), 'Y'),
        sphere('fuse-glow', 0.022 * s, (0.0, -0.088 * s, 0.0), flatten=0.7),
    ]


# --- families ------------------------------------------------------------------------------------


def strapped_sticks(spec, s):
    """Sizes 1 to 3: a row (or two) of red sticks in brass straps with a clockwork timer."""
    radius, height = spec['stick']
    pieces = stick_rows(spec['count'], spec['rows'], radius, height, s)
    width = row_width(spec['count'], radius)
    pieces += straps(width + 0.03, 0.08 + 0.05 * (spec['rows'] - 1), height, s)
    pieces += timer_pieces(spec['timer'], s)
    return pieces


def cradled_bundle(spec, s):
    """Size 4: two rows of four sticks in an iron cradle, the timer box on top of the bundle."""
    radius, height = spec['stick']
    pieces = stick_rows(spec['count'], spec['rows'], radius, height, s)
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
    pieces += stick_ends(columns, rows, width, depth, height, s)
    pieces += timer_pieces(spec['timer'], s, width=0.16)
    if columns == 4:
        pieces += [sphere('brass', 0.05 * s, scaled((0.17, -0.02, height / 2 + 0.05), s), flatten=0.8),
                   cylinder('brass', 0.055 * s, 0.015 * s, scaled((0.17, -0.02, height / 2 + 0.008), s), 'Z')]
    return pieces


def galvanic_keg(spec, s):
    """Sizes 7 and 8: an iron powder keg in brass hoops with the galvanic terminals on its lid."""
    radius, height = spec['radius'], spec['height']
    pieces = [
        cylinder('iron', radius * s, height * s, (0.0, 0.0, 0.0), 'Z'),
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
    """Size 9: a riveted iron drum lying on chocks, brass end caps, a pressure gauge on its face."""
    radius, length = spec['radius'], spec['length']
    pieces = [cylinder('iron', radius * s, length * s, (0.0, 0.0, 0.0), 'X')]
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
    pieces = [cylinder('iron', radius * s, length * s, (0.0, 0.0, 0.0), 'X')]
    pieces += [sphere('iron', radius * s, (x * s, 0.0, 0.0)) for x in (-length / 2, length / 2)]
    pieces += [band('brass', (radius + 0.005) * s, 0.016 * s, (x * s, 0.0, 0.0))
               for x in (-length / 2, 0.0, length / 2)]
    pieces += [small_rivet(scaled((x, -radius * 0.9, radius * 0.4), s), s)
               for x in stepped_between(-length / 2 + 0.07, length / 2 - 0.07, 4)]
    pieces += [
        box('brass', scaled((0.20, 0.02, 0.12), s), scaled((0.0, -radius + 0.004, 0.0), s)),
        box('charge-window', scaled((0.16, 0.02, 0.08), s), scaled((0.0, -radius - 0.004, 0.0), s)),
    ]
    pieces += chocks(length + radius, radius, s)
    pieces += terminal_pieces((0.0, radius + 0.005), (length + radius) / 2, s, posts=2)
    return pieces


FAMILIES = {
    'sticks': strapped_sticks,
    'cradle': cradled_bundle,
    'crate': stick_crate,
    'keg': galvanic_keg,
    'drum': riveted_drum,
    'bomb': riveted_bomb,
}


# --- shared pieces -------------------------------------------------------------------------------


def stick_rows(count, rows, radius, height, s):
    """`rows` rows of `count` red sticks with pale caps; the back row stands behind, offset."""
    pieces = []
    pitch = radius * 2.35
    for row in range(rows):
        y = 0.0 + 0.055 * row
        offset = pitch / 2 if row % 2 else 0.0
        for x in stick_columns(count, pitch):
            pieces += [
                cylinder('charge-red', radius * s, height * s, scaled((x + offset, y, -0.02), s), 'Z'),
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


def stick_ends(columns, rows, width, depth, height, s):
    """The sticks seen end-on through the crate's face: red discs with a pale fuse cap."""
    pieces = []
    pitch_x, pitch_z = width / (columns + 1), height / (rows + 1)
    for column in range(columns):
        for row in range(rows):
            x = -width / 2 + pitch_x * (column + 1)
            z = -height / 2 + pitch_z * (row + 1)
            pieces += [
                cylinder('charge-red', 0.032 * s, 0.02 * s, scaled((x, -depth / 2 - 0.006, z), s), 'Y'),
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


# --- the rack on hull.rear ---------------------------------------------------------------------

RACK_WIDTH = 0.28
RACK_BOTTOM = -0.215
SHELF_GAP = 0.014
SLOT_COLUMNS = (-0.062, 0.062)
# The arm bolts the rack to the chassis, which is towards +X from hull.rear; the reel hangs there.
ARM_AT = (0.165, 0.02, 0.0)
REEL_AT = (0.2, 0.0, 0.125)


def author_charge_rack():
    reset_scene()
    shelves = rack_shelves()
    build_part('rack-frame', rack_frame_pieces(shelves), at=(0.0, 0.0, 0.0), z_order=0)
    for size, (x, z, s) in rack_slots(shelves).items():
        part = build_part('stick-%d' % size, planted_pieces(SIZES[size], s), at=(x, 0.0, z), z_order=1)
        part.modifiers['bevel'].width = max(0.002, 0.015 * s)
    build_part('wire-reel', wire_reel_pieces(), at=REEL_AT, z_order=2)
    save_as('vehicle-dynamite-rack')


def rack_scale(size):
    """The rack's miniature of a size: its planted extent fitted to its slot, both growing with size."""
    slot_width, slot_height = RACK_SLOTS[size]
    width, height = SIZES[size]['extent']
    return min(slot_width / width, slot_height / height)


def rack_shelves():
    """Shelf tops from the bottom up, each tall enough for the two sizes it holds."""
    shelves, z = [], RACK_BOTTOM
    for row in range(SIZE_COUNT // 2):
        sizes = (2 * row + 1, 2 * row + 2)
        shelves.append(z)
        z += max(SIZES[size]['extent'][1] * rack_scale(size) for size in sizes) + SHELF_GAP
    return shelves + [z]


def rack_slots(shelves):
    """Each size's place: its column, the centre of its scaled height over its shelf, its scale."""
    slots = {}
    for size in SIZES:
        s = rack_scale(size)
        shelf = shelves[(size - 1) // 2]
        centre_z = shelf + SIZES[size]['extent'][1] * s / 2 + 0.003
        slots[size] = (SLOT_COLUMNS[(size - 1) % 2], centre_z, s)
    return slots


def rack_frame_pieces(shelves):
    bottom, top = shelves[0] - 0.012, shelves[-1]
    height, centre_z = top - bottom, (top + bottom) / 2
    half = RACK_WIDTH / 2
    pieces = [
        box('dark-iron', (RACK_WIDTH - 0.02, 0.03, height - 0.02), (0.0, 0.03, centre_z)),
        box('brass', (0.014, 0.05, height), (-half + 0.007, 0.0, centre_z)),
        box('brass', (0.014, 0.05, height), (half - 0.007, 0.0, centre_z)),
        box('brass', (RACK_WIDTH, 0.05, 0.016), (0.0, 0.0, bottom + 0.008)),
        box('brass', (RACK_WIDTH, 0.05, 0.016), (0.0, 0.0, top - 0.008)),
        box('charge-red', (0.2, 0.01, 0.012), (0.0, -0.022, top - 0.03)),
        box('iron', (0.08, 0.03, 0.05), ARM_AT),
        box('dark-iron', (0.024, 0.024, 0.2), (REEL_AT[0] - 0.02, 0.012, REEL_AT[2] - 0.07)),
        box('brass', (0.03, 0.03, 0.02), (REEL_AT[0], -0.012, REEL_AT[2] - 0.16)),
    ]
    pieces += [box('brass', (RACK_WIDTH - 0.02, 0.035, 0.008), (0.0, -0.005, shelf - 0.004)) for shelf in shelves[:-1]]
    pieces += [small_rivet((x, -0.03, z)) for x in (-half + 0.007, half - 0.007) for z in (bottom + 0.03, top - 0.03)]
    pieces += [small_rivet((ARM_AT[0] + 0.02, -0.01, ARM_AT[2]))]
    return pieces


def wire_reel_pieces():
    """The detonator's galvanic wire reel: a copper-wound drum between brass flanges, a crank, and
    the wire running down to its socket on the frame."""
    pieces = [
        cylinder('copper', 0.032, 0.04, (0.0, 0.0, 0.0), 'Y'),
        cylinder('brass', 0.046, 0.007, (0.0, -0.024, 0.0), 'Y'),
        cylinder('brass', 0.046, 0.007, (0.0, 0.024, 0.0), 'Y'),
        cylinder('dark-iron', 0.008, 0.07, (0.0, 0.0, 0.0), 'Y'),
        cylinder('brass', 0.005, 0.03, (0.03, -0.04, 0.0), 'X'),
        cylinder('brass', 0.005, 0.025, (0.045, -0.04, -0.0125), 'Z'),
        sphere('dark-iron', 0.008, (0.045, -0.04, -0.028)),
        cylinder('copper', 0.003, 0.13, (0.0, -0.034, -0.085), 'Z'),
    ]
    return pieces


AUTHORS = {
    'vehicle-dynamite-rack': author_charge_rack,
    'prop-dynamite-charge': author_planted_charges,
}

if __name__ == '__main__':
    main()
