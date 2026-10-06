"""
Review renders of the two shop buildings (#174, spec #170 "Acceptance: art review"): a turnaround
of each building, the pair on the dock as the game frames it, and the grayscale silhouette pair.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/shops/render_shops.py
    python3 docs/art/shops/sheet_shops.py

The first reads the exported sources art/blender/platform-building-<bay>/ and writes the renders
into this folder; the second (Blender's Python has no PIL) resamples the pair to the #173 phone,
writes the grayscale sheets and cuts the silhouette pair from the render's coverage.

The frame is the art pipeline's (#52): 1 unit = 1 m, game right +X, up +Z, an orthographic camera
at -Y looking along +Y is the game's 2D view at a chosen pixel density. The pair sheet puts
the Sell shop at -5 m and the Workshop at +7 m from the dock point, the #170 zone centres, on a
pad from -8 to +12, and is rendered at 1080p's density at the default zoom (90 px/m). Lighting is
a warm key from the front top-left and a cool fill, as the ore ladder's stage; nothing here is
game code.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILDINGS = {'platform-building-sell': -5.0, 'platform-building-upgrade': 7.0}
PAD_COLUMNS = (-8, 12)
TURNAROUND_PX_PER_M = 128
# 1080 px over the 12 m default zoom (#39): what a desktop screen shows of the dock.
DESKTOP_PX_PER_M = 90
SAMPLES = 48
BACKGROUND = (0.07, 0.055, 0.05)
PAD_COLOUR = (0.16, 0.15, 0.14)


def main():
    for asset_id in BUILDINGS:
        open_source(asset_id)
        stage_lights_and_world()
        render_turnaround(asset_id)
    stage_pair()
    render_pair()


# --- scenes --------------------------------------------------------------------------------------


def open_source(asset_id):
    path = os.path.join(REPO_ROOT, 'art', 'blender', asset_id, asset_id + '.blend')
    bpy.ops.wm.open_mainfile(filepath=path)


def stage_pair():
    """Both buildings at their zone centres on the pad, as #175 will place them."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for asset_id, centre_x in BUILDINGS.items():
        for obj in append_parts_of(asset_id):
            obj.location.x += centre_x
    add_pad()
    stage_lights_and_world()


def append_parts_of(asset_id):
    path = os.path.join(REPO_ROOT, 'art', 'blender', asset_id, asset_id + '.blend')
    with bpy.data.libraries.load(path, link=False) as (source, target):
        target.objects = list(source.objects)
    parts = [obj for obj in target.objects if obj is not None and obj.type == 'MESH']
    for obj in parts:
        bpy.context.scene.collection.objects.link(obj)
    return parts


def add_pad():
    first, last = PAD_COLUMNS
    width = last - first + 1
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=((first + last + 1) / 2, 2.0, -0.5))
    pad = bpy.context.active_object
    pad.scale = (width, 6.0, 1.0)
    material = bpy.data.materials.new('pad')
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*PAD_COLOUR, 1.0)
    shader.inputs['Roughness'].default_value = 0.9
    pad.data.materials.append(material)


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


def render_turnaround(asset_id):
    """The building alone: the game's front view at 128 px/m, then a three-quarter view."""
    min_x, min_z, max_x, max_z = mesh_bounds()
    width, height = max_x - min_x + 1.0, max_z - min_z + 1.0
    centre = ((min_x + max_x) / 2, (min_z + max_z) / 2)
    frame_orthographic(centre, width, height, TURNAROUND_PX_PER_M)
    render_to(output_path(asset_id + '.front.png'))
    eye = (centre[0] + width * 1.1, -max(width, height) * 1.6, centre[1] + height * 0.6)
    frame_perspective(eye, (centre[0], 0.0, centre[1]), 40.0, 1200, 900)
    render_to(output_path(asset_id + '.three-quarter.png'))


def render_pair():
    """The dock from the Sell shop's left edge to the Workshop's right edge, at desktop density."""
    first, last = PAD_COLUMNS
    width = last - first + 3
    height = 12.5
    frame_orthographic(((first + last + 1) / 2, height / 2 - 1.0), width, height, DESKTOP_PX_PER_M)
    return render_to(output_path('pair.desktop.raw.png'))


if __name__ == '__main__':
    main()
