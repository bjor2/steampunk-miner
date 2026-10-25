"""
Authors the first version of the planet-kit art's Blender sources (ticket 825, PK6 of spec #647):
the four kit tools' socket parts on the rig (G&V's sockets on ticket 823), the five merchant
frontages on the Assay & Exchange (the GD lock of 24 Oct: one merchant system, variants as data)
and the Cache Crate as a world prop.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/planet-kit/author_planet_kit.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for every asset the slice registers, or only the ids given
after `--`. From then on those files are the sources (#52): change the art in Blender and
re-export (`npm run art:export -- <id>`), rather than editing this script. Nothing here is rigged
(#51 acceptance 2): a part that moves has its origin at its hinge and the game turns it.

Everything comes from the data the game reads: the socket assets, parts and draw orders from
src/features/planet-kit/kitSockets.json, the frontages and their devices from merchantArt.json,
and each frontage's colours from the planet's look row (ores.economy.json; planet 1 its archetype
palette in artDirection.json), the same rows the star map card and the ground read.

Conventions are author_platform.py's, whose piece builders and materials this reuses: 1 unit = 1 m,
game right is +X (the drill end), up is +Z, details stand out towards -Y. A socket asset is
authored in its own frame with its attach point at the origin, as the tech gear is (#166); the
G&V guard holds every part inside the rig's bounds at every pose and behind the drawn drill tip
(#789), so each part hangs below or behind its point. A frontage is drawn in the station's frame
(author_service_station.py's: the Sell zone's rest point at the origin) and re-based onto its
own origin, the awning's left bracket foot, which the slice bolts onto the station at the table's
`atM`, as the dock add-ons are placed (#197).
"""

import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

from author_platform import (  # noqa: E402
    PALETTE,
    box,
    build_part,
    cylinder,
    finish_piece,
    frustum,
    reset_scene,
    save_as,
    sphere,
    torus,
)

SOCKETS_TABLE = os.path.join(REPO_ROOT, 'src', 'features', 'planet-kit', 'kitSockets.json')
MERCHANTS_TABLE = os.path.join(REPO_ROOT, 'src', 'features', 'planet-kit', 'merchantArt.json')
PLANET_ROWS = os.path.join(REPO_ROOT, 'src', 'features', 'ores', 'ores.economy.json')
ART_DIRECTION = os.path.join(REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')
CRATE_ASSET_ID = 'prop-cache-crate'
CRATE_TAG_PART_ID = 'crate-tag'

# Base colour, roughness, emission strength (author_platform's PALETTE shape).
PALETTE.update({
    'gunmetal': ((0.30, 0.31, 0.33), 0.4, 0.0),
    'bronze': ((0.55, 0.36, 0.18), 0.4, 0.0),
    'plank': ((0.42, 0.29, 0.15), 0.8, 0.0),
    'rope': ((0.62, 0.52, 0.34), 0.9, 0.0),
    'canvas-light': ((0.86, 0.80, 0.68), 0.8, 0.0),
    # The Damp Flask's bottled firedamp: a faint green glow (G&V: a bottled flask glows faintly).
    'flask-glass': ((0.45, 0.85, 0.52), 0.1, 0.35),
    # A lifted spinecrystal shard, the P4 hazard's ice-teal (the planet row's look).
    'shard-glass': ((0.62, 0.88, 1.0), 0.15, 0.3),
    # The merchants' devices: the lit parts of each trade.
    'amber-gem': ((1.0, 0.68, 0.22), 0.2, 0.9),
    'gas-flame': ((0.45, 1.0, 0.45), 0.2, 1.2),
    'rose-gem': ((1.0, 0.62, 0.78), 0.15, 0.7),
    'steam': ((0.95, 0.95, 0.92), 0.6, 0.5),
    'slate': ((0.33, 0.37, 0.42), 0.8, 0.0),
    'lamp-glow': ((1.0, 0.78, 0.42), 0.2, 1.0),
})
# The platform's 15 mm bevel would round a 3 cm part away; the rig's gear takes 4 mm, a prop 8 mm.
GEAR_BEVEL_M = 0.004
PROP_BEVEL_M = 0.008
SMALL_RIVET_RADIUS = 0.005


def main():
    assets = all_authors()
    for asset_id in requested_ids(assets):
        assets[asset_id]()


def requested_ids(assets):
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    unknown = [asset_id for asset_id in arguments if asset_id not in assets]
    if unknown:
        raise SystemExit('not planet-kit assets: ' + ', '.join(unknown))
    return arguments or list(assets)


def all_authors():
    authors = {}
    for socket in read_json(SOCKETS_TABLE)['sockets']:
        authors[socket['assetId']] = lambda socket=socket: author_socket(socket)
    merchants = read_json(MERCHANTS_TABLE)
    for frontage in merchants['frontages']:
        authors[frontage['assetId']] = lambda frontage=frontage: author_frontage(merchants, frontage)
    authors[CRATE_ASSET_ID] = author_crate
    return authors


def read_json(path):
    with open(path, encoding='utf8') as file:
        return json.load(file)


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


def tilted_box(material, size, centre, turn_x=0.0, turn_y=0.0, turn_z=0.0):
    """A box turned about any axis (the kit's box turns about Y alone)."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre, rotation=(turn_x, turn_y, turn_z))
    return finish_piece(material, scale=size, smooth=False)


def rotation_towards(direction):
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


def hub(material='brass', radius=0.008, length=0.02):
    """A short bearing along Y at a moving part's hinge, so its origin sits inside its mesh."""
    return cylinder(material, radius, length, (0.0, 0.0, 0.0), 'Y')


def soften_bevels(parts, width):
    for part in parts:
        part.modifiers['bevel'].width = width


def check_parts(asset_id, built, wanted):
    names = sorted(part.name for part in built)
    if names != sorted(wanted):
        raise SystemExit('%s parts %s do not match the table %s' % (asset_id, names, sorted(wanted)))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (asset_id, part.name))


def is_origin_inside(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    low_x, high_x = min(p.x for p in points), max(p.x for p in points)
    low_z, high_z = min(p.z for p in points), max(p.z for p in points)
    origin = obj.matrix_world.translation
    return low_x - 1e-6 <= origin.x <= high_x + 1e-6 and low_z - 1e-6 <= origin.z <= high_z + 1e-6


def z_of(socket, part_id):
    return next(part['z'] for part in socket['parts'] if part['id'] == part_id)


# --- the kit sockets ------------------------------------------------------------------------------


def author_socket(socket):
    reset_scene()
    built = SOCKET_BUILDERS[socket['itemId']](socket)
    soften_bevels(built, GEAR_BEVEL_M)
    check_parts(socket['assetId'], built, [part['id'] for part in socket['parts']])
    save_as(socket['assetId'])


def author_scree_plough(socket):
    """
    A scree cowl over the drill collar (drill.hood is the crest of the drill head): the origin is
    the cowl's crest, and the cowl hangs down over the head's upper half, behind the tip plane. The
    blades hang from a hinge at the cowl's forward edge, swept back; the game swings them out.
    """
    cowl = [
        # The crest: a ridge the point sits in, then the arched hood plates stepping down and out.
        box('dark-iron', (0.08, 0.05, 0.014), (0.0, 0.0, -0.002)),
        box('iron-plate', (0.2, 0.08, 0.03), (0.0, 0.0, -0.022)),
        box('iron-plate', (0.22, 0.07, 0.026), (0.0, 0.004, -0.05)),
        box('iron-plate', (0.21, 0.06, 0.024), (0.01, 0.008, -0.076)),
        # The cheeks either side of the collar, bolted down to the head's shoulders.
        box('dark-iron', (0.03, 0.055, 0.07), (-0.095, 0.0, -0.085)),
        box('dark-iron', (0.03, 0.055, 0.05), (0.095, 0.0, -0.075)),
        # A brass lip along the cowl's forward edge, where the scree parts.
        box('brass', (0.03, 0.065, 0.1), (0.108, 0.0, -0.052)),
        # A copper feed up the back for the plough's steam.
        cylinder('copper', 0.008, 0.08, (-0.07, -0.02, -0.04), 'Z'),
    ]
    cowl += [small_rivet((x, -0.041, -0.022)) for x in (-0.08, -0.04, 0.0, 0.04, 0.08)]
    cowl += [small_rivet((x, -0.037, -0.076)) for x in (-0.07, 0.0, 0.07)]
    blade = [
        hub('brass', 0.011, 0.07),
        # Two steel blades swept back from the hinge, one behind the other.
        box('steel', (0.11, 0.012, 0.028), (-0.05, -0.012, -0.03), turn_y=0.45),
        box('gunmetal', (0.1, 0.012, 0.024), (-0.045, 0.014, -0.038), turn_y=0.5),
        box('brass', (0.03, 0.02, 0.012), (-0.098, 0.0, -0.058), turn_y=0.45),
    ]
    return [
        build_part('plough-cowl', cowl, (0.0, 0.0, 0.0), z_of(socket, 'plough-cowl')),
        build_part('plough-blade', blade, (0.105, 0.0, -0.1), z_of(socket, 'plough-blade')),
    ]


def author_damp_flask(socket):
    """
    A flask rack by the cab: cab.gauge is the gauge cluster's point, which the tech gear's cluster
    fills, so the rack stands above it on a short stem (the origin is the stem's foot) and the
    flasks stand in brass hoops on its shelf, one per held flask.
    """
    rack = [
        box('dark-iron', (0.024, 0.024, 0.04), (0.0, 0.0, 0.02)),
        box('brass', (0.13, 0.05, 0.012), (0.0, -0.004, 0.046)),
        box('dark-iron', (0.13, 0.012, 0.062), (0.0, 0.02, 0.078)),
        box('brass', (0.134, 0.016, 0.008), (0.0, 0.02, 0.106)),
    ]
    rack += [ring('brass', 0.016, 0.003, (x, -0.008, 0.078), (0, 0, 1)) for x in FLASK_XS]
    rack += [small_rivet((x, -0.0065, 0.052)) for x in (-0.055, 0.055)]
    parts = [build_part('flask-rack', rack, (0.0, 0.0, 0.0), z_of(socket, 'flask-rack'))]
    for index, x in enumerate(FLASK_XS):
        parts.append(build_part('flask-%d' % (index + 1), flask_pieces(), (x, -0.008, 0.052),
                                z_of(socket, 'flask-%d' % (index + 1))))
    return parts


FLASK_XS = (-0.042, 0.0, 0.042)


def flask_pieces():
    """A glass flask on its base: the bottled gas glows faintly, the stopper is brass."""
    return [
        cylinder('flask-glass', 0.013, 0.036, (0.0, 0.0, 0.018), 'Z'),
        sphere('flask-glass', 0.0135, (0.0, 0.0, 0.034)),
        cylinder('flask-glass', 0.006, 0.014, (0.0, 0.0, 0.05), 'Z'),
        cylinder('copper', 0.0075, 0.005, (0.0, 0.0, 0.048), 'Z'),
        sphere('brass', 0.0075, (0.0, 0.0, 0.059)),
    ]


def author_shard_tongs(socket):
    """
    A gripper arm mirroring the mobility arm on hull.arm.right: the shoulder is the origin, the
    arm reaches left and down over the chassis's end, the fixed upper jaw at its tip, the lower
    jaw hung from a hinge there (authored open; the game closes it), and the lifted shard rides in
    the jaws while the tongs act.
    """
    arm = [
        box('dark-iron', (0.07, 0.05, 0.08), (0.0, 0.0, -0.01)),
        cylinder('brass', 0.03, 0.06, (0.0, 0.0, 0.0), 'Y'),
        cylinder('dark-iron', 0.016, 0.07, (0.0, 0.0, 0.0), 'Y'),
        box('steel', (0.22, 0.03, 0.034), (-0.12, 0.0, -0.045), turn_y=-0.25),
        box('copper', (0.16, 0.014, 0.014), (-0.1, -0.024, -0.02), turn_y=-0.25),
        box('dark-iron', (0.04, 0.034, 0.05), (-0.225, 0.0, -0.075)),
        # The fixed upper jaw with its tooth.
        box('steel', (0.085, 0.022, 0.018), (-0.27, 0.0, -0.065), turn_y=0.15),
        cone('steel', 0.009, 0.0, 0.025, (-0.308, 0.0, -0.08), (0, 0, -1)),
    ]
    arm += [small_rivet((x, -0.026, z)) for x, z in ((-0.025, 0.02), (0.025, 0.02), (-0.025, -0.04), (0.025, -0.04))]
    jaw = [
        hub('brass', 0.013, 0.04),
        box('steel', (0.095, 0.02, 0.016), (-0.045, 0.0, -0.028), turn_y=-0.55),
        cone('steel', 0.008, 0.0, 0.024, (-0.088, 0.0, -0.06), (0, 0, 1)),
        box('dark-iron', (0.03, 0.024, 0.012), (-0.004, 0.0, -0.018)),
    ]
    shard = [
        tilted_box('shard-glass', (0.028, 0.026, 0.095), (0.0, 0.0, 0.0), turn_y=0.25),
        tilted_box('shard-glass', (0.018, 0.018, 0.06), (0.018, 0.006, 0.012), turn_y=-0.7),
        tilted_box('shard-glass', (0.014, 0.014, 0.045), (-0.016, -0.004, -0.015), turn_y=0.9),
    ]
    return [
        build_part('tongs-arm', arm, (0.0, 0.0, 0.0), z_of(socket, 'tongs-arm')),
        build_part('tongs-jaw', jaw, (-0.225, 0.0, -0.1), z_of(socket, 'tongs-jaw')),
        build_part('tongs-shard', shard, (-0.3, 0.0, -0.145), z_of(socket, 'tongs-shard')),
    ]


def author_vent_vane(socket):
    """
    A folded brass vane on the roof: hull.roof.mid is the rig's roofline at tier 1, so the hinge
    barrel's top is the origin and every leaf hangs from it along the roof towards the drill,
    stacked shut; the game swings the two outer leaves down across the boiler to fan it open.
    """
    hinge = [
        cylinder('brass', 0.012, 0.05, (0.0, 0.0, -0.012), 'Y'),
        box('dark-iron', (0.09, 0.05, 0.016), (0.0, 0.0, -0.032)),
        box('iron-plate', (0.05, 0.04, 0.02), (0.0, 0.0, -0.05)),
        # The innermost leaf, which never moves: brass, ribbed, a boss at its tip.
        box('brass', (0.17, 0.006, 0.034), (0.095, -0.004, -0.021)),
        box('bronze', (0.14, 0.004, 0.006), (0.09, -0.009, -0.021)),
        sphere('brass', 0.008, (0.182, -0.004, -0.021)),
    ]
    hinge += [small_rivet((x, -0.026, -0.032)) for x in (-0.03, 0.03)]
    leaf = [
        hub('brass', 0.009, 0.014),
        box('brass', (0.17, 0.005, 0.03), (0.095, 0.0, -0.019)),
        box('bronze', (0.13, 0.004, 0.005), (0.09, -0.005, -0.012)),
        sphere('brass', 0.007, (0.182, 0.0, -0.019)),
    ]
    leaf_2 = [
        hub('brass', 0.009, 0.014),
        box('brass', (0.165, 0.005, 0.028), (0.0925, 0.0, -0.018)),
        box('bronze', (0.125, 0.004, 0.005), (0.088, -0.005, -0.026)),
        sphere('brass', 0.007, (0.178, 0.0, -0.018)),
    ]
    return [
        build_part('vane-hinge', hinge, (0.0, 0.0, 0.0), z_of(socket, 'vane-hinge')),
        build_part('vane-leaf', leaf, (0.0, -0.012, -0.012), z_of(socket, 'vane-leaf')),
        build_part('vane-leaf-2', leaf_2, (0.0, -0.02, -0.012), z_of(socket, 'vane-leaf-2')),
    ]


SOCKET_BUILDERS = {
    'scree_plough': author_scree_plough,
    'damp_flask': author_damp_flask,
    'shard_tongs': author_shard_tongs,
    'vent_vane': author_vent_vane,
}


# --- the Cache Crate prop -------------------------------------------------------------------------


def author_crate():
    """
    A strapped plank crate the size of a hold's worth of ore, its origin at its base's centre so
    it stands on its cell, and the owner's tag hung on the lid's hasp: the one part a tint tells
    whose crate it is.
    """
    reset_scene()
    body = [
        box('plank', (0.78, 0.6, 0.56), (0.0, 0.0, 0.28)),
        box('plank', (0.82, 0.64, 0.08), (0.0, 0.0, 0.6)),
    ]
    body += [box('dark-iron', (0.05, 0.66, 0.66), (x, 0.0, 0.33)) for x in (-0.3, 0.3)]
    body += [box('dark-iron', (0.86, 0.68, 0.05), (0.0, 0.0, z)) for z in (0.06, 0.52)]
    body += [box('iron', (0.84, 0.03, 0.02), (0.0, -0.32, z)) for z in (0.2, 0.36)]
    body += [small_rivet((x, -0.345, z)) for x in (-0.3, 0.3) for z in (0.06, 0.2, 0.36, 0.52)]
    body += [torus('rope', 0.06, 0.012, (x, -0.33, 0.42)) for x in (-0.2, 0.2)]
    body += [box('brass', (0.1, 0.03, 0.06), (0.2, -0.33, 0.6))]
    built = [build_part(CRATE_ASSET_ID, body, (0.0, 0.0, 0.0), 1)]
    tag = [
        ring('brass', 0.016, 0.004, (0.0, 0.0, 0.0), (0, 1, 0)),
        box('brass', (0.14, 0.012, 0.09), (0.0, 0.0, -0.065)),
        box('soot', (0.1, 0.006, 0.05), (0.0, -0.008, -0.065)),
    ]
    built.append(build_part(CRATE_TAG_PART_ID, tag, (0.2, -0.36, 0.55), 2))
    soften_bevels(built, PROP_BEVEL_M)
    check_parts(CRATE_ASSET_ID, built, [CRATE_ASSET_ID, CRATE_TAG_PART_ID])
    save_as(CRATE_ASSET_ID)


# --- the merchant frontages -----------------------------------------------------------------------

# The station's frame (author_service_station.py): the exchange arch and the assay house's roof.
SELL_ARCH_X = 1.92
ARCH_SPRING_Z = 1.85
ARCH_RADIUS = 0.8
FACE_Y = -0.7
AWNING_WIDTH = 1.9
AWNING_TOP_Z = 3.0
AWNING_SLOPE = 0.55
SHINGLE_AT = (1.38, -0.96, 2.3)
POLE_X = 1.35
ROOF_TERRACE_Z = 5.3
POLE_TOP_Z = 6.95
BANNER_PIVOT = (POLE_X, -0.33, 6.88)


def author_frontage(merchants, frontage):
    reset_scene()
    colours = planet_colours(frontage['planet'])
    canvas, trim = canvas_materials(frontage, colours)
    origin = Vector((merchants['atM'][0], 0.0, merchants['atM'][1]))
    shell = awning_pieces(canvas, trim) + shingle_pieces(frontage['device'], trim) + pole_pieces()
    built = [rebased(build_part(frontage['assetId'], shell, (0.0, 0.0, 0.0), 1), origin)]
    built.append(build_part(merchants['bannerPartId'], banner_pieces(canvas, trim), Vector(BANNER_PIVOT) - origin, 2))
    check_parts(frontage['assetId'], built, [frontage['assetId'], merchants['bannerPartId']])
    save_as(frontage['assetId'])


def rebased(part, origin):
    """The part drawn in the station's frame, its mesh moved so `origin` becomes its own origin."""
    part.data.transform(Matrix.Translation(-origin))
    return part


def planet_colours(planet):
    """The planet's look row, else its archetype palette: `horizon` is the canvas, `rockSurface` the trim."""
    rows = read_json(PLANET_ROWS)['ore']['planets']['rows']
    row = next(row for row in rows if str(row['planet']) == planet['planet'])
    look = row.get('look')
    if look is None:
        palette = read_json(ART_DIRECTION)['palettes']['palette.planet_%s' % planet['planet']]
        return {'canvas': palette['sky'], 'trim': palette['surface']}
    return {'canvas': look['horizon'], 'trim': look['rockSurface']}


def canvas_materials(frontage, colours):
    """Two materials of the planet's own: the canvas and a darker trim, named per frontage."""
    canvas = 'canvas-' + frontage['planet']['planet']
    trim = 'trim-' + frontage['planet']['planet']
    PALETTE[canvas] = (linear_of_hex(colours['canvas']), 0.8, 0.0)
    PALETTE[trim] = (linear_of_hex(colours['trim']), 0.7, 0.0)
    return canvas, trim


def linear_of_hex(hex_colour):
    """A display `#rrggbb` as the linear base colour Blender wants, so the bake reads it back."""
    channels = [int(hex_colour[at:at + 2], 16) / 255.0 for at in (1, 3, 5)]
    return tuple(pow((c + 0.055) / 1.055, 2.4) if c > 0.04045 else c / 12.92 for c in channels)


def awning_pieces(canvas, trim):
    """A sloped canvas over the exchange arch, scalloped along its front, on two brass brackets."""
    depth = 0.46
    centre_y = FACE_Y - 0.06 - depth / 2 * math.cos(AWNING_SLOPE)
    centre_z = AWNING_TOP_Z - depth / 2 * math.sin(AWNING_SLOPE)
    pieces = [
        tilted_box(canvas, (AWNING_WIDTH, depth, 0.024), (SELL_ARCH_X, centre_y, centre_z), turn_x=AWNING_SLOPE),
        box('dark-iron', (AWNING_WIDTH + 0.04, 0.06, 0.05), (SELL_ARCH_X, FACE_Y - 0.06, AWNING_TOP_Z + 0.01)),
    ]
    front_y = FACE_Y - 0.06 - depth * math.cos(AWNING_SLOPE)
    front_z = AWNING_TOP_Z - depth * math.sin(AWNING_SLOPE)
    pieces.append(box('brass', (AWNING_WIDTH, 0.03, 0.03), (SELL_ARCH_X, front_y, front_z)))
    scallops = 8
    for index in range(scallops):
        x = SELL_ARCH_X - AWNING_WIDTH / 2 + AWNING_WIDTH * (index + 0.5) / scallops
        pieces.append(cylinder(trim, AWNING_WIDTH / scallops / 2 - 0.01, 0.024, (x, front_y, front_z - 0.03), 'Y'))
    for x in (SELL_ARCH_X - AWNING_WIDTH / 2 + 0.08, SELL_ARCH_X + AWNING_WIDTH / 2 - 0.08):
        pieces.append(tilted_box('brass', (0.03, 0.44, 0.03), (x, (FACE_Y - 0.06 + front_y) / 2, (AWNING_TOP_Z + front_z) / 2 - 0.02),
                                 turn_x=AWNING_SLOPE))
        pieces.append(box('dark-iron', (0.06, 0.06, 0.14), (x, FACE_Y - 0.03, AWNING_TOP_Z - 0.04)))
    return pieces


def shingle_pieces(device, trim):
    """A hanging sign in the arch's free corner, by the hopper: a soot board in brass, the device on it."""
    x, y, z = SHINGLE_AT
    pieces = [
        box('soot', (0.44, 0.04, 0.36), (x, y, z)),
        box('brass', (0.46, 0.03, 0.02), (x, y, z + 0.18)),
        box('brass', (0.46, 0.03, 0.02), (x, y, z - 0.18)),
        box('brass', (0.02, 0.03, 0.36), (x - 0.22, y, z)),
        box('brass', (0.02, 0.03, 0.36), (x + 0.22, y, z)),
        box(trim, (0.4, 0.01, 0.32), (x, y - 0.018, z)),
    ]
    for chain_x in (x - 0.15, x + 0.15):
        pieces.append(cylinder('dark-iron', 0.008, 0.3, (chain_x, y, z + 0.33), 'Z'))
    pieces += DEVICES[device]((x, y - 0.05, z))
    return pieces


def pole_pieces():
    """The banner's pole on the assay house's roof terrace, a brass finial, a cross-arm the banner hangs from."""
    height = POLE_TOP_Z - ROOF_TERRACE_Z
    return [
        cylinder('dark-iron', 0.028, height, (POLE_X, -0.33, ROOF_TERRACE_Z + height / 2), 'Z'),
        cylinder('dark-iron', 0.07, 0.06, (POLE_X, -0.33, ROOF_TERRACE_Z + 0.03), 'Z'),
        sphere('brass', 0.045, (POLE_X, -0.33, POLE_TOP_Z + 0.03)),
        box('brass', (0.52, 0.03, 0.03), (POLE_X, -0.33, BANNER_PIVOT[2])),
    ]


def banner_pieces(canvas, trim):
    """A canvas pennant hung from the cross-arm (the origin), swallow-tailed, the planet's colours."""
    return [
        cylinder('brass', 0.012, 0.5, (0.0, 0.0, 0.0), 'X'),
        box(canvas, (0.46, 0.014, 0.74), (0.0, -0.005, -0.4)),
        box(trim, (0.46, 0.012, 0.08), (0.0, -0.012, -0.08)),
        tilted_box(canvas, (0.2, 0.014, 0.22), (-0.13, -0.005, -0.84), turn_y=0.5),
        tilted_box(canvas, (0.2, 0.014, 0.22), (0.13, -0.005, -0.84), turn_y=-0.5),
        cylinder('brass', 0.1, 0.014, (0.0, -0.016, -0.42), 'Y'),
        cylinder(trim, 0.07, 0.016, (0.0, -0.02, -0.42), 'Y'),
    ]


# --- the merchants' devices, on the shingle --------------------------------------------------------


def crucible_device(centre):
    """Hearthmoor Assay: an assay crucible on its tripod, a honey-amber gem glowing in it."""
    x, y, z = centre
    pieces = [
        frustum('brass', 0.085, 0.055, 0.1, (x, y, z - 0.03)),
        torus('brass', 0.085, 0.01, (x, y - 0.01, z + 0.02)),
        sphere('amber-gem', 0.04, (x, y - 0.02, z + 0.04)),
    ]
    pieces += [tilted_box('dark-iron', (0.016, 0.016, 0.12), (x + 0.07 * math.cos(a), y, z - 0.1), turn_y=-0.35 * math.cos(a))
               for a in (0.0, math.pi)]
    pieces.append(box('dark-iron', (0.2, 0.02, 0.02), (x, y, z - 0.15)))
    return pieces


def pick_and_shovel_device(centre):
    """Scree Yard: a crossed pick and shovel over a heap of scree."""
    x, y, z = centre
    pieces = [
        tilted_box('rope', (0.3, 0.02, 0.02), (x, y, z + 0.02), turn_y=0.75),
        tilted_box('rope', (0.3, 0.02, 0.02), (x, y - 0.01, z + 0.02), turn_y=-0.75),
        tilted_box('steel', (0.12, 0.02, 0.035), (x - 0.11, y, z + 0.13), turn_y=0.75),
        tilted_box('steel', (0.11, 0.02, 0.07), (x + 0.11, y - 0.01, z + 0.13), turn_y=-0.75),
    ]
    pieces += [sphere('slate', r, (x + dx, y, z - 0.1 + dz)) for dx, dz, r in
               ((-0.09, 0.0, 0.035), (-0.03, 0.01, 0.04), (0.04, 0.0, 0.038), (0.1, -0.005, 0.03), (0.0, 0.055, 0.03))]
    return pieces


def gas_lamp_device(centre):
    """Gasworks: a caged gas lamp burning the green firedamp flame."""
    x, y, z = centre
    pieces = [
        cylinder('brass', 0.075, 0.02, (x, y, z - 0.1), 'Z'),
        cylinder('brass', 0.07, 0.02, (x, y, z + 0.09), 'Z'),
        cone('brass', 0.05, 0.02, 0.05, (x, y, z + 0.125), (0, 0, 1)),
        torus('brass', 0.02, 0.005, (x, y, z + 0.17)),
        sphere('gas-flame', 0.05, (x, y, z - 0.01)),
        sphere('gas-flame', 0.03, (x, y, z + 0.04)),
    ]
    pieces += [cylinder('dark-iron', 0.006, 0.19, (x + 0.065 * math.cos(a), y + 0.065 * math.sin(a), z), 'Z')
               for a in (0.4, math.pi - 0.4, math.pi + 0.4, -0.4)]
    return pieces


def cut_gem_device(centre):
    """Lapidary: a cut rose-quartz gem held in a dop over its cutting wheel."""
    x, y, z = centre
    pieces = [
        cylinder('rose-gem', 0.075, 0.035, (x, y, z + 0.04), 'Y'),
        cone('rose-gem', 0.07, 0.03, 0.03, (x, y - 0.03, z + 0.04), (0, -1, 0)),
        cylinder('brass', 0.02, 0.04, (x, y, z - 0.04), 'Z'),
        cylinder('steel', 0.065, 0.02, (x, y, z - 0.11), 'Y'),
        cylinder('dark-iron', 0.02, 0.04, (x, y, z - 0.11), 'Y'),
        box('dark-iron', (0.24, 0.02, 0.02), (x, y, z - 0.17)),
    ]
    return pieces


def boiler_whistle_device(centre):
    """Boilerhouse: a small riveted boiler with its steam whistle blowing."""
    x, y, z = centre
    pieces = [
        cylinder('copper', 0.07, 0.22, (x, y, z - 0.03), 'X'),
        sphere('copper', 0.07, (x - 0.11, y, z - 0.03)),
        sphere('copper', 0.07, (x + 0.11, y, z - 0.03)),
        torus('brass', 0.072, 0.008, (x - 0.04, y - 0.004, z - 0.03)),
        torus('brass', 0.072, 0.008, (x + 0.04, y - 0.004, z - 0.03)),
        box('dark-iron', (0.26, 0.04, 0.03), (x, y, z - 0.12)),
        cylinder('brass', 0.018, 0.08, (x + 0.05, y, z + 0.07), 'Z'),
        cone('brass', 0.022, 0.012, 0.03, (x + 0.05, y, z + 0.12), (0, 0, 1)),
        sphere('steam', 0.035, (x + 0.05, y, z + 0.16)),
        sphere('steam', 0.022, (x + 0.09, y, z + 0.19)),
        cylinder('dark-iron', 0.03, 0.08, (x - 0.06, y, z + 0.06), 'Z'),
    ]
    return pieces


DEVICES = {
    'crucible': crucible_device,
    'pick-and-shovel': pick_and_shovel_device,
    'gas-lamp': gas_lamp_device,
    'cut-gem': cut_gem_device,
    'boiler-whistle': boiler_whistle_device,
}


if __name__ == '__main__':
    main()
