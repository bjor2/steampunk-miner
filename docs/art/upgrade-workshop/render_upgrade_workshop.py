"""
Review renders of the upgrade workshop hangar (ticket 395): the building alone, the casing driller
on its turntable under the showcase rig, the hangar with the add-ons it hosts, and the idle motion
the dock-buildings slice plays (the turntable turning, the gantry swaying).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/upgrade-workshop/render_upgrade_workshop.py [-- front fitted host idle]
    python3 docs/art/upgrade-workshop/sheet_upgrade_workshop.py

The first reads the sources (art/blender/platform-building-upgrade, -workshop-showcase, the
vehicle and the add-ons) and writes the renders into this folder; the second (Blender's Python
has no PIL) writes the grayscale, phone and silhouette sheets and the idle strip. The stage
(lights, world, cameras, the pad) is the shop buildings' (docs/art/shops/render_shops.py).

The idle frames turn the turntable about its axis in 3D and the gantry about its root bearing, the
motion the slice imitates on the flat art (`turntableSpin.ts`, `worksIdle.json`). The steam is
particles in the game and is not rendered here; `ingame.docked.png` shows it.
"""

import json
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
VEHICLE = 'vehicle'
ADD_ONS_FILE = os.path.join(REPO_ROOT, 'src', 'features', 'dock-buildings', 'dockAddOns.json')
IDLE_FILE = os.path.join(REPO_ROOT, 'src', 'features', 'dock-buildings', 'worksIdle.json')
FRONT_PX_PER_M = 128
FITTED_WINDOW = ((0.0, 2.6), 8.4, 6.0)
IDLE_WINDOW = ((-0.8, 2.3), 6.4, 5.4)
IDLE_PX_PER_M = 96
IDLE_FRAMES = 4
IDLE_SAMPLES = 24
# The car's origin is 0.48 m above its wheels (render_showcase.py); it stands on the pad.
VEHICLE_Z = 0.48
VEHICLE_Y = -1.9
# Behind the shell, or in front of it, as the slice's draw order layers the add-ons.
ADD_ON_Y = {'behind': 2.4, 'front': -1.9}
HOST_PAD_COLUMNS = (-6, 6)


def main():
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for name in wanted or list(RENDERS):
        RENDERS[name]()


# --- scenes --------------------------------------------------------------------------------------


def fresh_stage():
    """An empty scene with the hangar's parts, by name."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return {obj.name: obj for obj in append_parts_of(BUILDING)}


def finish_stage(pad_columns=None):
    if pad_columns is not None:
        stage.PAD_COLUMNS = pad_columns
    stage.add_pad()
    stage.stage_lights_and_world()
    bpy.context.view_layer.update()


def append_parts_of(asset_id, keep=lambda name: True):
    path = os.path.join(REPO_ROOT, 'art', 'blender', asset_id, asset_id + '.blend')
    with bpy.data.libraries.load(path, link=False) as (source, target):
        target.objects = [name for name in source.objects if keep(name)]
    parts = [obj for obj in target.objects if obj is not None and obj.type == 'MESH']
    for obj in parts:
        bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    return parts


def add_car():
    for obj in append_parts_of(VEHICLE, keep=lambda name: name.startswith('t1-')):
        obj.location += Vector((0.0, VEHICLE_Y, VEHICLE_Z))


def add_hosted_add_ons():
    with open(ADD_ONS_FILE, encoding='utf8') as file:
        add_ons = [add_on for add_on in json.load(file)['addOns'] if add_on['host'] == 'upgrade']
    for add_on in add_ons:
        asset_id = 'platform-' + add_on['rowId'].replace('_', '-')
        for obj in append_parts_of(asset_id):
            obj.location += Vector((add_on['atM'][0], ADD_ON_Y[add_on['layer']], add_on['atM'][1]))


# --- renders -------------------------------------------------------------------------------------


def render_front():
    """The hangar alone in the game's front view at 128 px/m, then from front-right and above."""
    fresh_stage()
    finish_stage()
    min_x, min_z, max_x, max_z = building_bounds()
    width, height = max_x - min_x + 1.0, max_z - min_z + 1.0
    centre = ((min_x + max_x) / 2, (min_z + max_z) / 2)
    stage.frame_orthographic(centre, width, height, FRONT_PX_PER_M)
    stage.render_to(stage_output('front.png'))
    eye = (centre[0] + width * 1.1, -max(width, height) * 1.6, centre[1] + height * 0.6)
    stage.frame_perspective(eye, (centre[0], 0.0, centre[1]), 40.0, 1200, 900)
    stage.render_to(stage_output('three-quarter.png'))


def render_fitted():
    """The casing driller parked on the turntable under the showcase rig (#182), at 128 px/m."""
    fresh_stage()
    append_parts_of(RIG)
    add_car()
    finish_stage()
    centre, width, height = FITTED_WINDOW
    stage.frame_orthographic(centre, width, height, FRONT_PX_PER_M)
    stage.render_to(stage_output('fitted.png'))


def render_host():
    """The hangar with the research annex behind and the drone hangar on its terrace, at 1080p's 90 px/m."""
    fresh_stage()
    add_hosted_add_ons()
    add_car()
    finish_stage(HOST_PAD_COLUMNS)
    width, height = 14.0, 12.5
    stage.frame_orthographic((0.0, height / 2 - 1.0), width, height, stage.DESKTOP_PX_PER_M)
    stage.render_to(stage_output('host.desktop.raw.png'))


def render_idle():
    """The idle motion as frames: the turntable a quarter rim period further each, the gantry swaying."""
    building = fresh_stage()
    add_car()
    finish_stage()
    bpy.context.scene.cycles.samples = IDLE_SAMPLES
    idle = read_idle()
    turntable, gantry = building['workshop-turntable'], building['workshop-gantry']
    centre, width, height = IDLE_WINDOW
    stage.frame_orthographic(centre, width, height, IDLE_PX_PER_M)
    for frame in range(IDLE_FRAMES):
        turntable.rotation_euler.z = math.radians(idle['turntable']['rimPeriodDegrees'] * frame / IDLE_FRAMES)
        gantry.rotation_euler.y = -idle['gantry']['swayRadians'] * math.sin(2 * math.pi * frame / IDLE_FRAMES)
        bpy.context.view_layer.update()
        stage.render_to(stage_output('idle.%d.raw.png' % frame))


def read_idle():
    with open(IDLE_FILE, encoding='utf8') as file:
        return json.load(file)


def building_bounds():
    """(min x, min z, max x, max z) of the hangar's parts, the pad left out."""
    corners = [obj.matrix_world @ Vector(corner) for obj in bpy.context.scene.objects
               if obj.type == 'MESH' and obj.name != 'Cube' for corner in obj.bound_box]
    xs, zs = [c.x for c in corners], [c.z for c in corners]
    return min(xs), max(min(zs), -0.2), max(xs), max(zs)


def stage_output(name):
    return os.path.join(HERE, name)


RENDERS = {
    'front': render_front,
    'fitted': render_fitted,
    'host': render_host,
    'idle': render_idle,
}

if __name__ == '__main__':
    main()
