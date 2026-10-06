"""
The ore ladder's stage (#150): one scene per style direction, five 1 m ore cells in a row, seen the
way the game sees them. The frame is the art pipeline's (#52): metric, 1 unit = 1 m = one world
cell, game right +X, game up +Z, Y is depth. An orthographic camera at -Y looks along +Y, so a
render is the game's 2D view at a chosen pixel density: 256 px/m is the ground bake density
(`art/asset-rules.json`) and the Game Director's grayscale test size (#151).

Renders use Cycles on the CPU with a fixed seed. The compositor's fog glow stands in for the
game's bloom pass (`src/scene/postPipeline.ts`), so emissive tiers bloom the way they would in play.
"""

import json
import math
import os

import bpy
import numpy as np
from mathutils import Vector

import ore_materials as materials
import ore_shapes as shapes

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

TILE_M = 1.0
TILE_PITCH_M = 1.1
GRADES = (1, 2, 3, 4, 5)
LADDER_WIDTH_M = TILE_PITCH_M * len(GRADES)
LADDER_HEIGHT_M = TILE_PITCH_M
LADDER_PX_PER_M = 256
CLOSEUP_PX_PER_M = 480
# 256 / 3 is 85 px/m, about the 90 px/m a 1080p screen shows at the default 12 m zoom (#39).
IN_GAME_DOWNSAMPLE = 3
MOTION_FRAMES = (1, 2, 3)
PEAK_FRAME = 2
SAMPLES = 64
BACKGROUND_HEX = '#120d0c'
BAND_COUNT = 5
GLOW_THRESHOLD = 1.0


def tile_x_of(grade):
    return (grade - 3) * TILE_PITCH_M


# --- the scene -------------------------------------------------------------------------------------


def reset_scene():
    """Empties the open file in place; reloading the home file would drop the MCP's output capture."""
    purge_scene_contents()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.frame_start, scene.frame_end = MOTION_FRAMES[0], MOTION_FRAMES[-1]
    set_render_engine(scene)
    set_colour_management(scene)
    set_world(scene)
    enable_glow(scene)
    return scene


def purge_scene_contents():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
                  bpy.data.images, bpy.data.worlds, bpy.data.actions):
        for item in list(block):
            if getattr(item, 'type', None) not in ('RENDER_RESULT', 'COMPOSITING'):
                block.remove(item)
    bpy.context.scene.camera = None


def set_render_engine(scene):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.seed = 0
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.transmission_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.render.use_persistent_data = True
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.compression = 60


def set_colour_management(scene):
    """The game draws sRGB values as authored, so no filmic curve sits between us and the colours."""
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def set_world(scene):
    world = bpy.data.worlds.new('ore-ladder')
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs['Color'].default_value = materials.rgba(materials.linear_of_hex(BACKGROUND_HEX))
    background.inputs['Strength'].default_value = 1.0
    scene.world = world


def enable_glow(scene):
    """The game blooms what is brighter than its threshold; the compositor's fog glow stands in."""
    scene.use_nodes = True
    tree = scene.node_tree
    for node in list(tree.nodes):
        tree.nodes.remove(node)
    layers = tree.nodes.new('CompositorNodeRLayers')
    glare = tree.nodes.new('CompositorNodeGlare')
    glare.glare_type = 'FOG_GLOW'
    glare.quality = 'HIGH'
    glare.threshold = GLOW_THRESHOLD
    glare.size = 7
    glare.mix = 0.0
    composite = tree.nodes.new('CompositorNodeComposite')
    tree.links.new(layers.outputs['Image'], glare.inputs['Image'])
    tree.links.new(glare.outputs['Image'], composite.inputs['Image'])


# --- light -----------------------------------------------------------------------------------------


def add_lamp_rig():
    """The game's light (#13): a warm headlamp from the front, top-left, and a weak cool fill."""
    key = bpy.data.lights.new('key', 'SUN')
    key.energy = 3.0
    key.color = materials.linear_of_hex('#fff1dc')
    key.angle = math.radians(6)
    aim_light(link_object(bpy.data.objects.new('key', key), (0, -4, 3)), (0.35, 0.8, -0.45))
    fill = bpy.data.lights.new('fill', 'AREA')
    fill.energy = 120.0
    fill.size = 8.0
    fill.color = materials.linear_of_hex('#c8d4e6')
    aim_light(link_object(bpy.data.objects.new('fill', fill), (0, -3.5, 0.6)), (0.0, 1.0, -0.15))


def add_point_light(name, location, hex_colour, watts, radius=0.08):
    light = bpy.data.lights.new(name, 'POINT')
    light.energy = watts
    light.color = materials.linear_of_hex(hex_colour)
    light.shadow_soft_size = radius
    return link_object(bpy.data.objects.new(name, light), location)


def aim_light(obj, direction):
    obj.rotation_euler = Vector(direction).to_track_quat('-Z', 'Y').to_euler()
    return obj


def link_object(obj, location):
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


# --- host rock -------------------------------------------------------------------------------------


def band_colour_hex(band):
    """Planet 1's band colour, surface to deep, mixed in display values like bandPalette.ts."""
    path = os.path.join(REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')
    with open(path, encoding='utf-8') as file:
        palette = json.load(file)['palettes']['palette.planet_1']
    return materials.mix_hex(palette['surface'], palette['deep'], (band - 1) / (BAND_COUNT - 1))


def add_rock_slab(grade, material):
    """A 1 m cell of rock, 0.25 m thick behind the face at y = 0."""
    slab = shapes.add_cube('rock-g%d' % grade, TILE_M, (tile_x_of(grade), 0.125, 0.0), scale=(1.0, 0.25, 1.0))
    return shapes.assign(slab, material)


# --- cameras ---------------------------------------------------------------------------------------


def frame_orthographic(centre_x, width_m, height_m, px_per_m):
    scene = bpy.context.scene
    camera = scene_camera()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = max(width_m, height_m)
    camera.location = (centre_x, -6.0, 0.0)
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


def frame_ladder():
    frame_orthographic(tile_x_of(3), LADDER_WIDTH_M, LADDER_HEIGHT_M, LADDER_PX_PER_M)


def scene_camera():
    scene = bpy.context.scene
    if scene.camera is None:
        camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
        camera.data.clip_start = 0.1
        camera.data.clip_end = 50.0
        bpy.context.collection.objects.link(camera)
        scene.camera = camera
    return scene.camera


# --- renders ---------------------------------------------------------------------------------------


def render_frame_to(path, frame):
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def render_ladder_sheet(path):
    frame_ladder()
    return render_frame_to(path, PEAK_FRAME)


def render_closeup(path):
    frame_orthographic(tile_x_of(3), LADDER_WIDTH_M, LADDER_HEIGHT_M, CLOSEUP_PX_PER_M)
    return render_frame_to(path, PEAK_FRAME)


def render_motion_strip(path):
    """Grades 4 and 5 over the three pulse frames, stacked top to bottom."""
    centre = (tile_x_of(4) + tile_x_of(5)) / 2
    frame_orthographic(centre, 2 * TILE_PITCH_M, LADDER_HEIGHT_M, LADDER_PX_PER_M)
    frames = [read_pixels(render_frame_to(path + '.frame%d.png' % frame, frame)) for frame in MOTION_FRAMES]
    for frame in MOTION_FRAMES:
        os.remove(path + '.frame%d.png' % frame)
    write_png(path, np.concatenate(frames, axis=0))
    return path


def render_three_quarter(path):
    """Grades 3 to 5 from front-right and above, to show the relief the flat view only hints at."""
    target = (tile_x_of(4), 0.0, 0.0)
    eye = (tile_x_of(4) + 1.9, -2.4, 1.5)
    frame_perspective(eye, target, 45.0, 1200, 480)
    return render_frame_to(path, PEAK_FRAME)


def save_blend(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    return path


# --- image post: grayscale, in-game size, luma report -----------------------------------------------


def read_pixels(path):
    """Display-space RGB, rows top-down, shape (height, width, 3)."""
    image = bpy.data.images.load(path, check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)[::-1, :, :3].copy()


def write_png(path, rgb):
    height, width = rgb.shape[:2]
    image = bpy.data.images.new(os.path.basename(path), width, height, alpha=False)
    with_alpha = np.concatenate([rgb[::-1], np.ones((height, width, 1), dtype=np.float32)], axis=2)
    image.pixels.foreach_set(np.ascontiguousarray(with_alpha, dtype=np.float32).ravel())
    image.save_render(filepath=path)
    bpy.data.images.remove(image)
    return path


def luma_of(rgb):
    """Rec. 709 luma of display-space pixels, computed in linear light."""
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    return linear @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def display_of_linear(channel):
    return np.where(channel <= 0.0031308, channel * 12.92, 1.055 * np.power(channel, 1 / 2.4) - 0.055)


def write_grayscale(src, dst):
    gray = display_of_linear(luma_of(read_pixels(src)))
    return write_png(dst, np.repeat(gray[:, :, None], 3, axis=2))


def write_downsampled(src, dst, factor):
    rgb = read_pixels(src)
    height, width = (rgb.shape[0] // factor) * factor, (rgb.shape[1] // factor) * factor
    boxed = rgb[:height, :width].reshape(height // factor, factor, width // factor, factor, 3).mean(axis=(1, 3))
    return write_png(dst, boxed)


def report_tile_luma(ladder_png, dst_json):
    """
    Mean luma of each cell's ore area (the central 0.7 m) and its rock margin (the outer 0.1 m),
    and the WCAG-style contrast between them. The order of the ore lumas is the grayscale test.
    """
    luma = luma_of(read_pixels(ladder_png))
    rows = [tile_luma_row(luma, grade) for grade in GRADES]
    report = {'pxPerMetre': LADDER_PX_PER_M, 'tiles': rows,
              'oreLumaRisesWithGrade': all(a['oreLuma'] < b['oreLuma'] for a, b in zip(rows, rows[1:]))}
    with open(dst_json, 'w', encoding='utf-8') as file:
        json.dump(report, file, indent=2)
        file.write('\n')
    return report


def tile_luma_row(luma, grade):
    px = LADDER_PX_PER_M
    left = LADDER_WIDTH_M / 2 + tile_x_of(grade) - TILE_M / 2
    top = LADDER_HEIGHT_M / 2 - TILE_M / 2
    cell = luma[round(top * px):round((top + TILE_M) * px), round(left * px):round((left + TILE_M) * px)]
    inset = round(0.15 * px)
    ore = cell[inset:-inset, inset:-inset]
    margin = cell.copy()
    margin[round(0.1 * px):-round(0.1 * px), round(0.1 * px):-round(0.1 * px)] = np.nan
    ore_luma, rock_luma = float(ore.mean()), float(np.nanmean(margin))
    contrast = (max(ore_luma, rock_luma) + 0.05) / (min(ore_luma, rock_luma) + 0.05)
    return {'grade': grade, 'oreLuma': round(ore_luma, 4), 'rockLuma': round(rock_luma, 4),
            'orePeakLuma': round(float(ore.max()), 4), 'contrast': round(contrast, 2)}


# --- animation -------------------------------------------------------------------------------------


def blink(objects, visible_frames):
    """Shows the objects only on the given frames (sparkle sets, alternating arcs)."""
    for obj in objects:
        for frame in MOTION_FRAMES:
            obj.hide_render = frame not in visible_frames
            obj.keyframe_insert('hide_render', frame=frame)
        obj.hide_render = PEAK_FRAME not in visible_frames
