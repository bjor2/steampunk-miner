"""
Authors the first version of the drill_tip track's rig-look parts (ticket 578, wave 576-1A of the
rig look ladder, #576): the base look and the five steps Systems' table puts at 70, 100, 130, 190
and 280 purchases (#157 comment 6300543785), named by Progression (comment 6300549964).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/author_drill_tip_looks.py

It writes art/blender/vehicle-look-drill-tip/vehicle-look-drill-tip.blend from drillTipLooks.json
(the table this script, the renders and the outline check share). From then on that file is the
source (#52): change the art in Blender rather than editing this script. Nothing is rigged (#51
acceptance 2) and nothing is registered: the registry row, the manifest entry, the placeholder
sidecar and the piece that swaps the part on the slot are the registry's (#577) and the wiring's
(#579).

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in its own frame with the track's attach slot, `drill.head`, at the origin, as the tech gear is
(#166), so the game draws a part at `attachPointOf(vehicleSidecar, 'drill.head')` with no offset.
Every look replaces the rig's tier-1 cutter crown, `t1-drill-bit`, whose centre sits 0.118 m right
of the slot at the crown's depth (its `atM` against the slot's in vehicle.parts.json), and sheathes
the last step of the stepped cone behind it. A look's silhouette stays inside the rig's: under the
crown's steel disc (radius 0.0396) and its eight teeth, and the cone's last step (radius 0.041 down
to 0.018 over the 76 mm before the crown), which check_outline.py proves against the whole rig at
tiers 1, 2 and 3. So the looks differ by colour, by what fills the disc, and by which of the rig's
tooth positions they keep: the cones keep none, the crowns the eight.

| Part               | Step (purchases) | Look                                                                  |
| ------------------ | ---------------- | --------------------------------------------------------------------- |
| `cutter-crown`     | 0, the default   | the rig's own crown, the same pieces as `t1-drill-bit`, re-based      |
| `steel-cone`       | 70               | a polished steel cone, all cool steel, one hot seam near the point    |
| `fluted-bit`       | 100              | the cone in deep blued steel, a steel guide ring with four lands      |
| `toothed-crown`    | 130              | sixteen cutters, brass on the rim, on a steel wheel round a hot core  |
| `gem-set-crown`    | 190              | a dark iron wheel set with six violet gems round a bezelled centre    |
| `aether-cut-crown` | 280              | a pale ceramic wheel with sixteen fins, aether glass on the rim       |

The crowns keep the rig's hot core (`nose-glow`, the nose seams' material) so the drill nose stays
the brightest part of the rig (#576 rules); the gem and aether glows sit under it (0.8 and 1.2
against 1.6).
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
from author_platform import build_part, reset_scene, save_as, sphere  # noqa: E402

LOOKS_TABLE = os.path.join(HERE, 'drillTipLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The gem and aether
# glows stay under the nose seams' 1.6 (author_casing_driller's `nose-glow`).
kit.PALETTE.update({
    'bright-steel': ((0.78, 0.80, 0.84), 0.25, 0.0),
    'blued-steel': ((0.08, 0.11, 0.22), 0.3, 0.0),
    'gem-violet': ((0.60, 0.25, 0.95), 0.15, 0.8),
    'aether-ceramic': ((0.78, 0.86, 0.84), 0.3, 0.0),
    'aether-glass': ((0.55, 0.95, 0.85), 0.15, 0.5),
    'aether-glow': ((0.45, 1.0, 0.85), 0.2, 1.2),
})

# Where the rig's `t1-drill-bit` crown sits against the `drill.head` slot (vehicle.parts.json: the
# crown's `atM` (0.768, 0) less the slot's (0.65, 0)), at the crown's own depth.
CROWN_AT = (0.118, -0.16, 0.0)
CROWN_RADIUS = 0.055
CROWN_FACE_Y = CROWN_AT[1] - 0.016
# The crown's silhouette is its steel disc (radius 0.0396) and eight teeth on a circle of 0.0462,
# each 13 mm along the rim and 20 mm out (author_casing_driller.crown_pieces): a look's wheel keeps
# to the disc, and its cutters stand where the rig's teeth stand, inside their footprint.
WHEEL_RADIUS = CROWN_RADIUS * 0.72
TOOTH_COUNT = 8
TOOTH_RING = CROWN_RADIUS * 0.84
TOOTH_SIZE = (CROWN_RADIUS * 0.24, 0.028, CROWN_RADIUS * 0.36)
# The head's depth, and how far proud of it a sheath stands so it reads over the cone.
SHEATH_Y = -0.108
# The sheath over the cone's last step: from 40 mm ahead of the slot to 7 mm past the cone's end,
# tapering 1.5 mm under the step's own radius (0.0325 down to 0.018) and under the wheel's chord.
SHEATH_X = (0.04, 0.095)
SHEATH_RADII = (0.029, 0.018)
# The cone looks: the cone from the sheath's end to a point under the rig's tooth at the tip,
# inside the wheel's chord all the way (0.032 at its back), a brass collar round its back and a
# hot seam near the point, as fine as the nose's own.
CONE_X = (0.095, 0.166)
CONE_RADII = (0.030, 0.002)
COLLAR = (0.026, 0.004, 0.097)
HOT_SEAM_X = 0.125
HOT_SEAM = (0.002, 0.0005, 0.006)
# The fluted bit's lands and spokes sit on the cone's surface at the wheel's centre (radius 16 mm).
LAND_Y = -0.125
GUIDE_RING = (0.034, 0.005)
# The crown looks: a short cone bridges the sheath to the wheel, under the wheel's chord (0.026 at
# the cone's end).
BRIDGE_X = (0.088, 0.118)
BRIDGE_RADII = (0.024, 0.020)
# Every look's reach back to the slot (shaft_pieces): 6 mm wide, in the cone's own colours.
SHAFT_RADIUS = 0.003
SHAFT_BRASS_END = 0.014
# The platform's 15 mm bevel would round a 3 cm rivet band away; vehicle-scale parts take 4 mm.
BEVEL_M = driller.BEVEL_M


def main():
    table = read_table()
    reset_scene()
    built = [author_look(look, int(table['z'])) for look in table['looks']]
    check_parts_match_table(table, built)
    save_as(table['assetId'])


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


def author_look(look, z_order):
    pieces = PIECES[look['part']]() + shaft_pieces()
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def check_parts_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(look['part'] for look in table['looks'])
    if names != wanted:
        raise SystemExit('%s parts %s do not match the table %s' % (table['assetId'], names, wanted))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (table['assetId'], part.name))


def is_origin_inside(obj):
    """The export refuses a part whose origin (here the slot) is outside its own bounds."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


# --- the cutter crown (the default look) ---------------------------------------------------------


def cutter_crown_pieces():
    """The rig's own crown, piece for piece (author_casing_driller.crown_pieces), so the look below
    the first step is the rig as it is."""
    pieces = driller.crown_pieces(CROWN_RADIUS, teeth=8)
    shift_pieces(pieces, CROWN_AT)
    return pieces


def shaft_pieces():
    """Every look's reach back to the slot: a shaft 6 mm wide at the head's depth, inside the cone's
    last step (radius 18 mm or more) and the look's own tip, so it adds nothing to the rig's
    silhouette and the part's origin (the slot) lies inside its bounds, as the export requires. It
    wears the tier-1 cone's colours where it crosses them (brass to 12 mm, steel beyond), so the
    sub-pixel line it draws over the cone in the game is the cone's own."""
    steel_length = CROWN_AT[0] - SHAFT_BRASS_END
    return [
        driller.cone_x('brass', SHAFT_RADIUS, SHAFT_RADIUS, SHAFT_BRASS_END, (SHAFT_BRASS_END / 2, -0.1, 0.0)),
        driller.cone_x('steel', SHAFT_RADIUS, SHAFT_RADIUS, steel_length, (SHAFT_BRASS_END + steel_length / 2, -0.1, 0.0)),
    ]


# --- the cone looks (70, 100) --------------------------------------------------------------------


def steel_cone_pieces():
    """All cool steel, so the step after it reads warm and dark against it at a phone's size."""
    return sheath_pieces('steel') + cone_pieces('bright-steel', collar_material='bright-steel')


def fluted_bit_pieces():
    """Deep blued steel under steel flutes, a dark iron collar, and a steel guide ring round the
    point carrying the flutes' four cutting lands where the rig's diagonal teeth stand: at a
    phone's size the tip turns from a bright point to a dark one in a steel ring."""
    return (sheath_pieces('blued-steel') + cone_pieces('blued-steel', collar_material='dark-iron') + flute_pieces()
            + [bright_point(), guide_ring()] + land_pieces())


def sheath_pieces(material):
    """The sleeve over the cone's last step, from 40 mm ahead of the slot to the cone's end."""
    length = SHEATH_X[1] - SHEATH_X[0]
    centre = (SHEATH_X[0] + length / 2, SHEATH_Y, 0.0)
    return [driller.cone_x(material, SHEATH_RADII[0], SHEATH_RADII[1], length, centre)]


def cone_pieces(material, collar_material):
    """The collar, the cone to its point and the hot seam that glows with the load."""
    length = CONE_X[1] - CONE_X[0]
    seam_radius = cone_radius_at(HOT_SEAM_X)
    return [
        collar(collar_material, COLLAR[0], COLLAR[1], (COLLAR[2], SHEATH_Y, 0.0)),
        driller.cone_x(material, CONE_RADII[0], CONE_RADII[1], length, (CONE_X[0] + length / 2, SHEATH_Y, 0.0)),
        driller.cone_x('nose-glow', seam_radius + HOT_SEAM[0], seam_radius + HOT_SEAM[1], HOT_SEAM[2],
                       (HOT_SEAM_X, SHEATH_Y, 0.0)),
    ]


def cone_radius_at(x):
    share = (x - CONE_X[0]) / (CONE_X[1] - CONE_X[0])
    return CONE_RADII[0] + (CONE_RADII[1] - CONE_RADII[0]) * share


def flute_pieces():
    """Three spiral flutes as steel slants down the camera side of the cone, each kept inside the
    cone's profile where it ends and leaning with the cone's taper so it lies on the surface."""
    start_x, end_x = 0.100, 0.128
    pieces = []
    for index in range(3):
        rise = (1 - index) * 0.022
        pieces.append(flute((start_x, rise), (end_x, rise * 0.3 - 0.008), 0.005, 0.008))
    return pieces


def flute(start, end, thickness, depth):
    """A bar on the cone from `start` to `end` (x, z), its depth centred on the cone's surface at
    its middle and tilted to the taper, so it neither buries nor stands off the cone."""
    dx, dz = end[0] - start[0], end[1] - start[1]
    mid_x, mid_z = (start[0] + end[0]) / 2, (start[1] + end[1]) / 2
    surface_y = SHEATH_Y - math.sqrt(max(cone_radius_at(mid_x) ** 2 - mid_z ** 2, 0.0))
    taper = math.atan2(cone_radius_at(start[0]) - cone_radius_at(end[0]), dx)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(mid_x, surface_y + 0.001, mid_z),
                                    rotation=(0.0, math.atan2(-dz, dx), taper))
    return kit.finish_piece('steel', scale=(math.hypot(dx, dz), depth, thickness), smooth=False)


def guide_ring():
    """The steel ring round the point, under the wheel's rim, the lands' spokes reach."""
    return driller.ring('steel', GUIDE_RING[0], GUIDE_RING[1], (CROWN_AT[0], LAND_Y, 0.0))


def land_pieces():
    """The four lands the flutes end in, seen face-on round the point where the rig's diagonal teeth
    stand, each on a steel spoke from the cone, at the cone's depth so they are part of it."""
    x = CROWN_AT[0]
    pieces = []
    for angle, dx, dz in driller.around(4, TOOTH_RING, phase=math.pi / 4):
        land = driller.tangent_box('steel', (0.010, 0.026, TOOTH_SIZE[2]), angle, TOOTH_RING, LAND_Y)
        land.location.x += x
        pieces.append(land)
        pieces.append(driller.segment('steel', (x, 0.0), (x + dx, dz), 0.006, 0.012, LAND_Y))
    return pieces


def bright_point():
    """The fluted bit's last 2 cm, bright steel."""
    return driller.cone_x('bright-steel', cone_radius_at(CONE_X[1] - 0.02), CONE_RADII[1], 0.02,
                          (CONE_X[1] - 0.01, SHEATH_Y - 0.001, 0.0))


# --- the crown looks (130, 190, 280) -------------------------------------------------------------


def toothed_crown_pieces():
    """Eight brass cutters where the rig's teeth stand and eight short steel ones between, on a
    steel wheel round a wider hot core."""
    x, y, _ = CROWN_AT
    pieces = sheath_pieces('steel') + bridge_pieces('steel') + [
        driller.disc('steel', WHEEL_RADIUS, 0.03, CROWN_AT),
        driller.disc('nose-glow', 0.018, 0.034, (x, y - 0.002, 0.0)),
        driller.ring('brass', 0.024, 0.004, (x, CROWN_FACE_Y, 0.0)),
    ]
    pieces += rim_cutters('brass', TOOTH_SIZE)
    for angle, _, _ in driller.around(TOOTH_COUNT, 0.033, phase=math.pi / TOOTH_COUNT):
        pieces.append(crown_tangent_box('steel', (0.008, 0.026, 0.012), angle, 0.033))
    return pieces


def gem_set_crown_pieces():
    """A dark iron wheel rimmed in brass, six violet gems round a bezelled centre gem, four brass
    prongs on the rig's diagonal teeth; the sheath carries a brass band."""
    x, y, _ = CROWN_AT
    pieces = sheath_pieces('dark-iron') + bridge_pieces('dark-iron') + [
        collar('brass', 0.025, 0.003, (0.046, SHEATH_Y, 0.0)),
        driller.disc('dark-iron', WHEEL_RADIUS, 0.03, CROWN_AT),
        driller.ring('brass', 0.035, 0.0035, (x, CROWN_FACE_Y, 0.0)),
        driller.ring('brass', 0.019, 0.004, (x, CROWN_FACE_Y, 0.0)),
        sphere('gem-violet', 0.016, (x, y - 0.018, 0.0), flatten=0.5),
    ]
    for _, dx, dz in driller.around(6, 0.027):
        pieces.append(sphere('gem-violet', 0.008, (x + dx, CROWN_FACE_Y, dz), flatten=0.5))
    for angle, _, _ in driller.around(4, TOOTH_RING, phase=math.pi / 4):
        pieces.append(crown_tangent_box('brass', (0.008, 0.026, TOOTH_SIZE[2]), angle, TOOTH_RING))
    return pieces


def aether_cut_crown_pieces():
    """A pale ceramic wheel with eight aether-glass fins where the rig's teeth stand and eight
    ceramic ones between, round a teal core; teal collars on the sheath."""
    x, y, _ = CROWN_AT
    pieces = sheath_pieces('aether-ceramic') + bridge_pieces('aether-ceramic') + [
        collar('teal-glass', 0.025, 0.003, (0.046, SHEATH_Y, 0.0)),
        collar('teal-glass', 0.019, 0.003, (0.070, SHEATH_Y, 0.0)),
        driller.disc('aether-ceramic', 0.036, 0.03, CROWN_AT),
        driller.disc('aether-glow', 0.020, 0.034, (x, y - 0.002, 0.0)),
        driller.ring('teal-glass', 0.027, 0.004, (x, CROWN_FACE_Y, 0.0)),
    ]
    pieces += rim_cutters('aether-glass', (0.006, 0.026, TOOTH_SIZE[2]))
    for angle, _, _ in driller.around(TOOTH_COUNT, 0.032, phase=math.pi / TOOTH_COUNT):
        pieces.append(crown_tangent_box('aether-ceramic', (0.005, 0.024, 0.012), angle, 0.032))
    return pieces


def rim_cutters(material, size):
    """Cutters where the rig's own teeth stand, no wider along the rim or further out than they are."""
    return [crown_tangent_box(material, size, angle, TOOTH_RING)
            for angle, _, _ in driller.around(TOOTH_COUNT, TOOTH_RING)]


def bridge_pieces(material):
    """The short cone from the sheath's end to the wheel's back."""
    length = BRIDGE_X[1] - BRIDGE_X[0]
    centre = (BRIDGE_X[0] + length / 2, SHEATH_Y, 0.0)
    return [driller.cone_x(material, BRIDGE_RADII[0], BRIDGE_RADII[1], length, centre)]


def crown_tangent_box(material, size, angle, radius):
    """A cutter on the wheel's rim, in the crown's own frame (author_casing_driller.tangent_box)."""
    piece = driller.tangent_box(material, size, angle, radius, 0.0)
    piece.location.x += CROWN_AT[0]
    piece.location.y += CROWN_AT[1]
    return piece


def collar(material, major, minor, centre):
    """A ring round the cone (its axis along X): edge-on to the camera, so its silhouette is a band
    as wide as its tube, not the circle a face-on ring covers."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=10, location=centre, rotation=(0.0, math.pi / 2, 0.0))
    return kit.finish_piece(material, smooth=True)


def shift_pieces(pieces, offset):
    for piece in pieces:
        piece.location.x += offset[0]
        piece.location.y += offset[1]
        piece.location.z += offset[2]


PIECES = {
    'cutter-crown': cutter_crown_pieces,
    'steel-cone': steel_cone_pieces,
    'fluted-bit': fluted_bit_pieces,
    'toothed-crown': toothed_crown_pieces,
    'gem-set-crown': gem_set_crown_pieces,
    'aether-cut-crown': aether_cut_crown_pieces,
}


if __name__ == '__main__':
    main()
