"""
Authors the first version of the drill-type rig-look parts (ticket 622, wave 308-1B of spec #308):
one look per owned drill-gear item that changes what the drill is, so the type reads on the rig at
a 360 px phone's width (G&V close-out on #308, 6301796899: cutters stick out to the sides, the
reamers are a wide ring, the crown is a long spike ahead).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-type/author_drill_type_looks.py

It writes art/blender/vehicle-look-drill-type/vehicle-look-drill-type.blend from drillTypeLooks.json
(the table this script, the reach check and the renders share). From then on that file is the
source (#52): change the art in Blender rather than editing this script. Nothing is rigged (#51
acceptance 2) and nothing is registered: the manifest entry, the placeholder sidecar, the export and
the piece that swaps the parts on the slot are the wiring's (#623), through the rig-look registry
(#577). #578 does not grow: this is its own asset on the same slot.

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in the drill_tip looks' frame (#578, author_drill_tip_looks.py): its own frame with the track's
attach slot, `drill.head`, at the origin, so the game draws a part at
`attachPointOf(vehicleSidecar, 'drill.head')` with no offset. Every look stands in place of the
rig's tier-1 cutter crown, `t1-drill-bit`, whose centre sits 0.118 m right of the slot at the
crown's depth, and sheathes the last step of the stepped cone behind it (radius 0.041 down to 0.018
over the 76 mm before the crown), the same reach back #578's looks take. Unlike the drill_tip
looks, these are meant to leave the rig's silhouette: that is what makes the type readable, and
check_reach.py measures how far each one does. Collision is a code constant no art reaches.

| Look                  | Parts                                              | What it shows                                                                                  |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `side-cutters-mark-1` | `cutter-yoke-1`, `cutter-arm-up-1`, `-down-1`      | the crown on a collared yoke; one geared cutter wheel a side on a steel arm, 0.36 m out         |
| `side-cutters-mark-2` | `cutter-yoke-2`, `cutter-arm-up-2`, `-down-2`      | a heavier yoke; two staggered wheels a side on a braced twin-bar arm, 0.5 m out                 |
| `gallery-reamers`     | `gallery-reamers`                                  | the crown inside a wide iron ring on four brass spokes, verdigris flutes, twelve reamer teeth   |
| `plunge-crown`        | `plunge-crown`                                     | a guard wheel where the crown was and a long bright-steel spike with two hot seams, 0.5 m out |
| `twin-bit`            | `twin-bit-head`                                    | an iron carrier with two counter-fluted steel bits side by side round a hot core               |
| `reach-boom`          | `boom-barrel`, `boom-ram`                          | a brass barrel on the cone's last step; a bigger crown pushed 0.4 m ahead on an open lattice ram  |

A moving part (the cutter arms, the ram) has its origin at its hinge or slide and is authored at
its deployed pose; the table carries the folded pose (the arms fold back along the rig, the ram
retracts 0.26 m), so the wiring can fold a toggled-off cutter in and out as the tech gear does
(extractorPose.ts). The crowns keep the rig's hot core (`nose-glow`, the nose seams' material) so
the drill nose stays the brightest part of the rig (#576 rules); no other piece glows.
"""

import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, reset_scene, save_as, sphere  # noqa: E402

LOOKS_TABLE = os.path.join(HERE, 'drillTypeLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). Nothing here glows
# but the rig's own `nose-glow`.
kit.PALETTE.update({
    'bright-steel': ((0.62, 0.65, 0.70), 0.25, 0.0),
    'gunmetal': ((0.30, 0.31, 0.33), 0.4, 0.0),
    'verdigris': ((0.36, 0.62, 0.52), 0.5, 0.0),
})

# #578's frame: where the rig's `t1-drill-bit` crown sits against the `drill.head` slot
# (vehicle.parts.json: the crown's `atM` (0.768, 0) less the slot's (0.65, 0)), at the crown's depth.
CROWN_AT = (0.118, -0.16, 0.0)
CROWN_RADIUS = 0.055
CROWN_FACE_Y = CROWN_AT[1] - 0.016
# The head's depth, and the sheath over the cone's last step (#578): from 40 mm ahead of the slot
# to the cone's end, 1.5 mm under the step's own radius.
SHEATH_Y = -0.108
SHEATH_X = (0.04, 0.088)
SHEATH_RADII = (0.029, 0.019)
# Every look's reach back to the slot: 6 mm wide, inside the cone's last step, in the cone's own
# colours; it starts 4 mm behind the slot so the part's origin lies strictly inside its bounds.
SHAFT_RADIUS = 0.003
SHAFT_START = -0.004
SHAFT_BRASS_END = 0.014
# The cutter arms: their hinge on the yoke, the wheel at the arm's end, the teeth round it.
HINGE = (0.06, 0.03)
ARM_Y = -0.14
WHEEL_Y = -0.152
ARM_LENGTHS = {1: 0.24, 2: 0.40}
WHEELS = {1: ((0.26, 0.065, 10),), 2: ((0.25, 0.062, 10), (0.41, 0.075, 12))}
# The gallery reamers' ring round the crown: its centre on the drill axis just ahead of the sheath.
RING_AT = (0.07, -0.13, 0.0)
RING_RADIUS = 0.25
RING_TUBE = 0.035
REAMER_TEETH = 12
REAMER_TOOTH = (0.03, 0.03, 0.05)
REAMER_TOOTH_RADIUS = 0.29
# The plunge crown's spike: from the guard wheel to its point.
SPIKE_X = (0.118, 0.50)
SPIKE_RADII = (0.040, 0.005)
SPIKE_SEAMS_X = (0.21, 0.33)
# The twin bits: two cones either side of the axis on an iron carrier.
TWIN_Z = 0.07
TWIN_CONE_X = (0.13, 0.35)
TWIN_CONE_RADII = (0.045, 0.003)
# The boom: the barrel over the cone's last step, the ram's two stages and the crown at its end.
BARREL_X = (SHAFT_START, 0.10)
BARREL_RADIUS = 0.042
RAM_RAILS_X = (0.08, 0.36)
RAM_RAIL_Z = 0.05
RAM_BRACES = 3
BOOM_CROWN_RADIUS = 0.07
RAM_Y = -0.10
BOOM_CROWN_X = 0.40
# The platform's 15 mm bevel would round a 3 cm rivet band away; vehicle-scale parts take 4 mm.
BEVEL_M = driller.BEVEL_M


def main():
    table = read_table()
    reset_scene()
    built = [author_part(part, int(table['z'])) for look in table['looks'] for part in look['parts']]
    check_parts_match_table(table, built)
    save_as(table['assetId'])


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


def author_part(part, z_order):
    pieces, pivot, z_over = PIECES[part['id']]()
    built = build_part(part['id'], pieces, (pivot[0], 0.0, pivot[1]), z_order + z_over)
    built.modifiers['bevel'].width = BEVEL_M
    return built


def check_parts_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(part['id'] for look in table['looks'] for part in look['parts'])
    if names != wanted:
        raise SystemExit('%s parts %s do not match the table %s' % (table['assetId'], names, wanted))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (table['assetId'], part.name))
    pivots = {part['id']: part.get('pivotM', [0.0, 0.0]) for look in table['looks'] for part in look['parts']}
    for part in built:
        at = (round(part.location.x, 4), round(part.location.z, 4))
        if at != (pivots[part.name][0], pivots[part.name][1]):
            raise SystemExit('%s: part "%s" pivots at %s, the table says %s' % (table['assetId'], part.name, at, pivots[part.name]))


def is_origin_inside(obj):
    """The export refuses a part whose origin (here the slot, a hinge or the slide) is outside its bounds."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


# --- the pieces every look shares ----------------------------------------------------------------


def shaft_pieces():
    """The reach back to the slot (#578's shaft_pieces), so a part on the slot has the slot inside
    its bounds; brass to 14 mm and steel beyond, the tier-1 cone's colours where it crosses them."""
    brass_length = SHAFT_BRASS_END - SHAFT_START
    steel_length = CROWN_AT[0] - SHAFT_BRASS_END
    return [
        driller.cone_x('brass', SHAFT_RADIUS, SHAFT_RADIUS, brass_length, (SHAFT_START + brass_length / 2, -0.1, 0.0)),
        driller.cone_x('steel', SHAFT_RADIUS, SHAFT_RADIUS, steel_length, (SHAFT_BRASS_END + steel_length / 2, -0.1, 0.0)),
    ]


def sheath_pieces(material):
    """The sleeve over the cone's last step, from 40 mm ahead of the slot to the cone's end."""
    length = SHEATH_X[1] - SHEATH_X[0]
    centre = (SHEATH_X[0] + length / 2, SHEATH_Y, 0.0)
    return [driller.cone_x(material, SHEATH_RADII[0], SHEATH_RADII[1], length, centre)]


def crown_pieces_at(at, radius=CROWN_RADIUS):
    """The rig's own cutter crown, piece for piece (author_casing_driller.crown_pieces), so a look
    that keeps the bit keeps the rig's hot core."""
    pieces = driller.crown_pieces(radius, teeth=8)
    shift_pieces(pieces, at)
    return pieces


def collar(material, major, minor, centre):
    """A ring round the drill axis (its axis along X): edge-on to the camera, a band as wide as its tube."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=10, location=centre, rotation=(0.0, math.pi / 2, 0.0))
    return kit.finish_piece(material, smooth=True)


def shift_pieces(pieces, offset):
    for piece in pieces:
        piece.location.x += offset[0]
        piece.location.y += offset[1]
        piece.location.z += offset[2]
    return pieces


def base_at_slot(pieces):
    """A part pivoted on the slot, drawn at the look's own order."""
    return pieces, (0.0, 0.0), 0


# --- the side cutters (Mark 1 and Mark 2) --------------------------------------------------------


def cutter_yoke_pieces(mark):
    """The crown and its sheath, a collared yoke round the sheath and the brass hinge blocks the
    arms turn on; Mark 2's yoke carries a second collar and heavier blocks."""
    pieces = shaft_pieces() + sheath_pieces('steel') + crown_pieces_at(CROWN_AT)
    pieces.append(collar('dark-iron', 0.034, 0.007, (HINGE[0], SHEATH_Y, 0.0)))
    block = (0.034, 0.03, 0.03) if mark == 1 else (0.046, 0.034, 0.034)
    for side in (1.0, -1.0):
        pieces.append(box('brass', block, (HINGE[0], ARM_Y + 0.012, side * HINGE[1])))
    if mark == 2:
        pieces.append(collar('dark-iron', 0.036, 0.007, (0.082, SHEATH_Y, 0.0)))
        pieces.append(collar('brass', 0.033, 0.005, (0.071, SHEATH_Y, 0.0)))
    return base_at_slot(pieces)


def cutter_arm_pieces(mark, side):
    """One arm in its own frame, the hinge at the origin, pointing up (`side` 1) or down (-1): the
    steel bar, Mark 2's second bar and brace, and the geared wheel (or two) at its end."""
    length = ARM_LENGTHS[mark]
    pieces = [
        sphere('brass', 0.018, (0.0, ARM_Y, 0.0)),
        box('steel', (0.026 if mark == 1 else 0.03, 0.02, length), (0.0, ARM_Y, side * length / 2)),
    ]
    if mark == 2:
        pieces.append(box('dark-iron', (0.014, 0.02, length * 0.9), (-0.024, ARM_Y, side * length * 0.45)))
        pieces.append(driller.segment('brass', (-0.024, side * 0.12), (0.012, side * 0.33), 0.01, 0.018, ARM_Y - 0.012))
    for reach, radius, teeth in WHEELS[mark]:
        pieces += wheel_pieces((0.012, side * reach), radius, teeth)
    return pieces, (HINGE[0], side * HINGE[1]), 1


def wheel_pieces(centre, radius, teeth):
    """A geared cutter wheel face-on: a steel disc, brass teeth round it, a brass hub on a dark axle."""
    x, z = centre
    pieces = [
        driller.disc('steel', radius, 0.03, (x, WHEEL_Y, z)),
        driller.disc('brass', radius * 0.3, 0.034, (x, WHEEL_Y - 0.002, z)),
        driller.disc('dark-iron', 0.009, 0.038, (x, WHEEL_Y - 0.004, z)),
    ]
    for angle, _, _ in driller.around(teeth, radius + 0.008):
        tooth = driller.tangent_box('brass', (radius * 0.28, 0.028, 0.022), angle, radius + 0.008, WHEEL_Y)
        tooth.location.x += x
        tooth.location.z += z
        pieces.append(tooth)
    for angle, dx, dz in driller.around(4, radius * 0.6, phase=math.pi / 4):
        pieces.append(driller.segment('dark-iron', (x, z), (x + dx, z + dz), 0.006, 0.01, WHEEL_Y - 0.017))
    return pieces


# --- the gallery reamers (Wide) ------------------------------------------------------------------


def gallery_reamers_pieces():
    """The crown inside a wide iron ring: four brass spokes from the sheath, a verdigris flute band
    and a brass rim on the ring's face, twelve steel reamer teeth standing out of it."""
    x, y, _ = RING_AT
    pieces = shaft_pieces() + sheath_pieces('steel') + crown_pieces_at(CROWN_AT)
    pieces += [
        driller.ring('dark-iron', RING_RADIUS, RING_TUBE, RING_AT),
        driller.ring('verdigris', RING_RADIUS - 0.012, 0.012, (x, y - 0.03, 0.0)),
        driller.ring('brass', RING_RADIUS + 0.014, 0.007, (x, y - 0.03, 0.0)),
        collar('brass', 0.034, 0.007, (x, SHEATH_Y, 0.0)),
    ]
    for angle, dx, dz in driller.around(4, RING_RADIUS - 0.02, phase=math.pi / 4):
        start = (x + 0.03 * math.cos(angle), 0.03 * math.sin(angle))
        pieces.append(driller.segment('brass', start, (x + dx, dz), 0.016, 0.02, y + 0.004))
    for angle, _, _ in driller.around(REAMER_TEETH, REAMER_TOOTH_RADIUS):
        tooth = driller.tangent_box('steel', REAMER_TOOTH, angle, REAMER_TOOTH_RADIUS, y)
        tooth.location.x += x
        pieces.append(tooth)
    for angle, _, _ in driller.around(REAMER_TEETH, RING_RADIUS, phase=math.pi / REAMER_TEETH):
        flute = driller.tangent_box('dark-iron', (0.012, 0.03, 0.05), angle, RING_RADIUS, y - 0.032)
        flute.location.x += x
        pieces.append(flute)
    return base_at_slot(pieces)


# --- the plunge crown (Deep) ---------------------------------------------------------------------


def plunge_crown_pieces():
    """A guard wheel where the crown was, four brass fins on it, and the long spike: bright steel
    to a point, two hot seams along it, so the nose's glow travels out with the bit."""
    x, y, _ = CROWN_AT
    length = SPIKE_X[1] - SPIKE_X[0]
    pieces = shaft_pieces() + sheath_pieces('dark-iron') + [
        collar('brass', 0.027, 0.005, (0.098, SHEATH_Y, 0.0)),
        driller.disc('steel', 0.046, 0.03, CROWN_AT),
        driller.disc('nose-glow', 0.018, 0.034, (x, y - 0.002, 0.0)),
        driller.ring('brass', 0.034, 0.004, (x, CROWN_FACE_Y, 0.0)),
        driller.cone_x('bright-steel', SPIKE_RADII[0], SPIKE_RADII[1], length, (SPIKE_X[0] + length / 2, y, 0.0)),
    ]
    for seam_x in SPIKE_SEAMS_X:
        radius = spike_radius_at(seam_x)
        pieces.append(driller.cone_x('nose-glow', radius + 0.005, radius + 0.002, 0.012, (seam_x, y, 0.0)))
    for angle, _, _ in driller.around(4, 0.052, phase=math.pi / 4):
        fin = driller.tangent_box('brass', (0.01, 0.028, 0.024), angle, 0.052, 0.0)
        fin.location.x += x
        fin.location.y += y
        pieces.append(fin)
    return base_at_slot(pieces)


def spike_radius_at(x):
    share = (x - SPIKE_X[0]) / (SPIKE_X[1] - SPIKE_X[0])
    return SPIKE_RADII[0] + (SPIKE_RADII[1] - SPIKE_RADII[0]) * share


# --- the twin bit --------------------------------------------------------------------------------


def twin_bit_head_pieces():
    """An iron carrier across the cone's end with a hot core between two steel bits, each with a
    brass collar, a gunmetal ring and flutes slanting the opposite way (they counter-rotate)."""
    length = TWIN_CONE_X[1] - TWIN_CONE_X[0]
    pieces = shaft_pieces() + sheath_pieces('steel') + [
        box('dark-iron', (0.06, 0.05, 0.2), (0.10, -0.13, 0.0)),
        driller.disc('nose-glow', 0.018, 0.034, (0.105, -0.158, 0.0)),
        driller.ring('brass', 0.026, 0.004, (0.105, -0.172, 0.0)),
    ]
    for side in (1.0, -1.0):
        z = side * TWIN_Z
        pieces += [
            driller.cone_x('steel', TWIN_CONE_RADII[0], TWIN_CONE_RADII[1], length, (TWIN_CONE_X[0] + length / 2, -0.14, z)),
            collar('brass', 0.04, 0.007, (0.14, -0.14, z)),
            collar('gunmetal', 0.03, 0.006, (0.22, -0.14, z)),
        ]
        for index in range(3):
            x0 = 0.16 + index * 0.05
            rise = side * 0.014
            pieces.append(driller.segment('dark-iron', (x0, z + rise), (x0 + 0.035, z - rise), 0.005, 0.012, -0.172))
    return base_at_slot(pieces)


# --- the reach boom ------------------------------------------------------------------------------


def boom_barrel_pieces():
    """The brass barrel over the cone's last step, collared at both ends, with steel guide rails
    above and below; the ram slides out of it."""
    length = BARREL_X[1] - BARREL_X[0]
    pieces = [
        driller.cone_x('brass', BARREL_RADIUS, BARREL_RADIUS, length, (BARREL_X[0] + length / 2, SHEATH_Y, 0.0)),
        collar('dark-iron', BARREL_RADIUS + 0.004, 0.008, (0.006, SHEATH_Y, 0.0)),
        collar('dark-iron', BARREL_RADIUS + 0.004, 0.008, (BARREL_X[1] - 0.008, SHEATH_Y, 0.0)),
    ]
    for side in (1.0, -1.0):
        pieces.append(box('steel', (0.11, 0.02, 0.012), (0.048, SHEATH_Y - 0.03, side * 0.05)))
        pieces += [driller.rivet(rx, SHEATH_Y - 0.045, side * 0.03, radius=0.005) for rx in (0.03, 0.07)]
    return base_at_slot(pieces)


def boom_ram_pieces():
    """The lattice ram carrying a bigger crown 0.4 m ahead, in its own frame with its slide (the
    slot) at the origin: two steel rails with brass cross-braces round a thin spindle, so the boom
    reads as an open frame, not a second spike; its shaft back to the slot hides inside the barrel.
    Drawn behind the head (order 7 against the head's 8) so a retracted ram hides inside the cone."""
    start, end = RAM_RAILS_X
    pieces = shaft_pieces() + [
        driller.cone_x('steel', 0.012, 0.012, end - start, ((start + end) / 2, RAM_Y, 0.0)),
    ]
    for side in (1.0, -1.0):
        pieces.append(box('steel', (end - start, 0.02, 0.016), ((start + end) / 2, RAM_Y - 0.02, side * RAM_RAIL_Z)))
    step = (end - start - 0.04) / RAM_BRACES
    for index in range(RAM_BRACES):
        x0 = start + 0.02 + index * step
        pieces.append(driller.segment('brass', (x0, RAM_RAIL_Z), (x0 + step, -RAM_RAIL_Z), 0.008, 0.016, RAM_Y - 0.03))
        pieces.append(driller.segment('brass', (x0, -RAM_RAIL_Z), (x0 + step, RAM_RAIL_Z), 0.008, 0.016, RAM_Y - 0.034))
    pieces += [
        collar('dark-iron', RAM_RAIL_Z + 0.012, 0.008, (end - 0.004, RAM_Y, 0.0)),
    ]
    pieces += crown_pieces_at((BOOM_CROWN_X, CROWN_AT[1], 0.0), BOOM_CROWN_RADIUS)
    return pieces, (0.0, 0.0), -2


PIECES = {
    'cutter-yoke-1': lambda: cutter_yoke_pieces(1),
    'cutter-arm-up-1': lambda: cutter_arm_pieces(1, 1.0),
    'cutter-arm-down-1': lambda: cutter_arm_pieces(1, -1.0),
    'cutter-yoke-2': lambda: cutter_yoke_pieces(2),
    'cutter-arm-up-2': lambda: cutter_arm_pieces(2, 1.0),
    'cutter-arm-down-2': lambda: cutter_arm_pieces(2, -1.0),
    'gallery-reamers': gallery_reamers_pieces,
    'plunge-crown': plunge_crown_pieces,
    'twin-bit-head': twin_bit_head_pieces,
    'boom-barrel': boom_barrel_pieces,
    'boom-ram': boom_ram_pieces,
}


if __name__ == '__main__':
    main()
