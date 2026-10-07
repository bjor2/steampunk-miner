"""
Review renders of the tech-unlocked gear (#166, spec #162 section 5): each gear asset alone in
the game's front view; the loaded rig, the tier-3 vehicle with its turret and charge rack and
every gear item mounted at the attach point the exported vehicle sidecar carries, folded and
deployed; the bare rig and the rig with only its five extractors folded for the G&V silhouette check; and
the unfold clip of each extractor.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/tech-gear/render_tech_gear.py [-- alone|rig|clips]
    python3 docs/art/tech-gear/sheet_tech_gear.py

The first reads the sources art/blender/<id>/ and writes the renders into this folder; the second
(Blender's Python has no PIL) flattens them, writes the grayscale and in-game sheets, assembles
the clips into GIFs and measures the folded silhouette against the bare one.

Every placement comes from data the game reads: a part sits at its attach point's `atM` from
public/assets/vehicle/vehicle/vehicle.parts.json (K5 #188), its pose from the folded and
deployed poses of src/features/tech-tree/techGear.json, blended as `extractorPose.ts` blends
them. Nothing is hand-placed here (TD acceptance 6). A screen-counter-clockwise `turn` is a
negative rotation about Blender's Y, which the camera looks along.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))

import render_dynamite as stage  # noqa: E402

GEAR_TABLE = os.path.join(REPO_ROOT, 'src', 'features', 'tech-tree', 'techGear.json')
VEHICLE_SIDECAR = os.path.join(REPO_ROOT, 'public', 'assets', 'vehicle', 'vehicle', 'vehicle.parts.json')
VEHICLE = 'vehicle'
TURRET = 'vehicle-auto-guns'
RACK = 'vehicle-blasting-charges'
VEHICLE_TIER = 3
GUN_LOOK = 3
# What the loaded rig carries: one item per exclusive socket, five slot housings, everything else.
EQUIPPED = {
    'drill.head': 'gear.twin_bit',
    'drill.collar': 'gear.sampling_corer',
    'drill.flank': 'gear.side_cutters',
    'powerup.1': 'power.steam_shield',
    'powerup.2': 'power.ore_shifter',
    'powerup.3': 'power.mineral_drain',
    'powerup.4': 'power.galvanic_probe',
    'powerup.5': 'power.grav_anchor',
}
# Each rig render: its name, how far deployed, and which kinds are mounted (None for all). The
# `extractors` look is the G&V silhouette case: the five extractors owned and folded, nothing else.
RIG_LOOKS = (
    ('bare', None, None),
    ('extractors', 0.0, ('extractor',)),
    ('folded', 0.0, None),
    ('deployed', 1.0, None),
)
ALONE_PX_PER_M = 768
RIG_PX_PER_M = 512
CLIP_PX_PER_M = 384
CLIP_WINDOW_M = (0.8, 0.6)
CLIP_FRAMES = 12
ALONE_SAMPLES = 32
RIG_SAMPLES = 48
CLIP_SAMPLES = 24
# The game draws flat quads in draw order, so here every gear part stands wholly in front of the
# hull's relief, stepped along Y by its draw order, where the orthographic camera cannot tell.
GEAR_CLEARANCE_Y = 0.05
Y_PER_DRAW_ORDER = -0.002
HULL_FRONT = {'y': 0.0}


def main():
    table = read_json(GEAR_TABLE)
    attach = {point['id']: point for point in read_json(VEHICLE_SIDECAR)['attach']}
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['alone', 'rig', 'clips']
    if 'alone' in wanted:
        render_each_alone(table)
    if 'rig' in wanted:
        render_rig(table, attach)
    if 'clips' in wanted:
        render_clips(table, attach)


def read_json(path):
    with open(path, encoding='utf8') as file:
        return json.load(file)


# --- each asset alone -----------------------------------------------------------------------------


def render_each_alone(table):
    for asset_id in sorted({item['assetId'] for item in table['items']}):
        stage.open_source(asset_id)
        stage.stage_lights_and_world()
        bpy.context.scene.cycles.samples = ALONE_SAMPLES
        min_x, min_z, max_x, max_z = stage.mesh_bounds()
        width, height = max_x - min_x + 0.06, max_z - min_z + 0.06
        stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, ALONE_PX_PER_M)
        stage.render_to(stage.output_path(asset_id + '.front.raw.png').replace(stage.HERE, HERE))


# --- the loaded rig --------------------------------------------------------------------------------


def render_rig(table, attach):
    for look, fraction, kinds in RIG_LOOKS:
        stage_vehicle()
        if fraction is not None:
            mount_everything(table, attach, fraction, kinds)
        settle()
        stage.stage_lights_and_world()
        bpy.context.scene.cycles.samples = RIG_SAMPLES
        stage.frame_orthographic((0.1, 0.1), 2.2, 1.5, RIG_PX_PER_M)
        stage.render_to(output_path('rig.%s.raw.png' % look))


def stage_vehicle():
    """The tier-3 vehicle, the look-3 turret and the full charge rack, as the game draws them."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keep_tiered(stage.append_parts_of(VEHICLE), VEHICLE_TIER)
    keep_tiered(stage.append_parts_of(TURRET), GUN_LOOK)
    stage.append_parts_of(RACK)
    settle()
    HULL_FRONT['y'] = nearest_y_of_meshes()


def nearest_y_of_meshes():
    from mathutils import Vector
    return min((obj.matrix_world @ Vector(corner)).y for obj in bpy.context.scene.objects
               if obj.type == 'MESH' for corner in obj.bound_box)


def keep_tiered(parts, tier):
    """Of `t<n>-<slot>` parts, the highest tier at or under `tier` per slot (#52 conventions)."""
    best = {}
    for obj in parts:
        own_tier, slot = tier_and_slot_of(obj.name)
        if own_tier <= tier and (slot not in best or tier_and_slot_of(best[slot].name)[0] < own_tier):
            best[slot] = obj
    for obj in parts:
        if best.get(tier_and_slot_of(obj.name)[1]) is not obj:
            bpy.data.objects.remove(obj)


def tier_and_slot_of(name):
    head, slot = name.split('-', 1)
    return int(head[1:]), slot


def mount_everything(table, attach, fraction, kinds=None):
    for item in table['items']:
        slot = slot_holding(item['itemId'])
        if item['attach'] == 'slot' and slot is None:
            continue
        if kinds is not None and item['kind'] not in kinds:
            continue
        mount(item, attach, slot, fraction)


def slot_holding(item_id):
    return next((slot for slot, held in EQUIPPED.items() if held == item_id), None)


def mount(item, attach, slot, fraction, keep=None):
    """The item's parts at its point, posed `fraction` deployed; a mirrored item twice."""
    point = attach['hull.' + slot] if item['attach'] == 'slot' else attach[item['attach']]
    poses = {part['id']: part for part in item['parts']}
    placed = place_parts(item['assetId'], poses, point, fraction, mirror=False, keep=keep)
    if item.get('mirrored'):
        placed += place_parts(item['assetId'], poses, point, fraction, mirror=True, keep=keep)
    return placed


def place_parts(asset_id, poses, point, fraction, mirror, keep):
    wanted = set(poses) if keep is None else set(keep)
    placed = []
    for obj in stage.append_parts_of(asset_id):
        if obj.name.split('.')[0] not in wanted:
            bpy.data.objects.remove(obj)
            continue
        pose = pose_at(poses[obj.name.split('.')[0]], fraction)
        sign = -1.0 if mirror else 1.0
        obj.location.x += point['atM'][0] + pose['shift'][0]
        obj.location.z = sign * (obj.location.z + pose['shift'][1]) + point['atM'][1]
        obj.location.y = HULL_FRONT['y'] - GEAR_CLEARANCE_Y + Y_PER_DRAW_ORDER * (point['z'] + 1)
        obj.rotation_euler.y = -pose['turn'] * sign
        if mirror:
            obj.scale.z = -1.0
        placed.append(obj)
    return placed


def pose_at(part, fraction):
    """`partPoseAt` of extractorPose.ts: the folded pose eased to the deployed one."""
    folded = part.get('folded', {'turn': 0.0, 'shift': [0.0, 0.0]})
    deployed = part.get('deployed', folded)
    blend = smoothstep(min(1.0, max(0.0, fraction)))
    mix = lambda a, b: a + (b - a) * blend  # noqa: E731
    return {'turn': mix(folded['turn'], deployed['turn']),
            'shift': [mix(folded['shift'][0], deployed['shift'][0]), mix(folded['shift'][1], deployed['shift'][1])]}


def smoothstep(value):
    return value * value * (3.0 - 2.0 * value)


def settle():
    """Moved objects keep stale world matrices until the view layer updates; the bounds read them."""
    bpy.context.view_layer.update()


# --- the unfold clips ------------------------------------------------------------------------------


def render_clips(table, attach):
    """Each extractor unfolding over the 8-tick deploy, then holding, framed on its point."""
    deploy = table['deploy']
    for item in table['items']:
        if item['kind'] != 'extractor':
            continue
        folder = os.path.join(HERE, 'clips', item['itemId'].split('.')[1].replace('_', '-'))
        os.makedirs(folder, exist_ok=True)
        point = attach[item['attach']]
        for frame in range(CLIP_FRAMES):
            stage_vehicle()
            mount(item, attach, None, min(1.0, frame / deploy['unfoldTicks']))
            settle()
            stage.stage_lights_and_world()
            bpy.context.scene.cycles.samples = CLIP_SAMPLES
            stage.frame_orthographic(tuple(point['atM']), CLIP_WINDOW_M[0], CLIP_WINDOW_M[1], CLIP_PX_PER_M)
            stage.render_to(os.path.join(folder, 'frame-%02d.png' % frame))


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
