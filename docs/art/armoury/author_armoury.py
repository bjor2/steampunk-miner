"""
Authors the first version of the armoury module mounts' Blender sources (ticket 364, the art half
of #321, spec #310 build 5): one asset per module of the two Armoury lanes, so every module from
builds 2 and 3 can be visibly mounted once bought, and each carries the gilded plate a Mastered
module shows.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/armoury/author_armoury.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for every module of armouryMounts.json (the table this script
and render_armoury.py share), or only the ids given after `--`. From then on those files are the
sources (#52): change the art in Blender rather than editing this script. Nothing here is rigged
(#51 acceptance 2) and nothing is registered: the attach-point ids, placeholder sidecars, manifest
entries and the piece that draws them are the wiring's (#321, with #314, #250 and #235).

Conventions are author_platform.py's, whose piece builders and materials this reuses: 1 unit =
1 m, game right is +X, up is +Z, details stand out towards -Y. Each asset is authored in its own
frame with its mount at the origin, as the tech gear is (#166): a bore module's gun fires along +X,
a turret module's along -X (the auto guns rest pointing at the rear). A part that moves has its
origin at its hinge. Every module's `gilded-plate` is a small gilt name plate the wiring shows only
once the module is Mastered (#310: "Mastered modules show the gilded plate"); it is the one part
that glows, faintly, so it reads at gameplay zoom.
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

MOUNT_TABLE = os.path.join(HERE, 'armouryMounts.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape).
PALETTE.update({
    'gunmetal': ((0.30, 0.31, 0.33), 0.4, 0.0),
    'gilt': ((0.98, 0.78, 0.34), 0.2, 0.25),
    'cement': ((0.62, 0.60, 0.55), 0.85, 0.0),
    'lens': ((0.25, 0.85, 0.82), 0.1, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'needle': ((0.55, 0.08, 0.06), 0.4, 0.0),
    'shell-red': ((0.55, 0.12, 0.07), 0.5, 0.0),
})

SMALL_RIVET_RADIUS = 0.006
# Draw order over the gun: the auto guns' head is 12, so a turret module sits just above it; the
# bore gun's own z is #362's, and its modules keep the same step over it.
Z_MODULE, Z_PLATE = 13, 14


def main():
    table = read_table()
    for module in requested_modules(table):
        author(module)


def read_table():
    with open(MOUNT_TABLE, encoding='utf8') as file:
        return json.load(file)


def requested_modules(table):
    modules = table['modules']
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    known = [module['assetId'] for module in modules]
    unknown = [asset_id for asset_id in arguments if asset_id not in known]
    if unknown:
        raise SystemExit('not armoury modules: ' + ', '.join(unknown))
    return [module for module in modules if not arguments or module['assetId'] in arguments]


def author(module):
    reset_scene()
    built = BUILDERS[module['itemId']]()
    check_parts_match_table(module, built)
    save_as(module['assetId'])


def check_parts_match_table(module, built):
    names = sorted(part.name for part in built)
    if names != sorted(module['parts']):
        raise SystemExit('%s parts %s do not match the table %s' % (module['assetId'], names, module['parts']))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (module['assetId'], part.name))


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


def tube(material, radius, length, centre, direction):
    """A cylinder whose axis points along `direction`."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=length, location=centre,
                                        rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def cone(material, base_radius, tip_radius, length, centre, direction):
    """A cone (or frustum) whose tip points along `direction`."""
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=base_radius, radius2=tip_radius, depth=length,
                                    location=centre, rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def ring(material, major, minor, centre, direction):
    """A torus whose axis points along `direction` (the kit's torus faces the camera)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24,
                                     minor_segments=8, location=centre, rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def rotation_towards(direction):
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


def hub(material='brass', radius=0.012, centre=(0.0, 0.0, 0.0)):
    """A short bearing along Y at a moving part's hinge, so its origin sits inside its mesh."""
    return cylinder(material, radius, 0.03, centre, 'Y')


def module_part(part_id, pieces, at=(0.0, 0.0, 0.0)):
    return build_part(part_id, pieces, at, Z_MODULE)


def gilded_plate(at):
    """The Mastered plate: a gilt name plate in a brass rim, four rivets, its origin at its centre."""
    pieces = [
        box('gilt', (0.05, 0.006, 0.022), (0, 0, 0)),
        box('brass', (0.056, 0.004, 0.004), (0, 0.001, 0.013)),
        box('brass', (0.056, 0.004, 0.004), (0, 0.001, -0.013)),
    ]
    pieces += [small_rivet((x, -0.004, 0)) for x in (-0.02, 0.02)]
    return build_part('gilded-plate', pieces, at, Z_PLATE)


# --- bore gun modules (the gun fires along +X) ----------------------------------------------------


def author_gimbal_sight():
    """bore.sight: a scope in two brass gimbal rings on a post; the code turns the scope to aim."""
    gimbal = [
        box('iron', (0.05, 0.03, 0.012), (0, 0, 0.006)),
        cylinder('iron', 0.008, 0.05, (0, 0, 0.035), 'Z'),
        torus('brass', 0.034, 0.005, (0, -0.005, 0.075)),
        ring('brass', 0.03, 0.004, (0, -0.005, 0.075), (0, 0, 1)),
    ]
    gimbal += [small_rivet((x, -0.016, 0.006)) for x in (-0.017, 0.017)]
    scope = [
        hub('brass', 0.01),
        tube('steel', 0.012, 0.11, (0.01, 0, 0), (1, 0, 0)),
        cone('brass', 0.012, 0.018, 0.022, (0.072, 0, 0), (1, 0, 0)),
        cylinder('lens', 0.015, 0.004, (0.084, 0, 0), 'X'),
        tube('brass', 0.009, 0.018, (-0.052, 0, 0), (1, 0, 0)),
    ]
    return [
        module_part('sight-gimbal', gimbal),
        module_part('sight-scope', scope, at=(0.0, -0.005, 0.075)),
        gilded_plate((0.0, -0.02, 0.022)),
    ]


def author_steam_sear():
    """bore.breech: a sear block on the breech's face with a steam cylinder; the lever trips it."""
    block = [
        box('iron-plate', (0.07, 0.012, 0.08), (0, -0.032, 0)),
        tube('brass', 0.014, 0.06, (0.0, -0.04, 0.058), (1, 0, 0)),
        cylinder('brass', 0.017, 0.006, (-0.03, -0.04, 0.058), 'X'),
        cylinder('brass', 0.017, 0.006, (0.03, -0.04, 0.058), 'X'),
        tube('copper', 0.004, 0.04, (0.034, -0.04, 0.03), (0, 0, 1)),
        cylinder('dial', 0.011, 0.004, (-0.018, -0.04, 0.012), 'Y'),
        box('needle', (0.009, 0.002, 0.002), (-0.015, -0.043, 0.015), turn_y=-0.6),
    ]
    block += [small_rivet((x, -0.039, z)) for x in (-0.03, 0.03) for z in (-0.033, 0.033)]
    lever = [
        hub('brass', 0.008),
        box('steel', (0.008, 0.008, 0.06), (0, -0.004, -0.028)),
        sphere('dark-iron', 0.009, (0, -0.004, -0.06)),
    ]
    return [
        module_part('sear-block', block),
        module_part('sear-lever', lever, at=(0.018, -0.045, 0.0)),
        gilded_plate((-0.002, -0.044, -0.024)),
    ]


def author_long_barrel():
    """
    bore.barrel: a forged iron sleeve over the barrel's fore half, ribbed every forged length (the
    Marks). Its origin is its rear rim, 14 cm up the barrel, clear of the rifled jacket's 12 cm.
    """
    sleeve = [tube('iron', 0.04, 0.34, (0.17, 0, 0), (1, 0, 0))]
    sleeve += [ring('brass', 0.042, 0.005, (x, 0, 0), (1, 0, 0)) for x in stepped(0.005, 0.335, 0.0471)]
    sleeve += [box('dark-iron', (0.32, 0.006, 0.01), (0.17, -0.04, 0))]
    sleeve += [small_rivet((x, -0.044, 0)) for x in stepped(0.03, 0.31, 0.07)]
    return [
        module_part('barrel-sleeve', sleeve, at=(0.14, 0.0, 0.0)),
        gilded_plate((0.31, -0.046, -0.03)),
    ]


def author_rifled_bore():
    """bore.barrel: a steel jacket by the breech, its rifling shown as a raised brass helix."""
    jacket = [tube('steel', 0.042, 0.12, (0.06, 0, 0), (1, 0, 0))]
    jacket += helix('brass', radius=0.042, start_x=0.004, end_x=0.116, turns=2.0)
    jacket += [ring('dark-iron', 0.045, 0.005, (x, 0, 0), (1, 0, 0)) for x in (0.0, 0.12)]
    # The jacket's origin is its rear rim; a pad at the rim keeps it inside the mesh.
    jacket += [box('dark-iron', (0.008, 0.02, 0.02), (0.002, 0, 0))]
    return [
        module_part('rifled-jacket', jacket),
        gilded_plate((0.06, -0.048, -0.035)),
    ]


def helix(material, radius, start_x, end_x, turns):
    """Small brass studs on a helix round the X axis, enough of them to read as one raised groove."""
    count = 28
    pieces = []
    for index in range(count):
        share = index / (count - 1)
        angle = share * turns * 2 * math.pi
        centre = (start_x + (end_x - start_x) * share, -radius * math.cos(angle), radius * math.sin(angle))
        pieces.append(sphere(material, 0.006, centre))
    return pieces


def author_splay_choke():
    """bore.muzzle: a slotted brass choke whose two lips splay the charge into twin lines."""
    choke = [
        tube('brass', 0.044, 0.05, (0.025, 0, 0), (1, 0, 0)),
        box('enamel', (0.034, 0.012, 0.012), (0.03, -0.042, 0)),
        cone('brass', 0.03, 0.022, 0.05, (0.07, 0, 0.026), (1, 0, 0.45)),
        cone('brass', 0.03, 0.022, 0.05, (0.07, 0, -0.026), (1, 0, -0.45)),
        ring('dark-iron', 0.046, 0.005, (0.002, 0, 0), (1, 0, 0)),
    ]
    choke += [small_rivet((0.025, -0.045, z)) for z in (-0.024, 0.024)]
    return [
        module_part('splay-choke', choke),
        gilded_plate((0.03, -0.05, -0.058)),
    ]


def author_earthing_spike():
    """bore.muzzle: a copper spike slung under the barrel, wound with a coil, its point past the muzzle."""
    spike = [
        tube('copper', 0.009, 0.24, (-0.03, 0, -0.058), (1, 0, 0)),
        cone('copper', 0.009, 0.0, 0.06, (0.12, 0, -0.058), (1, 0, 0)),
        box('iron', (0.012, 0.02, 0.06), (-0.12, 0, -0.03)),
        box('iron', (0.012, 0.02, 0.06), (-0.01, 0, -0.03)),
        box('dark-iron', (0.014, 0.02, 0.02), (0.0, 0, 0.0)),
    ]
    spike += [ring('brass', 0.012, 0.0025, (x, 0, -0.058), (1, 0, 0)) for x in stepped(-0.1, -0.03, 0.0117)]
    return [
        module_part('earthing-spike', spike),
        gilded_plate((-0.07, -0.016, -0.082)),
    ]


def author_cementing_round():
    """bore.magazine: a drum under the breech, cement-grey rounds showing through its window."""
    magazine = [
        cylinder('iron-plate', 0.05, 0.05, (0, 0, -0.06), 'Y'),
        torus('brass', 0.05, 0.006, (0, -0.026, -0.06)),
        box('dark-iron', (0.03, 0.03, 0.03), (0, 0, -0.005)),
        box('enamel', (0.05, 0.008, 0.026), (0, -0.027, -0.06)),
    ]
    magazine += [cylinder('cement', 0.008, 0.012, (x, -0.03, -0.06), 'Y') for x in stepped(-0.016, 0.016, 0.016)]
    magazine += [tube('brass', 0.012, 0.03, (-0.06, -0.01, -0.03), (-1, 0, 1))]
    return [
        module_part('cement-magazine', magazine),
        gilded_plate((0.0, -0.032, -0.1)),
    ]


def author_strut_bore():
    """bore.magazine: three iron struts clipped under the barrel ahead of the magazine."""
    rack = [box('dark-iron', (0.012, 0.02, 0.03), (x, 0, -0.008)) for x in (0.0, 0.2)]
    rack += [box('iron', (0.24, 0.012, 0.01), (0.1 + shift, -0.008 * row, -0.03 - 0.012 * row))
             for row, shift in enumerate((0.0, 0.01, -0.01))]
    rack += [cylinder('steel', 0.008, 0.012, (x, -0.02, -0.042), 'Y') for x in (-0.015, 0.215)]
    rack += [box('brass', (0.008, 0.03, 0.048), (x, -0.004, -0.032)) for x in (0.06, 0.14)]
    return [
        module_part('strut-rack', rack),
        gilded_plate((0.1, -0.03, -0.062)),
    ]


# --- turret modules (the auto guns rest pointing at -X) -------------------------------------------


def author_fire_director():
    """turret.sight: a brass rangefinder box on the cupola, a lens either end, a ranking dial."""
    director = [
        box('brass', (0.12, 0.05, 0.035), (0, 0, 0.0175)),
        box('dark-iron', (0.03, 0.03, 0.012), (0, 0, 0.0)),
        cylinder('lens', 0.012, 0.01, (-0.065, -0.005, 0.02), 'X'),
        cylinder('lens', 0.012, 0.01, (0.065, -0.005, 0.02), 'X'),
        cylinder('dial', 0.012, 0.004, (0, -0.027, 0.02), 'Y'),
        box('needle', (0.01, 0.002, 0.002), (0.003, -0.03, 0.024), turn_y=-0.8),
    ]
    director += [small_rivet((x, -0.027, z)) for x in (-0.05, 0.05) for z in (0.008, 0.028)]
    return [
        module_part('director-box', director),
        gilded_plate((0.0, -0.032, 0.05)),
    ]


def author_sentry_cam():
    """turret.cam: an iron cam on the trunnion's side; its follower rides it to swing the guns."""
    wheel = [
        cylinder('iron-plate', 0.04, 0.012, (0, 0, 0), 'Y'),
        sphere('iron-plate', 0.026, (0.03, 0, 0.0), flatten=0.25),
        cylinder('brass', 0.011, 0.02, (0, -0.006, 0), 'Y'),
    ]
    wheel += [small_rivet((0.022 * math.cos(a), -0.008, 0.022 * math.sin(a))) for a in (0.0, 2.1, 4.2)]
    follower = [
        hub('brass', 0.008),
        box('steel', (0.008, 0.008, 0.07), (0, 0, -0.03)),
        cylinder('dark-iron', 0.009, 0.012, (0, -0.002, -0.068), 'Y'),
    ]
    return [
        module_part('cam-wheel', wheel),
        module_part('cam-follower', follower, at=(0.06, -0.012, 0.08)),
        gilded_plate((0.0, -0.016, -0.06)),
    ]


def author_extended_barrels():
    """turret.barrel: two steel extensions onto the twin muzzles, braced by a brass collar."""
    extension = []
    for z in (-0.038, 0.038):
        extension += [
            tube('steel', 0.019, 0.15, (-0.075, 0, z), (1, 0, 0)),
            cone('steel', 0.021, 0.028, 0.03, (-0.16, 0, z), (-1, 0, 0)),
            ring('brass', 0.022, 0.004, (-0.01, 0, z), (1, 0, 0)),
        ]
    extension += [box('brass', (0.02, 0.05, 0.11), (-0.09, 0, 0))]
    extension += [box('dark-iron', (0.012, 0.02, 0.04), (0.0, 0, 0))]
    extension += [small_rivet((-0.09, -0.026, z)) for z in (-0.04, 0.04)]
    return [
        module_part('barrel-extension', extension),
        gilded_plate((-0.09, -0.034, 0.0)),
    ]


def author_grapeshot_breech():
    """turret.breech: a hinged breech cover with a hopper of loose iron shot."""
    breech = [
        box('iron-plate', (0.06, 0.012, 0.07), (0, -0.07, 0)),
        tube('brass', 0.006, 0.07, (0.03, -0.077, 0), (0, 0, 1)),
        box('brass', (0.05, 0.016, 0.03), (0, -0.078, 0.05)),
        box('enamel', (0.04, 0.006, 0.02), (0, -0.087, 0.05)),
    ]
    breech += [sphere('dark-iron', 0.007, (x, -0.09, 0.05 + dz)) for x, dz in
               ((-0.012, 0.0), (0.0, 0.003), (0.012, 0.0), (-0.006, -0.006), (0.006, -0.006))]
    breech += [box('dark-iron', (0.01, 0.07, 0.01), (0, -0.035, 0))]
    breech += [small_rivet((x, -0.077, z)) for x in (-0.022, 0.022) for z in (-0.026, 0.026)]
    return [
        module_part('grapeshot-breech', breech),
        gilded_plate((0.0, -0.082, -0.05)),
    ]


def author_concussion_shells():
    """turret.magazine: a belt box under the guns, blunt brass shells feeding up out of it."""
    box_pieces = [
        box('iron', (0.09, 0.06, 0.06), (0, 0, -0.03)),
        box('brass', (0.094, 0.064, 0.008), (0, 0, 0.0)),
        box('shell-red', (0.07, 0.004, 0.02), (0, -0.032, -0.035)),
    ]
    box_pieces += [cylinder('brass', 0.008, 0.024, (x, -0.02, 0.016), 'Z') for x in stepped(-0.03, 0.03, 0.015)]
    box_pieces += [sphere('brass', 0.008, (x, -0.02, 0.028), flatten=1.0) for x in stepped(-0.03, 0.03, 0.015)]
    box_pieces += [small_rivet((x, -0.033, z)) for x in (-0.038, 0.038) for z in (-0.012, -0.052)]
    return [
        module_part('concussion-box', box_pieces),
        gilded_plate((0.0, -0.036, -0.075)),
    ]


def author_flushing_shell():
    """turret.cradle: one fat iron shell lying in a brass cradle on the cupola's back."""
    cradle = [
        box('dark-iron', (0.014, 0.03, 0.03), (-0.04, 0, -0.005)),
        box('dark-iron', (0.014, 0.03, 0.03), (0.04, 0, -0.005)),
        box('brass', (0.1, 0.03, 0.008), (0, 0, -0.016)),
        tube('iron', 0.022, 0.09, (0, -0.005, 0.012), (1, 0, 0)),
        cone('iron', 0.022, 0.008, 0.03, (-0.06, -0.005, 0.012), (-1, 0, 0)),
        ring('copper', 0.023, 0.004, (0.03, -0.005, 0.012), (1, 0, 0)),
        ring('copper', 0.023, 0.004, (0.038, -0.005, 0.012), (1, 0, 0)),
    ]
    return [
        module_part('flushing-cradle', cradle),
        gilded_plate((0.0, -0.03, -0.034)),
    ]


def author_overpressure_burst():
    """turret.boiler: a small upright pressure tank, gauge and vent whistle, its vent band glowing."""
    tank = [
        cylinder('copper', 0.03, 0.11, (0, 0, 0.0), 'Z'),
        sphere('copper', 0.03, (0, 0, 0.055), flatten=1.0),
        cylinder('brass', 0.033, 0.008, (0, 0, -0.05), 'Z'),
        cylinder('brass', 0.033, 0.008, (0, 0, 0.03), 'Z'),
        cylinder('dial', 0.014, 0.005, (0, -0.03, 0.0), 'Y'),
        box('needle', (0.011, 0.002, 0.002), (0.004, -0.034, 0.004), turn_y=-0.9),
        tube('brass', 0.006, 0.04, (0, 0, 0.1), (0, 0, 1)),
        cone('brass', 0.007, 0.012, 0.02, (0, 0, 0.128), (0, 0, 1)),
        tube('copper', 0.005, 0.07, (-0.04, -0.01, -0.03), (-1, 0, -0.3)),
    ]
    tank += [small_rivet((x, -0.03, z)) for x in (-0.018, 0.018) for z in (-0.04, 0.02)]
    return [
        module_part('overpressure-tank', tank),
        gilded_plate((0.0, -0.034, -0.032)),
    ]


def author_ricochet_shot():
    """turret.hopper: a gunmetal hopper on the barrels, hardened steel balls, a deflector lip."""
    hopper = [
        box('gunmetal', (0.07, 0.04, 0.03), (0, 0, 0.0)),
        box('gunmetal', (0.05, 0.04, 0.02), (0, 0, -0.022)),
        box('steel', (0.04, 0.006, 0.03), (-0.045, -0.004, 0.012), turn_y=0.6),
        box('enamel', (0.05, 0.006, 0.016), (0, -0.022, 0.004)),
    ]
    hopper += [sphere('steel', 0.006, (x, -0.026, 0.004)) for x in stepped(-0.018, 0.018, 0.012)]
    hopper += [small_rivet((x, -0.022, -0.012)) for x in (-0.028, 0.028)]
    return [
        module_part('ricochet-hopper', hopper),
        gilded_plate((0.0, -0.026, 0.034)),
    ]


BUILDERS = {
    'weapon.gimbal_sight': author_gimbal_sight,
    'weapon.steam_sear': author_steam_sear,
    'weapon.long_barrel': author_long_barrel,
    'weapon.rifled_bore': author_rifled_bore,
    'weapon.splay_choke': author_splay_choke,
    'weapon.earthing_spike': author_earthing_spike,
    'weapon.cementing_round': author_cementing_round,
    'weapon.strut_bore': author_strut_bore,
    'weapon.fire_director': author_fire_director,
    'weapon.sentry_cam': author_sentry_cam,
    'weapon.extended_barrels': author_extended_barrels,
    'weapon.grapeshot_breech': author_grapeshot_breech,
    'weapon.concussion_shells': author_concussion_shells,
    'weapon.flushing_shell': author_flushing_shell,
    'weapon.overpressure_burst': author_overpressure_burst,
    'weapon.ricochet_shot': author_ricochet_shot,
}


if __name__ == '__main__':
    main()
