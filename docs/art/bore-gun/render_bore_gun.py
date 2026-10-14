"""
Review renders of the bore gun mount (#362, the art half of #315, for the GD decision on #309):
the gun alone across its aim arc, front and three-quarter, and the gun on the tier-1 and tier-3
rig at a review placement under the drill's nose.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/bore-gun/render_bore_gun.py
    python3 docs/art/bore-gun/sheet_bore_gun.py

The first reads the sources art/blender/vehicle-bore-gun/ and art/blender/vehicle/ and writes the
renders into this folder; the second (Blender's Python has no PIL) writes the grayscale sheets and
resamples the rig to what a 1080p screen shows at the default zoom.

The frame is the art pipeline's (#52): 1 unit = 1 m, game right +X, up +Z, an orthographic camera
at -Y looking along +Y is the game's 2D view. The review placement (`REVIEW_MOUNT_AT`) is only
where these renders hang the gun; the attach id and its point are the TD's (#314, #250, #235).
Lighting is the dynamite renders' warm key and cool fill; nothing here is game code.
"""

import math
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
GUN_ID = 'vehicle-bore-gun'
VEHICLE_ID = 'vehicle'
BARREL_PART = 't1-bore-barrel'
# The #309 arc: horizontal (the facing bearing) down to 60 degrees below, the excluded cone's edge.
ARC_DEGREES = (0, 30, 60)
ARC_PITCH_M = 0.55
# On the hull's front face under the drill head (near `hull.front`), nearer the camera than the
# chassis so it draws over it; the barrel then swings below the drill and in front of wheel 3.
REVIEW_MOUNT_AT = (0.47, -0.12, -0.12)
REVIEW_AIM_DEGREES = 30
GUN_PX_PER_M = 768
RIG_PX_PER_M = 512
SAMPLES = 32
BACKGROUND = (0.07, 0.055, 0.05)


def main():
    stage_arc()
    render_arc()
    for tier in (1, 3):
        stage_rig(tier)
        render_rig(tier)


# --- scenes --------------------------------------------------------------------------------------


def source_path(asset_id):
    return os.path.join(REPO_ROOT, 'art', 'blender', asset_id, asset_id + '.blend')


def empty_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage_lights_and_world()


def stage_arc():
    """Three copies of the gun side by side, the barrel at 0, 30 and 60 degrees below horizontal."""
    empty_scene()
    for index, degrees in enumerate(ARC_DEGREES):
        offset = Vector((index * ARC_PITCH_M, 0.0, 0.0))
        for obj in append_parts_of(GUN_ID):
            obj.location += offset
            aim_if_barrel(obj, degrees)
    bpy.context.view_layer.update()


def stage_rig(tier):
    """The rig's parts at `tier` with the gun bolted on at the review placement, aimed 30 degrees down."""
    empty_scene()
    for obj in append_parts_of(VEHICLE_ID):
        if not is_shown_at_tier(obj.name, tier):
            bpy.data.objects.remove(obj)
    for obj in append_parts_of(GUN_ID):
        obj.location += Vector(REVIEW_MOUNT_AT)
        aim_if_barrel(obj, REVIEW_AIM_DEGREES)
    bpy.context.view_layer.update()


def aim_if_barrel(obj, degrees_below):
    """A turn about +Y takes +X towards -Z: positive degrees aim the barrel down."""
    if obj.name.startswith(BARREL_PART):
        obj.rotation_euler = (0.0, math.radians(degrees_below), 0.0)


def is_shown_at_tier(part_name, tier):
    """A tier's own parts, plus each lower-tier part no part of the shown tiers replaces (#52)."""
    part_tier, base = int(part_name[1]), part_name.split('-', 1)[1]
    replacing = [t for t in range(part_tier + 1, tier + 1) if bpy.data.objects.get('t%d-%s' % (t, base))]
    return part_tier <= tier and not replacing


def append_parts_of(asset_id):
    with bpy.data.libraries.load(source_path(asset_id), link=False) as (source, target):
        target.objects = list(source.objects)
    parts = [obj for obj in target.objects if obj is not None and obj.type == 'MESH']
    for obj in parts:
        bpy.context.scene.collection.objects.link(obj)
    return parts


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


def framed_bounds(margin_m):
    min_x, min_z, max_x, max_z = mesh_bounds()
    width, height = max_x - min_x + margin_m, max_z - min_z + margin_m
    return ((min_x + max_x) / 2, (min_z + max_z) / 2), width, height


# --- renders -------------------------------------------------------------------------------------


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def output_path(name):
    return os.path.join(HERE, name)


def render_arc():
    """The gun alone at 0, 30 and 60 degrees: the game's front view at 768 px/m, then three-quarter."""
    centre, width, height = framed_bounds(0.08)
    frame_orthographic(centre, width, height, GUN_PX_PER_M)
    render_to(output_path('gun.arc.raw.png'))
    eye = (centre[0] + width * 0.6, -width * 1.6, centre[1] + height * 1.6)
    frame_perspective(eye, (centre[0], 0.0, centre[1]), 50.0, 1600, 700)
    render_to(output_path('gun.three-quarter.raw.png'))


def render_rig(tier):
    """The rig with the gun at 512 px/m in the game's front view."""
    centre, width, height = framed_bounds(0.12)
    frame_orthographic(centre, width, height, RIG_PX_PER_M)
    render_to(output_path('rig.tier-%d.raw.png' % tier))


if __name__ == '__main__':
    main()
