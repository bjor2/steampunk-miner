"""
Authors the first version of the drive's rig-look parts, tracks and wheels per engine stage (ticket
731, wave 576-3A of the rig look ladder, #576): the base look and the three steps the engine row
puts at 2, 18 and 26 purchases (Systems' table, #157 comment 6300543785; the GD on #726 keys the
drive look on levels.engine, so drill-speed buys never move it).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/author_drive_looks.py

It writes art/blender/vehicle-look-drive/vehicle-look-drive.blend from driveLooks.json (the table
this script, the renders and the outline check share). From then on that file is the source (#52):
change the art in Blender rather than editing this script. Nothing is rigged (#51 acceptance 2) and
nothing is registered: the registry rows are #577's and the swap of each step's part onto the slot,
in place of the engine's drive units, is the wiring's (#726).

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in its own frame with the track's attach slot, `chassis.drive`, at the origin, as the engine looks
are (#586), so the game draws a part at `attachPointOf(vehicleSidecar, 'chassis.drive')` with no
offset. The slot is the middle roller's hub (vehicle.parts.json: the slot and `t1-wheel-2` both at
(0, -0.36)); the three rollers sit 0.32 m apart on that line, radius 0.12 at tier 1 and 0.13 at
tier 3, and roll as wheels (partMotion). No rig part stands on the slot, so a look lies over the
undercarriage rather than replacing a part (`replaces: null`), at `z` 3 over the chassis's 2.

Each step is one part, the whole undercarriage: a track belt of links running over the three
rollers inside their own radius (so the rig's outline never grows and the belt sits on the ground
line the rollers stand on), side frames in the gaps between the rollers, a hub boss on each axle and
the engine stage's drive unit on the middle one. Every roller's face inside the belt is left open,
so the rig's own rollers keep turning under the look.

| Part          | Step (purchases)       | Look                                                                       |
| ------------- | ---------------------- | -------------------------------------------------------------------------- |
| `bare-hub`    | 0, the default         | the leg's own brass hub cap and axle nut, piece for piece (the rig as is)  |
| `iron-track`  | 2, Single piston       | a rubber belt with iron cleats, riveted iron frames, brass hubs, a piston  |
| `steel-track` | 18, Triple flywheel    | a pale steel belt with brass cleats, steel frames on a brass rail, spoked  |
| `guild-track` | 26, Guild turbine      | a guild-green belt shod in brass, bronze frames, enamel hubs, a lit core   |

The guild track's core is the one emission, at the engine turbine's 0.3 (under a fifth of the drill
nose's 1.6), so the nose stays the brightest part (#576 rules).
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

LOOKS_TABLE = os.path.join(HERE, 'driveLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape): the engine looks'
# guild enamel and turbine glow (author_engine_looks.py), so the two assets share one guild livery.
kit.PALETTE.update({
    'guild-enamel': ((0.10, 0.22, 0.20), 0.35, 0.0),
    'turbine-glow': ((0.26, 0.56, 0.72), 0.2, 0.3),
})

# The rollers (author_casing_driller: HUB_XS, roller_pieces): hubs 0.32 m apart on the slot's line,
# radius 0.12 at tier 1. The belt keeps inside that radius, and its inner edge clears the roller's
# lugs (the tangent boxes at 0.074, out to 0.084), so the roller turns visibly inside the loop.
HUB_XS = driller.HUB_XS
ROLLER_R = 0.12
BELT_OUT = 0.118
BELT_IN = 0.088
BELT_R = (BELT_OUT + BELT_IN) / 2
BELT_THICK = BELT_OUT - BELT_IN
# The leg's hub cap over each roller (leg_pieces: a brass disc and a dark-iron axle nut, the leg's
# depth): the base look reproduces the middle one 1 mm proud, so the two never share a face.
HUB_CAP = (0.032, 0.03, -0.181)
AXLE_NUT = (0.012, 0.035, -0.186)
# Every look stands in front of the caps (their front face at y -0.2035): the belt and frames at
# BODY_Y, the bosses and drive units out to FRONT_Y.
BODY_Y = -0.225
BODY_DEPTH = 0.03
FRONT_Y = -0.262
# Belt links round the loop (two straight runs, two half-turns), their pitch along the path.
LINK_COUNT = 46
LINK_GAP = 0.004
LINK_DEPTH = 0.03
# Cleats on every other link, standing proud of the belt but inside its outer radius.
CLEAT = (0.012, 0.036, 0.012)
CLEAT_R = BELT_OUT - 0.006
# Side frames in the gaps between the rollers, inside the belt loop, clear of the open faces.
FRAME_X = 0.16
FRAME = (0.08, 0.02, 0.17)
FRAME_RIVETS = ((-0.025, -0.06), (0.025, -0.06), (-0.025, 0.06), (0.025, 0.06))
RAIL = (0.08, 0.024, 0.016)
TRIM = (0.08, 0.024, 0.01)
# Hub bosses on the three axles, over the legs' caps, inside the roller's hub bolts.
BOSS_R = 0.034
BOSS_THICK = 0.02
BOSS_Y = -0.245
NUT_R = 0.012
# The drive units on the middle hub, one per stage: a steam cylinder lying along the axle's left
# (Single piston), a spoked flywheel face (Triple flywheel), a vaned window over a glow (Guild turbine).
PISTON = (0.016, 0.05, -0.058)
PISTON_FLANGE = (0.018, 0.006)
SPOKES = (6, 0.012, 0.03, 0.008)
VANES = (4, 0.012, 0.028, 0.5, 0.008)
GLOW = (0.02, 0.008)
WINDOW = (0.024, 0.01)
BOLT_RADIUS = 0.005
# The platform's 15 mm bevel would round a 1 cm cleat away; vehicle-scale parts take 4 mm.
BEVEL_M = driller.BEVEL_M


def main():
    table = read_table()
    reset_scene()
    built = [author_look(look, int(look.get('z', table['z']))) for look in table['looks']]
    check_parts_match_table(table, built)
    save_as(table['assetId'])


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


def author_look(look, z_order):
    pieces = PIECES[look['part']]()
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def check_parts_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(look['part'] for look in table['looks'])
    if names != wanted:
        raise SystemExit('%s parts %s do not match the table %s' % (table['assetId'], names, wanted))
    window = table['windowM']
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (table['assetId'], part.name))
        if not is_inside_window(part, window):
            raise SystemExit('%s: part "%s" reaches past the undercarriage window %s'
                             % (table['assetId'], part.name, window))


def is_inside_window(obj, window):
    """The table's window is in the vehicle frame; the asset's frame has the hub line at z 0."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    x0, z0, x1, z1 = window[0], window[1] - driller.HUB_Z, window[2], window[3] - driller.HUB_Z
    return x0 - 1e-6 <= min_x and max_x <= x1 + 1e-6 and z0 - 1e-6 <= min_z and max_z <= z1 + 1e-6


def is_origin_inside(obj):
    """The export refuses a part whose origin (here the slot) is outside its own bounds."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


# --- the belt --------------------------------------------------------------------------------------


def loop_points(count):
    """`count` points along the belt's loop, evenly spaced by path length: (x, z, direction angle)."""
    left, right = HUB_XS[0], HUB_XS[-1]
    straight = right - left
    turn = math.pi * BELT_R
    total = 2 * straight + 2 * turn
    points = []
    for index in range(count):
        along = total * (index + 0.5) / count
        points.append(point_along(along, left, right, straight, turn))
    return points


def point_along(along, left, right, straight, turn):
    """The loop runs right along the top, down round the front roller, left along the bottom, up round the back."""
    if along < straight:
        return (left + along, BELT_R, 0.0)
    along -= straight
    if along < turn:
        angle = math.pi / 2 - along / BELT_R
        return (right + BELT_R * math.cos(angle), BELT_R * math.sin(angle), angle - math.pi / 2)
    along -= turn
    if along < straight:
        return (right - along, -BELT_R, math.pi)
    along -= straight
    angle = -math.pi / 2 - along / BELT_R
    return (left + BELT_R * math.cos(angle), BELT_R * math.sin(angle), angle - math.pi / 2)


def belt_pieces(link_material, cleat_material):
    """The belt's links round the loop, a cleat on every other one standing out to the belt's edge."""
    pitch = (2 * (HUB_XS[-1] - HUB_XS[0]) + 2 * math.pi * BELT_R) / LINK_COUNT
    pieces = []
    for index, (x, z, direction) in enumerate(loop_points(LINK_COUNT)):
        pieces.append(box(link_material, (pitch - LINK_GAP, LINK_DEPTH, BELT_THICK), (x, BODY_Y, z), turn_y=-direction))
        if index % 2 == 0:
            pieces.append(cleat_piece(cleat_material, x, z, direction))
    return pieces


def cleat_piece(material, x, z, direction):
    """A cleat on the link's outer face: off the belt's centre line along the outward normal."""
    outward = (-math.sin(direction), math.cos(direction))
    reach = CLEAT_R - BELT_R
    centre = (x + outward[0] * reach, BODY_Y - (CLEAT[1] - LINK_DEPTH) / 2, z + outward[1] * reach)
    return box(material, CLEAT, centre, turn_y=-direction)


# --- the frames, the bosses and the drive units ----------------------------------------------------


def frame_pieces(material, trim):
    """A plate in each gap between the rollers, inside the loop; `trim` adds a bar along its top."""
    pieces = []
    for side in (-1.0, 1.0):
        x = side * FRAME_X
        pieces.append(box(material, FRAME, (x, BODY_Y + 0.002, 0.0)))
        if trim is not None:
            trim_material, size = trim
            pieces.append(box(trim_material, size, (x, BODY_Y - 0.002, FRAME[2] / 2 - size[2] / 2)))
    return pieces


def frame_rivets():
    return [driller.rivet(side * FRAME_X + dx, BODY_Y - 0.012, dz, radius=BOLT_RADIUS)
            for side in (-1.0, 1.0) for dx, dz in FRAME_RIVETS]


def boss_pieces(material, nut_material):
    """A disc on each axle over the leg's hub cap, with an axle nut."""
    pieces = []
    for x in HUB_XS:
        pieces.append(driller.disc(material, BOSS_R, BOSS_THICK, (x, BOSS_Y, 0.0)))
        pieces.append(driller.disc(nut_material, NUT_R, 0.012, (x, BOSS_Y - 0.014, 0.0)))
    return pieces


def piston_pieces():
    """The Single piston stage's drive unit: a brass steam cylinder lying along the axle's left."""
    radius, length, x = PISTON
    return [
        cylinder('brass', radius, length, (x, BOSS_Y, 0.0), 'X'),
        cylinder('iron', PISTON_FLANGE[0], PISTON_FLANGE[1], (x - length / 2 + 0.003, BOSS_Y, 0.0), 'X'),
        cylinder('iron', PISTON_FLANGE[0], PISTON_FLANGE[1], (x + length / 2 - 0.003, BOSS_Y, 0.0), 'X'),
        driller.segment('steel', (x + length / 2, 0.0), (-BOSS_R + 0.004, 0.0), 0.01, 0.01, BOSS_Y - 0.004),
    ]


def flywheel_face_pieces():
    """The Triple flywheel stage's drive unit: brass spokes over the middle boss to a steel rim."""
    count, inner, outer, thickness = SPOKES
    pieces = [kit.torus('steel', outer, 0.005, (0.0, BOSS_Y - 0.012, 0.0))]
    pieces += [radial('brass', angle, inner, outer, thickness, BOSS_Y - 0.012)
               for angle, _, _ in driller.around(count, outer, math.pi / 6)]
    pieces.append(sphere('brass', 0.011, (0.0, FRONT_Y, 0.0), flatten=0.7))
    return pieces


def turbine_face_pieces():
    """The Guild turbine stage's drive unit: a glass window over a faint blue glow, swept brass vanes."""
    count, inner, outer, sweep, thickness = VANES
    pieces = [
        driller.disc('glass', WINDOW[0], WINDOW[1], (0.0, BOSS_Y - 0.013, 0.0)),
        driller.disc('turbine-glow', GLOW[0], GLOW[1], (0.0, BOSS_Y - 0.02, 0.0)),
        sphere('brass', 0.008, (0.0, FRONT_Y, 0.0), flatten=0.7),
    ]
    pieces += [radial('brass', angle, inner, outer, thickness, BOSS_Y - 0.024, sweep)
               for angle, _, _ in driller.around(count, outer)]
    return pieces


def radial(material, angle, inner, outer, thickness, y, sweep=0.0):
    """A bar from `inner` to `outer` off the hub along `angle`, its far end swept by `sweep` radians."""
    start = (inner * math.cos(angle), inner * math.sin(angle))
    end = (outer * math.cos(angle + sweep), outer * math.sin(angle + sweep))
    return driller.segment(material, start, end, thickness, 0.008, y)


# --- the looks -------------------------------------------------------------------------------------


def bare_hub_pieces():
    """The leg's own hub cap and axle nut (author_casing_driller.leg_pieces), so the look below the
    first step is the rig as it is."""
    return [
        driller.disc('brass', HUB_CAP[0], HUB_CAP[1], (0.0, HUB_CAP[2], 0.0)),
        driller.disc('dark-iron', AXLE_NUT[0], AXLE_NUT[1], (0.0, AXLE_NUT[2], 0.0)),
    ]


def iron_track_pieces():
    pieces = belt_pieces('rubber', 'iron')
    pieces += frame_pieces('iron-plate', None)
    pieces += frame_rivets()
    pieces += boss_pieces('brass', 'dark-iron')
    pieces += piston_pieces()
    return pieces


def steel_track_pieces():
    pieces = belt_pieces('steel', 'brass')
    pieces += frame_pieces('hull-steel', ('brass', RAIL))
    pieces += boss_pieces('steel', 'brass')
    pieces += flywheel_face_pieces()
    return pieces


def guild_track_pieces():
    pieces = belt_pieces('guild-enamel', 'brass')
    pieces += frame_pieces('bronze', ('brass', TRIM))
    pieces += boss_pieces('guild-enamel', 'brass')
    pieces += turbine_face_pieces()
    return pieces


PIECES = {
    'bare-hub': bare_hub_pieces,
    'iron-track': iron_track_pieces,
    'steel-track': steel_track_pieces,
    'guild-track': guild_track_pieces,
}


if __name__ == '__main__':
    main()
