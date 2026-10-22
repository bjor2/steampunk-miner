"""
Review renders of the drive rig-look parts (ticket 731): each part alone in the game's front view,
the rig at tiers 1 and 3 bare and with each look swapped onto the `chassis.drive` slot, the drill
nose lit as while drilling, and the tier-1 rig's glow alone (no lamp, no sky: what the emissive
map carries), since the drill nose must stay the brightest part and a look's glow under its cap
(#576 rules).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/render_drive_looks.py [-- alone|rig|glow]
    python3 docs/art/rig-look-drive/sheet_drive_looks.py

The first reads art/blender/vehicle-look-drive/ and the vehicle's source and writes the raw
renders into build/ beside this file; the second (Blender's Python has no PIL) lays them out into
the committed sheets, the in-game and phone-size copies, and measures them (readability.json).

A swap is what the wiring (#726) will draw: the look's part stands at the slot's `atM` from the
exported vehicle sidecar. No rig part sits on `chassis.drive` (the table's `replaces` is null), so
the rig keeps every part of its own and the tracks lie over the rollers and the legs. The game
draws flat quads in draw order (`z`): the look at 3 covers the chassis at 2 and is covered by the
thrusters at 4 and the armour at 5, so here every rig part drawn over the look is brought forward
of it along Y, where the orthographic camera cannot tell.
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

LOOKS_TABLE = os.path.join(HERE, 'driveLooks.json')
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
# The bare rig, rendered beside the looks under this label.
BARE = 'rig'
# What the game lights while drilling: the nose seams and crown (partMotion's glowOf).
DRILLING_GLOWS = ('nose-glow',)
# How far forward a rig part drawn over the look is brought, well clear of the look's depth.
OVER_LOOK_Y = -0.4


def main():
    os.makedirs(BUILD, exist_ok=True)
    table = read_table()
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['alone', 'rig', 'glow']
    if 'alone' in wanted:
        for look in table['looks']:
            render_alone(table, look)
    if 'rig' in wanted:
        for tier in RIG_TIERS:
            render_bare(table, tier)
            for look in table['looks']:
                render_swapped(table, look, tier)
    if 'glow' in wanted:
        render_glow(table, None)
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


def render_bare(table, tier):
    stage_bare(table, tier)
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.png' % (tier, BARE)))


def render_swapped(table, look, tier):
    stage_swapped(table, look, tier)
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.png' % (tier, look['part'])))


def render_glow(table, look):
    """The tier-1 rig, bare or swapped, by its emission alone, the nose lit as while drilling."""
    if look is None:
        stage_bare(table, GLOW_TIER)
    else:
        stage_swapped(table, look, GLOW_TIER)
    light_opaque(RIG_SAMPLES)
    put_out_lamps()
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('tier-%d.%s.glow.png' % (GLOW_TIER, BARE if look is None else look['part'])))


def stage_bare(table, tier):
    driller.stage_vehicle(tier)
    bring_forward_parts_over(table['z'])
    driller.light_glows(DRILLING_GLOWS)


def stage_swapped(table, look, tier):
    driller.stage_vehicle(tier)
    bring_forward_parts_over(table['z'])
    leave_out_slot_part(table['replaces'])
    stand_at_slot(table, look)
    driller.light_glows(DRILLING_GLOWS)


def bring_forward_parts_over(look_z):
    """The rig parts the game draws over the look (a higher `z`) stand in front of it here too."""
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and int(obj.get('z', 0)) > look_z:
            obj.location.y += OVER_LOOK_Y
    rig.settle()


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
    """The swap: a rig part on the slot is not drawn under the look; the drive slot has none."""
    if part_id is not None:
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
