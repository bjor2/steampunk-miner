"""
The outline check of the boiler rig-look parts (ticket 582, #576 rules: a look stays inside the
rig outline and never changes collision or the hitbox). It rasterises the silhouette in the game's
front view (X right, Z up) of the rig at rest, at tiers 1 and 3, on a 4 mm grid, and of each look
standing on the `hull.boiler` slot, and writes outline.json: the cells of each look outside the
rig's silhouette (must be none) and the cells by which the kettle look differs from the rig's own
`t1-boiler` (must be none: below the first step the rig is as it is). It exits 1 on either.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/check_outline.py

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

LOOKS_TABLE = os.path.join(HERE, 'boilerLooks.json')
REPORT = os.path.join(HERE, 'outline.json')
RIG_TIERS = (1, 3)


def main():
    table = read_table()
    report = {look['part']: outline_of(table, look) for look in table['looks']}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_about(table, report), file, indent=2)
    problems = problems_in(report)
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
    replaced = int((look_mask ^ slot_part_silhouette(table['replaces'])).sum())
    return {'cells': int(look_mask.sum()), 'outsideRig': outside, 'differsFromSlotPart': replaced}


def look_silhouette(table, look):
    grid.fresh_scene()
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name == look['part']]
    grid.move_by(placed, attach_point(table['attach'])['atM'])
    return grid.silhouette_of(placed)


def rig_silhouette(tier):
    driller.stage_vehicle(tier)
    return grid.silhouette_of([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])


def slot_part_silhouette(part_id):
    driller.stage_vehicle(1)
    return grid.silhouette_of([bpy.data.objects[part_id]])


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def problems_in(report):
    problems = []
    for part, entry in report.items():
        problems += ['%s has %d cells outside the %s rig' % (part, cells, tier)
                     for tier, cells in entry['outsideRig'].items() if cells]
    kettle = report.get('kettle-boiler')
    if kettle is not None and kettle['differsFromSlotPart']:
        problems.append('kettle-boiler differs from t1-boiler by %d cells' % kettle['differsFromSlotPart'])
    return problems


def report_about(table, report):
    return {
        'about': 'Ticket 582: silhouette cells of each boiler look on %s, on a %g mm grid, outside the rig at '
                 'rest at tiers %s, and by which it differs from the rig\'s own %s; written by check_outline.py. '
                 '`outsideRig` must be all zero; the kettle\'s `differsFromSlotPart` must be zero.'
                 % (table['attach'], grid.CELL_M * 1000, ' and '.join(str(tier) for tier in RIG_TIERS),
                    table['replaces']),
        'looks': report,
    }


if __name__ == '__main__':
    main()
