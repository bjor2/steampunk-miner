"""
Authors the first version of the boiler track's rig-look parts (ticket 582, wave 576-1B of the rig
look ladder, #576): the Game Director locked one look step for the boiler (no second model, comment
6300553486 on #157), so the asset holds the base look and that one step.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_looks.py

It writes art/blender/vehicle-look-boiler/vehicle-look-boiler.blend from boilerLooks.json (the
table this script, the renders and the outline check share). From then on that file is the source
(#52): change the art in Blender rather than editing this script. Nothing is rigged (#51 acceptance
2) and nothing is registered: the registry row, the manifest entry, the placeholder sidecar and the
piece that swaps the part on the slot are the registry's (#577) and the wiring's (#583).

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in its own frame with the track's attach slot, `hull.boiler`, at the origin, as the tech gear is
(#166), so the game draws a part at `attachPointOf(vehicleSidecar, 'hull.boiler')` with no offset.
Both parts fill the same footprint: the vehicle's own `t1-boiler` dome, which sits with its base
0.01 m right of and 0.1 m under the slot (its `atM` against the slot's in vehicle.parts.json).

| Part               | Step (purchases) | Look                                                                       |
| ------------------ | ---------------- | -------------------------------------------------------------------------- |
| `kettle-boiler`    | 0, the default   | the rig's brass pressure dome, the same pieces as `t1-boiler`, re-based    |
| `twin-drum-boiler` | 16               | two copper drums end-on with riveted steel heads, a brass steam column     |
|                    |                  | between them over the firebox, a safety valve, a gauge, an ember door      |

The twin-drum stays inside the kettle's silhouette (check_outline.py proves it against the whole
rig), so the swap never grows the rig outline; its ember door is the one glow, at a third of the
drill nose's, so the nose stays the brightest part (#576 rules).
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
from author_platform import box, build_part, cylinder, reset_scene, save_as, sphere  # noqa: E402

LOOKS_TABLE = os.path.join(HERE, 'boilerLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The firebox ember
# glows at a third of the nose seams' 1.6 (author_casing_driller's `nose-glow`).
kit.PALETTE.update({
    'firebox': ((1.0, 0.42, 0.10), 0.3, 0.5),
})

# Where the vehicle's `t1-boiler` dome sits against the `hull.boiler` slot (vehicle.parts.json:
# the dome's `atM` (-0.12, 0.1) less the slot's (-0.13, 0.2)). Every piece is laid out in the dome's
# own frame and shifted here, so both looks fill the dome's footprint.
DOME_OFFSET = (0.01, 0.0, -0.1)
DOME_RADII = (0.24, 0.15, 0.22)
# The kettle's base plate (dome_pieces): the drums and the column stand on the same one.
PLATE_SIZE = (2 * DOME_RADII[0] + 0.02, 2 * DOME_RADII[1] + 0.02, 0.035)
# The two drums, end-on to the camera, and their heads. A drum's rim at this radius and spacing stays
# under the kettle's ellipse (the furthest head rivet is at 0.93 of it).
DRUM_RADIUS = 0.085
DRUM_X = 0.11
DRUM_DEPTH = 0.26
DRUM_Z = DRUM_RADIUS
DRUM_FRONT_Y = -DRUM_DEPTH / 2
HEAD_RIVETS = 8
# The brass steam column between the drums, its cap and the safety valve on top; the valve rises
# inside the kettle's own valve stem (radius 0.022, to 0.265).
COLUMN_RADIUS = 0.045
COLUMN_TOP = 0.16
COLUMN_CAP = 0.04
VALVE_RADIUS = 0.018
VALVE_TOP = 0.26
# The kettle's own valve ring (dome_pieces), so the step keeps the outline's top; a ring facing the
# camera covers its whole outer radius, and a smaller one crossed the kettle ring's hole.
VALVE_RING = (0.03, 0.006, (0.0, -0.02, 0.265))
# The firebox block the column stands on, its door and the ember port in the door.
FIREBOX_SIZE = (0.1, 0.09, 0.1)
FIREBOX_Z = 0.05
DOOR_RADIUS = 0.03
DOOR_Z = 0.04
EMBER_RADIUS = 0.018
GAUGE_RADIUS = 0.028
GAUGE_Z = 0.135
# author_casing_driller's gauges sit at the dome's front (y -0.16); the column's front is nearer.
GAUGE_Y_SHIFT = (DRUM_FRONT_Y - 0.004) - (-0.16)
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
    pieces = PIECES[look['part']]()
    shift_pieces(pieces, DOME_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def shift_pieces(pieces, offset):
    for piece in pieces:
        piece.location.x += offset[0]
        piece.location.y += offset[1]
        piece.location.z += offset[2]


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


# --- the kettle boiler (the default look) --------------------------------------------------------


def kettle_pieces():
    """The rig's own dome, piece for piece (author_casing_driller.dome_pieces), so the look below the
    first step is the rig as it is."""
    return driller.dome_pieces()


# --- the twin-drum boiler (the step at 16 purchases) ---------------------------------------------


def twin_drum_pieces():
    pieces = [box('brass', PLATE_SIZE, (0.0, 0.0, 0.0))]
    for x in (-DRUM_X, DRUM_X):
        pieces += drum_pieces(x)
    pieces += firebox_pieces()
    pieces += column_pieces()
    pieces += shifted(driller.gauge_pieces(0.0, GAUGE_Z, GAUGE_RADIUS, needle_turn=0.5), GAUGE_Y_SHIFT)
    return pieces


def drum_pieces(x):
    """A copper drum end-on, its dished steel head rimmed in brass and riveted, a boss at the centre."""
    head_y = DRUM_FRONT_Y - 0.004
    pieces = [
        cylinder('copper', DRUM_RADIUS, DRUM_DEPTH, (x, 0.0, DRUM_Z), 'Y'),
        driller.disc('steel', DRUM_RADIUS + 0.003, 0.014, (x, head_y, DRUM_Z)),
        driller.ring('brass', DRUM_RADIUS - 0.008, 0.009, (x, head_y - 0.008, DRUM_Z)),
        sphere('brass', 0.014, (x, head_y - 0.012, DRUM_Z), flatten=0.6),
    ]
    rivet_radius = DRUM_RADIUS - 0.02
    for _, dx, dz in driller.around(HEAD_RIVETS, rivet_radius, phase=math.pi / HEAD_RIVETS):
        pieces.append(driller.rivet(x + dx, head_y - 0.012, DRUM_Z + dz))
    return pieces


def firebox_pieces():
    """The iron firebox between the drums, its round door and the ember port that glows."""
    front_y = DRUM_FRONT_Y
    return [
        box('dark-iron', FIREBOX_SIZE, (0.0, front_y + FIREBOX_SIZE[1] / 2, FIREBOX_Z)),
        driller.ring('iron', DOOR_RADIUS, 0.006, (0.0, front_y - 0.004, DOOR_Z)),
        driller.disc('firebox', EMBER_RADIUS, 0.006, (0.0, front_y - 0.004, DOOR_Z)),
    ]


def column_pieces():
    """The brass steam column over the firebox, its domed cap and the safety valve."""
    column_y = DRUM_FRONT_Y + COLUMN_RADIUS
    return [
        cylinder('brass', COLUMN_RADIUS, COLUMN_TOP, (0.0, column_y, COLUMN_TOP / 2), 'Z'),
        driller.dome('brass', (COLUMN_RADIUS, COLUMN_RADIUS, COLUMN_CAP), (0.0, column_y, COLUMN_TOP)),
        cylinder('brass', VALVE_RADIUS, VALVE_TOP - COLUMN_TOP, (0.0, column_y, (VALVE_TOP + COLUMN_TOP) / 2), 'Z'),
        driller.ring('brass', *VALVE_RING),
    ]


def shifted(pieces, dy):
    for piece in pieces:
        piece.location.y += dy
    return pieces


PIECES = {
    'kettle-boiler': kettle_pieces,
    'twin-drum-boiler': twin_drum_pieces,
}


if __name__ == '__main__':
    main()
