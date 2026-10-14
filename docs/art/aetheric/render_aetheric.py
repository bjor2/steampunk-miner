"""
Review renders of the aetheric vehicle parts (ticket 363, the art half of #265): each part alone
in the game's front view, and the tier-3 rig bare and with all five fitted, at review size and at
gameplay zoom.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/render_aetheric.py [-- alone|rig]

It reads the sources art/blender/<id>/ and writes the PNGs into this folder. The rig is the tech
gear review's (render_tech_gear.py: the tier-3 vehicle, the look-3 turret and the dynamite rack).
Each part's origin sits at its `stageAtM` from aethericParts.json, a review position next to the
sidecar point the GD's words name, not the TD's attach point, which comes with the wiring (#265).
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'tech-gear'))

import render_dynamite as stage  # noqa: E402
import render_tech_gear as rig  # noqa: E402

PARTS_TABLE = os.path.join(HERE, 'aethericParts.json')
ALONE_PX_PER_M = 768
RIG_PX_PER_M = 512
# About what a 1080p screen shows at the default 12 m zoom (#39), as the tech gear renders use.
INGAME_PX_PER_M = 90
ALONE_SAMPLES = 32
RIG_SAMPLES = 48
MARGIN_M = 0.03
# The tech gear review's frame, so the two rig sheets line up when compared.
RIG_FRAME = ((0.1, 0.1), 2.2, 1.5)
RIG_LOOKS = ('bare', 'fitted')


def main():
    table = read_table()
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['alone', 'rig']
    if 'alone' in wanted:
        for entry in table['parts']:
            render_alone(entry)
    if 'rig' in wanted:
        for look in RIG_LOOKS:
            render_rig(table, look)


def read_table():
    with open(PARTS_TABLE, encoding='utf8') as file:
        return json.load(file)


def render_alone(entry):
    stage.open_source(entry['assetId'])
    light_opaque_stage(ALONE_SAMPLES)
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    width, height = max_x - min_x + 2 * MARGIN_M, max_z - min_z + 2 * MARGIN_M
    stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, ALONE_PX_PER_M)
    stage.render_to(output_path('%s.front.png' % entry['assetId']))


def render_rig(table, look):
    rig.stage_vehicle(attach_points())
    if look == 'fitted':
        for entry in table['parts']:
            fit_on_rig(entry)
    rig.settle()
    light_opaque_stage(RIG_SAMPLES)
    for px_per_m, suffix in ((RIG_PX_PER_M, ''), (INGAME_PX_PER_M, '.ingame')):
        stage.frame_orthographic(*RIG_FRAME, px_per_m)
        stage.render_to(output_path('rig.%s%s.png' % (look, suffix)))


def light_opaque_stage(samples):
    stage.stage_lights_and_world()
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.cycles.samples = samples


def attach_points():
    return {point['id']: point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach']}


def fit_on_rig(entry):
    """In front of the hull's relief, stepped by draw order as the tech gear review does."""
    at_x, at_z = entry['stageAtM']
    in_front_y = rig.HULL_FRONT['y'] - rig.GEAR_CLEARANCE_Y + rig.Y_PER_DRAW_ORDER * (entry['z'] + 1)
    for obj in stage.append_parts_of(entry['assetId']):
        obj.location.x += at_x
        obj.location.z += at_z
        obj.location.y += in_front_y


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
