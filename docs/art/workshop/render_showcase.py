"""
Review renders and clips of the Workshop showcase (#182, spec #180 section 7): the rig in the
Workshop with the car on its lift, the reaction pieces side by side, and one clip per upgrade row
of its small step (an arm darts in with the tool) and its big level-up (the hoist lowers the
component onto the part).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/workshop/render_showcase.py [-- showcase pieces clips]
    python3 docs/art/workshop/sheet_showcase.py

The first reads the exported sources (art/blender/platform-building-upgrade, -workshop-showcase,
prop-workshop-reactions and the vehicle) and writes the renders and clip frames into this folder;
the second (Blender's Python has no PIL) labels the pieces sheet, writes the grayscale sheets, and
cuts the clips into GIFs and a motion strip. The stage (lights, world, cameras) is the shop
buildings' (docs/art/shops/render_shops.py).

The arms are posed here by two-bone IK on their origins (the bearings), the way #177 will pose
them in code; nothing in the sources is rigged. The attach points the clips aim at are the
positions of the car's tier-1 parts, standing in for the `vehicle-attach` ids K5 registers.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'shops'))

import render_shops as stage  # noqa: E402

BUILDING = 'platform-building-upgrade'
RIG = 'platform-workshop-showcase'
PIECES = 'prop-workshop-reactions'
VEHICLE = 'vehicle'
ROWS = ('drill_power', 'drill_tip', 'engine', 'boiler', 'cargo_hold', 'hull', 'gun', 'blasting_charges', 'casing')
# Where each row's reaction lands, in the car's frame: the top of the part the attach id names.
ATTACH_AT = {
    'drill_power': (0.26, 0.12),
    'drill_tip': (0.625, 0.175),
    'engine': (0.0, -0.24),
    'boiler': (-0.13, 0.41),
    'cargo_hold': (0.2, 0.25),
    'hull': (0.46, 0.11),
    'gun': (0.04, 0.34),
    'blasting_charges': (-0.58, 0.14),
    'casing': (-0.3, -0.29),
}
# The car's wheels rest on the lift's cradle, 0.26 m over the pad; its origin is 0.48 m above them.
VEHICLE_Z = 0.74
VEHICLE_Y = -0.2
LIFT_RAISE = 0.24
SHOWCASE_PX_PER_M = 128
PIECES_PX_PER_M = 384
CLIP_PX_PER_M = 96
CLIP_WINDOW = ((0.0, 1.2), 4.6, 3.8)
CLIP_FRAMES = 10
CLIP_SAMPLES = 24
# Rest pose: the upper arm swung out towards its wall, the forearm folded back up.
REST_UPPER_OUT = math.radians(35)
REST_FOREARM_FOLD = math.radians(125)


def main():
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for name in wanted or list(RENDERS):
        RENDERS[name]()


# --- scenes --------------------------------------------------------------------------------------


def stage_workshop():
    """The Workshop with the rig and the car on the lift, lit as the shop buildings' review."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    building = {obj.name: obj for obj in append_parts_of(BUILDING)}
    rig = {obj.name: obj for obj in append_parts_of(RIG)}
    car = append_parts_of(VEHICLE, keep=lambda name: name.startswith('t1-'))
    for obj in car:
        obj.location += Vector((0.0, VEHICLE_Y, VEHICLE_Z))
    stage.add_pad()
    stage.stage_lights_and_world()
    return building, rig, car


def append_parts_of(asset_id, keep=lambda name: True):
    path = os.path.join(REPO_ROOT, 'art', 'blender', asset_id, asset_id + '.blend')
    with bpy.data.libraries.load(path, link=False) as (source, target):
        target.objects = [name for name in source.objects if keep(name)]
    parts = [obj for obj in target.objects if obj is not None and obj.type == 'MESH']
    for obj in parts:
        bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    return parts


def hide(objects):
    for obj in objects:
        obj.hide_render = True


# --- posing ----------------------------------------------------------------------------------------


class Arm:
    """One gantry arm: its two segments turned about their bearings, a tool hung from the gripper."""

    def __init__(self, rig, side):
        self.upper = rig['showcase-arm-upper-' + side]
        self.fore = rig['showcase-arm-fore-' + side]
        self.outward = -1.0 if side == 'left' else 1.0
        self.shoulder = self.upper.location.copy()
        # Authored hanging straight down: the elbow is where the forearm rests, the gripper tip
        # its full height below the elbow bearing.
        self.upper_length = self.shoulder.z - self.fore.location.z
        self.fore_length = self.fore.dimensions.z - 0.08
        self.tool = None

    def hold(self, tool):
        self.tool = tool

    def rest(self):
        self.pose(self.outward * REST_UPPER_OUT, self.outward * REST_UPPER_OUT - self.outward * REST_FOREARM_FOLD)

    def reach(self, target, blend=1.0):
        """Two-bone IK towards `target` (world XZ), the elbow bowing outwards; `blend` eases from rest."""
        tool_length = self.tool.dimensions.z if self.tool else 0.0
        reach = self.fore_length + tool_length
        to_target = Vector((target[0] - self.shoulder.x, target[1] - self.shoulder.z))
        distance = min(to_target.length, self.upper_length + reach - 0.01)
        aim = math.atan2(to_target.x, -to_target.y)
        bend = math.acos(max(-1.0, min(1.0, (self.upper_length ** 2 + distance ** 2 - reach ** 2) / (2 * self.upper_length * distance))))
        upper = aim + self.outward * bend
        elbow = self.shoulder + Vector((self.upper_length * math.sin(upper), 0.0, -self.upper_length * math.cos(upper)))
        fore = math.atan2(target[0] - elbow.x, -(target[1] - elbow.z))
        rest_upper = self.outward * REST_UPPER_OUT
        rest_fore = rest_upper - self.outward * REST_FOREARM_FOLD
        self.pose(rest_upper + (upper - rest_upper) * blend, rest_fore + (fore - rest_fore) * blend)

    def pose(self, upper_angle, fore_angle):
        """Angles from straight down towards +X; Blender's Y rotation swings the other way."""
        self.upper.rotation_euler = (0.0, -upper_angle, 0.0)
        elbow = self.shoulder + Vector((self.upper_length * math.sin(upper_angle), 0.0, -self.upper_length * math.cos(upper_angle)))
        self.fore.location = (elbow.x, self.fore.location.y, elbow.z)
        self.fore.rotation_euler = (0.0, -fore_angle, 0.0)
        if self.tool is not None:
            along = Vector((math.sin(fore_angle), 0.0, -math.cos(fore_angle)))
            grip = elbow + along * self.fore_length
            self.tool.location = grip + along * self.tool.dimensions.z + Vector((0.0, -0.3, 0.0))
            self.tool.rotation_euler = (0.0, -fore_angle, 0.0)


class Hoist:
    """The trolley on its rail, the chain stretched to the drop, the hook with the load."""

    def __init__(self, rig):
        self.trolley, self.chain, self.hook = rig['showcase-trolley'], rig['showcase-chain'], rig['showcase-hook']
        self.rail_z = self.trolley.location.z
        self.chain_top = self.chain.location.z
        self.chain_length = self.chain.dimensions.z
        self.hook_height = self.hook.dimensions.z
        self.load = None

    def carry(self, load):
        self.load = load

    def place(self, x, hook_bottom_z):
        drop = max(0.05, self.chain_top - self.hook_height - hook_bottom_z)
        for obj in (self.trolley, self.chain, self.hook):
            obj.location.x = x
        self.chain.scale = (1.0, 1.0, drop / self.chain_length)
        self.hook.location.z = hook_bottom_z
        if self.load is not None:
            self.load.location = (x, self.hook.location.y - 0.1, hook_bottom_z - self.load.dimensions.z)

    def rest(self):
        self.place(0.0, self.chain_top - self.chain_length - self.hook_height)


def piece_of(pieces, row, kind):
    return pieces[row.replace('_', '-') + '-' + kind]


def attach_world(row):
    x, z = ATTACH_AT[row]
    return (x, z + VEHICLE_Z)


def ease(t):
    return t * t * (3 - 2 * t)


# --- renders ---------------------------------------------------------------------------------------


def render_showcase():
    """The Workshop at work: the right arm bolting the drill housing, the hoist bringing the new one."""
    building, rig, car = stage_workshop()
    pieces = {obj.name: obj for obj in append_parts_of(PIECES)}
    hide(obj for name, obj in pieces.items() if name not in ('drill-power-step', 'drill-power-major'))
    arms = {side: Arm(rig, side) for side in ('left', 'right')}
    arms['right'].hold(pieces['drill-power-step'])
    arms['right'].reach(attach_world('drill_power'))
    arms['left'].rest()
    hoist = Hoist(rig)
    hoist.carry(pieces['drill-power-major'])
    hoist.place(0.3, 1.9)
    min_x, min_z, max_x, max_z = building_bounds(list(building.values()) + list(rig.values()) + car)
    width, height = max_x - min_x + 1.0, max_z - min_z + 1.0
    centre = ((min_x + max_x) / 2, (min_z + max_z) / 2)
    stage.frame_orthographic(centre, width, height, SHOWCASE_PX_PER_M)
    stage.render_to(os.path.join(HERE, 'showcase.front.png'))
    eye = (centre[0] + width * 0.9, -max(width, height) * 1.5, centre[1] + height * 0.7)
    stage.frame_perspective(eye, (centre[0], 0.0, centre[1]), 40.0, 1200, 900)
    stage.render_to(os.path.join(HERE, 'showcase.three-quarter.png'))


def building_bounds(objects):
    """(min x, min z, max x, max z) of the given meshes, so the pad does not widen the frame."""
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    xs, zs = [c.x for c in corners], [c.z for c in corners]
    return min(xs), min(zs), max(xs), max(zs)


def render_pieces():
    """Every reaction piece as authored, tools below their components, at three times the game's density."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pieces = append_parts_of(PIECES)
    stage.stage_lights_and_world()
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    print('pieces sheet: %d pieces, bounds %.2f..%.2f x %.2f..%.2f' % (len(pieces), min_x, max_x, min_z, max_z))
    width, height = max_x - min_x + 0.4, max_z - min_z + 0.4
    stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, PIECES_PX_PER_M)
    stage.render_to(os.path.join(HERE, 'pieces.sheet.raw.png'))


def render_clips():
    """Ten frames per row: the arm's small step (frames 0-4), then the hoist's big level-up (5-9)."""
    building, rig, car = stage_workshop()
    pieces = {obj.name: obj for obj in append_parts_of(PIECES)}
    arms = {side: Arm(rig, side) for side in ('left', 'right')}
    hoist = Hoist(rig)
    lift = rig['showcase-lift']
    bpy.context.scene.cycles.samples = CLIP_SAMPLES
    stage.frame_orthographic(*CLIP_WINDOW, CLIP_PX_PER_M)
    for row in ROWS:
        render_row_clip(row, pieces, arms, hoist, lift, car)


def render_row_clip(row, pieces, arms, hoist, lift, car):
    hide(pieces.values())
    tool, component = piece_of(pieces, row, 'step'), piece_of(pieces, row, 'major')
    tool.hide_render = component.hide_render = False
    raise_car(lift, car, LIFT_RAISE if row == 'engine' else 0.0)
    target = attach_world(row)
    if row == 'engine':
        target = (target[0], target[1] + LIFT_RAISE)
    worker = arms['right'] if ATTACH_AT[row][0] > 0.1 else arms['left']
    idle = arms['left'] if worker is arms['right'] else arms['right']
    idle.hold(None)
    idle.rest()
    worker.hold(tool)
    hoist.carry(component)
    folder = os.path.join(HERE, 'clips', row)
    os.makedirs(folder, exist_ok=True)
    for frame in range(CLIP_FRAMES):
        pose_frame(frame, worker, hoist, target)
        stage.render_to(os.path.join(folder, 'frame-%02d.png' % frame))


def pose_frame(frame, worker, hoist, target):
    """The arm reaches by frame 3 and withdraws by 4; the hoist lands the component by frame 8."""
    reach = (0.0, 0.45, 0.85, 1.0, 0.4, 0.0, 0.0, 0.0, 0.0, 0.0)[frame]
    worker.reach(target, blend=ease(reach))
    drop = (0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.55, 0.85, 1.0, 0.35)[frame]
    rest_bottom = hoist.chain_top - hoist.chain_length - hoist.hook_height
    load_height = hoist.load.dimensions.z
    landed_bottom = target[1] + load_height
    hoist.place(target[0] * ease(min(1.0, drop * 2)), rest_bottom + (landed_bottom - rest_bottom) * ease(drop))
    if frame == 9:
        hoist.load.location = (target[0], hoist.load.location.y, target[1])


def raise_car(lift, car, by):
    """Lifts the cradle and the car on it; each part remembers its raise in a custom property."""
    lift.location.z = -0.1 + by
    for obj in car:
        obj.location.z = obj.location.z - obj.get('raised_by', 0.0) + by
        obj['raised_by'] = by


RENDERS = {'showcase': render_showcase, 'pieces': render_pieces, 'clips': render_clips}

if __name__ == '__main__':
    main()
