"""
Authors the first version of the two shop buildings' Blender sources (#174, for the spec #170
"Look"): the tall "Assay & Exchange" over the Sell zone and the wide, low "Engineering Works" over
the Workshop zone, each with the attach points the sell burst (#171), the showcase (#180) and the
dock camera read.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_shop_buildings.py [-- <id> ...]

It wrote art/blender/<id>/<id>.blend for platform-building-sell and platform-building-upgrade.
From then on those files are the sources (#52): change the art in Blender (through the MCP or by
hand) and re-export, rather than editing this script. Nothing here is rigged (#51 acceptance 2).
The Assay & Exchange tower is retired: the service station replaced it (ticket 398, written by
docs/art/service-station/author_service_station.py), so this script now writes only the Works.

Conventions are author_platform.py's (#52, docs/art-pipeline.md): 1 unit = 1 m, game right +X,
up +Z, the camera looks along +Y so details stand out towards -Y, z = 0 is the top of the pad.
Each building's origin is its dock zone's centre column on the pad, where `bayRestPointOf` puts the
vehicle, so #175 places the asset at the rest point and nothing else. The static detail of each
building is one part (the asset's own id); only the ticker, the gantry and the turntable are parts
of their own (#170 budget). An empty named `attach.<id>` is an attach point the export writes
into the sidecar (#162 K5 shape).

The palette is brass, iron and soot; the only light is warm window and lamp glass on the emissive
map, and orange stays reserved for heat (#170). The sign glyphs are the bays' #158 emblems
(`src/ui/icons/emblem-bay-<bay>.svg`), extruded in brass on a soot plaque, so the signs speak the
icon language. The buildings read as silhouettes: vertical with a funnel crown against horizontal
with a crane arm.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import author_platform as platform  # noqa: E402

REPO_ROOT = platform.REPO_ROOT
ICON_FOLDER = os.path.join(REPO_ROOT, 'src', 'ui', 'icons')
ATTACH_PREFIX = 'attach.'

# Warm light only, well off orange: window glass, lamp glass and the sawtooth glazing (#170).
platform.PALETTE.update({
    'window-glow': ((1.0, 0.80, 0.50), 0.3, 1.6),
    'lamp-glow': ((1.0, 0.88, 0.64), 0.3, 2.2),
    'glazing': ((0.96, 0.82, 0.58), 0.25, 0.9),
    'ticker-glow': ((1.0, 0.86, 0.55), 0.3, 1.2),
    'gunmetal': ((0.16, 0.17, 0.19), 0.45, 0.0),
})

# The Workshop's static shell.
WORKS_WIDTH = 10.0
WORKS_EAVE = 4.0
WORKS_RIDGE = 5.5
WORKS_TOOTH = 2.5
WORKS_BACK_Y = 1.2
WORKS_STACK_X = 3.6
WORKS_STACK_TOP = 6.8
WORKS_GANTRY_ROOT = (-3.4, -1.0, 4.9)
WORKS_GANTRY_LENGTH = 4.0
WORKS_GANTRY_RISE = 1.7
WORKS_TURNTABLE_RADIUS = 1.6


def main():
    for asset_id in requested_asset_ids():
        AUTHORS[asset_id]()


def requested_asset_ids():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return requested or list(AUTHORS)


# --- shared shapes ----------------------------------------------------------------------------


def ring(material, major, minor, centre):
    """A ring lying flat (its axis along Z): a funnel rim, a stack band, the turntable's edge."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48,
                                     minor_segments=10, location=centre)
    return platform.finish_piece(material, smooth=True)


# --- Engineering Works (Workshop) ---------------------------------------------------------------


def author_workshop_building():
    platform.reset_scene()
    platform.build_part('platform-building-upgrade', workshop_shell_pieces(), at=(0.0, 0.0, 0.0), z_order=0)
    platform.build_part('workshop-gantry', gantry_pieces(), at=WORKS_GANTRY_ROOT, z_order=1)
    platform.build_part('workshop-turntable', turntable_pieces(), at=(0.0, 0.1, 0.0), z_order=1)
    add_attach_point('workshop.gantry', (WORKS_GANTRY_ROOT[0], WORKS_GANTRY_ROOT[2]), z_order=2)
    add_attach_point('workshop.platform', (0.0, 0.0), z_order=1)
    add_attach_point('workshop.showcase_cam', (0.0, 1.8), z_order=0)
    add_attach_point('workshop.stack', (WORKS_STACK_X, WORKS_STACK_TOP), z_order=-1)
    platform.save_as('platform-building-upgrade')


def workshop_shell_pieces():
    return (workshop_floor_pieces() + workshop_back_wall_pieces() + workshop_pillar_pieces()
            + workshop_roof_pieces() + workshop_lamp_pieces() + workshop_stack_pieces()
            + sign_plaque_pieces('emblem-bay-upgrade', centre=(2.6, -0.95, 4.05), radius=0.62))


def workshop_floor_pieces():
    """The floor plate behind the pad's edge; the open front shows it under the turntable."""
    pieces = [
        platform.box('dark-iron', (WORKS_WIDTH, 1.4, 0.12), (0.0, WORKS_BACK_Y - 0.5, 0.06)),
        platform.box('brass', (WORKS_WIDTH - 0.4, 0.06, 0.03), (0.0, 0.0, 0.12)),
    ]
    pieces += [platform.box('iron-plate', (0.9, 0.9, 0.03), (x, WORKS_BACK_Y - 0.5, 0.13)) for x in platform.stepped(-4.0, 4.0, 1.0)]
    return pieces


def workshop_back_wall_pieces():
    """The hall's back wall, cut away to the camera: tool racks, pipes, a pressure gauge and high windows."""
    face = WORKS_BACK_Y - 0.17
    pieces = [
        platform.box('enamel', (WORKS_WIDTH - 0.4, 0.3, WORKS_EAVE), (0.0, WORKS_BACK_Y, WORKS_EAVE / 2)),
        platform.box('iron-plate', (WORKS_WIDTH - 0.6, 0.05, 1.1), (0.0, face, 0.65)),
        platform.cylinder('copper', 0.08, WORKS_WIDTH - 1.0, (0.0, face - 0.05, 2.6), 'X'),
        platform.cylinder('copper', 0.06, WORKS_WIDTH - 1.0, (0.0, face - 0.05, 2.8), 'X'),
        platform.box('brass', (2.2, 0.08, 0.06), (-2.6, face - 0.04, 2.1)),
        platform.box('brass', (2.2, 0.08, 0.06), (2.6, face - 0.04, 2.1)),
        platform.cylinder('brass', 0.3, 0.08, (-4.1, face - 0.06, 3.1), 'Y'),
        platform.cylinder('enamel', 0.24, 0.1, (-4.1, face - 0.07, 3.1), 'Y'),
        platform.box('brass', (0.03, 0.04, 0.2), (-4.1, face - 0.1, 3.18), turn_y=math.radians(-30)),
        platform.cylinder('copper', 0.08, 1.2, (-4.4, face - 0.05, 3.2), 'Z'),
    ]
    tools = platform.stepped(-3.6, -1.6, 0.4) + platform.stepped(1.6, 3.6, 0.4)
    pieces += [platform.box('gunmetal', (0.08, 0.1, 0.5), (x, face - 0.08, 1.8)) for x in tools]
    for x in platform.stepped(-3.75, 3.75, 1.5):
        pieces.append(platform.box('brass', (1.0, 0.04, 0.6), (x, face + 0.02, 3.45)))
        pieces.append(platform.box('window-glow', (0.9, 0.1, 0.5), (x, face - 0.01, 3.45)))
    pieces += platform.rivet_row(-4.4, 4.4, 0.4, y=face - 0.04, z=1.2)
    return pieces


def workshop_pillar_pieces():
    pieces = []
    for x in (-(WORKS_WIDTH / 2 - 0.25), WORKS_WIDTH / 2 - 0.25):
        pieces += [
            platform.box('iron', (0.5, 1.2, WORKS_EAVE), (x, 0.4, WORKS_EAVE / 2)),
            platform.box('brass', (0.6, 1.3, 0.1), (x, 0.4, 0.45)),
            platform.box('brass', (0.6, 1.3, 0.1), (x, 0.4, WORKS_EAVE - 0.35)),
        ]
        pieces += [platform.rivet((x, -0.21, z)) for z in platform.stepped(0.8, 3.4, 0.4)]
    return pieces


def workshop_roof_pieces():
    """A lintel across the open front and four sawtooth teeth, each glazed on its steep face."""
    pieces = [
        platform.box('brass', (WORKS_WIDTH, 1.0, 0.3), (0.0, -0.3, WORKS_EAVE - 0.15)),
        platform.box('dark-iron', (WORKS_WIDTH + 0.2, 2.6, 0.12), (0.0, 0.4, WORKS_EAVE + 0.06)),
    ]
    pieces += platform.rivet_row(-4.6, 4.6, 0.4, y=-0.81, z=WORKS_EAVE - 0.15)
    left = -WORKS_WIDTH / 2
    for tooth in range(4):
        x0 = left + tooth * WORKS_TOOTH
        pieces += sawtooth_pieces(x0, x0 + WORKS_TOOTH)
    return pieces


def sawtooth_pieces(x0, x1):
    """One tooth: a slope rising left to right over the eave, a steep face dropping back, glazed to the front."""
    base, ridge = WORKS_EAVE + 0.12, WORKS_RIDGE
    profile = [(x0, base), (x1, base), (x1, ridge), (x0 + 0.15, base + 0.05)]
    return [
        prism('iron', profile, y_from=-0.9, y_to=1.7),
        platform.box('brass', (0.12, 2.7, 0.1), (x1 - 0.06, 0.4, ridge)),
        prism('brass', inset_profile(profile, 0.2), y_from=-0.96, y_to=-0.85),
        prism('glazing', inset_profile(profile, 0.3), y_from=-0.99, y_to=-0.85),
    ]


def inset_profile(profile, by):
    """The tooth's face shrunk towards its centre: the skylight in it, framed by the iron around."""
    cx = sum(x for x, _ in profile) / len(profile)
    cz = sum(z for _, z in profile) / len(profile)
    return [(x + (cx - x) * by * 2.2, z + (cz - z) * by * 2.2) for x, z in profile]


def prism(material, profile, y_from, y_to):
    """A straight prism along Y from an XZ profile (counter-clockwise seen from -Y)."""
    front = [(x, y_from, z) for x, z in profile]
    back = [(x, y_to, z) for x, z in profile]
    count = len(profile)
    faces = [list(range(count))[::-1], [count + i for i in range(count)]]
    faces += [[i, (i + 1) % count, count + (i + 1) % count, count + i] for i in range(count)]
    mesh = bpy.data.meshes.new('prism')
    mesh.from_pydata(front + back, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('prism', mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return platform.finish_piece(material, smooth=False)


def workshop_lamp_pieces():
    """Three hanging lamps under the roof, lit."""
    pieces = []
    for x in (-2.6, 0.0, 2.6):
        pieces += [
            platform.cylinder('dark-iron', 0.02, 0.5, (x, -0.5, WORKS_EAVE - 0.55), 'Z'),
            platform.frustum('dark-iron', 0.3, 0.1, 0.22, (x, -0.5, WORKS_EAVE - 0.9)),
            platform.cylinder('lamp-glow', 0.16, 0.12, (x, -0.5, WORKS_EAVE - 1.04), 'Z'),
        ]
    return pieces


def workshop_stack_pieces():
    """A short boiler-house stack through the right end of the roof, booted on the tooth's slope."""
    boot = WORKS_EAVE + 0.3
    return [
        platform.cylinder('soot', 0.35, WORKS_STACK_TOP - boot, (WORKS_STACK_X, 0.9, (boot + WORKS_STACK_TOP) / 2), 'Z'),
        platform.cylinder('brass', 0.42, 0.1, (WORKS_STACK_X, 0.9, WORKS_STACK_TOP - 0.05), 'Z'),
        platform.cylinder('brass', 0.4, 0.08, (WORKS_STACK_X, 0.9, WORKS_STACK_TOP - 0.9), 'Z'),
        platform.cylinder('dark-iron', 0.5, 0.5, (WORKS_STACK_X, 0.9, boot + 0.45), 'Z'),
    ]


def gantry_pieces():
    """The crane jib out of the roof: a lattice arm from its root bearing, a hook block on a cable."""
    length, rise = WORKS_GANTRY_LENGTH, WORKS_GANTRY_RISE
    turn = math.atan2(rise, length)
    pieces = [
        platform.cylinder('brass', 0.3, 0.3, (0.0, 0.0, 0.0), 'Y'),
        platform.cylinder('dark-iron', 0.12, 0.36, (0.0, 0.0, 0.0), 'Y'),
    ]
    for across in (-0.14, 0.14):
        offset = (-across * math.sin(turn), across * math.cos(turn))
        pieces.append(platform.box('gunmetal', (length, 0.12, 0.08),
                                   (length / 2 * math.cos(turn) + offset[0], 0.0, rise / 2 + offset[1]), turn_y=-turn))
    for along in platform.stepped(0.4, length - 0.4, 0.45):
        pieces.append(platform.box('gunmetal', (0.06, 0.1, 0.3), (along * math.cos(turn), 0.0, along * math.sin(turn)),
                                   turn_y=-turn + math.radians(35)))
    tip = ((length - 0.1) * math.cos(turn), (length - 0.1) * math.sin(turn))
    pieces += [
        platform.cylinder('brass', 0.12, 0.16, (tip[0], 0.0, tip[1]), 'Y'),
        platform.cylinder('dark-iron', 0.015, 1.0, (tip[0], -0.02, tip[1] - 0.55), 'Z'),
        platform.box('gunmetal', (0.22, 0.14, 0.3), (tip[0], -0.02, tip[1] - 1.15)),
        platform.torus('brass', 0.12, 0.035, (tip[0], -0.03, tip[1] - 1.4)),
    ]
    return pieces


def turntable_pieces():
    """The showcase turntable, flush with the pad: a riveted iron disc with a brass rim and a keyed hub line."""
    pieces = [
        platform.cylinder('dark-iron', WORKS_TURNTABLE_RADIUS, 0.2, (0.0, 0.0, -0.02), 'Z'),
        ring('brass', WORKS_TURNTABLE_RADIUS, 0.05, (0.0, 0.0, 0.07)),
        platform.cylinder('brass', 0.3, 0.06, (0.0, 0.0, 0.08), 'Z'),
    ]
    pieces += [platform.rivet((x, -WORKS_TURNTABLE_RADIUS + 0.04, 0.02)) for x in platform.stepped(-1.2, 1.2, 0.4)]
    return pieces


# --- signs and attach points ----------------------------------------------------------------------


def sign_plaque_pieces(icon_id, centre, radius):
    """The bay's #158 emblem, extruded in brass on a soot plaque with a brass rim."""
    x, y, z = centre
    pieces = [
        platform.cylinder('brass', radius + 0.08, 0.08, (x, y + 0.02, z), 'Y'),
        platform.cylinder('soot', radius, 0.1, (x, y, z), 'Y'),
        emblem_glyph(icon_id, 'brass', (x, y - 0.06, z), 2 * radius * 0.78),
    ]
    pieces += [platform.rivet((x + radius * math.cos(a), y - 0.04, z + radius * math.sin(a)))
               for a in (math.radians(d) for d in (45, 135, 225, 315))]
    return pieces


def emblem_glyph(icon_id, material, centre, size):
    """Imports the emblem's SVG as curves, keeps the filled shapes, extrudes them and faces them to the camera."""
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=os.path.join(ICON_FOLDER, icon_id + '.svg'))
    curves = [obj for obj in bpy.data.objects if obj not in before]
    filled = [obj for obj in curves if obj.dimensions.x > 0 and obj.dimensions.y > 0]
    for stray in (obj for obj in curves if obj not in filled):
        bpy.data.objects.remove(stray, do_unlink=True)
    for curve in filled:
        curve.data.extrude = 0.0002
        curve.data.fill_mode = 'BOTH'
    glyph = join_as_mesh(filled)
    place_glyph(glyph, centre, size)
    remove_import_collection(icon_id)
    glyph.data.materials.clear()
    glyph.data.materials.append(platform.material_of(material))
    return glyph


def join_as_mesh(curves):
    bpy.ops.object.select_all(action='DESELECT')
    for curve in curves:
        curve.select_set(True)
    bpy.context.view_layer.objects.active = curves[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def place_glyph(glyph, centre, size):
    """Scales the flat glyph to `size` across, stands it in the XZ plane facing -Y, centred on `centre`."""
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    scale = size / max(glyph.dimensions.x, glyph.dimensions.y)
    glyph.scale = (scale, scale, scale)
    glyph.rotation_euler = (math.pi / 2, 0.0, 0.0)
    glyph.location = centre
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def remove_import_collection(icon_id):
    collection = bpy.data.collections.get(icon_id + '.svg')
    if collection is not None:
        for obj in list(collection.objects):
            bpy.context.scene.collection.objects.link(obj)
            collection.objects.unlink(obj)
        bpy.data.collections.remove(collection)


def add_attach_point(attach_id, at_xz, z_order):
    """An `attach.<id>` empty: a named point of the asset frame the export writes, never baked."""
    empty = bpy.data.objects.new(ATTACH_PREFIX + attach_id, None)
    empty.empty_display_type = 'PLAIN_AXES'
    empty.empty_display_size = 0.3
    empty.location = (at_xz[0], -1.0, at_xz[1])
    empty['z'] = z_order
    bpy.context.scene.collection.objects.link(empty)
    return empty


AUTHORS = {
    'platform-building-upgrade': author_workshop_building,
}

if __name__ == '__main__':
    main()
