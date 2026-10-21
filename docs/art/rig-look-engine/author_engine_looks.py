"""
Authors the first version of the engine track's rig-look parts (ticket 586, wave 576-1A of the rig
look ladder, #576): the base look and the three steps Systems' table puts at 2, 18 and 26
purchases (#157 comment 6300543785), named by Progression (comment 6300549964).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-engine/author_engine_looks.py

It writes art/blender/vehicle-look-engine/vehicle-look-engine.blend from engineLooks.json (the
table this script, the renders and the outline check share). From then on that file is the source
(#52): change the art in Blender rather than editing this script. Nothing is rigged (#51
acceptance 2) and nothing is registered: the registry row is #577's and the piece that swaps the
part on the slot is the wiring's (#587).

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in its own frame with the track's attach slot, `chassis.drive`, at the origin, as the tech gear is
(#166), so the game draws a part at `attachPointOf(vehicleSidecar, 'chassis.drive')` with no offset.
The slot is the middle roller's hub (vehicle.parts.json: the slot and `t1-wheel-2` both at
(0, -0.36)), where the middle leg's brass hub cap and axle nut sit in front of the roller's own
discs. No rig part stands on the slot, so a look lies over the roller's hub rather than replacing a
part: a drive unit on the axle, every piece inside the roller's own disc (radius 0.12 at tier 1,
0.13 at tier 3), so the rig's outline never grows (check_outline.py proves it against the whole rig
at tiers 1 and 3) and the roller keeps rolling under it.

| Part              | Step (purchases) | Look                                                                     |
| ----------------- | ---------------- | ------------------------------------------------------------------------ |
| `hub-cap`         | 0, the default   | the leg's own brass hub cap and axle nut, piece for piece (the rig as is) |
| `single-piston`   | 2                | a brass steam cylinder driving an iron crank disc through a steel rod      |
| `triple-flywheel` | 18               | three spoked steel flywheels stacked down the axle, largest at the back    |
| `guild-turbine`   | 26               | a steel turbine casing, guild-green enamel ring, brass vanes over a glow   |

The turbine's glow is the one emission, at under a fifth of the drill nose's (0.3 against the nose
seams' 1.6), so the nose stays the brightest part (#576 rules).
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
from author_platform import build_part, cylinder, reset_scene, save_as, sphere  # noqa: E402

LOOKS_TABLE = os.path.join(HERE, 'engineLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The turbine's glow
# takes the registry's placeholder hue for the step (rigLook.json: #6fd3ff), darkened, at the hull
# gems' 0.3, well under the nose seams' 1.6 (author_casing_driller's `nose-glow`): at 0.5, and at
# 0.3 in the pale placeholder colour, the lit window outread the lit nose at a phone's size; the
# enamel is the hull filigree's guild green.
kit.PALETTE.update({
    'guild-enamel': ((0.10, 0.22, 0.20), 0.35, 0.0),
    'turbine-glow': ((0.26, 0.56, 0.72), 0.2, 0.3),
})

# The leg's hub cap over the middle roller (author_casing_driller.leg_pieces: a brass disc and a
# dark-iron axle nut at the hub, the leg's depth): the base look reproduces them 1 mm proud, so the
# two never share a face in a render.
HUB_CAP = (0.032, 0.03, -0.181)
AXLE_NUT = (0.012, 0.035, -0.186)
# Every engine stands in front of that cap (its front face at y -0.2025): the body plate here, the
# details out to FRONT_Y. Nothing reaches past ENVELOPE_R from the hub, inside the roller's disc.
BODY_Y = -0.215
FRONT_Y = -0.262
ENVELOPE_R = 0.09
# The single piston: a crank disc on the axle (warm iron plate, not the roller's own dark iron, so
# the step reads at a phone's size), a brass cylinder lying along X at the left, its rod to a crank
# pin, a copper steam pipe rising from the cylinder.
CRANK_RADIUS = 0.062
CYLINDER = (0.022, 0.056, -0.056)
FLANGE = (0.025, 0.008)
ROD = ((-0.03, 0.0), (0.026, 0.02), 0.012)
CRANK_PIN = 0.011
PIPE = (0.007, 0.034, 0.036)
CRANK_BOLTS = 4
# The triple flywheel: three rims down the axle, the largest at the back, each with brass spokes,
# on an iron backing disc that hides the roller's sprocket.
BACKING = (0.085, 0.012, -0.198)
FLYWHEELS = ((0.08, 0.008, -0.207, 6, 0.0), (0.057, 0.007, -0.226, 5, 0.3), (0.035, 0.006, -0.245, 4, 0.6))
SPOKE = 0.01
AXLE = (0.014, 0.07, -0.228)
# The guild turbine: a steel casing, an enamel ring round a glass window, eight swept brass vanes
# over the glow, a brass hub, bolts round the casing.
CASING = (0.085, 0.02, -0.212)
ENAMEL_RING = (0.07, 0.012, -0.226)
WINDOW = (0.058, 0.01, -0.222)
GLOW = (0.054, 0.008, -0.23)
VANES = (8, 0.02, 0.05, 0.5, 0.012, -0.24)
TURBINE_HUB = (0.016, -0.246)
CASING_BOLTS = (8, 0.077, -0.236)
BOLT_RADIUS = 0.0055
# The platform's 15 mm bevel would round a 1 cm spoke away; vehicle-scale parts take 4 mm.
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
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (table['assetId'], part.name))
        if reach_of(part) > ENVELOPE_R:
            raise SystemExit('%s: part "%s" reaches %.3f m from the hub, past the roller\'s disc'
                             % (table['assetId'], part.name, reach_of(part)))


def is_origin_inside(obj):
    """The export refuses a part whose origin (here the slot) is outside its own bounds."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


def reach_of(obj):
    """How far the part's farthest vertex stands from the hub in the view plane."""
    bpy.context.view_layer.update()
    return max(math.hypot(vertex.co.x, vertex.co.z) for vertex in obj.data.vertices)


def radial(material, angle, inner, outer, thickness, y, sweep=0.0):
    """A bar from `inner` to `outer` off the hub along `angle`, its far end swept by `sweep` radians."""
    start = (inner * math.cos(angle), inner * math.sin(angle))
    end = (outer * math.cos(angle + sweep), outer * math.sin(angle + sweep))
    return driller.segment(material, start, end, thickness, 0.01, y)


def bolts(count, radius, y):
    return [driller.rivet(x, y, z, radius=BOLT_RADIUS) for _, x, z in driller.around(count, radius, math.pi / count)]


# --- the hub cap (the default look) ---------------------------------------------------------------


def hub_cap_pieces():
    """The leg's own hub cap and axle nut (author_casing_driller.leg_pieces), so the look below the
    first step is the rig as it is."""
    return [
        driller.disc('brass', HUB_CAP[0], HUB_CAP[1], (0.0, HUB_CAP[2], 0.0)),
        driller.disc('dark-iron', AXLE_NUT[0], AXLE_NUT[1], (0.0, AXLE_NUT[2], 0.0)),
    ]


# --- the single piston (the step at 2 purchases) --------------------------------------------------


def single_piston_pieces():
    radius, length, x = CYLINDER
    pieces = [
        driller.disc('iron-plate', CRANK_RADIUS, 0.02, (0.0, BODY_Y, 0.0)),
        cylinder('brass', radius, length, (x, BODY_Y, 0.0), 'X'),
        cylinder('iron', FLANGE[0], FLANGE[1], (x - length / 2 + 0.004, BODY_Y, 0.0), 'X'),
        cylinder('iron', FLANGE[0], FLANGE[1], (x + length / 2 - 0.004, BODY_Y, 0.0), 'X'),
        driller.segment('steel', ROD[0], ROD[1], ROD[2], 0.012, BODY_Y - 0.023),
        sphere('brass', CRANK_PIN, (ROD[1][0], BODY_Y - 0.029, ROD[1][1]), flatten=0.7),
        sphere('brass', 0.014, (0.0, BODY_Y - 0.017, 0.0), flatten=0.6),
    ]
    pieces += pipe_pieces()
    pieces += bolts(CRANK_BOLTS, CRANK_RADIUS - 0.01, BODY_Y - 0.013)
    return pieces


def pipe_pieces():
    """The copper steam pipe up from the cylinder, elbowed at the top."""
    radius, length, z = PIPE
    x = CYLINDER[2]
    return [
        cylinder('copper', radius, length, (x, BODY_Y, z), 'Z'),
        sphere('copper', radius + 0.002, (x, BODY_Y, z + length / 2), flatten=1.0),
    ]


# --- the triple flywheel (the step at 18 purchases) -----------------------------------------------


def triple_flywheel_pieces():
    pieces = [driller.disc('iron', BACKING[0], BACKING[1], (0.0, BACKING[2], 0.0))]
    for major, minor, y, spokes, phase in FLYWHEELS:
        pieces += flywheel_pieces(major, minor, y, spokes, phase)
    pieces += [
        cylinder('dark-iron', AXLE[0], AXLE[1], (0.0, AXLE[2], 0.0), 'Y'),
        sphere('brass', 0.012, (0.0, FRONT_Y, 0.0), flatten=0.7),
    ]
    return pieces


def flywheel_pieces(major, minor, y, spokes, phase):
    """A steel rim with brass spokes to the axle, facing the camera."""
    pieces = [kit.torus('steel', major, minor, (0.0, y, 0.0))]
    pieces += [radial('brass', angle, 0.012, major - minor / 2, SPOKE, y)
               for angle, _, _ in driller.around(spokes, major, phase)]
    return pieces


# --- the guild turbine (the step at 26 purchases) -------------------------------------------------


def guild_turbine_pieces():
    count, inner, outer, sweep, thickness, y = VANES
    pieces = [
        driller.disc('steel', CASING[0], CASING[1], (0.0, CASING[2], 0.0)),
        kit.torus('guild-enamel', ENAMEL_RING[0], ENAMEL_RING[1], (0.0, ENAMEL_RING[2], 0.0)),
        driller.disc('glass', WINDOW[0], WINDOW[1], (0.0, WINDOW[2], 0.0)),
        driller.disc('turbine-glow', GLOW[0], GLOW[1], (0.0, GLOW[2], 0.0)),
        sphere('brass', TURBINE_HUB[0], (0.0, TURBINE_HUB[1], 0.0), flatten=0.7),
    ]
    pieces += [radial('brass', angle, inner, outer, thickness, y, sweep)
               for angle, _, _ in driller.around(count, outer)]
    pieces += bolts(CASING_BOLTS[0], CASING_BOLTS[1], CASING_BOLTS[2])
    return pieces


PIECES = {
    'hub-cap': hub_cap_pieces,
    'single-piston': single_piston_pieces,
    'triple-flywheel': triple_flywheel_pieces,
    'guild-turbine': guild_turbine_pieces,
}


if __name__ == '__main__':
    main()
