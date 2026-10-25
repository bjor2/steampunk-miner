"""
The outline check of the drill_power rig-look parts (ticket 875; #576 rules: a look stays inside
the rig outline and never changes collision or the hitbox; #789: the drawn drill tip never moves).
It rasterises the silhouette in the game's front view (X right, Z up) of the rig at rest, at tiers
1, 2 and 3, on a 4 mm grid, and of each look standing on the `drill.housing` slot, and writes
outline.json: the cells of each look outside the rig's silhouette, which must be none at every
tier. It exits 1 on any.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-power/check_outline.py

No rig part stands on the slot (the table's `replaces` is null): the looks lie over the housing
drum on the pod's bow, so every rig part stays and the check is against the whole rig. The parts
never reach the drill head, so the drawn tip is the head's own at every step. Collision needs no
check here: the collider is a code constant (`COLLIDER_M` in author_casing_driller.py mirrors it)
and vehicle.blend is untouched, so nothing a look does can reach it.
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

LOOKS_TABLE = os.path.join(HERE, 'drillPowerLooks.json')
REPORT = os.path.join(HERE, 'outline.json')
RIG_TIERS = (1, 2, 3)


def main():
    table = read_table()
    rigs = {tier: rig_silhouette(tier) for tier in RIG_TIERS}
    report = {look['part']: outline_of(table, look, rigs) for look in table['looks']}
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


def outline_of(table, look, rigs):
    look_mask = look_silhouette(table, look)
    outside = {('tier-%d' % tier): int((look_mask & ~rig_mask).sum()) for tier, rig_mask in rigs.items()}
    return {'cells': int(look_mask.sum()), 'outsideRig': outside}


def look_silhouette(table, look):
    grid.fresh_scene()
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name == look['part']]
    grid.move_by(placed, attach_point(table['attach'])['atM'])
    return grid.silhouette_of(placed)


def rig_silhouette(tier):
    driller.stage_vehicle(tier)
    return grid.silhouette_of([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def problems_in(report):
    return ['%s has %d cells outside the %s rig' % (part, cells, tier)
            for part, entry in report.items() for tier, cells in entry['outsideRig'].items() if cells]


def report_about(table, report):
    return {
        'about': 'Ticket 875: silhouette cells of each drill_power look on %s, on a %g mm grid, outside the rig at '
                 'rest at tiers %s; written by check_outline.py. `outsideRig` must be all zero. No rig part stands '
                 'on the slot, so the check is against the whole rig.'
                 % (table['attach'], grid.CELL_M * 1000, ', '.join(str(tier) for tier in RIG_TIERS)),
        'looks': report,
    }


if __name__ == '__main__':
    main()
