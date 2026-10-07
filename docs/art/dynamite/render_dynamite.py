"""
Review renders of the dynamite sizes (#145, for the #153 look and the #143 ladder): the rack with
its ten stick models and the wire reel, front and three-quarter, and the ten planted props as a
ladder on their tiles, front and three-quarter.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/dynamite/render_dynamite.py
    python3 docs/art/dynamite/sheet_dynamite.py

The first reads the sources art/blender/vehicle-dynamite-rack/ and art/blender/prop-dynamite-charge/
and writes the renders into this folder; the second (Blender's Python has no PIL) writes the
grayscale sheets and resamples the ladder to what a 1080p screen shows at the default zoom.

The frame is the art pipeline's (#52): 1 unit = 1 m, game right +X, up +Z, an orthographic camera
at -Y looking along +Y is the game's 2D view at a chosen pixel density. Every planted size is
authored at the origin (the build draws one at the charge's tile), so the ladder spreads them a
tile and a bit apart, each on a 1 m tile of band rock. Lighting is a warm key from the front
top-left and a cool fill, as the shop renders; nothing here is game code.
"""

import math
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
RACK_ID = 'vehicle-dynamite-rack'
PROP_ID = 'prop-dynamite-charge'
SIZE_COUNT = 10
LADDER_PITCH_M = 1.25
RACK_PX_PER_M = 768
LADDER_PX_PER_M = 256
SAMPLES = 32
BACKGROUND = (0.07, 0.055, 0.05)
# Planet 1's band-2 rock, about where the first charges are planted.
TILE_COLOUR = (0.21, 0.17, 0.13)


def main():
    open_source(RACK_ID)
    stage_lights_and_world()
    render_rack()
    stage_ladder()
    render_ladder()


# --- scenes --------------------------------------------------------------------------------------


def source_path(asset_id):
    return os.path.join(REPO_ROOT, 'art', 'blender', asset_id, asset_id + '.blend')


def open_source(asset_id):
    bpy.ops.wm.open_mainfile(filepath=source_path(asset_id))


def stage_ladder():
    """The ten planted sizes side by side, each on its own tile, size 1 on the left."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in append_parts_of(PROP_ID):
        obj.location.x += ladder_x(size_of(obj.name))
    for size in range(1, SIZE_COUNT + 1):
        add_tile(ladder_x(size))
    stage_lights_and_world()


def ladder_x(size):
    return (size - 1 - (SIZE_COUNT - 1) / 2) * LADDER_PITCH_M


def size_of(part_name):
    return int(part_name.rsplit('-', 1)[1])


def append_parts_of(asset_id):
    with bpy.data.libraries.load(source_path(asset_id), link=False) as (source, target):
        target.objects = list(source.objects)
    parts = [obj for obj in target.objects if obj is not None and obj.type == 'MESH']
    for obj in parts:
        bpy.context.scene.collection.objects.link(obj)
    return parts


def add_tile(x):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, 0.6, 0.0))
    tile = bpy.context.view_layer.objects.active
    tile.scale = (1.0, 0.2, 1.0)
    tile.data.materials.append(tile_material())


def tile_material():
    existing = bpy.data.materials.get('review-tile')
    if existing is not None:
        return existing
    material = bpy.data.materials.new('review-tile')
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*TILE_COLOUR, 1.0)
    shader.inputs['Roughness'].default_value = 0.9
    return material


def stage_lights_and_world():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.seed = 0
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    world = bpy.data.worlds.new('review')
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (*BACKGROUND, 1.0)
    background.inputs['Strength'].default_value = 0.6
    scene.world = world
    add_sun('key', (1.0, 0.93, 0.82), 3.5, direction=(0.35, 0.8, -0.5))
    add_sun('fill', (0.75, 0.82, 0.95), 0.8, direction=(-0.4, 0.9, 0.2))


def add_sun(name, colour, energy, direction):
    light = bpy.data.lights.new(name, 'SUN')
    light.color = colour
    light.energy = energy
    light.angle = math.radians(8)
    obj = bpy.data.objects.new(name, light)
    obj.location = (0.0, -20.0, 10.0)
    obj.rotation_euler = Vector(direction).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(obj)


# --- cameras -------------------------------------------------------------------------------------


def scene_camera():
    scene = bpy.context.scene
    if scene.camera is None:
        camera = bpy.data.objects.new('review-camera', bpy.data.cameras.new('review-camera'))
        camera.data.clip_end = 200.0
        scene.collection.objects.link(camera)
        scene.camera = camera
    return scene.camera


def frame_orthographic(centre, width_m, height_m, px_per_m):
    scene = bpy.context.scene
    camera = scene_camera()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = max(width_m, height_m)
    camera.location = (centre[0], -40.0, centre[1])
    camera.rotation_euler = (math.pi / 2, 0.0, 0.0)
    scene.render.resolution_x = round(width_m * px_per_m)
    scene.render.resolution_y = round(height_m * px_per_m)
    scene.render.resolution_percentage = 100


def frame_perspective(eye, target, focal_mm, width_px, height_px):
    scene = bpy.context.scene
    camera = scene_camera()
    camera.data.type = 'PERSP'
    camera.data.lens = focal_mm
    camera.location = eye
    camera.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = width_px
    scene.render.resolution_y = height_px
    scene.render.resolution_percentage = 100


def mesh_bounds():
    """(min x, min z, max x, max z) over every mesh in the scene, world space."""
    corners = [obj.matrix_world @ Vector(corner) for obj in bpy.context.scene.objects
               if obj.type == 'MESH' for corner in obj.bound_box]
    xs, zs = [c.x for c in corners], [c.z for c in corners]
    return min(xs), min(zs), max(xs), max(zs)


# --- renders -------------------------------------------------------------------------------------


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def output_path(name):
    return os.path.join(HERE, name)


def render_rack():
    """The rack alone: the game's front view at 768 px/m, then a three-quarter view."""
    min_x, min_z, max_x, max_z = mesh_bounds()
    width, height = max_x - min_x + 0.1, max_z - min_z + 0.1
    centre = ((min_x + max_x) / 2, (min_z + max_z) / 2)
    frame_orthographic(centre, width, height, RACK_PX_PER_M)
    render_to(output_path('rack.front.raw.png'))
    eye = (centre[0] + width * 1.3, -max(width, height) * 1.8, centre[1] + height * 0.7)
    frame_perspective(eye, (centre[0], 0.0, centre[1]), 50.0, 1000, 1000)
    render_to(output_path('rack.three-quarter.raw.png'))


def render_ladder():
    """The ten sizes on their tiles at 256 px/m, then the same from front-right and above."""
    width = SIZE_COUNT * LADDER_PITCH_M + 0.5
    height = 1.4
    frame_orthographic((0.0, 0.0), width, height, LADDER_PX_PER_M)
    render_to(output_path('planted.ladder.raw.png'))
    eye = (width * 0.3, -width * 1.15, height * 3.5)
    frame_perspective(eye, (0.0, 0.0, 0.0), 40.0, 2400, 720)
    render_to(output_path('planted.three-quarter.raw.png'))


if __name__ == '__main__':
    main()
