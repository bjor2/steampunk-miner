"""
Authors the engine line's LK8 look steps (ticket 871, wave 647-7Z of the P1-P5 map #647) into the
existing source, art/blender/vehicle-look-drive/vehicle-look-drive.blend: the GD lock of 25 Oct
06:48 (#871) wants the line authored to about P40 on the band edges LK1 (#809) froze for the engine
(step 5: 5, 10, ..., 100), at least 13 steps (Systems' sizing row), each a new outline or an added
part in a socket, never a recolour. The five steps of #731 and LK3 (#811) stay the first steps (5 to
25); each step here is the exhaust track with one more part fitted, from 30 to 100: engine fittings
first, then heavier running gear, then the aetheric glows of the guild's drive. Since #726 the
engine line's art is the drive's (the engine's drive units were retired), so these are drive parts.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/author_drive_p40_steps.py

It opens the .blend (the source since #731), removes any earlier copy of these fifteen parts and
rebuilds them from driveLooks.json's rows, so a re-run rewrites the same objects; the six parts of
#731 and #811 are left as they are. Conventions are author_drive_looks.py's: the slot
`chassis.drive` (the middle roller's hub) at the origin, game right +X, up +Z, details towards -Y,
draw order `z` 3, the vehicle-scale 4 mm bevel.

Why every part sits where it does: a look may not leave the rig's silhouette or the undercarriage
window (#871, #789, check_outline.py), and the thruster bells (`z` 4, x +-0.119..0.221, from the
belt's top run up to 0.19 m over the hub line) and the tier-3 belly skirt (`z` 5, 0.105 to 0.175
over the hub line) are drawn over the look, so the sockets are what those leave open: the bow
axle (the sprocket; the tail axle carries LK3's flywheel), the lower half of each frame gap
between the rollers (the idlers), the line just under the axles across the whole loop (the side
rod), the belt's bottom run in the gaps (the guards), the pod's belly between the thrusters over
the keel bar (the governor, the cylinders, the steam lines), the belly over each thruster's top
and inboard of LK3's stacks (the lockers, the lamps), the ring round the turbine inside the belt
(the bull gear), the cleats' faces round the loop (the studs), the stacks' shafts over the skirt
line (the coils), and the wheels' hubs and rims (the aether glows). Every part keeps inside the
look box of driveLooks.json (the window plus the belly strip to 0.42 m over the hub line, 0.06 m
over the vehicle's origin), so nothing moves the rig outline, the drawn drill tip or the collider.

| Part               | Step | Adds                                                                  |
| ------------------ | ---- | --------------------------------------------------------------------- |
| `sprocket-track`   | 30   | a toothed brass drive sprocket with steel spokes on the bow axle      |
| `idler-track`      | 35   | a brass-rimmed steel idler wheel riding the bottom run in each gap    |
| `coupled-track`    | 40   | crank pins on the three axles and a steel side rod coupling them      |
| `guard-track`      | 45   | riveted pale steel guard plates over the bottom run in each gap       |
| `governor-track`   | 50   | a brass centrifugal governor with steel balls on the belly            |
| `cylinder-track`   | 55   | twin brass steam cylinders with iron flanges over the governor        |
| `piped-track`      | 60   | copper steam lines from the cylinders to the stacks' bonnets          |
| `locker-track`     | 65   | a riveted dark-iron side locker with a brass hasp over each thruster  |
| `lamped-track`     | 70   | a brass running lamp with an amber lens over each locker              |
| `geared-track`     | 75   | a toothed brass bull gear round the guild turbine                     |
| `studded-track`    | 80   | a bright steel stud on every cleat round the belt                     |
| `coiled-track`     | 85   | three copper induction coils round each stack's shaft                 |
| `aether-hub-track` | 90   | a glowing teal lens on every wheel's and idler's hub                  |
| `haloed-track`     | 95   | a glowing teal halo inside the sprocket, flywheel and turbine         |
| `aether-track`     | 100  | glowing teal strips along the side rod, the guards and the cylinders  |
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

import author_drive_looks as base  # noqa: E402
import author_drive_steps as lk3  # noqa: E402
import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, sphere  # noqa: E402

BLEND_PATH = lk3.BLEND_PATH

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The aether glows and
# the lamps' lenses sit at the turbine core's emission (0.3, under a fifth of the nose seams' 1.6),
# so the drill nose stays the brightest part of the rig.
kit.PALETTE.update({
    'bright-steel': ((0.72, 0.74, 0.78), 0.25, 0.0),
    'aether-glow': ((0.30, 0.90, 0.85), 0.2, 0.3),
    'lamp-amber': ((1.0, 0.72, 0.30), 0.2, 0.3),
})

# Depth planes: the belt and frames at base.BODY_Y (-0.225), the bosses and drive units out to
# base.FRONT_Y (-0.262); the fitted wheel parts stand in front of those, the belly parts in front
# of the keel bar's face (-0.109) and the legs' hips (-0.186).
WHEEL_Y = base.FRONT_Y - 0.004
ROD_Y = base.FRONT_Y - 0.018
BELLY_Y = -0.13

# The drive sprocket on the bow axle, inside the belt's inner edge (base.BELT_IN 0.088): a brass
# ring, twelve dark-iron teeth to 0.086, six steel spokes and a brass hub nut.
SPROCKET_X = base.HUB_XS[-1]
SPROCKET_RIM = (0.066, 0.009)
SPROCKET_TEETH = (12, 0.079, (0.016, 0.012, 0.014))
SPROCKET_SPOKES = (6, 0.03, 0.058, 0.012)
SPROCKET_NUT = (0.013, 0.01)
# The idler wheels, one in each gap riding the belt's bottom run under the thruster bells' reach.
IDLER_XS = (-base.FRAME_X, base.FRAME_X)
IDLER_Z = -0.064
IDLER = (0.022, 0.012)
IDLER_RIM = (0.02, 0.004)
IDLER_HUB = (0.007, 0.012)
# The coupling: a crank pin at radius 0.05 on each axle, just under the turbine window, and the
# steel side rod through the three pins, clear of the idlers' tops (-0.042).
CRANK_R = 0.05
CRANK_Z = -0.03
CRANK_DX = math.sqrt(CRANK_R * CRANK_R - CRANK_Z * CRANK_Z)
CRANK_PIN = 0.009
ROD_END = 0.012
ROD = (0.016, 0.01)
# The belt guards over the bottom run in each gap: pale steel plates with three dark-iron rivets.
GUARD_Z = -0.104
GUARD = (0.13, 0.016, 0.028)
GUARD_Y = -0.238
GUARD_RIVET_DXS = (-0.04, 0.0, 0.04)
GUARD_RIVET_R = 0.006
# The governor on the belly between the thrusters: base disc, spindle, two arms with steel balls,
# a collar and a finial, over the middle leg's hip (its top at 0.216).
GOVERNOR_BASE = (0.028, 0.012, 0.225)
GOVERNOR_SPINDLE = (0.007, 0.11, 0.285)
GOVERNOR_ARMS = ((0.0, 0.33), (0.045, 0.285))
GOVERNOR_BALL = (0.015, 0.045, 0.285)
GOVERNOR_COLLAR = (0.012, 0.008, 0.34)
GOVERNOR_FINIAL = (0.009, 0.35)
# The twin cylinders over the governor, lying along the axle line between the thrusters, under
# the look box's top (0.42).
CYLINDER_XS = (-0.075, 0.075)
CYLINDER = (0.02, 0.07, 0.385)
CYLINDER_FLANGE = (0.023, 0.006)
CYLINDER_GLAND = (0.012, 0.008)
# The steam lines: from each cylinder's outer end out along the belly to an elbow beside the
# stack's bonnet (its edge at x 0.228), then down to its side.
PIPE_R = 0.006
PIPE_ELBOW_X = 0.224
PIPE_DROP_Z = 0.335
PIPE_UNION = 0.011
# The side lockers over each thruster's top (0.19) and inboard of the stacks (0.248): a dark-iron
# box, a brass hinge strip along its top and a brass hasp on its face.
LOCKER_XS = (-0.17, 0.17)
LOCKER = (0.09, 0.03, 0.08)
LOCKER_Z = 0.24
LOCKER_Y = -0.125
LOCKER_HINGE = (0.09, 0.006, 0.008)
LOCKER_HASP = (0.016, 0.008, 0.024)
LOCKER_RIVET_DXS = (-0.036, 0.036)
LOCKER_RIVET_DZS = (-0.03, 0.03)
# The running lamps over the lockers, inboard of the stack bonnets and under the steam lines.
LAMP_XS = (-0.2, 0.2)
LAMP = (0.02, 0.03, 0.31)
LAMP_LENS = (0.014, 0.01)
# The bull gear round the turbine: a brass ring outside the vanes (0.056) and sixteen teeth inside
# the belt's inner edge.
GEAR_RIM = (0.068, 0.007)
GEAR_TEETH = (16, 0.079, (0.012, 0.01, 0.012))
GEAR_Y = base.FRONT_Y - 0.008
# The belt studs: a bright steel dome on every cleat's face round the loop, inside the window's
# edges (x +-0.44, z -0.12).
STUD_R = 0.006
STUD_Y = -0.25
# The induction coils round each stack's shaft, over the tier-3 skirt line (0.175) and under the
# stack's lower band (0.245).
COIL = (0.03, 0.006)
COIL_ZS = (0.19, 0.205, 0.22)
# The aether hubs: a glowing lens on the three axles and the two idlers.
HUB_LENS = (0.011, 0.006)
IDLER_LENS = (0.006, 0.006)
# The wheel halos: inside the sprocket's and flywheel's rims, and round the turbine's vanes inside
# its boss (0.034).
WHEEL_HALO = (0.05, 0.004)
TURBINE_HALO = (0.031, 0.0025)
HALO_Y = base.FRONT_Y - 0.026
# The aether drive: glow strips along the side rod, the guards and round the cylinders' ends.
ROD_STRIP = 0.005
GUARD_STRIP = (0.12, 0.004, 0.006)
CYLINDER_RING = (0.021, 0.003)
# The vehicle-scale 4 mm bevel of the first six parts.
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
    part = build_part(look['part'], step_pieces(look['part']), (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def step_pieces(part_id):
    """The exhaust track with every LK8 part up to and including this step's fitted."""
    pieces = lk3.exhaust_track_pieces()
    for step_part, fitted_pieces in STEPS:
        pieces += fitted_pieces()
        if step_part == part_id:
            return pieces
    raise SystemExit('no LK8 step named "%s"' % part_id)


def check_steps_match_table(table, built):
    names = [part.name for part in built]
    wanted = [look['part'] for look in table['looks'] if look['part'] in STEP_PARTS]
    if names != wanted or sorted(names) != sorted(STEP_PARTS):
        raise SystemExit('LK8 parts %s do not match the table %s' % (names, wanted))
    look_box = table['lookBoxM']
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)
        if not base.is_inside_window(part, look_box):
            raise SystemExit('part "%s" reaches past the look box %s' % (part.name, look_box))


# --- the fitted parts: engine fittings ----------------------------------------------------------


def sprocket_pieces():
    """A toothed brass drive sprocket on the bow axle, mirroring the tail axle's flywheel."""
    major, minor = SPROCKET_RIM
    count, radius, size = SPROCKET_TEETH
    spoke_count, inner, outer, thickness = SPROCKET_SPOKES
    pieces = [kit.torus('brass', major, minor, (SPROCKET_X, WHEEL_Y, 0.0))]
    for angle, _, _ in driller.around(count, radius, math.pi / count):
        tooth = driller.tangent_box('dark-iron', size, angle, radius, WHEEL_Y)
        tooth.location.x += SPROCKET_X
        pieces.append(tooth)
    for angle, _, _ in driller.around(spoke_count, outer):
        spoke = base.radial('steel', angle, inner, outer, thickness, WHEEL_Y)
        spoke.location.x += SPROCKET_X
        pieces.append(spoke)
    pieces.append(sphere('brass', SPROCKET_NUT[0], (SPROCKET_X, WHEEL_Y - SPROCKET_NUT[1], 0.0), flatten=0.7))
    return pieces


def idler_pieces():
    """A brass-rimmed steel idler wheel riding the belt's bottom run in each gap."""
    radius, thickness = IDLER
    pieces = []
    for x in IDLER_XS:
        pieces.append(driller.disc('steel', radius, thickness, (x, WHEEL_Y, IDLER_Z)))
        pieces.append(kit.torus('brass', IDLER_RIM[0], IDLER_RIM[1], (x, WHEEL_Y - 0.006, IDLER_Z)))
        pieces.append(driller.disc('dark-iron', IDLER_HUB[0], IDLER_HUB[1], (x, WHEEL_Y - 0.008, IDLER_Z)))
    return pieces


def crank_pin_xs():
    return [hub_x + CRANK_DX for hub_x in base.HUB_XS]


def coupling_pieces():
    """A crank pin on each axle and one steel side rod through all three, as a locomotive's."""
    pieces = []
    for x in crank_pin_xs():
        pieces.append(sphere('dark-iron', CRANK_PIN, (x, ROD_Y - 0.008, CRANK_Z), flatten=0.7))
        pieces.append(driller.disc('brass', ROD_END, 0.008, (x, ROD_Y - 0.002, CRANK_Z)))
    thickness, depth = ROD
    pins = crank_pin_xs()
    pieces.append(driller.segment('steel', (pins[0], CRANK_Z), (pins[-1], CRANK_Z), thickness, depth, ROD_Y))
    return pieces


def guard_pieces():
    """A riveted pale steel guard plate over the belt's bottom run in each gap."""
    pieces = []
    for x in IDLER_XS:
        pieces.append(box('bright-steel', GUARD, (x, GUARD_Y, GUARD_Z)))
        pieces += [sphere('dark-iron', GUARD_RIVET_R, (x + dx, GUARD_Y - GUARD[1] / 2 - 0.002, GUARD_Z), flatten=0.6)
                   for dx in GUARD_RIVET_DXS]
    return pieces


def governor_pieces():
    """A brass centrifugal governor standing on the keel bar between the thrusters."""
    base_r, base_t, base_z = GOVERNOR_BASE
    spindle_r, spindle_len, spindle_z = GOVERNOR_SPINDLE
    top, tip = GOVERNOR_ARMS
    ball_r, ball_x, ball_z = GOVERNOR_BALL
    collar_r, collar_t, collar_z = GOVERNOR_COLLAR
    pieces = [
        driller.disc('brass', base_r, base_t, (0.0, BELLY_Y, base_z)),
        cylinder('brass', spindle_r, spindle_len, (0.0, BELLY_Y - 0.005, spindle_z), 'Z'),
        driller.disc('brass', collar_r, collar_t, (0.0, BELLY_Y - 0.005, collar_z)),
        sphere('brass', GOVERNOR_FINIAL[0], (0.0, BELLY_Y - 0.005, GOVERNOR_FINIAL[1])),
    ]
    for side in (-1.0, 1.0):
        pieces.append(driller.segment('steel', top, (side * tip[0], tip[1]), 0.008, 0.008, BELLY_Y - 0.01))
        pieces.append(sphere('steel', ball_r, (side * ball_x, BELLY_Y - 0.012, ball_z)))
    return pieces


def cylinder_pieces():
    """Twin brass steam cylinders lying along the axle line over the governor."""
    radius, length, z = CYLINDER
    flange_r, flange_len = CYLINDER_FLANGE
    pieces = []
    for x in CYLINDER_XS:
        pieces.append(cylinder('brass', radius, length, (x, BELLY_Y, z), 'X'))
        for end in (-1.0, 1.0):
            pieces.append(cylinder('iron', flange_r, flange_len, (x + end * (length / 2 - 0.004), BELLY_Y, z), 'X'))
        pieces.append(driller.disc('dark-iron', CYLINDER_GLAND[0], CYLINDER_GLAND[1], (x, BELLY_Y - radius, z)))
    return pieces


def pipe_pieces():
    """Copper steam lines from each cylinder's outer end to the side of its stack's bonnet."""
    _, length, z = CYLINDER
    pieces = []
    for side in (-1.0, 1.0):
        start_x = side * (abs(CYLINDER_XS[0]) + length / 2)
        elbow = (side * PIPE_ELBOW_X, z)
        pieces.append(driller.segment('copper', (start_x, z), elbow, 2 * PIPE_R, 2 * PIPE_R, BELLY_Y - 0.004))
        pieces.append(driller.segment('copper', elbow, (elbow[0], PIPE_DROP_Z), 2 * PIPE_R, 2 * PIPE_R, BELLY_Y - 0.004))
        pieces.append(sphere('brass', PIPE_UNION, (elbow[0], BELLY_Y - 0.006, z)))
        pieces.append(sphere('brass', PIPE_UNION, (elbow[0], BELLY_Y - 0.006, PIPE_DROP_Z)))
    return pieces


# --- the fitted parts: heavier running gear -----------------------------------------------------


def locker_pieces():
    """A riveted dark-iron side locker over each thruster, a brass hinge strip and hasp."""
    width, depth, height = LOCKER
    pieces = []
    for x in LOCKER_XS:
        pieces.append(box('dark-iron', LOCKER, (x, LOCKER_Y, LOCKER_Z)))
        pieces.append(box('brass', LOCKER_HINGE, (x, LOCKER_Y - depth / 2, LOCKER_Z + height / 2 - LOCKER_HINGE[2] / 2)))
        pieces.append(box('brass', LOCKER_HASP, (x, LOCKER_Y - depth / 2 - 0.002, LOCKER_Z)))
        pieces += [sphere('bright-steel', 0.005, (x + dx, LOCKER_Y - depth / 2 - 0.002, LOCKER_Z + dz), flatten=0.6)
                   for dx in LOCKER_RIVET_DXS for dz in LOCKER_RIVET_DZS]
    return pieces


def lamp_pieces():
    """A brass running lamp with an amber lens over each locker, inboard of the stack bonnets."""
    radius, length, z = LAMP
    pieces = []
    for x in LAMP_XS:
        pieces.append(cylinder('brass', radius, length, (x, BELLY_Y - 0.01, z), 'Y'))
        pieces.append(driller.disc('lamp-amber', LAMP_LENS[0], LAMP_LENS[1], (x, BELLY_Y - 0.01 - length / 2, z)))
        pieces.append(kit.torus('brass', radius * 0.85, radius * 0.14, (x, BELLY_Y - 0.012 - length / 2, z)))
    return pieces


def gear_pieces():
    """A toothed brass bull gear round the guild turbine, inside the belt loop."""
    major, minor = GEAR_RIM
    count, radius, size = GEAR_TEETH
    pieces = [kit.torus('brass', major, minor, (0.0, GEAR_Y, 0.0))]
    for angle, _, _ in driller.around(count, radius):
        pieces.append(driller.tangent_box('dark-iron', size, angle, radius, GEAR_Y))
    return pieces


def stud_pieces():
    """A bright steel dome on every cleat's face round the belt loop."""
    pieces = []
    for index, (x, z, direction) in enumerate(base.loop_points(base.LINK_COUNT)):
        if index % 2 != 0:
            continue
        outward = (-math.sin(direction), math.cos(direction))
        reach = base.CLEAT_R - base.BELT_R
        pieces.append(sphere('bright-steel', STUD_R, (x + outward[0] * reach, STUD_Y, z + outward[1] * reach), flatten=0.6))
    return pieces


def coil_pieces():
    """Three copper induction coils round each stack's shaft, over the tier-3 skirt line."""
    major, minor = COIL
    return [kit.torus('copper', major, minor, (x, lk3.STACK_Y, z)) for x in lk3.STACK_XS for z in COIL_ZS]


# --- the fitted parts: the aetheric glows -------------------------------------------------------


def aether_hub_pieces():
    """A glowing teal lens on every axle's hub and on each idler's hub."""
    pieces = [driller.disc('aether-glow', HUB_LENS[0], HUB_LENS[1], (x, HALO_Y, 0.0)) for x in base.HUB_XS]
    pieces += [driller.disc('aether-glow', IDLER_LENS[0], IDLER_LENS[1], (x, HALO_Y, IDLER_Z)) for x in IDLER_XS]
    return pieces


def halo_pieces():
    """A glowing teal halo inside the sprocket's and flywheel's rims and round the turbine's vanes."""
    major, minor = WHEEL_HALO
    pieces = [kit.torus('aether-glow', major, minor, (x, HALO_Y, 0.0)) for x in (base.HUB_XS[0], base.HUB_XS[-1])]
    pieces.append(kit.torus('aether-glow', TURBINE_HALO[0], TURBINE_HALO[1], (0.0, HALO_Y, 0.0)))
    return pieces


def aether_drive_pieces():
    """Glow strips along the side rod and the guards, and glowing rings round the cylinders' ends."""
    pins = crank_pin_xs()
    pieces = [driller.segment('aether-glow', (pins[0] + ROD_END, CRANK_Z), (pins[-1] - ROD_END, CRANK_Z),
                              ROD_STRIP, ROD_STRIP, ROD_Y - ROD[1] / 2 - 0.002)]
    pieces += [box('aether-glow', GUARD_STRIP, (x, GUARD_Y - GUARD[1] / 2 - 0.002, GUARD_Z + 0.008)) for x in IDLER_XS]
    _, length, z = CYLINDER
    for x in CYLINDER_XS:
        for end in (-1.0, 1.0):
            pieces.append(cylinder('aether-glow', CYLINDER_RING[0], CYLINDER_RING[1],
                                   (x + end * (length / 2 - 0.012), BELLY_Y, z), 'X'))
    return pieces


STEPS = (
    ('sprocket-track', sprocket_pieces),
    ('idler-track', idler_pieces),
    ('coupled-track', coupling_pieces),
    ('guard-track', guard_pieces),
    ('governor-track', governor_pieces),
    ('cylinder-track', cylinder_pieces),
    ('piped-track', pipe_pieces),
    ('locker-track', locker_pieces),
    ('lamped-track', lamp_pieces),
    ('geared-track', gear_pieces),
    ('studded-track', stud_pieces),
    ('coiled-track', coil_pieces),
    ('aether-hub-track', aether_hub_pieces),
    ('haloed-track', halo_pieces),
    ('aether-track', aether_drive_pieces),
)
STEP_PARTS = tuple(part for part, _ in STEPS)


if __name__ == '__main__':
    main()
