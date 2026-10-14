"""
Authors the first version of the aetheric vehicle parts' Blender sources (ticket 363, the art half
of #265, build 7 of the GD lock on #245): one asset per aetheric item, so each item shows on the
vehicle once owned (#245 rule: "it shows on the vehicle").

    blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/author_aetheric.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for every part of aethericParts.json (the table this script
and render_aetheric.py share), or only the ids given after `--`. From then on those files are the
sources (#52): change the art in Blender rather than editing this script. Nothing here is rigged
(#51 acceptance 2) and nothing is registered: the attach-point ids, placeholder sidecars, manifest
entries and the piece that draws them are the wiring's (#265, with #314, #250 and #235).

Conventions are author_platform.py's, whose piece builders and materials this reuses: 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. Each asset is
authored in its own frame with its mount at the origin, as the tech gear is (#166). A part that
moves has its origin at its hinge or slide. Aether glass is the one family that glows, so every
part reads as the same science at gameplay zoom.
"""

import json
import math
import os
import sys

import bpy
import numpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

from author_platform import (  # noqa: E402
    PALETTE,
    box,
    build_part,
    cylinder,
    finish_piece,
    reset_scene,
    save_as,
    sphere,
    stepped,
    torus,
)

PARTS_TABLE = os.path.join(HERE, 'aethericParts.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape).
PALETTE.update({
    'ceramic': ((0.86, 0.84, 0.78), 0.45, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'needle': ((0.55, 0.08, 0.06), 0.4, 0.0),
    'cord': ((0.62, 0.56, 0.42), 0.9, 0.0),
    'aether-glass': ((0.30, 0.50, 1.0), 0.1, 0.5),
    'aether-core': ((0.62, 0.80, 1.0), 0.2, 1.2),
    'arc-glow': ((0.55, 0.72, 1.0), 0.2, 1.2),
})

SMALL_RIVET_RADIUS = 0.005
# The platform's 15 mm bevel would round a 3 cm part away; this gear takes 4 mm, as the bore gun does.
SMALL_BEVEL_M = 0.004
# The builders below draw at sketch size; at gameplay zoom (90 px/m) that read as a few pixels, so
# each asset is scaled up before saving. The lantern is the smallest shape and the only one on the
# nose, so it takes the most.
READ_SCALE = {'power.phase_lantern': 1.6}
DEFAULT_READ_SCALE = 1.3


def main():
    table = read_table()
    for entry in requested_parts(table):
        author(entry)


def read_table():
    with open(PARTS_TABLE, encoding='utf8') as file:
        return json.load(file)


def requested_parts(table):
    entries = table['parts']
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    known = [entry['assetId'] for entry in entries]
    unknown = [asset_id for asset_id in arguments if asset_id not in known]
    if unknown:
        raise SystemExit('not aetheric parts: ' + ', '.join(unknown))
    return [entry for entry in entries if not arguments or entry['assetId'] in arguments]


def author(entry):
    reset_scene()
    built = BUILDERS[entry['itemId']](entry['z'])
    scale = READ_SCALE.get(entry['itemId'], DEFAULT_READ_SCALE)
    scale_parts(built, scale)
    soften_small_bevels(built, scale)
    check_parts_match_table(entry, built)
    save_as(entry['assetId'])


def scale_parts(parts, scale):
    """Scales every part about the asset's origin and applies it, so the parts keep scale 1."""
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.location = part.location * scale
        part.scale = (scale, scale, scale)
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def soften_small_bevels(parts, scale):
    for part in parts:
        part.modifiers['bevel'].width = SMALL_BEVEL_M * scale


def check_parts_match_table(entry, built):
    names = sorted(part.name for part in built)
    if names != sorted(entry['parts']):
        raise SystemExit('%s parts %s do not match the table %s' % (entry['assetId'], names, entry['parts']))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (entry['assetId'], part.name))


def is_origin_inside(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = numpy.array([tuple(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices])
    evaluated.to_mesh_clear()
    low, high = points.min(axis=0), points.max(axis=0)
    origin = obj.matrix_world.translation
    return low[0] - 1e-6 <= origin.x <= high[0] + 1e-6 and low[2] - 1e-6 <= origin.z <= high[2] + 1e-6


# --- generic pieces -------------------------------------------------------------------------------


def small_rivet(centre):
    return sphere('brass', SMALL_RIVET_RADIUS, centre, flatten=0.6)


def ring(material, major, minor, centre, direction):
    """A torus whose axis points along `direction` (the kit's torus faces the camera)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24,
                                     minor_segments=8, location=centre, rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def cone(material, base_radius, tip_radius, length, centre, direction):
    """A cone (or frustum) whose tip points along `direction`."""
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=base_radius, radius2=tip_radius, depth=length,
                                    location=centre, rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def rotation_towards(direction):
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


def hub(material='brass', radius=0.006):
    """A short bearing along Y at a moving part's hinge, so its origin sits inside its mesh."""
    return cylinder(material, radius, 0.012, (0.0, 0.0, 0.0), 'Y')


def foot_plate(width, depth=0.04):
    """A dark iron foot whose underside dips just below the origin, so the origin is inside."""
    return box('dark-iron', (width, depth, 0.012), (0.0, 0.0, 0.004))


# --- resonance whistle (P15, sound): on the boiler stack's fore side -------------------------------


def author_resonance_whistle(z_order):
    """
    A brass steam whistle teed off the stack: the origin is the flange on the stack's wall, the
    feed runs +X, then the whistle stands up with its mouth slot facing the camera.
    """
    bell_x = 0.052
    body = [
        cylinder('brass', 0.016, 0.012, (0.004, 0.0, 0.0), 'X'),
        cylinder('copper', 0.007, 0.042, (0.03, 0.0, 0.0), 'X'),
        sphere('copper', 0.009, (bell_x, 0.0, 0.0)),
        cylinder('copper', 0.007, 0.04, (bell_x, 0.0, 0.02), 'Z'),
        cylinder('brass', 0.013, 0.02, (bell_x, 0.0, 0.045), 'Z'),
        cylinder('brass', 0.016, 0.075, (bell_x, 0.0, 0.095), 'Z'),
        box('enamel', (0.022, 0.006, 0.008), (bell_x, -0.015, 0.068)),
        ring('brass', 0.017, 0.003, (bell_x, 0.0, 0.078), (0, 0, 1)),
        ring('brass', 0.017, 0.003, (bell_x, 0.0, 0.124), (0, 0, 1)),
        cone('brass', 0.017, 0.006, 0.016, (bell_x, 0.0, 0.14), (0, 0, 1)),
        sphere('brass', 0.005, (bell_x, 0.0, 0.152)),
    ]
    body += [small_rivet((0.004, -0.012, z)) for z in (-0.009, 0.009)]
    lever = [
        hub('brass', 0.005),
        box('steel', (0.034, 0.004, 0.005), (0.017, 0.0, 0.0)),
        sphere('dark-iron', 0.005, (0.034, 0.0, 0.0)),
        box('cord', (0.002, 0.002, 0.05), (0.034, -0.002, -0.027)),
        torus('brass', 0.005, 0.0015, (0.034, -0.002, -0.055)),
    ]
    return [
        build_part('whistle-body', body, (0.0, 0.0, 0.0), z_order),
        build_part('whistle-lever', lever, (bell_x, -0.014, 0.045), z_order),
    ]


# --- phase lantern (P16, aether): on the nose, its lens facing the drill --------------------------


def author_phase_lantern(z_order):
    """
    A caged aether lantern on a short post; the origin is its foot on the hull. Its forward lens
    looks along +X at the cell it phases through, and the shutter slides off the glass to open.
    """
    glass_z = 0.08
    frame = [
        foot_plate(0.06),
        cylinder('iron', 0.008, 0.03, (0.0, 0.0, 0.023), 'Z'),
        cylinder('brass', 0.03, 0.012, (0.0, 0.0, 0.044), 'Z'),
        cylinder('aether-glass', 0.024, 0.06, (0.0, 0.0, glass_z), 'Z'),
        sphere('aether-core', 0.01, (0.0, -0.004, glass_z), flatten=0.6),
        cone('brass', 0.032, 0.012, 0.022, (0.0, 0.0, 0.121), (0, 0, 1)),
        cylinder('brass', 0.008, 0.012, (0.0, 0.0, 0.138), 'Z'),
        torus('brass', 0.011, 0.0025, (0.0, 0.0, 0.155)),
        cylinder('aether-glass', 0.017, 0.008, (0.03, 0.0, glass_z), 'X'),
        ring('brass', 0.019, 0.003, (0.034, 0.0, glass_z), (1, 0, 0)),
    ]
    frame += [cylinder('brass', 0.0025, 0.062, (x, -0.02, glass_z), 'Z') for x in (-0.022, 0.0, 0.022)]
    frame += [small_rivet((x, -0.016, 0.004)) for x in (-0.022, 0.022)]
    shutter = [
        box('dark-iron', (0.046, 0.004, 0.026), (0.0, 0.0, 0.0)),
        *[box('brass', (0.046, 0.003, 0.003), (0.0, -0.003, z)) for z in (-0.008, 0.0, 0.008)],
        sphere('brass', 0.004, (0.0, -0.005, -0.016)),
    ]
    return [
        build_part('lantern-frame', frame, (0.0, 0.0, 0.0), z_order),
        build_part('lantern-shutter', shutter, (0.0, -0.03, 0.095), z_order),
    ]


# --- galvanic arc coil (P16, galvanism): twin Tesla coils on the roof -----------------------------


COIL_SPACING_M = 0.055


def author_arc_coil(z_order):
    """
    Two Tesla coils on one iron plinth, joined by a copper bus. The origin is the plinth's foot;
    each coil's origin is its own foot, so the code can flicker or tilt them apart.
    """
    plinth = [
        foot_plate(0.2),
        box('brass', (0.21, 0.042, 0.004), (0.0, 0.0, 0.012)),
        box('copper', (0.11, 0.006, 0.006), (0.0, -0.022, 0.022)),
    ]
    plinth += [small_rivet((x, -0.021, 0.004)) for x in (-0.09, -0.03, 0.03, 0.09)]
    return [
        build_part('coil-plinth', plinth, (0.0, 0.0, 0.0), z_order),
        build_part('coil-aft', tesla_coil_pieces(), (-COIL_SPACING_M, 0.0, 0.014), z_order),
        build_part('coil-fore', tesla_coil_pieces(), (COIL_SPACING_M, 0.0, 0.014), z_order),
    ]


def tesla_coil_pieces():
    pieces = [
        cylinder('ceramic', 0.017, 0.018, (0.0, 0.0, 0.008), 'Z'),
        cylinder('copper', 0.012, 0.07, (0.0, 0.0, 0.052), 'Z'),
        cylinder('brass', 0.003, 0.014, (0.0, 0.0, 0.093), 'Z'),
        ring('brass', 0.018, 0.007, (0.0, 0.0, 0.104), (0, 0, 1)),
        sphere('arc-glow', 0.006, (0.0, 0.0, 0.117)),
    ]
    pieces += [ring('copper', 0.0125, 0.0018, (0.0, 0.0, z), (0, 0, 1)) for z in stepped(0.021, 0.084, 0.007)]
    return pieces


# --- chronometric governor (P24, clockwork): the escapement cage on the aft roof ------------------


CAGE_CENTRE_Z = 0.085
# The two gimbal rings reach 5.5 cm towards the camera; the wheel and its pallet fork ride in front.
WHEEL_Y = -0.064


def author_chronometric_governor(z_order):
    """
    A gyro cage of three brass rings between two iron uprights, an escapement wheel in front. The
    origin is the cage's foot; the wheel's is its arbor, where the code ticks it round.
    """
    cage = [
        foot_plate(0.15),
        box('iron', (0.01, 0.012, 0.14), (-0.066, 0.0, 0.075)),
        box('iron', (0.01, 0.012, 0.14), (0.066, 0.0, 0.075)),
        box('iron', (0.142, 0.012, 0.01), (0.0, 0.0, 0.15)),
        sphere('brass', 0.007, (0.0, 0.0, 0.16)),
        torus('brass', 0.055, 0.004, (0.0, 0.004, CAGE_CENTRE_Z)),
        ring('brass', 0.055, 0.0035, (0.0, 0.0, CAGE_CENTRE_Z), (0, 0, 1)),
        ring('brass', 0.055, 0.0035, (0.0, 0.0, CAGE_CENTRE_Z), (1, 0, 0)),
        sphere('aether-core', 0.012, (0.0, 0.01, CAGE_CENTRE_Z)),
        cylinder('brass', 0.008, 0.016, (-0.058, 0.0, CAGE_CENTRE_Z), 'X'),
        cylinder('brass', 0.008, 0.016, (0.058, 0.0, CAGE_CENTRE_Z), 'X'),
        # The pallet fork that holds the wheel back, a tick at a time.
        box('steel', (0.004, 0.004, 0.03), (0.0, WHEEL_Y - 0.002, 0.135)),
        box('steel', (0.04, 0.004, 0.004), (0.0, WHEEL_Y - 0.002, 0.12)),
        box('steel', (0.004, 0.004, 0.01), (-0.018, WHEEL_Y - 0.002, 0.115)),
        box('steel', (0.004, 0.004, 0.01), (0.018, WHEEL_Y - 0.002, 0.115)),
    ]
    cage += [small_rivet((x, -0.016, 0.004)) for x in (-0.06, 0.06)]
    return [
        build_part('escapement-cage', cage, (0.0, 0.0, 0.0), z_order),
        build_part('escapement-wheel', escapement_wheel_pieces(), (0.0, WHEEL_Y, CAGE_CENTRE_Z), z_order),
    ]


def escapement_wheel_pieces():
    """A brass escape wheel facing the camera: rim, four spokes, arbor and 15 raked teeth."""
    pieces = [
        torus('brass', 0.026, 0.003, (0.0, 0.0, 0.0)),
        cylinder('dark-iron', 0.006, 0.008, (0.0, 0.0, 0.0), 'Y'),
    ]
    pieces += [box('brass', (0.05, 0.003, 0.004), (0.0, 0.0, 0.0), turn_y=angle) for angle in (0.0, math.pi / 2)]
    pieces += [escape_tooth(index * 2 * math.pi / 15) for index in range(15)]
    return pieces


def escape_tooth(angle):
    centre = (0.032 * math.cos(angle), 0.0, 0.032 * math.sin(angle))
    return box('brass', (0.004, 0.003, 0.01), centre, turn_y=-angle + 0.5)


# --- aether condenser (P29, boiler): the tank on the flank ----------------------------------------


GAUGE_AT = (0.06, 0.012)


def author_aether_condenser(z_order):
    """
    A copper condenser lying along the flank in two saddles, its aether sight glass in front and a
    charge gauge at the fore end. The origin is the tank's centre; the needle's is the gauge pin.
    """
    tank = [
        cylinder('copper', 0.05, 0.2, (0.0, 0.0, 0.0), 'X'),
        cylinder('brass', 0.053, 0.012, (-0.1, 0.0, 0.0), 'X'),
        cylinder('brass', 0.053, 0.012, (0.1, 0.0, 0.0), 'X'),
        cylinder('copper', 0.03, 0.01, (-0.111, 0.0, 0.0), 'X'),
        cylinder('copper', 0.03, 0.01, (0.111, 0.0, 0.0), 'X'),
        box('brass', (0.104, 0.004, 0.026), (-0.03, -0.049, 0.0)),
        box('aether-glass', (0.092, 0.006, 0.016), (-0.03, -0.052, 0.0)),
        cylinder('dial', 0.016, 0.006, (GAUGE_AT[0], -0.05, GAUGE_AT[1]), 'Y'),
        torus('brass', 0.017, 0.003, (GAUGE_AT[0], -0.053, GAUGE_AT[1])),
        cylinder('copper', 0.006, 0.03, (-0.07, 0.0, 0.062), 'Z'),
        torus('brass', 0.012, 0.0025, (-0.07, -0.004, 0.078)),
        cylinder('copper', 0.006, 0.026, (0.07, 0.0, 0.06), 'Z'),
        sphere('brass', 0.008, (0.07, 0.0, 0.074)),
    ]
    tank += [box('dark-iron', (0.016, 0.06, 0.014), (x, 0.0, -0.052)) for x in (-0.06, 0.06)]
    tank += [ring('brass', 0.051, 0.0035, (x, 0.0, 0.0), (1, 0, 0)) for x in (-0.085, 0.025, 0.085)]
    tank += [small_rivet((x, -0.05, z)) for x in (-0.085, 0.025) for z in (-0.03, 0.03)]
    needle = [
        sphere('brass', 0.003, (0.0, 0.0, 0.0)),
        box('needle', (0.013, 0.002, 0.002), (0.006, 0.0, 0.0)),
    ]
    return [
        build_part('condenser-tank', tank, (0.0, 0.0, 0.0), z_order),
        build_part('condenser-needle', needle, (GAUGE_AT[0], -0.056, GAUGE_AT[1]), z_order),
    ]


BUILDERS = {
    'power.resonance_whistle': author_resonance_whistle,
    'power.phase_lantern': author_phase_lantern,
    'power.arc_coil': author_arc_coil,
    'power.chronometric_governor': author_chronometric_governor,
    'power.aether_condenser': author_aether_condenser,
}


if __name__ == '__main__':
    main()
