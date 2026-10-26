"""
Authors the gem-cut library (ticket 889) on the ore stage (docs/art/ores): one .blend per cut (its
1 m cell on the gems' review rock, the lamp rig and the game's orthographic camera), the 248 px lit
neutral sprite of each (the rock held out, so the alpha is the mask) into art/build/gem-cuts/ for
cut_post.py, the cell table, and the review sheet of every cut in two rows (`--sheets-only` renders the sheet
alone; the closeup is left out, since 24 cells at 480 px a metre is more than the shared box
renders in one go). Run headless:

  BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
    -P docs/art/gem-cuts/author_gem_cuts.py -- [cut-id ...] [--no-sheets]

or through the MCP: add this folder, docs/art/ore-heroes, docs/art/ores and docs/art/ore-ladder to
sys.path, `import author_gem_cuts`, `author_gem_cuts.author()`.
"""

import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
for folder in (HERE, os.path.normpath(os.path.join(HERE, '..', 'ore-heroes')), os.path.normpath(os.path.join(HERE, '..', 'ores')),
               os.path.normpath(os.path.join(HERE, '..', 'ore-ladder'))):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import cut_marks  # noqa: E402
import gem_cuts as library  # noqa: E402
import ore_stage as stage  # noqa: E402

BLEND_DIR = os.path.join(HERE, 'blend')
SHEET_DIR = os.path.join(HERE, 'sheets')
BUILD_DIR = os.path.join(library.REPO_ROOT, 'art', 'build', 'gem-cuts')
SPRITE_PX = library.ATLAS['contentPx']
SHEET_COLUMNS = 12


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ids = [arg for arg in argv if not arg.startswith('--')]
    if '--sheets-only' in argv:
        render_sheet(library.load_library())
        return
    author(ids or None, sheets='--no-sheets' not in argv)


def author(cut_ids=None, sheets=True):
    importlib.reload(library)
    importlib.reload(cut_marks)
    cuts = [cut for cut in library.load_library() if cut_ids is None or cut['id'] in cut_ids]
    for folder in (BLEND_DIR, SHEET_DIR, BUILD_DIR):
        os.makedirs(folder, exist_ok=True)
    for cut in cuts:
        author_cut(cut)
    library.write_cell_table()
    if sheets:
        render_sheet(library.load_library())
    print('authored %d gem cuts' % len(cuts))


def author_cut(cut):
    stage.reset_scene()
    stage.add_lamp_rig('shallow')
    rock = stage.add_rock_slab('rock-' + library.short_name_of(cut), (0.0, 0.0), stage.band_colour_hex(library.REVIEW_BAND))
    cut_marks.build_cut(cut, (0.0, 0.0))
    frame_cell()
    stage.save_blend(os.path.join(BLEND_DIR, 'cut-%s.blend' % library.short_name_of(cut)))
    render_sprite(cut, rock)
    print('authored %s' % cut['id'])


def frame_cell():
    """The cell alone, 1 m square, at the atlas content density: one pixel per 1/248 m."""
    stage.frame_grid(1, 1)
    scene = bpy.context.scene
    scene.camera.data.ortho_scale = stage.CELL_M
    scene.render.resolution_x = scene.render.resolution_y = SPRITE_PX


def render_sprite(cut, rock):
    """The lit cell with the rock held out: what stands off the face keeps its shading."""
    scene = bpy.context.scene
    rock.is_holdout = True
    scene.render.film_transparent = True
    scene.cycles.film_transparent_glass = True
    scene.use_nodes = False
    scene.render.image_settings.color_mode = 'RGBA'
    try:
        stage.render_to(os.path.join(BUILD_DIR, '%s.sprite.png' % library.short_name_of(cut)))
    finally:
        rock.is_holdout = False
        scene.render.film_transparent = False
        scene.use_nodes = True
        scene.render.image_settings.color_mode = 'RGB'


def render_sheet(cuts):
    """Every cut on its rock, SHEET_COLUMNS to a row, under the shallow rig, at 256 px a metre."""
    stage.reset_scene()
    stage.add_lamp_rig('shallow')
    rows = (len(cuts) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
    for at, cut in enumerate(cuts):
        centre = stage.cell_centre(at % SHEET_COLUMNS, at // SHEET_COLUMNS, SHEET_COLUMNS, rows)
        stage.add_rock_slab('rock-' + library.short_name_of(cut), centre, stage.band_colour_hex(library.REVIEW_BAND))
        cut_marks.build_cut(cut, centre)
    stage.frame_grid(SHEET_COLUMNS, rows)
    stage.render_to(os.path.join(SHEET_DIR, 'gem-cuts.shallow.png'))
    stage.save_blend(os.path.join(BLEND_DIR, 'gem-cuts.blend'))


if __name__ == '__main__':
    main()
