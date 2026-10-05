"""
Authors the first version of the platform's Blender sources (S7b, #67): the hub with its two
visual states (#8 `outpost`, `core-drive`) and the Sell and Upgrade bays, each bay with the
staging (camera, lights, floor and wall) its screen backdrop renders with (#45, #51).

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_platform.py

It writes art/blender/<id>/<id>.blend for platform-hub, platform-bay-sell and
platform-bay-upgrade, or only the ids given after `--`. From then on those files are the sources (#52): change the art in Blender
and re-export, rather than editing this script. Nothing here is rigged (#51 acceptance 2).

Conventions (#52, docs/art-pipeline.md): 1 unit = 1 m, game right is +X, up is +Z, the camera
looks along +Y so details stand out towards -Y. Each part is one mesh object named for its
placeholder id, its origin the placeholder's pivot (bottom centre), at the placeholder's `atM`,
and its bounds the placeholder's `sizeM`, so the real art drops into the placeholder's place.
Materials are dielectric: Cycles' diffuse colour pass, which the albedo bake reads, is black on a
metallic surface. The look is #48's lit brass on dark iron; Sell is copper and amber with an
assay scale, Upgrade steel and teal with a gear and wrench (#45).
"""

import math
import os
import sys

import bpy
from mathutils import Vector

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
STAGING_COLLECTION = 'backdrop-staging'

# Base colour, roughness, emission strength (0 for none).
PALETTE = {
    'iron': ((0.20, 0.18, 0.17), 0.6, 0.0),
    'dark-iron': ((0.10, 0.09, 0.085), 0.7, 0.0),
    'iron-plate': ((0.26, 0.23, 0.21), 0.5, 0.0),
    'brass': ((0.78, 0.58, 0.24), 0.35, 0.0),
    'copper': ((0.72, 0.38, 0.20), 0.4, 0.0),
    'steel': ((0.46, 0.49, 0.53), 0.35, 0.0),
    'teal': ((0.08, 0.42, 0.42), 0.45, 0.0),
    'enamel': ((0.055, 0.055, 0.065), 0.5, 0.0),
    'glass': ((0.05, 0.07, 0.08), 0.1, 0.0),
    'amber-glass': ((0.92, 0.56, 0.16), 0.15, 0.0),
    'teal-glass': ((0.25, 0.85, 0.82), 0.15, 0.0),
    'core-glow': ((1.0, 0.54, 0.29), 0.3, 1.0),
    'core-heart': ((1.0, 0.89, 0.69), 0.3, 1.0),
    'floor': ((0.07, 0.06, 0.055), 0.8, 0.0),
    'wall': ((0.045, 0.042, 0.045), 0.6, 0.0),
}
# The staging floor and wall span metres where a part spans centimetres; the fine bump would
# stretch over them into ripples, so they stay smooth.
SMOOTH_MATERIALS = ('floor', 'wall')


def main():
    for asset_id in requested_asset_ids():
        AUTHORS[asset_id]()


def requested_asset_ids():
    """The ids after `--`, or all three; re-authoring one file leaves the others untouched."""
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return requested or list(AUTHORS)


# --- the three files ------------------------------------------------------------------------------


def author_hub():
    reset_scene()
    outpost = build_part('outpost', outpost_pieces(), at=(-3.4, 0.0, 0.0), z_order=0)
    core = build_part('core-drive', core_drive_pieces(), at=(-3.6, -0.45, 2.8), z_order=1)
    move_to_collection(outpost, 'outpost')
    move_to_collection(core, 'core-drive')
    save_as('platform-hub')


def author_sell_bay():
    reset_scene()
    build_part('platform-bay-sell', bay_frame_pieces('copper', 'amber-glass') + assay_scale_pieces(),
               at=(0.0, 0.0, 0.0), z_order=0)
    stage_backdrop(key_colour=(1.0, 0.78, 0.55), accent_colour=(1.0, 0.6, 0.2))
    save_as('platform-bay-sell')


def author_upgrade_bay():
    reset_scene()
    build_part('platform-bay-upgrade', bay_frame_pieces('steel', 'teal-glass', lintel='teal')
               + gear_and_wrench_pieces(), at=(0.0, 0.0, 0.0), z_order=0)
    stage_backdrop(key_colour=(0.8, 0.9, 1.0), accent_colour=(0.2, 0.85, 0.8))
    save_as('platform-bay-upgrade')


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def save_as(asset_id):
    folder = os.path.join(REPO_ROOT, 'art', 'blender', asset_id)
    os.makedirs(folder, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, asset_id + '.blend'), compress=True)
    print('authored ' + asset_id)


# --- the hub (outpost 4.4 x 3.2 m, core drive 1.6 x 2.0 m) ----------------------------------------


def outpost_pieces():
    pieces = [
        box('dark-iron', (4.4, 0.8, 0.4), (0, 0, 0.2)),
        box('iron', (3.8, 0.6, 2.4), (0, 0, 1.6)),
        box('iron-plate', (1.3, 0.04, 1.9), (-1.05, -0.32, 1.6)),
        box('iron-plate', (1.3, 0.04, 1.9), (1.05, -0.32, 1.6)),
        box('brass', (0.66, 0.06, 1.76), (0, -0.33, 1.4)),
        box('glass', (0.5, 0.08, 1.6), (0, -0.34, 1.4)),
        box('dark-iron', (0.62, 0.06, 1.1), (1.15, -0.36, 1.05)),
        box('brass', (0.08, 0.08, 0.2), (0.92, -0.42, 1.05)),
        cylinder('brass', 0.06, 3.8, (0, -0.4, 0.62), 'X'),
        cylinder('brass', 0.06, 3.8, (0, -0.4, 2.62), 'X'),
        box('brass', (3.9, 0.7, 0.13), (0, 0, 2.865)),
        box('dark-iron', (3.5, 0.5, 0.15), (0.05, 0.05, 3.005)),
        cylinder('dark-iron', 0.15, 0.25, (-1.4, 0, 3.055), 'Z'),
        cylinder('brass', 0.18, 0.05, (-1.4, 0, 3.175), 'Z'),
        box('iron', (0.5, 0.3, 0.12), (1.2, 0, 3.14)),
    ]
    for x in (-1.05, 1.05):
        pieces += [torus('brass', 0.22, 0.04, (x, -0.36, 2.05)), cylinder('glass', 0.19, 0.04, (x, -0.35, 2.05), 'Y')]
    for x in stepped(-1.8, 1.8, 0.45):
        pieces += [cylinder('brass', 0.09, 0.05, (x, -0.4, z), 'X') for z in (0.62, 2.62)]
    pieces += rivet_row(-2.0, 2.0, 0.4, y=-0.41, z=0.2)
    pieces += rivet_frame(-1.05, 1.6, 1.3, 1.9, y=-0.35)
    pieces += rivet_frame(1.05, 1.6, 1.3, 1.9, y=-0.35)
    return pieces


def core_drive_pieces():
    pieces = [
        box('dark-iron', (1.6, 0.6, 0.3), (0, 0, 0.15)),
        box('iron', (1.2, 0.5, 1.1), (0, 0, 0.85)),
        sphere('core-glow', 0.38, (0, -0.2, 0.92), flatten=0.5),
        sphere('core-heart', 0.17, (0, -0.4, 0.92), flatten=0.5),
        torus('brass', 0.42, 0.07, (0, -0.3, 0.92)),
        cylinder('copper', 0.05, 1.6, (0, -0.32, 0.38), 'X'),
        cylinder('copper', 0.05, 0.9, (-0.7, -0.2, 0.75), 'Z'),
        cylinder('copper', 0.05, 0.9, (0.7, -0.2, 0.75), 'Z'),
        box('brass', (1.3, 0.55, 0.08), (0, 0, 1.44)),
    ]
    for x in (-0.5, 0.5):
        pieces += [
            cylinder('iron', 0.12, 0.5, (x, 0, 1.73), 'Z'),
            cylinder('brass', 0.15, 0.04, (x, 0, 1.6), 'Z'),
            cylinder('brass', 0.15, 0.04, (x, 0, 1.98), 'Z'),
            box('core-glow', (0.04, 0.02, 0.22), (x, -0.13, 1.76)),
        ]
    pieces += rivet_row(-0.6, 0.6, 0.3, y=-0.31, z=0.15)
    return pieces


# --- the bays (4.0 x 3.0 m each) -----------------------------------------------------------------


def bay_frame_pieces(metal, lamp_glass, lintel=None):
    """The shared bay: plinth, two pillars, a lintel with lamps and a dark enamel back wall (#45)."""
    pieces = [
        box('dark-iron', (4.0, 0.8, 0.35), (0, 0, 0.175)),
        box('enamel', (3.1, 0.2, 2.3), (0, 0.25, 1.5)),
        box(metal, (0.35, 0.6, 2.3), (-1.7, 0, 1.5)),
        box(metal, (0.35, 0.6, 2.3), (1.7, 0, 1.5)),
        box(lintel or metal, (4.0, 0.6, 0.35), (0, 0, 2.825)),
        box('brass', (4.0, 0.64, 0.05), (0, 0, 2.67)),
        box('brass', (0.43, 0.64, 0.06), (-1.7, 0, 0.4)),
        box('brass', (0.43, 0.64, 0.06), (1.7, 0, 0.4)),
    ]
    pieces += [sphere(lamp_glass, 0.1, (x, -0.32, 2.83)) for x in (-1.2, 1.2)]
    pieces += [cylinder('brass', 0.13, 0.05, (x, -0.3, 2.83), 'Y') for x in (-1.2, 1.2)]
    pieces += rivet_row(-1.8, 1.8, 0.4, y=-0.41, z=0.175)
    for x in (-1.7, 1.7):
        pieces += [rivet((x, -0.31, z)) for z in stepped(0.7, 2.4, 0.34)]
    return pieces


def assay_scale_pieces():
    """The Sell bay's motif: a hopper feeding an assay balance (#45)."""
    pieces = [
        frustum('copper', 0.6, 0.18, 0.7, (-0.75, -0.05, 1.95)),
        cylinder('copper', 0.12, 1.0, (-0.75, -0.05, 1.1), 'Z'),
        box('dark-iron', (0.5, 0.5, 0.25), (-0.75, -0.05, 0.475)),
        cylinder('brass', 0.05, 1.3, (0.6, -0.2, 1.0), 'Z'),
        box('brass', (0.4, 0.3, 0.08), (0.6, -0.2, 0.39)),
        box('brass', (1.3, 0.06, 0.07), (0.6, -0.3, 1.66)),
        sphere('brass', 0.07, (0.6, -0.33, 1.66)),
        box('brass', (0.04, 0.05, 0.3), (0.6, -0.36, 1.82)),
    ]
    for x in (0.0, 1.2):
        pieces += [
            cylinder('brass', 0.012, 0.5, (x - 0.12, -0.3, 1.42), 'Z'),
            cylinder('brass', 0.012, 0.5, (x + 0.12, -0.3, 1.42), 'Z'),
            cylinder('brass', 0.22, 0.05, (x, -0.3, 1.16), 'Z'),
        ]
    return pieces


def gear_and_wrench_pieces():
    """The Upgrade bay's motif: a big gear with a crossed wrench, and a hoist (#45)."""
    centre = (-0.55, -0.15, 1.55)
    pieces = [
        cylinder('steel', 0.5, 0.12, centre, 'Y'),
        cylinder('teal', 0.18, 0.16, centre, 'Y'),
        cylinder('dark-iron', 0.07, 0.2, centre, 'Y'),
    ]
    for tooth in range(12):
        angle = tooth * math.tau / 12
        x, z = centre[0] + 0.56 * math.cos(angle), centre[2] + 0.56 * math.sin(angle)
        pieces.append(box('steel', (0.16, 0.12, 0.14), (x, centre[1], z), turn_y=-angle))
    wrench_turn = math.radians(35)
    pieces += [
        box('steel', (0.11, 0.07, 1.0), (0.75, -0.28, 1.35), turn_y=wrench_turn),
        torus('steel', 0.13, 0.05, (1.04, -0.28, 1.76)),
        torus('steel', 0.1, 0.04, (0.46, -0.28, 0.94)),
        box('steel', (1.5, 0.1, 0.1), (0.7, -0.15, 2.45)),
        cylinder('dark-iron', 0.02, 0.4, (1.3, -0.15, 2.2), 'Z'),
        torus('brass', 0.07, 0.02, (1.3, -0.18, 1.96)),
    ]
    return pieces


# --- backdrop staging ----------------------------------------------------------------------------


def stage_backdrop(key_colour, accent_colour):
    """
    Camera, lights, floor and wall for the bay's screen backdrop. The bay sits right of centre,
    where #45 puts the backdrop's visible half beside the panel. The floor and wall are in the
    backdrop-staging collection, which the parts bake skips.
    """
    scene = bpy.context.scene
    staging = bpy.data.collections.new(STAGING_COLLECTION)
    scene.collection.children.link(staging)
    for piece in (box('floor', (24, 12, 0.2), (0, 3, -0.1)), box('wall', (24, 0.2, 10), (0, 1.2, 4))):
        piece.name = 'staging-' + piece.data.materials[0].name
        move_object_to(piece, staging)
    add_camera(scene)
    add_light('key', 'AREA', (-3.0, -5.0, 5.0), key_colour, 900, size=3.0)
    add_light('fill', 'AREA', (4.0, -6.0, 1.5), (0.6, 0.65, 0.75), 180, size=4.0)
    add_light('accent', 'POINT', (0.0, -0.9, 2.3), accent_colour, 60)
    world = bpy.data.worlds.new('backdrop-world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.008, 0.007, 0.006, 1.0)
    scene.world = world


def add_camera(scene):
    camera = bpy.data.objects.new('backdrop-camera', bpy.data.cameras.new('backdrop-camera'))
    camera.data.lens = 35
    camera.location = (-1.7, -8.5, 1.7)
    camera.rotation_euler = (math.radians(88), 0.0, 0.0)
    scene.collection.objects.link(camera)
    scene.camera = camera


def add_light(name, kind, location, colour, energy, size=None):
    light = bpy.data.lights.new(name, kind)
    light.color = colour
    light.energy = energy
    if size is not None:
        light.size = size
    obj = bpy.data.objects.new(name, light)
    obj.location = location
    if kind == 'AREA':
        aim_at(obj, (0.0, 0.0, 1.5))
    bpy.context.scene.collection.objects.link(obj)


def aim_at(obj, target):
    direction = [t - o for t, o in zip(target, obj.location)]
    obj.rotation_euler = Vector(direction).to_track_quat('-Z', 'Y').to_euler()


# --- parts from pieces ---------------------------------------------------------------------------


def build_part(part_id, pieces, at, z_order):
    """Joins the pieces into one mesh object named for the part, its origin the pivot at `at`."""
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    part = bpy.context.view_layer.objects.active
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    part.name = part_id
    part.data.name = part_id
    part.location = at
    part['z'] = z_order
    bevel = part.modifiers.new('bevel', 'BEVEL')
    bevel.width = 0.015
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    return part


def move_to_collection(obj, name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    move_object_to(obj, collection)


def move_object_to(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def box(material, size, centre, turn_y=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre, rotation=(0.0, turn_y, 0.0))
    return finish_piece(material, scale=size, smooth=False)


def cylinder(material, radius, length, centre, axis):
    rotation = {'X': (0.0, math.pi / 2, 0.0), 'Y': (math.pi / 2, 0.0, 0.0), 'Z': (0.0, 0.0, 0.0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=length, location=centre,
                                        rotation=rotation)
    return finish_piece(material, smooth=True)


def frustum(material, top_half_width, bottom_half_width, height, centre):
    """A square funnel, wide side up (the Sell bay's hopper)."""
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=bottom_half_width * math.sqrt(2),
                                    radius2=top_half_width * math.sqrt(2), depth=height,
                                    location=centre, rotation=(0.0, 0.0, math.pi / 4))
    return finish_piece(material, smooth=False)


def sphere(material, radius, centre, flatten=1.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=centre)
    return finish_piece(material, scale=(1.0, flatten, 1.0), smooth=True)


def torus(material, major, minor, centre):
    """A ring facing the camera (its axis along Y)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=10, location=centre, rotation=(math.pi / 2, 0.0, 0.0))
    return finish_piece(material, smooth=True)


def rivet(centre):
    return sphere('brass', 0.03, centre, flatten=0.6)


def rivet_row(start, stop, step, y, z):
    return [rivet((x, y, z)) for x in stepped(start, stop, step)]


def rivet_frame(cx, cz, width, height, y):
    """Rivets round a plate's edge, inset 0.08 m."""
    left, right = cx - width / 2 + 0.08, cx + width / 2 - 0.08
    bottom, top = cz - height / 2 + 0.08, cz + height / 2 - 0.08
    across = [(x, z) for x in stepped(left, right, 0.28) for z in (bottom, top)]
    down = [(x, z) for z in stepped(bottom + 0.28, top - 0.28, 0.28) for x in (left, right)]
    return [rivet((x, y, z)) for x, z in across + down]


def stepped(start, stop, step):
    count = int(round((stop - start) / step))
    return [start + step * index for index in range(count + 1)]


def finish_piece(material, scale=(1.0, 1.0, 1.0), smooth=False):
    piece = bpy.context.view_layer.objects.active
    piece.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if smooth:
        bpy.ops.object.shade_smooth()
    piece.data.materials.append(material_of(material))
    return piece


# --- materials -----------------------------------------------------------------------------------


def material_of(name):
    existing = bpy.data.materials.get(name)
    return existing if existing is not None else new_material(name)


def new_material(name):
    """A dielectric Principled BSDF with grime in the colour and (on parts) a fine bump, from noise."""
    colour, roughness, emission = PALETTE[name]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes['Principled BSDF']
    shader.inputs['Metallic'].default_value = 0.0
    shader.inputs['Roughness'].default_value = roughness
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 9.0
    noise.inputs['Detail'].default_value = 6.0
    grime = nodes.new('ShaderNodeMix')
    grime.data_type = 'RGBA'
    grime.inputs['A'].default_value = (*colour, 1.0)
    grime.inputs['B'].default_value = (*(channel * 0.62 for channel in colour), 1.0)
    links.new(noise.outputs['Fac'], grime.inputs['Factor'])
    links.new(grime.outputs['Result'], shader.inputs['Base Color'])
    if name not in SMOOTH_MATERIALS:
        add_fine_bump(nodes, links, shader)
    if emission > 0.0:
        shader.inputs['Emission Color'].default_value = (*colour, 1.0)
        shader.inputs['Emission Strength'].default_value = emission
    return material


def add_fine_bump(nodes, links, shader):
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    fine = nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 60.0
    links.new(fine.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])


AUTHORS = {
    'platform-hub': author_hub,
    'platform-bay-sell': author_sell_bay,
    'platform-bay-upgrade': author_upgrade_bay,
}

if __name__ == '__main__':
    main()
