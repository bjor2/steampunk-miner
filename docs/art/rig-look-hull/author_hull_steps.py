"""
Authors the hull track's LK7 look steps (ticket 816, wave 647-7K of the P1-P5 map #647) into the
existing source, art/blender/vehicle-look-hull/vehicle-look-hull.blend: the GD lock of 24 Oct
14:54 (#816) wants the line authored to about P40 on the band edges LK1 (#809) froze for the hull
(step 120: 120, 240, ..., 2280), each step a new outline or an added part in a socket, never a
recolour. The #584 parts stay the first five steps (120 to 600); each step here is the filigree
armour with one more part fitted, in the order the ticket named: plates first (720 to 1200), then
rivets on them (1320 to 1680), then the armour skirts (1800 to 2280).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/author_hull_steps.py

It opens the .blend (the source since #584), removes any earlier copy of these fourteen parts and
rebuilds them from hullLooks.json's rows, so a re-run rewrites the same objects; the six parts of
#584 are left as they are. Conventions are author_hull_looks.py's: the slot `hull.plates` at the
origin, +X towards the drill, details stand out towards -Y, draw order `z` 5, the vehicle-scale
4 mm bevel, every part laid out in the pod's frame and shifted onto the slot, the two lifting
eyes that put the slot inside each part's bounds.

Why every part sits where it does: the rig outline the steps may not leave (#816, #789,
check_outline.py) is, round the plating, the pod itself: a capsule of radius 0.18 m about its
axis 0.21 m under the slot, 0.26 m long either way plus its end caps. The #584 plating covers
the skin from 0.06 m under the axis to the deck line; what the pod leaves bare is the belly
strip between the plating's bottom edge and its own keel bar (the keel strake's socket), the
stern and bow caps beside the plating under the dome's base plate (the cap plates' sockets),
the plating's own corner bays (the corner plates lie over the filigree) and the hatch opening
round the porthole (the hatch ring). The skirts hang under the keel strake over the keel bar,
the hips and the thrusters' swivel mounts, as the tier-3 rig's own belly skirt does
(author_casing_driller.skirt_pieces, `t3-armour-plate-3`): 0.3 m either side of the slot and
no lower than 0.166 m under the pod's axis, which is inside the pod's silhouette out to the
caps and well inside the 0.9 m collider box (VEHICLE_COLLIDER_SIZE), so a skirt never reads as
hit area. The skirts stand with their faces 0.215 m nearer the camera than the pod's axis, in
front of the hips and thigh rams of the legs, so the review composites show them as the game draws
them: the look's sprite (draw order 5) over the chassis (2) and the thrusters (4). Every plate
is a metal that contrasts with what it lies on (dark iron on the bronze stern and the dark
keel strip, pale steel on the grey bow cap, over the dark filigree bays and over the dark keel
bar), and rivets and bolts are 10 to 11 mm domes in a metal that contrasts with their plate
(bright steel on dark iron, dark iron on pale steel), in double or ringed rows, so a rivet
step moves a 360 px phone's pixels along a whole edge rather than one dot. No glow is added:
the filigree's gems stay the hull's one emission, under a fifth of the drill nose's.

| Part                     | Step | Adds                                                                     |
| ------------------------ | ---- | ------------------------------------------------------------------------ |
| `keel-strake-armour`     | 720  | a dark-iron keel strake along the plating's bottom edge, brass-lipped    |
| `stern-plated-armour`    | 840  | a brass-rimmed dark-iron plate on the bronze stern cap, three facets     |
| `bow-plated-armour`      | 960  | a brass-rimmed pale steel plate on the grey bow cap, three facets        |
| `corner-plated-armour`   | 1080 | pale steel doubling plates with dark chamfers over the four corner bays  |
| `hatch-ringed-armour`    | 1200 | a heavy dark-iron ring round the porthole, brass hinge knuckles, a latch |
| `keel-riveted-armour`    | 1320 | two staggered rows of bright steel rivets along the keel strake          |
| `cap-riveted-armour`     | 1440 | a ring of bright steel rivets round each cap plate                       |
| `corner-riveted-armour`  | 1560 | a ring of dark-iron rivets round each corner plate                       |
| `hatch-bolted-armour`    | 1680 | twelve bright steel bolts round the hatch ring                           |
| `skirt-rail-armour`      | 1800 | a brass skirt rail under the keel strake on five brass hangers           |
| `stern-skirt-armour`     | 1920 | three pale steel skirt plates hung from the rail at the stern            |
| `bow-skirt-armour`       | 2040 | three more at the bow                                                    |
| `full-skirt-armour`      | 2160 | the three middle plates, closing the skirt                               |
| `bossed-skirt-armour`    | 2280 | a brass boss on every skirt plate and a brass trim bar along its hem     |
"""

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_hull_looks as base  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, sphere, stepped  # noqa: E402

BLEND_PATH = os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle-look-hull', 'vehicle-look-hull.blend')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). Nothing here glows.
kit.PALETTE.update({
    'bright-steel': ((0.72, 0.74, 0.78), 0.25, 0.0),
})

# Where the #584 plating stands off the skin (its plates, then the filigree's bars over them).
PLATING_LIFT = base.GAP + base.PLATE_T + base.STRIP_T
# The keel strake: the bare belly strip between the plating's bottom row (-0.06) and the pod's
# own keel rivets (-0.08, on the keel bar's top edge at -0.095), the pod's whole plated length.
STRAKE_X = (-0.245, 0.245)
STRAKE_DZ = (-0.098, -0.062)
STRAKE_LIP_W = 0.008
# The cap plates: a fifth column either side of the plating on the stern and bow caps, each in
# the plating's three rows, under the dome's base plate (its bottom edge at 0.155) and clear of
# the stack's foot (x -0.326) and the piston (x 0.313). At x +-0.32 the cap's silhouette still
# reaches 0.168 m off the axis, so the rows' 0.145 m top stays inside it.
CAP_COLUMNS = ((-0.32, -0.247), (0.247, 0.31))
CAP_PLATE_MATERIALS = ('dark-iron', 'steel')
CAP_ROWS = ((-0.062, 0.02), (0.02, 0.10), (0.10, 0.145))
CAP_TRIM_W = 0.010
# The corner plates over the plating's four corner bays, inset from the bay, standing over the
# filigree's beads and gems (which reach 0.025 off the skin).
CORNER_BAYS = tuple((column, row) for column in (0, len(base.COLUMNS) - 1) for row in (0, len(base.ROWS) - 1))
CORNER_INSET = 0.008
CORNER_LIFT = 0.028
CORNER_T = 0.010
CORNER_CHAMFER_W = 0.009
# The hatch ring round the porthole (ring radius 0.056 at (0.08, 0.02), author_casing_driller's
# porthole_pieces), over the filigree's hatch frame, with two hinge knuckles on its stern side
# and a dog latch on its bow side.
HATCH_AT = (0.08, 0.02)
HATCH_RING = (0.066, 0.011)
HATCH_LIFT = 0.030
HINGE_SIZE = (0.016, 0.014, 0.022)
HINGE_DX = -0.074
HINGE_DZS = (-0.028, 0.028)
LATCH_SIZE = (0.020, 0.012, 0.036)
LATCH_DX = 0.076
# Rivets: two staggered rows along the strake, a ring round each cap plate and each corner
# plate, twelve bolts round the hatch ring.
KEEL_RIVET_ROWS = ((-0.071, -0.225), (-0.089, -0.2025))
KEEL_RIVET_STEP = 0.045
KEEL_RIVET_R = 0.010
CAP_RIVET_INSET = 0.016
CAP_RIVET_STEP = 0.034
CAP_RIVET_R = 0.011
CORNER_RIVET_INSET = 0.015
CORNER_RIVET_STEP = 0.024
CORNER_RIVET_R = 0.010
HATCH_BOLTS = 12
HATCH_BOLT_R = 0.010
# The skirt: a brass rail on five hangers under the keel strake, nine plates hung from it, a
# boss on each and a trim bar along the hem. Flat, facing the camera, their faces at SKIRT_Y,
# ahead of everything the legs put in front of the pod (the hips' faces are at -0.186, the
# thigh rams' at -0.20), inside the pod's silhouette: at x +-0.30 the stern and bow caps reach
# 0.1755 m under the axis, the hem stops at 0.168.
SKIRT_Y = -0.215
RAIL_X = (-0.30, 0.30)
RAIL_DZ = (-0.114, -0.100)
RAIL_T = 0.012
HANGER_XS = (-0.24, -0.12, 0.0, 0.12, 0.24)
HANGER_SIZE = (0.016, 0.020, 0.024)
HANGER_DZ = -0.094
SKIRT_PLATES = 9
SKIRT_PLATE_GAP = 0.005
SKIRT_PLATE_DZ = (-0.166, -0.116)
SKIRT_PLATE_T = 0.012
SKIRT_LIP_DZ = 0.009
STERN_SKIRT_PLATES = (0, 1, 2)
BOW_SKIRT_PLATES = (6, 7, 8)
MIDDLE_SKIRT_PLATES = (3, 4, 5)
BOSS_RADIUS = 0.015
BOSS_T = 0.006
HEM_DZ = (-0.168, -0.158)
HEM_T = 0.008
# The platform's 15 mm bevel would round a 1 cm trim away; vehicle-scale parts take 4 mm.
BEVEL_M = base.BEVEL_M


def main():
    table = base.read_table()
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    remove_earlier_copies()
    built = [author_step(look, int(table['z'])) for look in table['looks'] if look['part'] in STEP_PARTS]
    check_steps_match_table(table, built)
    bpy.ops.wm.save_mainfile(filepath=BLEND_PATH, compress=True)
    print('authored ' + ', '.join(part.name for part in built))


def remove_earlier_copies():
    for part_id in STEP_PARTS:
        earlier = bpy.data.objects.get(part_id)
        if earlier is not None:
            bpy.data.objects.remove(earlier)
    for mesh in [mesh for mesh in bpy.data.meshes if mesh.users == 0]:
        bpy.data.meshes.remove(mesh)


def author_step(look, z_order):
    pieces = step_pieces(look['part'])
    base.shift_pieces(pieces, base.POD_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def step_pieces(part_id):
    """The filigree armour with every LK7 part up to and including this step's fitted."""
    pieces = base.filigree_armour_pieces()
    for step_part, fitted_pieces in STEPS:
        pieces += fitted_pieces()
        if step_part == part_id:
            return pieces
    raise SystemExit('no LK7 step named "%s"' % part_id)


def check_steps_match_table(table, built):
    names = [part.name for part in built]
    wanted = [look['part'] for look in table['looks'] if look['part'] in STEP_PARTS]
    if names != wanted or sorted(names) != sorted(STEP_PARTS):
        raise SystemExit('LK7 parts %s do not match the table %s' % (names, wanted))
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)
        if not is_inside_skirt_bounds(part):
            raise SystemExit('part "%s" reaches past the skirt bounds' % part.name)


def is_inside_skirt_bounds(part):
    """No part reaches past the skirt's hem or the cap plates' ends: the pod's silhouette."""
    (min_x, min_z), (max_x, _) = base.driller.view_bounds_of(part)
    lowest = HEM_DZ[0] + base.POD_OFFSET[2] - 1e-6
    return min_z >= lowest and min_x >= CAP_COLUMNS[0][0] - 1e-6 and max_x <= CAP_COLUMNS[1][1] + 1e-6


# --- the plate steps (720 to 1200) ---------------------------------------------------------------


def keel_strake_pieces():
    """A dark-iron strake along the plating's bottom edge, a brass lip along its own."""
    x0, x1 = STRAKE_X
    dz0, dz1 = STRAKE_DZ
    return [
        base.facet('dark-iron', x0, x1, dz0, dz1, base.GAP),
        base.facet('brass', x0, x1, dz0, dz0 + STRAKE_LIP_W, base.GAP + base.PLATE_T, base.STRIP_T),
    ]


def stern_plate_pieces():
    return cap_plate_pieces(CAP_COLUMNS[0], CAP_PLATE_MATERIALS[0])


def bow_plate_pieces():
    return cap_plate_pieces(CAP_COLUMNS[1], CAP_PLATE_MATERIALS[1])


def cap_plate_pieces(column, material):
    """Three facets down a cap, the plating's rows, under one brass rim: dark iron on the bronze
    stern, pale steel on the grey bow, so each reads against its cap."""
    x0, x1 = column
    pieces = [base.facet(material, x0, x1, dz0, dz1, base.GAP) for dz0, dz1 in CAP_ROWS]
    bay = (x0, x1, CAP_ROWS[0][0], CAP_ROWS[-1][1])
    return pieces + base.rim_strips('brass', bay, CAP_TRIM_W, base.GAP + base.PLATE_T)


def corner_plate_pieces():
    """Pale steel doubling plates over the four corner bays, each under a dark-iron chamfer."""
    pieces = []
    for bay in corner_bays():
        x0, x1, dz0, dz1 = bay
        pieces.append(base.facet('steel', x0, x1, dz0, dz1, CORNER_LIFT, CORNER_T))
        pieces += base.rim_strips('dark-iron', bay, CORNER_CHAMFER_W, CORNER_LIFT + CORNER_T)
    return pieces


def corner_bays():
    """(x0, x1, dz0, dz1) of each corner plate: its bay, inset."""
    bays = []
    for column, row in CORNER_BAYS:
        x0, x1 = base.COLUMNS[column]
        dz0, dz1 = base.ROWS[row]
        bays.append((x0 + CORNER_INSET, x1 - CORNER_INSET, dz0 + CORNER_INSET, dz1 - CORNER_INSET))
    return bays


def hatch_ring_pieces():
    """A heavy dark-iron ring round the porthole, hinge knuckles astern of it, a latch ahead."""
    x, dz = HATCH_AT
    major, minor = HATCH_RING
    pieces = [base.tilted_ring('dark-iron', major, minor, base.on_skin(x, dz, HATCH_LIFT + minor), base.tilt_at(dz))]
    for hinge_dz in HINGE_DZS:
        pieces.append(skin_box('brass', HINGE_SIZE, x + HINGE_DX, dz + hinge_dz, HATCH_LIFT))
    pieces.append(skin_box('brass', LATCH_SIZE, x + LATCH_DX, dz, HATCH_LIFT))
    return pieces


# --- the rivet steps (1320 to 1680) --------------------------------------------------------------


def keel_rivet_pieces():
    """Two staggered rows of bright steel rivets along the keel strake."""
    x0, x1 = STRAKE_X
    lift = base.GAP + base.PLATE_T
    return [rivet('bright-steel', x, dz, lift, KEEL_RIVET_R)
            for dz, start in KEEL_RIVET_ROWS
            for x in stepped(start, x1 + x0 - start, KEEL_RIVET_STEP)]


def cap_rivet_pieces():
    """A ring of bright steel rivets round each cap plate, inside its brass rim."""
    pieces = []
    for x0, x1 in CAP_COLUMNS:
        bay = (x0, x1, CAP_ROWS[0][0], CAP_ROWS[-1][1])
        pieces += rivet_ring('bright-steel', bay, base.GAP + base.PLATE_T, CAP_RIVET_INSET, CAP_RIVET_STEP,
                             CAP_RIVET_R)
    return pieces


def corner_rivet_pieces():
    """A ring of dark-iron rivets round each corner plate, inside its chamfer."""
    pieces = []
    for bay in corner_bays():
        pieces += rivet_ring('dark-iron', bay, CORNER_LIFT + CORNER_T, CORNER_RIVET_INSET, CORNER_RIVET_STEP,
                             CORNER_RIVET_R)
    return pieces


def hatch_bolt_pieces():
    """Twelve bright steel bolts on the hatch ring's crest."""
    x, dz = HATCH_AT
    major, minor = HATCH_RING
    return [rivet('bright-steel', x + major * math.cos(angle), dz + major * math.sin(angle), HATCH_LIFT + 2 * minor,
                  HATCH_BOLT_R)
            for angle, _, _ in base.driller.around(HATCH_BOLTS, major, phase=math.pi / HATCH_BOLTS)]


# --- the skirt steps (1800 to 2280) --------------------------------------------------------------


def skirt_rail_pieces():
    """A brass rail under the keel strake, on five brass hangers."""
    x0, x1 = RAIL_X
    dz0, dz1 = RAIL_DZ
    pieces = [skirt_box('brass', (x1 - x0, RAIL_T, dz1 - dz0), (x0 + x1) / 2, (dz0 + dz1) / 2, RAIL_T / 2)]
    for x in HANGER_XS:
        pieces.append(skirt_box('brass', HANGER_SIZE, x, HANGER_DZ, HANGER_SIZE[1] / 2 + RAIL_T / 2))
    return pieces


def stern_skirt_pieces():
    return skirt_plate_pieces(STERN_SKIRT_PLATES)


def bow_skirt_pieces():
    return skirt_plate_pieces(BOW_SKIRT_PLATES)


def middle_skirt_pieces():
    return skirt_plate_pieces(MIDDLE_SKIRT_PLATES)


def skirt_plate_pieces(indices):
    """Pale steel plates hung from the rail over the dark keel bar, a dark-iron lip along each
    one's hem."""
    dz0, dz1 = SKIRT_PLATE_DZ
    pieces = []
    for index in indices:
        x, width = skirt_plate_span(index)
        pieces.append(skirt_box('steel', (width, SKIRT_PLATE_T, dz1 - dz0), x, (dz0 + dz1) / 2, 0.0))
        pieces.append(skirt_box('dark-iron', (width, SKIRT_PLATE_T, SKIRT_LIP_DZ), x, dz0 + SKIRT_LIP_DZ / 2, -0.002))
    return pieces


def skirt_plate_span(index):
    """(centre x, width) of the skirt plate `index` of SKIRT_PLATES along the rail."""
    x0, x1 = RAIL_X
    pitch = (x1 - x0) / SKIRT_PLATES
    return x0 + pitch * (index + 0.5), pitch - SKIRT_PLATE_GAP


def skirt_boss_pieces():
    """A brass boss on every skirt plate and a brass trim bar along the hem."""
    dz0, dz1 = SKIRT_PLATE_DZ
    pieces = []
    for index in range(SKIRT_PLATES):
        x, _ = skirt_plate_span(index)
        pieces.append(base.driller.disc('brass', BOSS_RADIUS, BOSS_T, (x, SKIRT_Y - 0.004 - BOSS_T / 2, (dz0 + dz1) / 2)))
    x0, x1 = RAIL_X
    hem0, hem1 = HEM_DZ
    pieces.append(skirt_box('brass', (x1 - x0, HEM_T, hem1 - hem0), (x0 + x1) / 2, (hem0 + hem1) / 2, -0.003))
    return pieces


# --- shapes on the pod ---------------------------------------------------------------------------


def rivet(material, x, dz, lift, radius):
    """A domed rivet on the skin at (x, dz), seated on whatever stands `lift` off it."""
    return sphere(material, radius, base.on_skin(x, dz, lift + radius * 0.3), flatten=0.6)


def rivet_ring(material, bay, lift, inset, step, radius):
    """Rivets round a plate's edge: along its top and bottom, then down its sides."""
    x0, x1, dz0, dz1 = bay
    across = [(x, dz) for x in stepped(x0 + inset, x1 - inset, step) for dz in (dz0 + inset, dz1 - inset)]
    down = [(x, dz) for dz in stepped(dz0 + inset + step, dz1 - inset - step, step) for x in (x0 + inset, x1 - inset)]
    return [rivet(material, x, dz, lift, radius) for x, dz in across + down]


def skin_box(material, size, x, dz, lift):
    """A box tangent to the skin at (x, dz), its back face `lift` off it."""
    return base.tilted_box(material, size, base.on_skin(x, dz, lift + size[1] / 2), base.tilt_at(dz))


def skirt_box(material, size, x, dz, behind):
    """A flat box facing the camera, its face `behind` metres behind the skirt's face."""
    return box(material, size, (x, SKIRT_Y + behind + size[1] / 2, dz))


STEPS = (
    ('keel-strake-armour', keel_strake_pieces),
    ('stern-plated-armour', stern_plate_pieces),
    ('bow-plated-armour', bow_plate_pieces),
    ('corner-plated-armour', corner_plate_pieces),
    ('hatch-ringed-armour', hatch_ring_pieces),
    ('keel-riveted-armour', keel_rivet_pieces),
    ('cap-riveted-armour', cap_rivet_pieces),
    ('corner-riveted-armour', corner_rivet_pieces),
    ('hatch-bolted-armour', hatch_bolt_pieces),
    ('skirt-rail-armour', skirt_rail_pieces),
    ('stern-skirt-armour', stern_skirt_pieces),
    ('bow-skirt-armour', bow_skirt_pieces),
    ('full-skirt-armour', middle_skirt_pieces),
    ('bossed-skirt-armour', skirt_boss_pieces),
)
STEP_PARTS = tuple(part for part, _ in STEPS)


if __name__ == '__main__':
    main()
