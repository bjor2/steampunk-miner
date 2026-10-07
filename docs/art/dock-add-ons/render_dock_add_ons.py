"""
Review renders of the three in-place dock add-ons (#197a, the #170 amendment): each add-on alone
(the game's front view and a three-quarter view), each bolted onto its host building, and the
planet 20 pad with both buildings and all three add-ons as the game will place them.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/dock-add-ons/render_dock_add_ons.py
    python3 docs/art/dock-add-ons/sheet_dock_add_ons.py

The first reads the sources art/blender/<id>/ and writes the renders into this folder; the second
(Blender's Python has no PIL) cuts the pad render into the phone, grayscale and silhouette sheets.
The frame, lights and cameras are docs/art/shops/render_shops.py's (#174). Each add-on is placed
at its host's origin (the zone centre, Sell -5 m and the Works +7 m) plus its `atM` from
src/features/dock-buildings/dockAddOns.json, the same numbers the slice's rules use, on the
-8..+18 pad planet 20 has (the merchants' counter from P10 is not built yet, so bare pad). It
refuses a source with more than two parts (#170 amendment "Parts").
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'shops'))

import render_shops as shops  # noqa: E402

ADD_ONS_FILE = os.path.join(REPO_ROOT, 'src', 'features', 'dock-buildings', 'dockAddOns.json')
HOST_ASSET_IDS = {'sell': 'platform-building-sell', 'upgrade': 'platform-building-upgrade'}
MAX_ADD_ON_PARTS = 2
# The TD's pad formula (#170): -8..+12, plus 6 columns east per counter building; one at P20.
P20_PAD_COLUMNS = (-8, 18)
ALONE_SAMPLES = 32


def main():
    add_ons = read_add_ons()
    for add_on in add_ons:
        render_alone(add_on)
        render_on_host(add_on)
    stage_pad(add_ons)
    render_pad()


def read_add_ons():
    with open(ADD_ONS_FILE, encoding='utf8') as file:
        return json.load(file)['addOns']


def asset_id_of(add_on):
    return 'platform-' + add_on['rowId'].replace('_', '-')


def host_offset_of(add_on):
    """World metres of the add-on's origin: its host's zone centre plus its `atM`."""
    host_x = shops.BUILDINGS[HOST_ASSET_IDS[add_on['host']]]
    return host_x + add_on['atM'][0], add_on['atM'][1]


# --- scenes --------------------------------------------------------------------------------------


def open_add_on(add_on):
    asset_id = asset_id_of(add_on)
    shops.open_source(asset_id)
    refuse_over_two_parts(asset_id)
    shops.stage_lights_and_world()
    bpy.context.scene.cycles.samples = ALONE_SAMPLES
    return asset_id


def refuse_over_two_parts(asset_id):
    parts = [obj.name for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(parts) > MAX_ADD_ON_PARTS:
        raise SystemExit('%s has %d parts (%s); the add-on cap is %d' % (asset_id, len(parts), ', '.join(parts), MAX_ADD_ON_PARTS))
    print('%s parts: %s' % (asset_id, ', '.join(sorted(parts))))


def stage_host_with(add_on):
    """The host building at the origin with the add-on bolted on at its `atM`."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shops.append_parts_of(HOST_ASSET_IDS[add_on['host']])
    place_add_on(add_on, 0.0)
    settle_placements()
    shops.stage_lights_and_world()
    bpy.context.scene.cycles.samples = ALONE_SAMPLES


def stage_pad(add_ons):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for asset_id, centre_x in shops.BUILDINGS.items():
        for obj in shops.append_parts_of(asset_id):
            obj.location.x += centre_x
    for add_on in add_ons:
        place_add_on(add_on, shops.BUILDINGS[HOST_ASSET_IDS[add_on['host']]])
    add_pad(P20_PAD_COLUMNS)
    settle_placements()
    shops.stage_lights_and_world()


def place_add_on(add_on, host_x):
    for obj in shops.append_parts_of(asset_id_of(add_on)):
        obj.location.x += host_x + add_on['atM'][0]
        obj.location.z += add_on['atM'][1]


def settle_placements():
    """Moved objects keep stale world matrices until the view layer updates; the bounds read them."""
    bpy.context.view_layer.update()


def add_pad(columns):
    first, last = columns
    width = last - first + 1
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=((first + last + 1) / 2, 2.0, -0.5))
    pad = bpy.context.active_object
    pad.scale = (width, 6.0, 1.0)
    material = bpy.data.materials.new('pad')
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*shops.PAD_COLOUR, 1.0)
    shader.inputs['Roughness'].default_value = 0.9
    pad.data.materials.append(material)


# --- renders -------------------------------------------------------------------------------------


def output_path(name):
    return os.path.join(HERE, name)


def render_alone(add_on):
    """The add-on by itself: the game's front view at 128 px/m, then a three-quarter view."""
    asset_id = open_add_on(add_on)
    min_x, min_z, max_x, max_z = shops.mesh_bounds()
    width, height = max_x - min_x + 1.0, max_z - min_z + 1.0
    centre = ((min_x + max_x) / 2, (min_z + max_z) / 2)
    shops.frame_orthographic(centre, width, height, shops.TURNAROUND_PX_PER_M)
    shops.render_to(output_path(asset_id + '.front.png'))
    eye = (centre[0] + width * 1.1, -max(width, height) * 1.6, centre[1] + height * 0.6)
    shops.frame_perspective(eye, (centre[0], 0.0, centre[1]), 40.0, 1000, 900)
    shops.render_to(output_path(asset_id + '.three-quarter.png'))


def render_on_host(add_on):
    """The host building with the add-on on it, front view at 128 px/m, framed on the pair."""
    stage_host_with(add_on)
    min_x, min_z, max_x, max_z = shops.mesh_bounds()
    width, height = max_x - min_x + 1.0, max_z - min_z + 1.0
    centre = ((min_x + max_x) / 2, (min_z + max_z) / 2)
    shops.frame_orthographic(centre, width, height, shops.TURNAROUND_PX_PER_M)
    shops.render_to(output_path(asset_id_of(add_on) + '.on-host.png'))


def render_pad():
    """The planet 20 dock from the pad's west edge to its east edge, at desktop density."""
    first, last = P20_PAD_COLUMNS
    width = last - first + 3
    height = 14.5
    shops.frame_orthographic(((first + last + 1) / 2, height / 2 - 1.0), width, height, shops.DESKTOP_PX_PER_M)
    return shops.render_to(output_path('pad-p20.desktop.raw.png'))


if __name__ == '__main__':
    main()
