"""
The clearance check of the five aetheric attach points (ticket 376, TD lock on #265): each part at
its point must overlap nothing that can be drawn on the vehicle with it. It rasterises the
silhouette in the game's front view (X right, Z up) of every such part on a 4 mm grid and writes
the overlaps to clearance.json; it exits 1 when there is any.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/check_clearance.py

Checked against each part: every gear row of techGear.json at its point, folded and deployed (an
extractor's unfold in between is listed apart, as `unfold`, since it lasts 8 ticks); every slot
housing in each of the five cradles; the auto-guns turret at every look, the dynamite rack and the
bore gun; the hull.stack showcase stack at every tier and the hull.liner point; and the other four
aetheric parts (their own gear rows are skipped). The vehicle's own hull, boilers and wheels are
what the parts are mounted on, so they are not obstacles.
"""

import json
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'tech-gear'))
sys.path.insert(0, HERE)

import render_aetheric as aetheric  # noqa: E402
import render_dynamite as stage  # noqa: E402
import render_tech_gear as rig  # noqa: E402

REPORT = os.path.join(HERE, 'clearance.json')
CELL_M = 0.004
WINDOW_M = (-1.0, -0.7, 1.2, 1.0)
REST_POSES = (0.0, 1.0)
UNFOLD_POSES = (0.25, 0.5, 0.75)
SLOT_POINTS = ('powerup.1', 'powerup.2', 'powerup.3', 'powerup.4', 'powerup.5')
TURRET = 'vehicle-auto-guns'
BORE_GUN = ('vehicle-bore-gun', 'hull.front')
RACK = ('vehicle-dynamite-rack', 'hull.rear')
SHOWCASE_STACK_PARTS = ('t2-stack-2', 't3-stack-2')
LINER_POINT = 'hull.liner'
LINER_RADIUS_M = 0.03

COLUMNS = int(round((WINDOW_M[2] - WINDOW_M[0]) / CELL_M))
ROWS = int(round((WINDOW_M[3] - WINDOW_M[1]) / CELL_M))
CELL_X = WINDOW_M[0] + (np.arange(COLUMNS) + 0.5) * CELL_M
CELL_Z = WINDOW_M[1] + (np.arange(ROWS) + 0.5) * CELL_M


def main():
    attach = aetheric.attach_points()
    rig.HULL_FRONT['y'] = 0.0
    parts = aetheric_silhouettes(attach)
    obstacles = obstacle_silhouettes(attach)
    report = {name: clearance_of(name, mask, parts, obstacles) for name, mask in parts.items()}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_with_points(report, attach), file, indent=2)
        file.write('\n')
    if any(entry['overlaps'] for entry in report.values()):
        sys.exit(1)


# --- what is drawn ---------------------------------------------------------------------------------


def aetheric_silhouettes(attach):
    masks = {}
    for entry in aetheric.read_table()['parts']:
        fresh_scene()
        placed = stage.append_parts_of(entry['assetId'])
        move_by(placed, attach[entry['attach']]['atM'])
        masks[entry['attach']] = silhouette_of(placed)
    return masks


def obstacle_silhouettes(attach):
    """(name, pose, mask) for everything that can be on the vehicle with the five parts."""
    table = rig.read_json(rig.GEAR_TABLE)
    obstacles = []
    for item in table['items']:
        if not is_aetheric(item):
            obstacles += gear_silhouettes(item, attach)
    obstacles += asset_part_silhouettes(TURRET, (0.0, 0.0), 'turret')
    obstacles += [(asset, 'fitted', asset_silhouette(asset, attach[point]['atM'])) for asset, point in (RACK, BORE_GUN)]
    obstacles += [(name, 'showcase', mask) for name, _, mask in asset_part_silhouettes('vehicle', (0.0, 0.0), 'vehicle')
                  if name.split('/')[1] in SHOWCASE_STACK_PARTS]
    obstacles.append((LINER_POINT, 'showcase', disk_at(attach[LINER_POINT]['atM'], LINER_RADIUS_M)))
    return obstacles


def is_aetheric(item):
    """A gear row of one of the five parts themselves: #262 ships the whistle as a slot row until
    #265 moves it to its point."""
    return any(entry['itemId'] == item['itemId'] for entry in aetheric.read_table()['parts'])


def gear_silhouettes(item, attach):
    if item['attach'] == 'slot':
        return [(item['itemId'], slot, mounted_silhouette(item, attach, slot, 0.0)) for slot in SLOT_POINTS]
    rest = [(item['itemId'], pose_name(fraction), mounted_silhouette(item, attach, None, fraction))
            for fraction in REST_POSES]
    if item['kind'] != 'extractor':
        return rest
    unfold = np.any([mounted_silhouette(item, attach, None, fraction) for fraction in UNFOLD_POSES], axis=0)
    return rest + [(item['itemId'], 'unfold', unfold)]


def pose_name(fraction):
    return 'folded' if fraction == 0.0 else 'deployed'


def mounted_silhouette(item, attach, slot, fraction):
    fresh_scene()
    return silhouette_of(rig.mount(item, attach, slot, fraction))


def asset_silhouette(asset_id, at_m):
    fresh_scene()
    placed = stage.append_parts_of(asset_id)
    move_by(placed, at_m)
    return silhouette_of(placed)


def asset_part_silhouettes(asset_id, at_m, label):
    fresh_scene()
    placed = stage.append_parts_of(asset_id)
    move_by(placed, at_m)
    return [('%s/%s' % (label, obj.name), 'every look', silhouette_of([obj])) for obj in placed]


def fresh_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def move_by(objects, at_m):
    for obj in objects:
        obj.location.x += at_m[0]
        obj.location.z += at_m[1]


# --- silhouettes -----------------------------------------------------------------------------------


def silhouette_of(objects):
    """The cells the objects' triangles cover in the front view."""
    rig.settle()
    graph = bpy.context.evaluated_depsgraph_get()
    mask = np.zeros((ROWS, COLUMNS), bool)
    for obj in objects:
        for triangle in front_triangles_of(obj, graph):
            fill_triangle(mask, triangle)
    return mask


def front_triangles_of(obj, graph):
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    corners = np.array([(obj.matrix_world @ vertex.co)[:] for vertex in mesh.vertices]).reshape(-1, 3)[:, [0, 2]]
    triangles = [corners[list(triangle.vertices)] for triangle in mesh.loop_triangles]
    evaluated.to_mesh_clear()
    return triangles


def fill_triangle(mask, triangle):
    a, b, c = triangle
    low, high = triangle.min(axis=0), triangle.max(axis=0)
    i0, i1 = cell_range(low[0], high[0], WINDOW_M[0], COLUMNS)
    j0, j1 = cell_range(low[1], high[1], WINDOW_M[1], ROWS)
    area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if i1 <= i0 or j1 <= j0 or abs(area) < 1e-12:
        return
    x, z = np.meshgrid(CELL_X[i0:i1], CELL_Z[j0:j1])
    first = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / area
    second = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / area
    mask[j0:j1, i0:i1] |= (first >= 0) & (second >= 0) & (first + second <= 1)


def cell_range(low, high, origin, count):
    return max(0, int((low - origin) / CELL_M)), min(count, int((high - origin) / CELL_M) + 1)


def disk_at(at_m, radius):
    x, z = np.meshgrid(CELL_X, CELL_Z)
    return (x - at_m[0]) ** 2 + (z - at_m[1]) ** 2 <= radius * radius


# --- the report ------------------------------------------------------------------------------------


def clearance_of(name, mask, parts, obstacles):
    others = [(other, 'fitted', other_mask) for other, other_mask in parts.items() if other != name]
    overlaps, unfold = [], []
    for obstacle, pose, obstacle_mask in obstacles + others:
        cells = int((mask & obstacle_mask).sum())
        if cells:
            (unfold if pose == 'unfold' else overlaps).append({'with': obstacle, 'pose': pose, 'cells': cells})
    return {'overlaps': overlaps, 'unfold': unfold, 'checked': len(obstacles) + len(others)}


def report_with_points(report, attach):
    return {
        'about': 'Ticket 376: silhouette overlaps of each aetheric part at its attach point, on a %g mm grid; '
                 'written by check_clearance.py. `overlaps` must be empty; `unfold` lists the 8-tick '
                 'extractor unfold sweep for the record.' % (CELL_M * 1000),
        'points': {name: {'atM': attach[name]['atM'], 'z': attach[name]['z'], **entry}
                   for name, entry in report.items()},
    }


if __name__ == '__main__':
    main()
