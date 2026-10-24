"""
Authors the engine track's LK3 look steps (ticket 811, wave 647-7K of the P1-P5 map #647) into the
existing source, art/blender/vehicle-look-drive/vehicle-look-drive.blend: the GD lock of 24 Oct
14:54 (#811) wants at least 5 authored steps on every line, each a new outline or an added part in a
socket, never a recolour, on the band edges LK1 (#809) froze for the engine (5, 10, 15, ...). The
three tracks of #731 stay the first steps on 5, 10 and 15 (the engine's drive units of #586 were
retired by #726, so the engine line's art is the drive's); each step here is the guild track with
one more part fitted, in the order the ticket named: a flywheel, then twin exhaust stacks with a
spark cap. Piston count is the existing steps' (Single piston, Triple flywheel).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/author_drive_steps.py

It opens the .blend (the source since #731), removes any earlier copy of these two parts and
rebuilds them from driveLooks.json's rows, so a re-run rewrites the same objects; the four parts of
#731 are left as they are. Conventions are author_drive_looks.py's: the slot `chassis.drive` (the
middle roller's hub) at the origin, game right +X, up +Z, details towards -Y, draw order `z` 3, the
vehicle-scale 4 mm bevel.

Why every part sits where it does: a look may not leave the rig's silhouette or the undercarriage
window (#811, #789, check_outline.py), and the thrusters (`z` 4) are drawn over the look between
the rollers, so the sockets are the tail roller's axle (the flywheel stands on it, inside the belt
loop, its spokes open over the roller's turning face) and the pod's belly either side of the
thrusters (the stacks rise from the belt's top run over the keel, inside the pod's own outline, and
clear of the thruster bells and the outer legs). Both parts are sized to move a 360 px phone's
pixels (#157: one visible step is at least a 4 x 4 patch at 45 px/m).

| Part             | Step (purchases) | Adds                                                                |
| ---------------- | ---------------- | ------------------------------------------------------------------- |
| `flywheel-track` | 20               | a brass-rimmed, steel-spoked flywheel with a crank pin on the tail  |
|                  |                  | axle                                                                |
| `exhaust-track`  | 25               | twin dark-iron exhaust stacks on brass feet either side of the      |
|                  |                  | thrusters, each under a brass spark-arrestor bonnet with a glowing  |
|                  |                  | mesh and a soot cap                                                 |
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_drive_looks as base  # noqa: E402
import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import build_part, cylinder, sphere  # noqa: E402

BLEND_PATH = os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle-look-drive', 'vehicle-look-drive.blend')

# The spark arrestors' glowing mesh: the turbine core's emission (0.3, under a fifth of the nose
# seams' 1.6), in ember orange, so the drill nose stays the brightest part of the rig.
kit.PALETTE.update({
    'spark-glow': ((1.0, 0.52, 0.18), 0.3, 0.3),
})

# The flywheel on the tail roller's axle: its rim inside the belt's inner edge (BELT_IN 0.088), its
# spokes from the hub boss out, all in front of the bosses (BOSS_Y -0.245, 0.02 deep).
FLYWHEEL_X = base.HUB_XS[0]
FLYWHEEL_Y = base.FRONT_Y
RIM = (0.074, 0.011)
SPOKES = (8, 0.03, 0.07, 0.012)
HUB_NUT = (0.013, 0.01)
CRANK_PIN = (0.05, 0.009)

# The twin stacks: either side of the thruster bells (x +-0.119..0.221), inboard of the outer legs'
# hips (x +-0.304 on), from the belt's top run (BELT_OUT 0.118) up the pod's belly to the spark caps.
STACK_XS = (-0.27, 0.27)
STACK_Y = -0.252
STACK_RADIUS = 0.022
STACK_FOOT = (0.032, 0.022, 0.095)
STACK_BOTTOM = 0.1
STACK_TOP = 0.3
STACK_BANDS = (0.15, 0.245)
STACK_BAND = (0.027, 0.014)
BONNET = (0.042, 0.024, 0.045)
BONNET_Z = STACK_TOP + BONNET[2] / 2 - 0.004
MESH_RING = (0.03, 0.005)
MESH_Z = STACK_TOP + 0.016
SOOT_CAP = (0.036, 0.012)
SOOT_Z = BONNET_Z + BONNET[2] / 2 + 0.004
SPARKS = ((-0.012, 0.372, 0.006), (0.014, 0.384, 0.005), (0.0, 0.398, 0.004))
# The vehicle-scale 4 mm bevel of the first four parts.
BEVEL_M = base.BEVEL_M


def main():
    table = base.read_table()
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    remove_earlier_copies()
    built = [author_step(look, int(look.get('z', table['z']))) for look in table['looks'] if look['part'] in PIECES]
    check_steps_match_table(table, built)
    bpy.ops.wm.save_mainfile(filepath=BLEND_PATH, compress=True)
    print('authored ' + ', '.join(part.name for part in built))


def remove_earlier_copies():
    for part_id in PIECES:
        earlier = bpy.data.objects.get(part_id)
        if earlier is not None:
            bpy.data.objects.remove(earlier)
    for mesh in [mesh for mesh in bpy.data.meshes if mesh.users == 0]:
        bpy.data.meshes.remove(mesh)


def author_step(look, z_order):
    pieces = PIECES[look['part']]()
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def check_steps_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(look['part'] for look in table['looks'] if look['part'] in PIECES)
    if names != wanted or len(names) != len(PIECES):
        raise SystemExit('LK3 parts %s do not match the table %s' % (names, wanted))
    look_box = table['lookBoxM']
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)
        if not base.is_inside_window(part, look_box):
            raise SystemExit('part "%s" reaches past the look box %s' % (part.name, look_box))


# --- the steps, each the one before with its part fitted --------------------------------------


def flywheel_track_pieces():
    return base.guild_track_pieces() + flywheel_pieces()


def exhaust_track_pieces():
    return flywheel_track_pieces() + twin_stack_pieces()


# --- the fitted parts ----------------------------------------------------------------------------


def flywheel_pieces():
    """A brass-rimmed flywheel on the tail axle, eight steel spokes from the boss, a crank pin on
    the rim and a brass hub nut."""
    major, minor = RIM
    count, inner, outer, thickness = SPOKES
    pin_reach, pin_radius = CRANK_PIN
    pieces = [kit.torus('brass', major, minor, (FLYWHEEL_X, FLYWHEEL_Y, 0.0))]
    for angle, _, _ in driller.around(count, outer):
        spoke = base.radial('steel', angle, inner, outer, thickness, FLYWHEEL_Y)
        spoke.location.x += FLYWHEEL_X
        pieces.append(spoke)
    pieces.append(sphere('dark-iron', pin_radius, (FLYWHEEL_X + pin_reach, FLYWHEEL_Y - 0.012, 0.0), flatten=0.7))
    pieces.append(sphere('brass', HUB_NUT[0], (FLYWHEEL_X, FLYWHEEL_Y - HUB_NUT[1], 0.0), flatten=0.7))
    return pieces


def twin_stack_pieces():
    pieces = []
    for x in STACK_XS:
        pieces += stack_pieces(x)
    return pieces


def stack_pieces(x):
    """A dark-iron exhaust stack on a brass foot, banded, under a brass spark-arrestor bonnet whose
    mesh glows with the embers it catches, a soot cap on top and a few sparks over it."""
    foot_radius, foot_length, foot_z = STACK_FOOT
    band_radius, band_length = STACK_BAND
    pieces = [
        cylinder('brass', foot_radius, foot_length, (x, STACK_Y, foot_z), 'Z'),
        cylinder('dark-iron', STACK_RADIUS, STACK_TOP - STACK_BOTTOM, (x, STACK_Y, (STACK_TOP + STACK_BOTTOM) / 2), 'Z'),
    ]
    pieces += [cylinder('brass', band_radius, band_length, (x, STACK_Y, z), 'Z') for z in STACK_BANDS]
    pieces += spark_cap_pieces(x)
    return pieces


def spark_cap_pieces(x):
    top_half, bottom_half, height = BONNET
    mesh_major, mesh_minor = MESH_RING
    soot_radius, soot_length = SOOT_CAP
    pieces = [
        kit.frustum('brass', top_half, bottom_half, height, (x, STACK_Y, BONNET_Z)),
        driller.ring('spark-glow', mesh_major, mesh_minor, (x, STACK_Y - top_half - 0.002, MESH_Z)),
        cylinder('soot', soot_radius, soot_length, (x, STACK_Y, SOOT_Z), 'Z'),
    ]
    pieces += [sphere('spark-glow', radius, (x + dx, STACK_Y - 0.01, z)) for dx, z, radius in SPARKS]
    return pieces


PIECES = {
    'flywheel-track': flywheel_track_pieces,
    'exhaust-track': exhaust_track_pieces,
}


if __name__ == '__main__':
    main()
