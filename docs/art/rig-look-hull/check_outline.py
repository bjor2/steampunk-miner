"""
The outline check of the hull rig-look parts (ticket 584, #576 rules: a look stays inside the
rig outline and never changes collision or the hitbox). It rasterises the silhouette in the game's
front view (X right, Z up) of the rig at rest, at tiers 1 and 3, on a 4 mm grid, and of each look
standing on the `hull.plates` slot, and writes outline.json: the cells of each look outside the
rig's silhouette (must be none) and, for the base look, the cells by which it differs from the
pod fittings it reproduces, the rig's own bands and porthole (must be none: below the first step
the rig is as it is). It exits 1 on either.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/check_outline.py

Collision needs no check here: the collider is a code constant (`COLLIDER_M` in
author_casing_driller.py mirrors it) and vehicle.blend is untouched, so nothing a look does can
reach it.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'aetheric'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'dynamite'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'tech-gear'))

import check_clearance as grid  # noqa: E402
import render_casing_driller as driller  # noqa: E402
import render_dynamite as stage  # noqa: E402
import render_tech_gear as rig  # noqa: E402

LOOKS_TABLE = os.path.join(HERE, 'hullLooks.json')
REPORT = os.path.join(HERE, 'outline.json')
RIG_TIERS = (1, 3)
# The base look reproduces these pod fittings (author_hull_looks.bronze_pod_pieces): the rig's
# own silhouette inside this window of the tier-1 pod, in the vehicle frame (x0, z0, x1, z1).
BASE_WINDOW_M = (-0.25, -0.2, 0.25, 0.10)


def main():
    table = read_table()
    report = {look['part']: outline_of(table, look) for look in table['looks']}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_about(table, report), file, indent=2)
    problems = problems_in(table, report)
    for problem in problems:
        print('outline check failed: ' + problem, file=sys.stderr)
    if problems:
        raise SystemExit(1)
    print('outline check passed: ' + ', '.join(report))


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


def outline_of(table, look):
    look_mask = look_silhouette(table, look)
    outside = {('tier-%d' % tier): int((look_mask & ~rig_silhouette(tier)).sum()) for tier in RIG_TIERS}
    entry = {'cells': int(look_mask.sum()), 'outsideRig': outside}
    if look.get('unnamedDefault'):
        entry['addsToPod'] = int((look_mask & ~pod_fittings_silhouette()).sum())
    return entry


def look_silhouette(table, look):
    grid.fresh_scene()
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name == look['part']]
    grid.move_by(placed, attach_point(table['attach'])['atM'])
    return grid.silhouette_of(placed)


def rig_silhouette(tier):
    driller.stage_vehicle(tier)
    return grid.silhouette_of([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])


def pod_fittings_silhouette():
    """The tier-1 chassis's cells inside the base window: the bands and porthole are the pod's own
    skin, so the base look can add no cell to them."""
    driller.stage_vehicle(1)
    mask = grid.silhouette_of([bpy.data.objects['t1-chassis']])
    window = grid.np.zeros_like(mask)
    x0, z0, x1, z1 = BASE_WINDOW_M
    rows = grid.cell_range(z0, z1, grid.WINDOW_M[1], grid.ROWS)
    columns = grid.cell_range(x0, x1, grid.WINDOW_M[0], grid.COLUMNS)
    window[rows[0]:rows[1], columns[0]:columns[1]] = True
    return mask | ~window


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def problems_in(table, report):
    problems = []
    for part, entry in report.items():
        problems += ['%s has %d cells outside the %s rig' % (part, cells, tier)
                     for tier, cells in entry['outsideRig'].items() if cells]
        if entry.get('addsToPod'):
            problems.append('%s adds %d cells to the pod\'s own bands and porthole' % (part, entry['addsToPod']))
    return problems


def report_about(table, report):
    return {
        'about': 'Ticket 584: silhouette cells of each hull look on %s, on a %g mm grid, outside the rig at '
                 'rest at tiers %s, and, for the base look, the cells it adds to the tier-1 pod\'s own skin '
                 'inside the window %s (its bands and porthole); written by check_outline.py. '
                 '`outsideRig` must be all zero; the base look\'s `addsToPod` must be zero.'
                 % (table['attach'], grid.CELL_M * 1000, ' and '.join(str(tier) for tier in RIG_TIERS),
                    list(BASE_WINDOW_M)),
        'looks': report,
    }


if __name__ == '__main__':
    main()
