"""
Renders a bay's screen backdrop (#51 "Bay screen backdrops", #45: the panel sits over a lit render
of its bay). The backdrop is rendered from the same .blend as the bay, so there is no second model:
export.sh opens art/blender/platform-bay-<bay>/ for `platform-bay-<bay>-backdrop`. The scene's
camera frames it; the floor, wall and lights that stage it sit in the `backdrop-staging`
collection (lights anywhere), which the parts bake skips. A part whose `backdrop_hidden` custom
property is set (a refinery look other than the one the backdrop shows) is left out of the render;
`hide_render` would also drop it from the parts bake.

The render is a single opaque map that ships as `<id>.albedo.ktx2` (sRGB, ETC1S) at the size in
art/asset-rules.json. Cycles on the CPU with a fixed seed, sample count and thread count, so an
unchanged .blend renders the same pixels and encodes to a byte-identical KTX2. (The intermediate
PNG still carries Cycles' render timings as text, which toktx ignores.)
"""

import os
import sys

import bpy

import asset_layout

STAGING_COLLECTION = 'backdrop-staging'
HIDDEN_PART_PROPERTY = 'backdrop_hidden'
RENDER_THREADS = 8


def export_backdrop(asset_id, rules):
    refuse_without_camera()
    hide_parts_kept_out_of_the_backdrop()
    configure_cycles_render(rules)
    render_to(albedo_path_of(asset_id))
    print('rendered backdrop %s at %dx%d' % (asset_id, *rules['backdropPx']))


def refuse_without_camera():
    if bpy.context.scene.camera is None:
        print('export refused: a backdrop needs the scene camera that frames it', file=sys.stderr)
        sys.exit(1)


def hide_parts_kept_out_of_the_backdrop():
    """The .blend is never saved, so hiding here leaves the source as it was."""
    for obj in bpy.context.scene.objects:
        if obj.get(HIDDEN_PART_PROPERTY):
            obj.hide_render = True


def configure_cycles_render(rules):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = rules['backdropSamples']
    scene.cycles.seed = 0
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = RENDER_THREADS
    scene.render.resolution_x, scene.render.resolution_y = rules['backdropPx']
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.use_stamp = False
    write_no_render_metadata(scene.render)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 15


def write_no_render_metadata(render):
    """Blender stamps the date, frame and file path into the PNG; none of it is the art."""
    for flag in dir(render):
        if flag.startswith('use_stamp_'):
            setattr(render, flag, False)


def albedo_path_of(asset_id):
    folder = asset_layout.bake_dir_of(asset_id)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, '%s.albedo.png' % asset_id)


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
