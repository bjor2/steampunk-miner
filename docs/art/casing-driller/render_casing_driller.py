"""
Review renders of the casing driller (ticket 393): the three visual tiers at rest, every state
the game draws the vehicle in, posed the way the code poses it, and the tier-3 rig with every
module mounted at the attach points of the exported sidecar.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/casing-driller/render_casing_driller.py [-- tiers|states|turn|fitted]
    python3 docs/art/casing-driller/sheet_casing_driller.py

The first reads art/blender/vehicle/vehicle.blend (and the module sources for `fitted`) and writes
the raw renders into build/ beside this file; the second (Blender's Python has no PIL) lays them
out into the committed sheets and the in-game-size copies.

The poses are the code's, not hand-placed: the drill head and its bit sit on the circle of reach
(collider + head width) / 2 round the body's centre at the facing's angle and turn with it
(drillHeadPose.ts); the turnaround sweeps that angle from right through up to left, the short way
a half turn takes (counter-clockwise); the casing arms turn about their shoulders by up to
CASING_ARM_SWING_RADIANS; the glow a state lights is the emission partMotion turns up (the nose
while drilling, the thrusters while thrusting, the lamps always). A screen-counter-clockwise turn
is a negative rotation about Blender's Y, which the camera looks along.
"""

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'tech-gear'))

import render_dynamite as stage  # noqa: E402
import render_tech_gear as rig  # noqa: E402

BUILD = os.path.join(HERE, 'build')
VEHICLE = 'vehicle'
PX_PER_M = 512
SAMPLES = 32
# One frame for every render, so the sheets line up: the drill facing up or down needs the room.
FRAME = ((0.05, 0.05), 2.1, 1.75)
# src/constants/scene.ts CASING_ARM_SWING_RADIANS, the arms at the top of their swing.
CASING_ARM_SWING_RADIANS = 0.6
FACINGS = (('right', 0.0), ('up', 90.0), ('left', 180.0), ('down', -90.0))
TURN_DEGREES = (0, 45, 90, 135, 180)
STATE_TIER = 1
# What glows in each state (partMotion's glowOf): the material, and its emission when lit.
GLOWS = {'nose-glow': 1.6, 'thrust-core': 2.0, 'thrust-rim': 1.6}


def main():
    os.makedirs(BUILD, exist_ok=True)
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['tiers', 'states', 'turn', 'fitted']
    if 'tiers' in wanted:
        for tier in (1, 2, 3):
            render_state('tier-%d' % tier, tier)
    if 'states' in wanted:
        render_states()
    if 'turn' in wanted:
        for degrees in TURN_DEGREES:
            render_state('turn-%03d' % degrees, STATE_TIER, facing=degrees, lit=('nose-glow',))
    if 'fitted' in wanted:
        render_fitted()


def render_states():
    render_state('state-drive', STATE_TIER, wheel_turn=0.6)
    render_state('state-fly', STATE_TIER, lit=('thrust-core', 'thrust-rim'))
    render_state('state-casing', STATE_TIER, arm_swing=CASING_ARM_SWING_RADIANS)
    for name, degrees in FACINGS:
        render_state('state-drill-%s' % name, STATE_TIER, facing=degrees, lit=('nose-glow',), bit_turn=0.7)


def render_state(name, tier, facing=0.0, lit=(), wheel_turn=0.0, arm_swing=0.0, bit_turn=0.0):
    stage_vehicle(tier)
    light_glows(lit)
    pose_drill(facing, bit_turn)
    turn_parts('-wheel', wheel_turn)
    turn_parts('-casing-arm', arm_swing)
    render(name)


def render_fitted():
    """Every module the game can hang on the tier-3 rig, folded, at the sidecar's points."""
    table = rig.read_json(rig.GEAR_TABLE)
    attach = {point['id']: point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach']}
    rig.stage_vehicle(attach)
    rig.mount_everything(table, attach, 0.0)
    light_glows(())
    render('fitted')


# --- staging -------------------------------------------------------------------------------------


def stage_vehicle(tier):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig.keep_tiered(stage.append_parts_of(VEHICLE), tier)
    rig.settle()


def light_glows(lit):
    """Emission on only for the materials this state lights; the lamp lens keeps its own."""
    for material in bpy.data.materials:
        base = material.name.split('.')[0]
        if base not in GLOWS or not material.use_nodes:
            continue
        shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
        shader.inputs['Emission Strength'].default_value = GLOWS[base] if base in lit else 0.0


def drill_parts():
    return [obj for obj in bpy.context.scene.objects if '-drill-' in obj.name]


def pose_drill(degrees, bit_turn):
    """drillHeadPose.ts: the head's centre on the circle of reach, every drill part turned with it."""
    head = next(obj for obj in drill_parts() if obj.name.split('.')[0].endswith('drill-head'))
    reach = head.location.x
    angle = math.radians(degrees)
    for obj in drill_parts():
        dx, dz = obj.location.x - reach, obj.location.z
        obj.location.x = reach * math.cos(angle) + dx * math.cos(angle) - dz * math.sin(angle)
        obj.location.z = reach * math.sin(angle) + dx * math.sin(angle) + dz * math.cos(angle)
        spin = bit_turn if obj.name.split('.')[0].endswith('drill-bit') else 0.0
        obj.rotation_euler.y = -angle + spin
    rig.settle()


def turn_parts(suffix, screen_angle):
    """Turns every part whose slot is `suffix` (and its repeats) about its own pivot."""
    for obj in bpy.context.scene.objects:
        if suffix in obj.name and obj.type == 'MESH':
            obj.rotation_euler.y = -screen_angle
    rig.settle()


def render(name):
    stage.stage_lights_and_world()
    bpy.context.scene.cycles.samples = SAMPLES
    stage.frame_orthographic(FRAME[0], FRAME[1], FRAME[2], PX_PER_M)
    stage.render_to(os.path.join(BUILD, name + '.png'))


if __name__ == '__main__':
    main()
