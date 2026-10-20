"""
Authors the drawn mineral skin layers (#576, ticket 592 onward): for every base, vein and sheen
layer of the mineral-skins slice's `mineralSkins.json` (or only the ids given), one .blend under
blend/ (the recipe of layer_art.py staged on the 1 m cell with the game's orthographic camera) and
its 256 px render into art/build/mineral-skins/ for skin_post.py, then the cell table
skin-layers.json. Run headless:

  BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
    -P docs/art/mineral-skins/author_skin_layers.py -- [<kind>/<id> ...]

or through the MCP: add this folder to sys.path, `import author_skin_layers`, `author()`.
"""

import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
for folder in (HERE, os.path.normpath(os.path.join(HERE, '..', 'ores')), os.path.normpath(os.path.join(HERE, '..', 'ore-ladder'))):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import layer_art as art  # noqa: E402
import ore_stage as stage  # noqa: E402
import skin_layers as layers  # noqa: E402

BLEND_DIR = os.path.join(HERE, 'blend')
TEXTURE_SAMPLES = 16
VEIN_SAMPLES = 32
# The vein is lit on the rock of band 3, the middle of the P1 bands; the rock is held out of the cell.
VEIN_ROCK_BAND = 3


def main():
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    author(wanted)


def author(wanted=()):
    for module in (layers, art):
        importlib.reload(module)
    for folder in (BLEND_DIR, layers.BUILD_DIR):
        os.makedirs(folder, exist_ok=True)
    drawn = [(kind, entry['id']) for kind in layers.DRAWN_KINDS for entry in layers.load_skins()['layers'][kind]]
    chosen = [(kind, layer_id) for kind, layer_id in drawn if not wanted or '%s/%s' % (kind, layer_id) in wanted]
    for kind, layer_id in chosen:
        author_layer(kind, layer_id)
    layers.write_cell_table()
    print('authored %d skin layers' % len(chosen))


def author_layer(kind, layer_id):
    recipe = art.recipe_of(kind, layer_id)
    stage.reset_scene()
    if kind == 'vein':
        stage_vein(kind, layer_id, recipe)
    else:
        stage_texture(kind, layer_id, recipe)
    frame_cell()
    stage.save_blend(os.path.join(HERE, layers.blend_path(kind, layer_id)))
    render_cell(kind, layer_id)
    print('authored %s/%s' % (kind, layer_id))


def stage_texture(kind, layer_id, recipe):
    art.add_texture_quad('%s-%s' % (kind, layer_id), recipe)
    scene = bpy.context.scene
    # The emission value is the cell's value: no view curve, no denoiser, no glow.
    scene.view_settings.view_transform = 'Raw'
    scene.cycles.samples = TEXTURE_SAMPLES
    scene.cycles.use_denoising = False
    scene.use_nodes = False
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = 'RGB'


def stage_vein(kind, layer_id, recipe):
    stage.add_lamp_rig('shallow')
    rock = stage.add_rock_slab('rock', (0.0, 0.0), stage.band_colour_hex(VEIN_ROCK_BAND))
    recipe(art.rng_of(kind, layer_id), art.vein_material())
    scene = bpy.context.scene
    scene.cycles.samples = VEIN_SAMPLES
    # The rock held out: what stands off the face keeps its shading, the rock is transparent.
    rock.is_holdout = True
    scene.render.film_transparent = True
    scene.use_nodes = False
    scene.render.image_settings.color_mode = 'RGBA'


def frame_cell():
    """The 1 m cell alone at 256 px/m, the camera at -Y as the game sees the face."""
    stage.frame_grid(1, 1)
    scene = bpy.context.scene
    scene.camera.data.ortho_scale = art.CELL_M
    scene.render.resolution_x = scene.render.resolution_y = layers.CELL_PX


def render_cell(kind, layer_id):
    return stage.render_to(os.path.join(layers.BUILD_DIR, '%s-%s.png' % (kind, layer_id)))


if __name__ == '__main__':
    main()
