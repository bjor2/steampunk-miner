"""
Review renders of the drill-type rig-look parts (ticket 622): each look alone in the game's front
view, the rig at tiers 1 and 3 bare and with each look swapped onto the `drill.head` slot in place
of its `t1-drill-bit`, the drill nose lit as while drilling, and the tier-1 rig's glow alone (no
lamp, no sky: what the emissive map carries), since the drill nose must stay the brightest part
(#576 rules). The frame, stage and depths are #582's boiler review (render_boiler_looks.py), on
the casing driller review's frame, so the sheets line up with its tiers.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-type/render_drill_type_looks.py [-- alone|rig|glow]
    python3 docs/art/rig-look-drill-type/sheet_drill_type_looks.py

The first reads art/blender/vehicle-look-drill-type/ and the vehicle's source and writes the raw
renders into build/ beside this file; the second (Blender's Python has no PIL) lays them out into
the committed sheets, the in-game and phone-size copies, and measures them (readability.json).

A swap is what the wiring (#623) will draw: the rig's own `t1-drill-bit` is left out (where the
tier has it) and every part of the look stands at the slot's `atM` from the exported vehicle
sidecar at its deployed pose, in the depth it was authored at.
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

LOOKS_TABLE = os.path.join(HERE, 'drillTypeLooks.json')
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
        for look in looks_with_parts(table):
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


def looks_with_parts(table):
    return [look for look in table['looks'] if look['parts']]


def render_alone(table, look):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keep_only(stage.append_parts_of(table['assetId']), part_ids_of(look))
    rig.settle()
    light_opaque(ALONE_SAMPLES)
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    width, height = max_x - min_x + 2 * MARGIN_M, max_z - min_z + 2 * MARGIN_M
    stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, ALONE_PX_PER_M)
    stage.render_to(build_path('%s.front.png' % look['look']))


def render_swapped(table, look, tier):
    driller.stage_vehicle(tier)
    stand_at_slot(table, look)
    driller.light_glows(DRILLING_GLOWS)
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.png' % (tier, look['look'])))


def render_glow(table, look):
    """The swapped tier-1 rig by its emission alone, the nose lit as while drilling."""
    driller.stage_vehicle(GLOW_TIER)
    stand_at_slot(table, look)
    driller.light_glows(DRILLING_GLOWS)
    light_opaque(RIG_SAMPLES)
    put_out_lamps()
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.glow.png' % (GLOW_TIER, look['look'])))


def put_out_lamps():
    for obj in [obj for obj in bpy.context.scene.objects if obj.type == 'LIGHT']:
        bpy.data.objects.remove(obj)
    background = next(node for node in bpy.context.scene.world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs['Strength'].default_value = 0.0


def keep_only(parts, part_ids):
    for obj in parts:
        if obj.name not in part_ids:
            bpy.data.objects.remove(obj)


def part_ids_of(look):
    return [part['id'] for part in look['parts']]


def stand_at_slot(table, look):
    """The swap: the bare look leaves the rig as it is; any other leaves the rig's own crown out
    and stands every part of the look on the slot."""
    if not look['parts']:
        return
    leave_out_slot_part(table['replaces'])
    at_x, at_z = attach_point(table['attach'])['atM']
    wanted = part_ids_of(look)
    for obj in stage.append_parts_of(table['assetId']):
        if obj.name not in wanted:
            bpy.data.objects.remove(obj)
            continue
        obj.location.x += at_x
        obj.location.z += at_z
    rig.settle()


def leave_out_slot_part(part_id):
    """The rig's own part on the slot is not drawn under the look; tier 3 has no tip crown to leave out."""
    own = bpy.data.objects.get(part_id)
    if own is not None:
        bpy.data.objects.remove(own)


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def light_opaque(samples):
    stage.stage_lights_and_world()
    bpy.context.scene.cycles.samples = samples


def build_path(name):
    return os.path.join(BUILD, name)


if __name__ == '__main__':
    main()
