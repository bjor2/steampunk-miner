"""
Review renders of the service station (ticket 398): the building alone in the game's front view
and from three-quarters, the building on the pad with the casing driller parked at the Sell zone's
rest point, and the idle motion as the code poses it.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/service-station/render_service_station.py [-- front|turn|dock|idle|preview]
    python3 docs/art/service-station/sheet_service_station.py

The first reads art/blender/platform-building-sell/platform-building-sell.blend (and the vehicle's
source for `dock`) and writes the raw renders into build/ beside this file; the second (Blender's
Python has no PIL) lays them out into the committed sheets.

The frame is the art pipeline's (#52): 1 unit = 1 m, game right +X, up +Z, an orthographic camera
at -Y looking along +Y is the game's 2D view at a chosen pixel density. The origin is the Sell
zone's rest point; the vehicle's chassis centre rests 0.5 m above it (`bayRestPointOf`). The idle
frames pose the moving parts the way stationIdleMotion.ts does: the ore slides up the belt by a
share of one pitch, an arc or a spark is hidden (squashed flat) or flipped about its pivot.
Lighting is a dusk stage, a low warm key from the right and a cool violet fill; nothing here is
game code.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(HERE, 'build')
ASSET_ID = 'platform-building-sell'
VEHICLE_REST_Z = 0.5
TURN_PX_PER_M = 128
# 1080 px over the 12 m default zoom (#39): what a desktop screen shows of the dock.
DESKTOP_PX_PER_M = 90
SAMPLES = 48
BACKGROUND = (0.11, 0.07, 0.12)
PAD_COLOUR = (0.16, 0.15, 0.14)
# The belt the ore rides (author_service_station.py BELT_LOW to BELT_HIGH) and its cleat pitch.
BELT_LOW = (0.95, 0.52)
BELT_HIGH = (1.86, 1.98)
CONVEYOR_PITCH = 0.2
# Each idle frame: the share of a pitch the ore has slid, the arcs' and sparks' scale (0 hidden).
IDLE_FRAMES = (
    (0.0, (1, 0), (1, -1)),
    (0.25, (-1, 1), (0, 1)),
    (0.5, (0, -1), (-1, 0)),
    (0.75, (1, 1), (1, 1)),
)


def main():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for mode in requested or ['front', 'turn', 'dock', 'idle']:
        RENDERS[mode]()


def render_preview():
    stage(with_vehicle=True, samples=8)
    bpy.context.scene.render.film_transparent = False
    frame_orthographic((0.0, 4.0), 7.0, 9.0, 64)
    render_to('preview.png')


def render_front():
    stage(with_vehicle=False)
    frame_orthographic((0.0, 4.2), 7.0, 9.4, TURN_PX_PER_M)
    render_to('front.png')


def render_turn():
    stage(with_vehicle=False)
    frame_perspective((8.5, -11.0, 7.5), (0.0, 0.0, 3.8), 40.0, 1200, 1200)
    render_to('three-quarter.png')


def render_dock():
    """The building on the pad with the driller parked in the repair bay, at desktop density."""
    stage(with_vehicle=True)
    add_pad()
    frame_orthographic((0.0, 4.2), 8.0, 9.6, DESKTOP_PX_PER_M)
    render_to('dock.png')


def render_idle():
    """The moving parts in four poses, the building around them, at the turnaround density."""
    stage(with_vehicle=True)
    parts = {obj.name: obj for obj in bpy.context.scene.objects if obj.name.startswith('sell-')}
    rest = {name: obj.location.copy() for name, obj in parts.items()}
    for index, (slide, arcs, sparks) in enumerate(IDLE_FRAMES):
        pose_conveyor(parts['sell-conveyor'], rest['sell-conveyor'], slide)
        parts['sell-arc'].scale.z, parts['sell-arc-2'].scale.z = arcs
        parts['sell-spark'].scale.z, parts['sell-spark-2'].scale.z = sparks
        bpy.context.view_layer.update()
        frame_orthographic((0.0, 4.2), 7.0, 9.4, 64)
        render_to('idle-%d.png' % index)


def pose_conveyor(part, rest, slide):
    angle = math.atan2(BELT_HIGH[1] - BELT_LOW[1], BELT_HIGH[0] - BELT_LOW[0])
    along = slide * CONVEYOR_PITCH
    part.location = (rest.x + along * math.cos(angle), rest.y, rest.z + along * math.sin(angle))


# --- the stage -----------------------------------------------------------------------------------


def stage(with_vehicle, samples=SAMPLES):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    append_meshes(os.path.join(REPO_ROOT, 'art', 'blender', ASSET_ID, ASSET_ID + '.blend'))
    if with_vehicle:
        for obj in append_meshes(os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle', 'vehicle.blend'),
                                 prefix='t1-'):
            obj.location.z += VEHICLE_REST_Z
            obj.location.y -= 1.6
    bpy.context.view_layer.update()
    stage_lights_and_world(samples)


def append_meshes(path, prefix=''):
    """The file's mesh objects whose names start with `prefix` (the vehicle's tier-1 parts: `t1-`)."""
    with bpy.data.libraries.load(path, link=False) as (source, target):
        target.objects = [name for name in source.objects if name.startswith(prefix)]
    meshes = [obj for obj in target.objects if obj is not None and obj.type == 'MESH']
    for obj in meshes:
        bpy.context.scene.collection.objects.link(obj)
    return meshes


def add_pad():
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 1.0, -0.5))
    pad = bpy.context.view_layer.objects.active
    pad.scale = (12.0, 6.0, 1.0)
    material = bpy.data.materials.new('pad')
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*PAD_COLOUR, 1.0)
    shader.inputs['Roughness'].default_value = 0.9
    pad.data.materials.append(material)


def stage_lights_and_world(samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.seed = 0
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    world = bpy.data.worlds.new('dusk')
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (*BACKGROUND, 1.0)
    background.inputs['Strength'].default_value = 0.7
    scene.world = world
    add_sun('key', (1.0, 0.82, 0.62), 3.2, direction=(-0.55, 0.75, -0.35))
    add_sun('fill', (0.62, 0.66, 1.0), 1.0, direction=(0.5, 0.85, 0.1))


def add_sun(name, colour, energy, direction):
    light = bpy.data.lights.new(name, 'SUN')
    light.color = colour
    light.energy = energy
    light.angle = math.radians(8)
    obj = bpy.data.objects.new(name, light)
    obj.location = (0.0, -20.0, 10.0)
    obj.rotation_euler = Vector(direction).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(obj)


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


def render_to(name):
    os.makedirs(BUILD, exist_ok=True)
    bpy.context.scene.render.filepath = os.path.join(BUILD, name)
    bpy.ops.render.render(write_still=True)


RENDERS = {
    'preview': render_preview,
    'front': render_front,
    'turn': render_turn,
    'dock': render_dock,
    'idle': render_idle,
}

if __name__ == '__main__':
    main()
