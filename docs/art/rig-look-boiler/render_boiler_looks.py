"""
Review renders of the boiler rig-look parts (ticket 582): each part alone in the game's front
view, the rig at tiers 1 and 3 with each look swapped onto the `hull.boiler` slot, the drill nose
lit as while drilling, and the tier-1 rig's glow alone (no lamp, no sky: what the emissive map
carries), since the drill nose must stay the brightest part and a look's glow under its cap
(#576 rules).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/render_boiler_looks.py [-- alone|rig|glow]
    python3 docs/art/rig-look-boiler/sheet_boiler_looks.py

The first reads art/blender/vehicle-look-boiler/ and the vehicle's source and writes the raw
renders into build/ beside this file; the second (Blender's Python has no PIL) lays them out into
the committed sheets, the in-game and phone-size copies, and measures them (readability.json).

A swap is what the wiring (#583) will draw: the rig's own `t1-boiler` is left out and the look's
part stands at the slot's `atM` from the exported vehicle sidecar, in the same depth as the dome it
replaces (the parts are authored at the dome's depth, so no offset in Y).
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

LOOKS_TABLE = os.path.join(HERE, 'boilerLooks.json')
BUILD = os.path.join(HERE, 'build')
ALONE_PX_PER_M = 768
RIG_PX_PER_M = 512
ALONE_SAMPLES = 32
RIG_SAMPLES = 32
MARGIN_M = 0.03
# The casing driller review's frame, so the sheets line up with its tiers.
RIG_FRAME = driller.FRAME
RIG_TIERS = (1, 3)
GLOW_TIER = 1
# What the game lights while drilling: the nose seams and crown (partMotion's glowOf).
DRILLING_GLOWS = ('nose-glow',)


def main():
    os.makedirs(BUILD, exist_ok=True)
    table = read_table()
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['alone', 'rig', 'glow']
    if 'alone' in wanted:
        for look in table['looks']:
            render_alone(table, look)
    if 'rig' in wanted:
        for tier in RIG_TIERS:
            for look in table['looks']:
                render_swapped(table, look, tier)
    if 'glow' in wanted:
        for look in table['looks']:
            render_glow(table, look)


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


def render_alone(table, look):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keep_only(stage.append_parts_of(table['assetId']), look['part'])
    rig.settle()
    light_opaque(ALONE_SAMPLES)
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    width, height = max_x - min_x + 2 * MARGIN_M, max_z - min_z + 2 * MARGIN_M
    stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, ALONE_PX_PER_M)
    stage.render_to(build_path('%s.front.png' % look['part']))


def render_swapped(table, look, tier):
    driller.stage_vehicle(tier)
    leave_out_slot_part(table['replaces'])
    stand_at_slot(table, look)
    driller.light_glows(DRILLING_GLOWS)
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.png' % (tier, look['part'])))


def render_glow(table, look):
    """The swapped tier-1 rig by its emission alone, the nose lit as while drilling."""
    driller.stage_vehicle(GLOW_TIER)
    leave_out_slot_part(table['replaces'])
    stand_at_slot(table, look)
    driller.light_glows(DRILLING_GLOWS)
    light_opaque(RIG_SAMPLES)
    put_out_lamps()
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.glow.png' % (GLOW_TIER, look['part'])))


def put_out_lamps():
    for obj in [obj for obj in bpy.context.scene.objects if obj.type == 'LIGHT']:
        bpy.data.objects.remove(obj)
    background = next(node for node in bpy.context.scene.world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs['Strength'].default_value = 0.0


def keep_only(parts, part_id):
    for obj in parts:
        if obj.name != part_id:
            bpy.data.objects.remove(obj)


def leave_out_slot_part(part_id):
    """The swap: the rig's own part on the slot is not drawn under the look."""
    bpy.data.objects.remove(bpy.data.objects[part_id])


def stand_at_slot(table, look):
    at_x, at_z = attach_point(table['attach'])['atM']
    for obj in stage.append_parts_of(table['assetId']):
        if obj.name != look['part']:
            bpy.data.objects.remove(obj)
            continue
        obj.location.x += at_x
        obj.location.z += at_z
    rig.settle()


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def light_opaque(samples):
    stage.stage_lights_and_world()
    bpy.context.scene.cycles.samples = samples


def build_path(name):
    return os.path.join(BUILD, name)


if __name__ == '__main__':
    main()
