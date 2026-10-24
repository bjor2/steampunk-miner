"""
Authors the hero ore looks of one authored set (#452, tickets 744 and 785; `AUTHORED_SETS` in
hero_species.py) on the ore stage (docs/art/ores): one .blend per hero species (its 1 m cell on its
band's rock, the lamp rig and the game's orthographic camera), the 248 px lit albedo sprite of each
(the rock held out, so the alpha is the mask) into art/build/ore-heroes/ for hero_post.py, the cell
table of every authored set, and the review sheets of the set's heroes side by side under the
shallow and the deep rig. Run headless:

  BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
    -P docs/art/ore-heroes/author_ore_heroes.py -- [set] [--no-sheets]

or through the MCP: add this folder to sys.path, `import author_ore_heroes`, `author('legacy')`.
"""

import importlib
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
for folder in (HERE, os.path.normpath(os.path.join(HERE, '..', 'ores')), os.path.normpath(os.path.join(HERE, '..', 'ore-ladder'))):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import gem_marks  # noqa: E402
import gem_marks_deep  # noqa: E402
import hero_marks as marks  # noqa: E402
import hero_species as species  # noqa: E402
import ore_stage as stage  # noqa: E402

BLEND_DIR = os.path.join(HERE, 'blend')
SHEET_DIR = os.path.join(HERE, 'sheets')
BUILD_DIR = os.path.join(species.REPO_ROOT, 'art', 'build', 'ore-heroes')
SPRITE_PX = species.ATLAS['contentPx']
AMBIENTS = ('shallow', 'deep')


def main():
    set_id, with_sheets = parse_arguments(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    author(set_id, sheets=with_sheets)


def parse_arguments(argv):
    set_id = next((arg for arg in argv if not arg.startswith('--')), 'legacy')
    return set_id, '--no-sheets' not in argv


def author(set_id, sheets=True):
    reload_modules()
    heroes = species.heroes_of_set(set_id)
    for folder in (BLEND_DIR, SHEET_DIR, BUILD_DIR):
        os.makedirs(folder, exist_ok=True)
    for hero in heroes:
        author_hero(hero)
    species.write_cell_table()
    if sheets:
        render_sheets(set_id, heroes)
    print('authored %d heroes of %s' % (len(heroes), set_id))


def reload_modules():
    for module in (species, marks, gem_marks, gem_marks_deep):
        importlib.reload(module)


# --- one hero: its cell, its source file and its sprite ----------------------------------------------


def author_hero(hero):
    stage.reset_scene()
    stage.add_lamp_rig('shallow')
    rock = stage.add_rock_slab('rock-' + hero['id'], (0.0, 0.0), stage.band_colour_hex(rock_band_of(hero)))
    marks.build_hero(hero, (0.0, 0.0))
    frame_cell()
    stage.save_blend(blend_path(hero))
    render_sprite(hero, rock)
    print('authored %s: %s' % (hero['id'], os.path.relpath(blend_path(hero), species.REPO_ROOT)))


def rock_band_of(hero):
    """The rock a hero is reviewed on: the middle band of its depth window."""
    low, high = hero['gradeBand']
    return int((low + high) / 2)


def blend_path(hero):
    return os.path.join(BLEND_DIR, 'hero-%s.blend' % hero['id'])


def sprite_path(hero):
    return os.path.join(BUILD_DIR, '%s.sprite.png' % hero['id'])


def frame_cell():
    """The cell alone, 1 m square, at the atlas content density: one pixel per 1/248 m."""
    stage.frame_grid(1, 1)
    scene = bpy.context.scene
    scene.camera.data.ortho_scale = stage.CELL_M
    scene.render.resolution_x = scene.render.resolution_y = SPRITE_PX


def render_sprite(hero, rock):
    """
    The lit cell with the rock held out: what is in front of the face keeps its shading, the rock
    and anything sunk into it come out transparent. No compositor glow: the shader adds the
    rarity glow and frame on top (#450), so the sprite carries the body alone.
    """
    scene = bpy.context.scene
    rock.is_holdout = True
    scene.render.film_transparent = True
    scene.cycles.film_transparent_glass = True
    scene.use_nodes = False
    scene.render.image_settings.color_mode = 'RGBA'
    try:
        stage.render_to(sprite_path(hero))
    finally:
        rock.is_holdout = False
        scene.render.film_transparent = False
        scene.use_nodes = True
        scene.render.image_settings.color_mode = 'RGB'


# --- the set's review sheets -------------------------------------------------------------------------


def render_sheets(set_id, heroes):
    stage.reset_scene()
    columns = len(heroes)
    for column, hero in enumerate(heroes):
        centre = stage.cell_centre(column, 0, columns, 1)
        stage.add_rock_slab('rock-' + hero['id'], centre, stage.band_colour_hex(rock_band_of(hero)))
        marks.build_hero(hero, centre)
    labels = [[hero['id'] for hero in heroes]]
    for ambient in AMBIENTS:
        relight(ambient)
        stage.frame_grid(columns, 1)
        sheet = stage.render_to(sheet_path(set_id, ambient + '.png'))
        stage.report_grid_luma(sheet, columns, 1, labels, sheet_path(set_id, ambient + '.luma.json'))
    relight('shallow')
    stage.frame_grid(columns, 1, stage.CLOSEUP_PX_PER_M)
    stage.render_to(sheet_path(set_id, 'closeup.png'))
    stage.frame_grid(columns, 1)
    stage.save_blend(os.path.join(BLEND_DIR, 'heroes-%s.blend' % set_id))


def relight(ambient):
    for obj in list(bpy.data.objects):
        if obj.type == 'LIGHT':
            bpy.data.objects.remove(obj, do_unlink=True)
    stage.add_lamp_rig(ambient)


def sheet_path(set_id, suffix):
    return os.path.join(SHEET_DIR, 'heroes-%s.%s' % (set_id, suffix))


if __name__ == '__main__':
    main()
