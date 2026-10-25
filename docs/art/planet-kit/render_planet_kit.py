"""
Review renders of the planet-kit art (ticket 825): each kit socket's parts alone in the game's
front view; the rig at tiers 1 and 3 bare and with every tool fitted, at rest and acting; each
merchant frontage alone and on the Assay & Exchange; the Cache Crate prop alone. Then the outline
report: every socket part's silhouette against the rig's at both tiers, the G&V guard (ticket 823:
no part draws past the rig's outline; the drill tip stays, #789).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/planet-kit/render_planet_kit.py [-- alone|rig|merchants|crate|outline]
    python3 docs/art/planet-kit/sheet_planet_kit.py

The first reads the sources art/blender/<id>/ and writes raw PNGs into build/ beside this file and
outline.json; the second (Blender's Python has no PIL) lays them out into the contact sheets at
desktop and phone size and measures what the eye is asked to judge. Every placement comes from the
data the game reads: a socket part sits at its point's `atM` from the exported vehicle sidecar,
posed as kitSockets.json says and as kitSocketLook.ts poses it; a frontage sits at merchantArt.json's
`atM` on the station. Nothing is hand-placed.
"""

import json
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
for folder in ('aetheric', 'casing-driller', 'dynamite', 'tech-gear', 'shops'):
    sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', folder))

import check_clearance as grid  # noqa: E402
import render_casing_driller as driller  # noqa: E402
import render_dynamite as stage  # noqa: E402
import render_shops as shops  # noqa: E402
import render_tech_gear as rig  # noqa: E402

BUILD = os.path.join(HERE, 'build')
REPORT = os.path.join(HERE, 'outline.json')
SOCKETS_TABLE = os.path.join(REPO_ROOT, 'src', 'features', 'planet-kit', 'kitSockets.json')
MERCHANTS_TABLE = os.path.join(REPO_ROOT, 'src', 'features', 'planet-kit', 'merchantArt.json')
VEHICLE_SIDECAR = os.path.join(REPO_ROOT, 'public', 'assets', 'vehicle', 'vehicle', 'vehicle.parts.json')
STATION = 'platform-building-sell'
CRATE = 'prop-cache-crate'
ALONE_PX_PER_M = 768
PROP_PX_PER_M = 256
FRONTAGE_PX_PER_M = 128
RIG_PX_PER_M = 512
# 1080 px over the 12 m default zoom (#39): what a desktop screen shows of the dock.
DESKTOP_PX_PER_M = 90
ALONE_SAMPLES = 32
RIG_SAMPLES = 32
MARGIN_M = 0.03
RIG_FRAME = driller.FRAME
# The station alone, as render_service_station.py frames it.
STATION_FRAME = ((0.0, 4.2), 7.0, 9.4)
RIG_TIERS = (1, 3)
# What a socket shows: at rest, and everything (every flask, the shard, the acting pose).
SHOWS = (('rest', {'heldFlasks': 0, 'isActing': False}), ('acting', {'heldFlasks': 3, 'isActing': True}))
DRILLING_GLOWS = ('nose-glow',)
# As render_tech_gear places gear: nearer the camera than the hull, a hair per draw order.
GEAR_CLEARANCE_Y = 0.05
Y_PER_DRAW_ORDER = -0.002


def main():
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['alone', 'rig', 'merchants', 'crate', 'outline']
    os.makedirs(BUILD, exist_ok=True)
    sockets = read_json(SOCKETS_TABLE)['sockets']
    merchants = read_json(MERCHANTS_TABLE)
    if 'alone' in wanted:
        for socket in sockets:
            render_socket_alone(socket)
    if 'rig' in wanted:
        for tier in RIG_TIERS:
            render_rig(sockets, tier)
    if 'merchants' in wanted:
        render_station_bare()
        for frontage in merchants['frontages']:
            render_frontage_alone(frontage)
            render_frontage_on_station(merchants, frontage)
    if 'crate' in wanted:
        render_crate()
    if 'outline' in wanted:
        write_outline_report(sockets)


def read_json(path):
    with open(path, encoding='utf8') as file:
        return json.load(file)


def build_path(name):
    return os.path.join(BUILD, name)


def light_opaque(samples):
    stage.stage_lights_and_world()
    bpy.context.scene.cycles.samples = samples


def frame_bounds(px_per_m):
    min_x, min_z, max_x, max_z = stage.mesh_bounds()
    width, height = max_x - min_x + 2 * MARGIN_M, max_z - min_z + 2 * MARGIN_M
    stage.frame_orthographic(((min_x + max_x) / 2, (min_z + max_z) / 2), width, height, px_per_m)


# --- the sockets ---------------------------------------------------------------------------------


def attach_points():
    return {point['id']: point for point in read_json(VEHICLE_SIDECAR)['attach']}


def render_socket_alone(socket):
    grid.fresh_scene()
    stage.append_parts_of(socket['assetId'])
    rig.settle()
    light_opaque(ALONE_SAMPLES)
    frame_bounds(ALONE_PX_PER_M)
    stage.render_to(build_path('%s.front.png' % socket['assetId']))


def render_rig(sockets, tier):
    attach = attach_points()
    driller.stage_vehicle(tier)
    driller.light_glows(DRILLING_GLOWS)
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
    stage.render_to(build_path('rig.tier-%d.bare.png' % tier))
    for look, show in SHOWS:
        driller.stage_vehicle(tier)
        hull_y = rig.nearest_y_of_meshes()
        for socket in sockets:
            fit_socket(socket, attach[socket['attach']], show, hull_y)
        rig.settle()
        driller.light_glows(DRILLING_GLOWS)
        light_opaque(RIG_SAMPLES)
        stage.frame_orthographic(RIG_FRAME[0], RIG_FRAME[1], RIG_FRAME[2], RIG_PX_PER_M)
        stage.render_to(build_path('rig.tier-%d.%s.png' % (tier, look)))


def fit_socket(socket, point, show, hull_y):
    """The socket's parts at the point, as kitSocketLook.ts shows and poses them."""
    rows = {part['id']: part for part in socket['parts']}
    placed = []
    for obj in stage.append_parts_of(socket['assetId']):
        row = rows[obj.name.split('.')[0]]
        if not is_part_shown(row, show):
            bpy.data.objects.remove(obj)
            continue
        pose = pose_of(row, show['isActing'])
        obj.location.x += point['atM'][0] + pose['shift'][0]
        obj.location.z += point['atM'][1] + pose['shift'][1]
        obj.location.y = hull_y - GEAR_CLEARANCE_Y + Y_PER_DRAW_ORDER * (row['z'] + 1)
        obj.rotation_euler.y = -pose['turn']
        placed.append(obj)
    return placed


def is_part_shown(row, show):
    if 'shownFromHeld' in row and show['heldFlasks'] < row['shownFromHeld']:
        return False
    return not row.get('shownWhileActing') or show['isActing']


def pose_of(row, is_acting):
    key = 'acting' if is_acting else 'resting'
    return row.get(key) or {'turn': 0.0, 'shift': [0.0, 0.0]}


# --- the merchants -------------------------------------------------------------------------------


def render_station_bare():
    grid.fresh_scene()
    shops.append_parts_of(STATION)
    rig.settle()
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(STATION_FRAME[0], STATION_FRAME[1], STATION_FRAME[2], DESKTOP_PX_PER_M)
    stage.render_to(build_path('station.bare.png'))


def render_frontage_alone(frontage):
    grid.fresh_scene()
    stage.append_parts_of(frontage['assetId'])
    rig.settle()
    light_opaque(ALONE_SAMPLES)
    frame_bounds(FRONTAGE_PX_PER_M)
    stage.render_to(build_path('%s.front.png' % frontage['assetId']))


def render_frontage_on_station(merchants, frontage):
    grid.fresh_scene()
    shops.append_parts_of(STATION)
    station_front_y = rig.nearest_y_of_meshes()
    for obj in stage.append_parts_of(frontage['assetId']):
        obj.location.x += merchants['atM'][0]
        obj.location.z += merchants['atM'][1]
        # The station's facade carries relief up to 0.35 m; the frontage hangs in front of it all.
        obj.location.y += min(0.0, station_front_y + 0.2)
    rig.settle()
    light_opaque(RIG_SAMPLES)
    stage.frame_orthographic(STATION_FRAME[0], STATION_FRAME[1], STATION_FRAME[2], DESKTOP_PX_PER_M)
    stage.render_to(build_path('station.%s.png' % frontage['assetId']))


# --- the crate -----------------------------------------------------------------------------------


def render_crate():
    grid.fresh_scene()
    stage.append_parts_of(CRATE)
    rig.settle()
    light_opaque(ALONE_SAMPLES)
    frame_bounds(PROP_PX_PER_M)
    stage.render_to(build_path('%s.front.png' % CRATE))


# --- the outline report ---------------------------------------------------------------------------


def write_outline_report(sockets):
    """
    Each socket part's silhouette cells (4 mm) outside the rig's at tiers 1 and 3, at rest and
    acting, and its rightmost cell against the drawn drill tip's. A cell count is a finding for the
    README, never a tuning lever: the G&V guard is judged on the rig's bounds (kitSocketLook.test.ts).
    """
    attach = attach_points()
    rigs = {tier: rig_silhouette(tier) for tier in RIG_TIERS}
    tips = {tier: drill_tip_column(tier) for tier in RIG_TIERS}
    report = {}
    for socket in sockets:
        for look, show in SHOWS:
            entry = {}
            for tier in RIG_TIERS:
                mask = socket_silhouette(socket, attach[socket['attach']], show)
                columns = np.nonzero(mask.any(axis=0))[0]
                entry['tier-%d' % tier] = {
                    'cells': int(mask.sum()),
                    'outsideRig': int((mask & ~rigs[tier]).sum()),
                    'behindDrillTip': bool(columns.size == 0 or int(columns.max()) < tips[tier]),
                }
            report['%s.%s' % (socket['itemId'], look)] = entry
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump({'cellM': grid.CELL_M, 'windowM': list(grid.WINDOW_M), 'sockets': report}, file, indent=2)
        file.write('\n')
    print('outline report: ' + ', '.join('%s %s' % (key, value) for key, value in report.items()))


def rig_silhouette(tier):
    driller.stage_vehicle(tier)
    return grid.silhouette_of([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])


def drill_tip_column(tier):
    """The rightmost cell of the drawn drill bit: a socket part stays left of it (#789)."""
    driller.stage_vehicle(tier)
    bits = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name.split('.')[0].endswith('drill-bit')]
    columns = np.nonzero(grid.silhouette_of(bits).any(axis=0))[0]
    return int(columns.max())


def socket_silhouette(socket, point, show):
    grid.fresh_scene()
    placed = fit_socket(socket, point, show, 0.0)
    return grid.silhouette_of(placed)


if __name__ == '__main__':
    main()
