"""
Review renders of the jump drive (ticket 759): the drive alone in the game's front view, and over
each coal tender wagon at the shared hitch, as `JumpDrivePiece` draws it (draw order 1 over the
wagon's 0), so its fit behind every tender body can be judged.

    FUEL_TENDER_BLEND=<a real vehicle-fuel-tank.blend> \
      blender -b --factory-startup --python-exit-code 1 -P docs/art/jump-drive/render_jump_drive.py
    python3 docs/art/jump-drive/sheet_jump_drive.py

The tender's source is a Git LFS pointer in a worktree with no LFS filter, so its path can be
given; it defaults to art/blender/vehicle-fuel-tank/. Raw renders go to build/ beside this file.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))

import render_dynamite as stage  # noqa: E402

DRIVE_ID = 'vehicle-jump-drive'
TENDER_ID = 'vehicle-fuel-tank'
LADDER_TABLE = os.path.join(REPO_ROOT, 'src', 'data', 'vehicle', 'fuelTender.json')
BUILD = os.path.join(HERE, 'build')
PX_PER_M = 768
SAMPLES = 32
MARGIN_M = 0.03
OVER_WAGON_Y = -0.4


def main():
    os.makedirs(BUILD, exist_ok=True)
    render_alone()
    for step in read_table()['steps']:
        render_over(step['part'])


def read_table():
    with open(LADDER_TABLE, encoding='utf8') as file:
        return json.load(file)


def render_alone():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    append_parts(blend_of(DRIVE_ID))
    frame_and_render('jump-drive.front.png')


def render_over(wagon):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in append_parts(blend_of(TENDER_ID)):
        if obj.name != wagon:
            bpy.data.objects.remove(obj)
    for obj in append_parts(blend_of(DRIVE_ID)):
        obj.location.y += OVER_WAGON_Y
    frame_and_render('over-%s.png' % wagon)


def frame_and_render(name):
    bpy.context.view_layer.update()
    stage.stage_lights_and_world()
    bpy.context.scene.cycles.samples = SAMPLES
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    width, height = max_x - min_x + 2 * MARGIN_M, max_z - min_z + 2 * MARGIN_M
    stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, PX_PER_M)
    stage.render_to(os.path.join(BUILD, name))


def blend_of(asset_id):
    override = os.environ.get('FUEL_TENDER_BLEND') if asset_id == TENDER_ID else None
    return override or os.path.join(REPO_ROOT, 'art', 'blender', asset_id, asset_id + '.blend')


def append_parts(path):
    with bpy.data.libraries.load(path, link=False) as (source, target):
        target.objects = list(source.objects)
    parts = [obj for obj in target.objects if obj is not None and obj.type == 'MESH']
    for obj in parts:
        bpy.context.scene.collection.objects.link(obj)
    return parts


if __name__ == '__main__':
    main()
