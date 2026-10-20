"""
Review renders of the drill_tip rig-look parts (ticket 578): each part alone in the game's front
view, the rig at tiers 1, 2 and 3 with each look swapped onto the `drill.head` slot, the drill nose
lit as while drilling, and the tier-1 rig's glow alone (no lamp, no sky: what the emissive map
carries), since the drill nose must stay the brightest part and a look's glow under its cap
(#576 rules).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/render_drill_tip_looks.py [-- alone|rig|glow]
    python3 docs/art/rig-look-drill-tip/sheet_drill_tip_looks.py

The first reads art/blender/vehicle-look-drill-tip/ and the vehicle's source and writes the raw
renders into build/ beside this file; the second (Blender's Python has no PIL) lays them out into
the committed sheets, the in-game and phone-size copies, and measures them (readability.json).

A swap is what the wiring (#579) will draw: the rig's own `t1-drill-bit` is left out and the look's
part stands at the slot's `atM` from the exported vehicle sidecar, at the depth it was authored
(the crown's for the wheel, a little proud of the head's for the sheath). Tier 3 has no tip crown
to leave out (its `drill-bit` is the reamer collar), so there the look stands over the cone.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'tech-gear'))
sys.path.insert(0, HERE)

import check_outline as looks  # noqa: E402
import render_casing_driller as driller  # noqa: E402
import render_dynamite as stage  # noqa: E402
import render_tech_gear as rig  # noqa: E402

BUILD = os.path.join(HERE, 'build')
ALONE_PX_PER_M = 768
RIG_PX_PER_M = 512
ALONE_SAMPLES = 32
RIG_SAMPLES = 32
MARGIN_M = 0.03
# The casing driller review's frame, so the sheets line up with its tiers.
RIG_FRAME = driller.FRAME
RIG_TIERS = looks.RIG_TIERS
GLOW_TIER = 1
# What the game lights while drilling: the nose seams and crown core (partMotion's glowOf).
DRILLING_GLOWS = ('nose-glow',)


def main():
    os.makedirs(BUILD, exist_ok=True)
    table = looks.read_table()
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
    stage_swapped(table, look, tier)
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.png' % (tier, look['part'])))


def render_glow(table, look):
    """The swapped tier-1 rig by its emission alone, the nose lit as while drilling."""
    stage_swapped(table, look, GLOW_TIER)
    light_opaque(RIG_SAMPLES)
    put_out_lamps()
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.glow.png' % (GLOW_TIER, look['part'])))


def stage_swapped(table, look, tier):
    driller.stage_vehicle(tier)
    leave_out_slot_part(table['replaces'])
    stand_at_slot(table, look)
    driller.light_glows(DRILLING_GLOWS)


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
    """The swap: the rig's own part on the slot is not drawn under the look (none at tier 3)."""
    part = bpy.data.objects.get(part_id)
    if part is not None:
        bpy.data.objects.remove(part)


def stand_at_slot(table, look):
    at_x, at_z = looks.attach_point(table['attach'])['atM']
    for obj in stage.append_parts_of(table['assetId']):
        if obj.name != look['part']:
            bpy.data.objects.remove(obj)
            continue
        obj.location.x += at_x
        obj.location.z += at_z
    rig.settle()


def light_opaque(samples):
    stage.stage_lights_and_world()
    bpy.context.scene.cycles.samples = samples


def build_path(name):
    return os.path.join(BUILD, name)


if __name__ == '__main__':
    main()
