"""
Review renders of the armoury module mounts (ticket 364, the art half of #321): each module alone
in the game's front view, and each gun bare, with every module of its lane bought, and with every
module Mastered (the gilded plates shown).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/armoury/render_armoury.py [-- alone|guns]

It reads the sources art/blender/<id>/ and writes the PNGs into this folder. The bore gun body is a
stand-in built here (the real mount is #362's, not merged when this was drawn); the turret is the
shipped vehicle-auto-guns at barrel look 3 with its trunnion at the stage origin. Each module sits
at its mount's stage position from armouryMounts.json; those are review positions, not the TD's
attach points, which come with the wiring (#321).
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

import render_dynamite as stage  # noqa: E402
from author_platform import box, build_part, cylinder, torus  # noqa: E402

MOUNT_TABLE = os.path.join(HERE, 'armouryMounts.json')
TURRET = 'vehicle-auto-guns'
TURRET_PARTS = ('t1-turret-mount', 't1-turret-head', 't3-gun-barrel')
# author_auto_guns.py's TRUNNION_AT: moved to the origin so the turret mounts read as offsets.
TRUNNION_AT = (0.04, 0.0, 0.64)
ALONE_PX_PER_M = 768
GUN_PX_PER_M = 512
# About what a 1080p screen shows at the default 12 m zoom (#39), as the tech gear renders use.
INGAME_PX_PER_M = 90
MARGIN_M = 0.06
LOOKS = ('bare', 'bought', 'mastered')


def main():
    table = read_table()
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['alone', 'guns']
    if 'alone' in wanted:
        for module in table['modules']:
            render_alone(module)
    if 'guns' in wanted:
        for look in LOOKS:
            render_gun('bore', table, look)
            render_gun('turret', table, look)


def read_table():
    with open(MOUNT_TABLE, encoding='utf8') as file:
        return json.load(file)


# --- scenes --------------------------------------------------------------------------------------


def fresh_stage():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.stage_lights_and_world()
    bpy.context.scene.render.film_transparent = False


def place_module(module, at):
    for obj in stage.append_parts_of(module['assetId']):
        obj.location.x += at[0]
        obj.location.z += at[1]


def stage_bore_gun():
    """The stand-in bore gun: a pedestal, a breech block and a 54 cm barrel along +X."""
    pieces = [
        box('dark-iron', (0.16, 0.12, 0.03), (-0.06, 0.0, -0.13)),
        cylinder('iron', 0.03, 0.1, (-0.06, 0.0, -0.07), 'Z'),
        cylinder('brass', 0.05, 0.02, (-0.06, 0.0, -0.03), 'Z'),
        box('iron-plate', (0.12, 0.08, 0.09), (-0.1, 0.0, 0.0)),
        cylinder('steel', 0.03, 0.54, (0.23, 0.0, 0.0), 'X'),
        torus('brass', 0.04, 0.008, (-0.1, -0.04, 0.0)),
    ]
    build_part('stand-in-bore-gun', pieces, (0.0, 0.0, 0.0), 10)


def stage_turret():
    for obj in stage.append_parts_of(TURRET):
        if obj.name not in TURRET_PARTS:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        obj.location.x -= TRUNNION_AT[0]
        obj.location.z -= TRUNNION_AT[2]


GUN_STAGES = {'bore': stage_bore_gun, 'turret': stage_turret}


# --- renders -------------------------------------------------------------------------------------


def render_alone(module):
    fresh_stage()
    place_module(module, (0.0, 0.0))
    frame_scene(ALONE_PX_PER_M)
    stage.render_to(stage_path('%s.front.png' % module['assetId']))


def render_gun(gun, table, look):
    """Every look is framed on the gun with all its modules, so the three line up when compared."""
    fresh_stage()
    GUN_STAGES[gun]()
    mounts = table['boreGun' if gun == 'bore' else 'turret']['mounts']
    for module in lane_modules(table, gun):
        place_module(module, mounts[module['mount']])
    frame = frame_of_scene()
    drop_parts_hidden_in(look)
    for px_per_m, suffix in ((GUN_PX_PER_M, ''), (INGAME_PX_PER_M, '.ingame')):
        stage.frame_orthographic(*frame, px_per_m)
        stage.render_to(stage_path('%s.%s%s.png' % (gun, look, suffix)))


def drop_parts_hidden_in(look):
    """Bare shows the gun alone, bought every module without its plate, mastered everything."""
    if look == 'mastered':
        return
    is_module = (lambda name: name.startswith('gilded-plate')) if look == 'bought' else is_module_part
    for obj in [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and is_module(obj.name)]:
        bpy.data.objects.remove(obj, do_unlink=True)


def is_module_part(name):
    return not name.startswith('stand-in') and name not in TURRET_PARTS


def lane_modules(table, gun):
    return [module for module in table['modules'] if module['mount'].startswith(gun + '.')]


def frame_scene(px_per_m):
    stage.frame_orthographic(*frame_of_scene(), px_per_m)


def frame_of_scene():
    """The centre, width and height (metres) that hold every mesh with a margin."""
    bpy.context.view_layer.update()
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    width, height = max_x - min_x + 2 * MARGIN_M, max_z - min_z + 2 * MARGIN_M
    return ((min_x + max_x) / 2, (min_z + max_z) / 2), width, height


def stage_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
