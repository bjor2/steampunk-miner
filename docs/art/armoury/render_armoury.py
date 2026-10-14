"""
Review renders of the armoury module mounts (ticket 364, the art half of #321; re-staged by #321):
each module alone in the game's front view, and each gun bare, with every module of its lane bought,
and with every module Mastered (the gilded plates shown).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/armoury/render_armoury.py [-- alone|guns]

It reads the sources art/blender/<id>/ and writes the PNGs into this folder. The bore gun is #362's
vehicle-bore-gun and the turret the shipped vehicle-auto-guns at barrel look 3, each with its
trunnion at the stage origin. Each module sits where the game hangs it: its mount's point in
src/features/ground-gun/armouryMounts.json (the one table of the points, ticket 321), a muzzle
module moved out by the long barrel, a turret `muzzle` point from the barrel's tip. The game draws a
module over its gun by draw order, so each module stands in front of the gun along -Y here.
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

MOUNT_TABLE = os.path.join(HERE, 'armouryMounts.json')
GAME_MOUNTS = os.path.join(REPO_ROOT, 'src', 'features', 'ground-gun', 'armouryMounts.json')
BORE_GUN = 'vehicle-bore-gun'
BORE_PARTS = ('t1-bore-mount', 't1-bore-barrel')
# #362: the barrel's trunnion sits this far under the saddle's origin; moved to the stage origin.
BORE_TRUNNION_Z = -0.108
TURRET = 'vehicle-auto-guns'
TURRET_PARTS = ('t1-turret-mount', 't1-turret-head', 't3-gun-barrel')
# author_auto_guns.py's TRUNNION_AT: moved to the origin so the turret mounts read as offsets.
TRUNNION_AT = (0.04, 0.0, 0.64)
# The t3 barrel's tip from the trunnion (its sidecar pivotM), where a turret `muzzle` point counts.
TURRET_TIP_X = -0.4
# In front of every gun part's relief, so a module covers its gun as its draw order does in game.
MODULE_FRONT_Y = -0.12
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


def read_game_mounts():
    with open(GAME_MOUNTS, encoding='utf8') as file:
        return json.load(file)


# --- scenes --------------------------------------------------------------------------------------


def fresh_stage():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.stage_lights_and_world()
    bpy.context.scene.render.film_transparent = False


def place_module(module, at, front_y=0.0):
    for obj in stage.append_parts_of(module['assetId']):
        obj.location.x += at[0]
        obj.location.y += front_y
        obj.location.z += at[1]


def stage_bore_gun():
    for obj in stage.append_parts_of(BORE_GUN):
        obj.location.z -= BORE_TRUNNION_Z


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
    game = read_game_mounts()
    modules = lane_modules(table, gun)
    for module in modules:
        place_module(module, game_point_of(game, module, modules), MODULE_FRONT_Y)
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
    return name not in BORE_PARTS and name not in TURRET_PARTS


def game_point_of(game, module, bought):
    """armouryMounts.ts' mountPointOf: the point, from the tip for a muzzle mount, moved out by
    every bought module that lengthens the gun past it."""
    mount_id = mount_id_of(game, module['itemId'])
    mount = game['mounts'][mount_id]
    x, z = mount['atM']
    if mount['from'] == 'muzzle':
        x += TURRET_TIP_X
    for other in bought:
        extension = row_of(game, other['itemId']).get('extends')
        if extension is not None and extension['mount'] == mount_id:
            x, z = x + extension['byM'][0], z + extension['byM'][1]
    return x, z


def row_of(game, item_id):
    return next(row for row in game['modules'] if row['itemId'] == item_id)


def mount_id_of(game, item_id):
    return row_of(game, item_id)['mount']


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
