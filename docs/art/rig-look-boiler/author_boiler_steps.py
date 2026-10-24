"""
Authors the boiler track's LK2 look steps (ticket 810, wave 647-7K of the P1-P5 map #647) into the
existing source, art/blender/vehicle-look-boiler/vehicle-look-boiler.blend: the GD lock of 24 Oct
14:54 (#810) wants at least 5 authored steps on every line, each a new outline or an added part in a
socket, never a recolour, on the band edges LK1 (#809) froze for the boiler (5, 10, 15, ...). The
twin-drum boiler stays the first step; each step here is that boiler with one more part fitted, in
the order G&V named: a pressure gauge, a safety valve and whistles, a pipe manifold, a second
(steam) drum, a riveted firebox door with a glow.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_steps.py

It opens the .blend (the source since #582), removes any earlier copy of these five parts and
rebuilds them from boilerLooks.json's rows, so a re-run rewrites the same objects; `kettle-boiler`
and `twin-drum-boiler` are left as they are. Conventions are author_boiler_looks.py's: the slot
`hull.boiler` at the origin, pieces laid out in the dome's frame and shifted by DOME_OFFSET, draw
order `z` 3, the vehicle-scale 4 mm bevel.

Why every part sits where it does: the rig outline the steps may not leave (#810, #789) is the
kettle dome's ellipse (x +-0.24, z 0..0.22), its valve stem (x +-0.022 to z 0.26) and the stem's
ring, so the sockets are the two drum heads (the right one takes the gauge, the left the whistle
rack), the shoulder over the right drum (the safety valve), the plate front (the manifold header),
the column between the drums (the steam drum stands over it) and the firebox front (the door). Every
part is fitted in front of the heads (nearer the camera, -Y) so it draws over them, and is sized to
move a 360 px phone's pixels (#157: one visible step is at least a 4 x 4 patch at 45 px/m).

| Part                 | Step (purchases) | Adds                                                                  |
| -------------------- | ---------------- | --------------------------------------------------------------------- |
| `gauged-boiler`      | 10               | a large brass-rimmed pressure gauge on the right drum's head           |
| `whistle-boiler`     | 15               | three brass whistles on the left head, a lever safety valve on top     |
| `manifold-boiler`    | 20               | a brass header pipe along the plate with four handwheels and risers    |
| `steam-drum-boiler`  | 25               | a third, upper drum end-on over the column: the steam drum             |
| `firebox-boiler`     | 30               | a hooded, brass-framed riveted firebox door with a glowing port and    |
|                      |                  | grate, an iron ash pan under it                                        |
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

import author_boiler_looks as base  # noqa: E402
import author_casing_driller as driller  # noqa: E402
from author_platform import box, build_part, cylinder, sphere  # noqa: E402

BLEND_PATH = os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle-look-boiler', 'vehicle-look-boiler.blend')

# The heads' front face (author_boiler_looks.drum_pieces) and where a fitted part stands: in front
# of the heads' rivets and bosses (which reach y -0.154), so it draws over them.
HEAD_Y = base.DRUM_FRONT_Y - 0.004
FITTED_Y = -0.165

# The pressure gauge: on the right (drill-side) drum head, inside the head's steel disc.
GAUGE_AT = (0.13, 0.085)
GAUGE_RADIUS = 0.05
# author_casing_driller's gauges sit at y -0.16; the ring moves to the fitted depth.
GAUGE_Y_SHIFT = (FITTED_Y - 0.011) - (-0.16)
GAUGE_STEM_RADIUS = 0.014

# The whistle rack on the left drum head: a brass base and three tubes rising towards the centre,
# each top under the dome's ellipse at its own x (0.157, 0.183 and 0.201 there).
WHISTLE_BASE = (0.1, 0.03, 0.03)
WHISTLE_BASE_AT = (-0.12, 0.1)
WHISTLE_TUBES = ((-0.155, 0.15), (-0.12, 0.175), (-0.085, 0.19))
WHISTLE_RADIUS = 0.013
WHISTLE_COLLAR_RADIUS = 0.017
WHISTLE_COLLAR_LENGTH = 0.012
# The lever safety valve over the right drum's shoulder, its pipe rising from the drum.
VALVE_X = 0.075
VALVE_Y = -0.1
VALVE_PIPE = (0.01, 0.15, 0.175)
VALVE_BODY = (0.02, 0.17, 0.198)
VALVE_LEVER = ((0.055, 0.203), (0.115, 0.185))
VALVE_WEIGHT = (0.112, 0.181, 0.01)

# The manifold: a header along the plate front, capped, with handwheels and risers into the drums.
HEADER_Z = 0.04
HEADER_RADIUS = 0.013
HEADER_HALF = 0.2
HEADER_CAP = (0.018, 0.012)
HANDWHEELS = ((-0.165, 0.02), (-0.072, 0.018), (0.072, 0.018), (0.165, 0.02))
HANDWHEEL_Y = -0.19
HANDWHEEL_SPOKES = 3
RISER_X = 0.19
RISER_RADIUS = 0.01
RISER_TOP = 0.085

# The steam drum: a third drum end-on over the column, its head a touch in front of the others'.
STEAM_DRUM_Z = 0.135
STEAM_DRUM_RADIUS = 0.065
STEAM_DRUM_Y_SHIFT = -0.006
STEAM_DRUM_RIVETS = 8

# The firebox door: a brass frame on the firebox front under a brass hood, an iron leaf, rivets,
# hinges, a latch, the ember port and grate that glow (the `firebox` material, half the nose
# seams' emission), and the iron ash pan under it along the plate. At a phone's 45 px/m the door
# alone moved 15 pixels, one under the sweep's 16; the hood over the steam drum's head and the pan
# over the brass plate are what carry the step past it.
DOOR_FRAME = (0.1, 0.012, 0.095)
DOOR_LEAF = (0.08, 0.008, 0.075)
DOOR_Z = 0.0525
DOOR_FRAME_Y = -0.196
DOOR_LEAF_Y = DOOR_FRAME_Y - 0.01
DOOR_FRONT_Y = DOOR_LEAF_Y - 0.006
DOOR_RIVET_INSET = 0.008
DOOR_PORT = (0.062, 0.026)
DOOR_GRATE_SLOTS = (0.022, 0.032)
DOOR_GRATE_SIZE = (0.05, 0.006, 0.005)
DOOR_HINGES = (0.075, 0.03)
DOOR_HINGE_SIZE = (0.022, 0.006, 0.01)
DOOR_LATCH = (0.03, 0.0525)
DOOR_HOOD = (0.11, 0.03, 0.012)
DOOR_HOOD_Z = 0.106
ASH_PAN = (0.12, 0.014, 0.03)
ASH_PAN_Z = 0.0
ASH_PAN_Y = -0.19


def main():
    table = base.read_table()
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    remove_earlier_copies()
    built = [author_step(look, int(table['z'])) for look in table['looks'] if look['part'] in PIECES]
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
    base.shift_pieces(pieces, base.DOME_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = base.BEVEL_M
    return part


def check_steps_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(look['part'] for look in table['looks'] if look['part'] in PIECES)
    if names != wanted or len(names) != len(PIECES):
        raise SystemExit('LK2 parts %s do not match the table %s' % (names, wanted))
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)


# --- the steps, each the one before with its part fitted --------------------------------------


def gauged_pieces():
    return base.twin_drum_pieces() + pressure_gauge_pieces()


def whistle_pieces():
    return gauged_pieces() + whistle_rack_pieces() + safety_valve_pieces()


def manifold_pieces():
    return whistle_pieces() + manifold_header_pieces()


def steam_drum_pieces():
    return manifold_pieces() + upper_drum_pieces()


def firebox_door_pieces():
    return steam_drum_pieces() + door_pieces()


# --- the fitted parts ----------------------------------------------------------------------------


def pressure_gauge_pieces():
    """A brass-rimmed dial on a stem from the right head, the needle high in the red."""
    x, z = GAUGE_AT
    stem_length = HEAD_Y - (FITTED_Y - 0.011)
    pieces = [cylinder('brass', GAUGE_STEM_RADIUS, stem_length, (x, HEAD_Y - stem_length / 2, z), 'Y')]
    return pieces + base.shifted(driller.gauge_pieces(x, z, GAUGE_RADIUS, needle_turn=0.9), GAUGE_Y_SHIFT)


def whistle_rack_pieces():
    """Three brass whistles of rising pitch on a base across the left head."""
    base_x, base_z = WHISTLE_BASE_AT
    pieces = [box('brass', WHISTLE_BASE, (base_x, FITTED_Y, base_z))]
    for x, top in WHISTLE_TUBES:
        length = top - base_z
        pieces += [
            cylinder('brass', WHISTLE_RADIUS, length, (x, FITTED_Y, base_z + length / 2), 'Z'),
            cylinder('brass', WHISTLE_COLLAR_RADIUS, WHISTLE_COLLAR_LENGTH,
                     (x, FITTED_Y, top - 0.02), 'Z'),
            cylinder('dark-iron', WHISTLE_RADIUS + 0.001, 0.006, (x, FITTED_Y, top - 0.036), 'Z'),
        ]
    return pieces


def safety_valve_pieces():
    """A lever safety valve on a pipe from the right drum's shoulder, a ball weight on the lever."""
    pipe_radius, pipe_bottom, pipe_top = VALVE_PIPE
    body_radius, body_bottom, body_top = VALVE_BODY
    weight_x, weight_z, weight_radius = VALVE_WEIGHT
    return [
        cylinder('brass', pipe_radius, pipe_top - pipe_bottom, (VALVE_X, VALVE_Y, (pipe_top + pipe_bottom) / 2), 'Z'),
        cylinder('brass', body_radius, body_top - body_bottom, (VALVE_X, VALVE_Y, (body_top + body_bottom) / 2), 'Z'),
        driller.segment('brass', VALVE_LEVER[0], VALVE_LEVER[1], 0.008, 0.012, VALVE_Y),
        sphere('brass', weight_radius, (weight_x, VALVE_Y, weight_z)),
    ]


def manifold_header_pieces():
    """A brass header across the plate, capped at both ends, four handwheels, a riser into each drum."""
    pieces = [cylinder('brass', HEADER_RADIUS, 2 * HEADER_HALF, (0.0, FITTED_Y - 0.007, HEADER_Z), 'X')]
    cap_radius, cap_length = HEADER_CAP
    for x in (-HEADER_HALF, HEADER_HALF):
        pieces.append(cylinder('brass', cap_radius, cap_length, (x, FITTED_Y - 0.007, HEADER_Z), 'X'))
    for x, radius in HANDWHEELS:
        pieces += handwheel_pieces(x, radius)
    for x in (-RISER_X, RISER_X):
        riser_length = RISER_TOP - HEADER_Z
        pieces.append(cylinder('brass', RISER_RADIUS, riser_length, (x, FITTED_Y - 0.007, HEADER_Z + riser_length / 2), 'Z'))
        pieces.append(sphere('brass', RISER_RADIUS + 0.003, (x, FITTED_Y - 0.007, RISER_TOP)))
    return pieces


def handwheel_pieces(x, radius):
    """A brass handwheel facing the camera on its valve bonnet, spoked to a hub."""
    bonnet_length = (FITTED_Y - 0.007) - HANDWHEEL_Y
    pieces = [
        cylinder('brass', 0.009, bonnet_length, (x, HANDWHEEL_Y + bonnet_length / 2, HEADER_Z), 'Y'),
        driller.ring('brass', radius, 0.004, (x, HANDWHEEL_Y, HEADER_Z)),
        sphere('brass', 0.007, (x, HANDWHEEL_Y, HEADER_Z), flatten=0.6),
    ]
    for angle, _, _ in driller.around(HANDWHEEL_SPOKES, radius, phase=math.pi / 2):
        pieces.append(box('brass', (2 * radius, 0.004, 0.005), (x, HANDWHEEL_Y, HEADER_Z), turn_y=angle))
    return pieces


def upper_drum_pieces():
    """The steam drum: a third copper drum end-on over the column, headed and riveted like the two."""
    head_y = HEAD_Y + STEAM_DRUM_Y_SHIFT
    pieces = [
        cylinder('copper', STEAM_DRUM_RADIUS, base.DRUM_DEPTH, (0.0, STEAM_DRUM_Y_SHIFT, STEAM_DRUM_Z), 'Y'),
        driller.disc('steel', STEAM_DRUM_RADIUS + 0.003, 0.014, (0.0, head_y, STEAM_DRUM_Z)),
        driller.ring('brass', STEAM_DRUM_RADIUS - 0.008, 0.009, (0.0, head_y - 0.008, STEAM_DRUM_Z)),
        sphere('brass', 0.014, (0.0, head_y - 0.012, STEAM_DRUM_Z), flatten=0.6),
    ]
    rivet_radius = STEAM_DRUM_RADIUS - 0.02
    for _, dx, dz in driller.around(STEAM_DRUM_RIVETS, rivet_radius, phase=math.pi / STEAM_DRUM_RIVETS):
        pieces.append(driller.rivet(dx, head_y - 0.012, STEAM_DRUM_Z + dz))
    return pieces


def door_pieces():
    """A brass-framed iron firebox door over the header under its hood, riveted, hinged, latched,
    its port glowing, the ash pan under it along the plate."""
    pieces = [
        box('brass', DOOR_FRAME, (0.0, DOOR_FRAME_Y, DOOR_Z)),
        box('iron-plate', DOOR_LEAF, (0.0, DOOR_LEAF_Y, DOOR_Z)),
        box('brass', DOOR_HOOD, (0.0, DOOR_FRAME_Y + DOOR_HOOD[1] / 2 - DOOR_FRAME[1] / 2, DOOR_HOOD_Z)),
        box('iron', ASH_PAN, (0.0, ASH_PAN_Y, ASH_PAN_Z)),
    ]
    pieces += door_rivet_pieces()
    for z in DOOR_HINGES:
        pieces.append(box('brass', DOOR_HINGE_SIZE, (-DOOR_LEAF[0] / 2 + 0.004, DOOR_FRONT_Y, z)))
    latch_x, latch_z = DOOR_LATCH
    pieces.append(sphere('brass', 0.007, (latch_x, DOOR_FRONT_Y, latch_z), flatten=0.6))
    pieces += ember_pieces()
    return pieces


def door_rivet_pieces():
    half_x = DOOR_LEAF[0] / 2 - DOOR_RIVET_INSET
    half_z = DOOR_LEAF[2] / 2 - DOOR_RIVET_INSET
    corners = [(x, z) for x in (-half_x, half_x) for z in (DOOR_Z - half_z, DOOR_Z + half_z)]
    edges = [(0.0, DOOR_Z - half_z), (0.0, DOOR_Z + half_z), (-half_x, DOOR_Z), (half_x, DOOR_Z)]
    return [driller.rivet(x, DOOR_FRONT_Y, z, radius=0.005) for x, z in corners + edges]


def ember_pieces():
    """The round port and the grate slots the fire shows through."""
    port_z, port_radius = DOOR_PORT
    pieces = [
        driller.ring('dark-iron', port_radius, 0.003, (0.0, DOOR_FRONT_Y, port_z)),
        driller.disc('firebox', port_radius - 0.002, 0.004, (0.0, DOOR_FRONT_Y + 0.001, port_z)),
    ]
    for z in DOOR_GRATE_SLOTS:
        pieces.append(box('firebox', DOOR_GRATE_SIZE, (0.0, DOOR_FRONT_Y + 0.001, z)))
    return pieces


PIECES = {
    'gauged-boiler': gauged_pieces,
    'whistle-boiler': whistle_pieces,
    'manifold-boiler': manifold_pieces,
    'steam-drum-boiler': steam_drum_pieces,
    'firebox-boiler': firebox_door_pieces,
}


if __name__ == '__main__':
    main()
