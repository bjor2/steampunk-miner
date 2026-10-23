"""
Review renders of the coal tender (ticket 758): each wagon alone in the game's front view, and the
tier-1 and tier-3 rig bare and with each wagon hung at the hitch, the drill nose lit as while
drilling, so the wagon can be judged against the rig at desktop and phone sizes.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/render_fuel_tender.py [-- alone|rig]
    python3 docs/art/fuel-tender/sheet_fuel_tender.py

The first reads art/blender/vehicle-fuel-tank/ and the vehicle's source and writes the raw renders
into build/ beside this file; the second (Blender's Python has no PIL) lays them out into the
committed sheets, the in-game and phone-size copies, and measures them (readability.json).

A wagon stands at the hitch's `atM` from the exported vehicle sidecar, as `FuelTenderPiece` draws
it, at draw order 0 behind every rig part; here every rig part is brought forward of it along Y,
where the orthographic camera cannot tell. The frame is wider than the casing driller review's,
since the wagon trails the rig to the left.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'tech-gear'))

import render_casing_driller as driller  # noqa: E402
import render_dynamite as stage  # noqa: E402
import render_tech_gear as rig  # noqa: E402

LADDER_TABLE = os.path.join(REPO_ROOT, 'src', 'data', 'vehicle', 'fuelTender.json')
BUILD = os.path.join(HERE, 'build')
ALONE_PX_PER_M = 768
RIG_PX_PER_M = 512
ALONE_SAMPLES = 32
RIG_SAMPLES = 32
MARGIN_M = 0.03
# The casing driller review's frame, widened to the left for the wagon: (centre x, centre z), width, height.
RIG_FRAME = ((-0.25, 0.05), 2.7, 1.75)
RIG_TIERS = (1, 3)
BARE = 'rig'
DRILLING_GLOWS = ('nose-glow',)
OVER_WAGON_Y = -0.4


def main():
    os.makedirs(BUILD, exist_ok=True)
    table = read_table()
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['alone', 'rig']
    if 'alone' in wanted:
        for step in table['steps']:
            render_alone(table, step)
    if 'rig' in wanted:
        for tier in RIG_TIERS:
            render_bare(table, tier)
            for step in table['steps']:
                render_hung(table, step, tier)


def read_table():
    with open(LADDER_TABLE, encoding='utf8') as file:
        return json.load(file)


def render_alone(table, step):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keep_only(stage.append_parts_of(table['assetId']), step['part'])
    rig.settle()
    light(ALONE_SAMPLES)
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    width, height = max_x - min_x + 2 * MARGIN_M, max_z - min_z + 2 * MARGIN_M
    stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, ALONE_PX_PER_M)
    stage.render_to(build_path('%s.front.png' % step['part']))


def render_bare(table, tier):
    driller.stage_vehicle(tier)
    bring_forward_parts_over(table['z'])
    driller.light_glows(DRILLING_GLOWS)
    light(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.png' % (tier, BARE)))


def render_hung(table, step, tier):
    driller.stage_vehicle(tier)
    bring_forward_parts_over(table['z'])
    hang_at_hitch(table, step)
    driller.light_glows(DRILLING_GLOWS)
    light(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.png' % (tier, step['part'])))


def bring_forward_parts_over(wagon_z):
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and int(obj.get('z', 0)) > wagon_z:
            obj.location.y += OVER_WAGON_Y
    rig.settle()


def keep_only(parts, part_id):
    for obj in parts:
        if obj.name != part_id:
            bpy.data.objects.remove(obj)


def hang_at_hitch(table, step):
    at_x, at_z = attach_point(table['attach'])['atM']
    for obj in stage.append_parts_of(table['assetId']):
        if obj.name != step['part']:
            bpy.data.objects.remove(obj)
            continue
        obj.location.x += at_x
        obj.location.z += at_z
    rig.settle()


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def light(samples):
    stage.stage_lights_and_world()
    bpy.context.scene.cycles.samples = samples


def build_path(name):
    return os.path.join(BUILD, name)


if __name__ == '__main__':
    main()
