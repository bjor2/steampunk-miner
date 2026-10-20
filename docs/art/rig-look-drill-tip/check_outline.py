"""
The outline check of the drill_tip rig-look parts (ticket 578, #576 rules: a look stays inside the
rig outline and never changes collision or the hitbox). It rasterises the silhouette in the game's
front view (X right, Z up) of the rig at rest, at tiers 1, 2 and 3, on a 4 mm grid, and of each
look standing on the `drill.head` slot, and writes outline.json: the cells of each look outside
the rig's silhouette (must be none at every tier) and the cells by which the tier-1 rig's
silhouette changes when the cutter-crown look stands in place of its own `t1-drill-bit` (must be
none: below the first step the rig is as it is). It exits 1 on either.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/check_outline.py

Tier 3's nose has no tip crown (its `drill-bit` is the reamer collar round the cone's base), so a
look there sits over the cone's third step; the check proves the cone still covers it. Collision
needs no check here: the collider is a code constant (`COLLIDER_M` in author_casing_driller.py
mirrors it) and vehicle.blend is untouched, so nothing a look does can reach it.
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

LOOKS_TABLE = os.path.join(HERE, 'drillTipLooks.json')
REPORT = os.path.join(HERE, 'outline.json')
RIG_TIERS = (1, 2, 3)


def main():
    table = read_table()
    rigs = {tier: rig_silhouette(tier) for tier in RIG_TIERS}
    rig_without_crown = rig_silhouette(RIG_TIERS[0], leave_out=table['replaces'])
    report = {look['part']: outline_of(table, look, rigs, rig_without_crown) for look in table['looks']}
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


def outline_of(table, look, rigs, rig_without_crown):
    look_mask = look_silhouette(table, look)
    outside = {('tier-%d' % tier): int((look_mask & ~rig_mask).sum()) for tier, rig_mask in rigs.items()}
    changed = int(((rig_without_crown | look_mask) ^ rigs[RIG_TIERS[0]]).sum())
    return {'cells': int(look_mask.sum()), 'outsideRig': outside, 'changesRigOutline': changed}


def look_silhouette(table, look):
    grid.fresh_scene()
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name == look['part']]
    grid.move_by(placed, attach_point(table['attach'])['atM'])
    return grid.silhouette_of(placed)


def rig_silhouette(tier, leave_out=None):
    driller.stage_vehicle(tier)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name != leave_out]
    return grid.silhouette_of(meshes)


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def problems_in(table, report):
    problems = []
    for part, entry in report.items():
        problems += ['%s has %d cells outside the %s rig' % (part, cells, tier)
                     for tier, cells in entry['outsideRig'].items() if cells]
    base = base_look_of(table)
    if report[base]['changesRigOutline']:
        problems.append('%s in place of %s changes the tier-1 rig outline by %d cells'
                        % (base, table['replaces'], report[base]['changesRigOutline']))
    return problems


def base_look_of(table):
    return next(look['part'] for look in table['looks'] if look['purchases'] == 0)


def report_about(table, report):
    return {
        'about': 'Ticket 578: silhouette cells of each drill_tip look on %s, on a %g mm grid, outside the rig at '
                 'rest at tiers %s, and by which the tier-1 rig\'s silhouette changes with the look in place of its own '
                 '%s; written by check_outline.py. `outsideRig` must be all zero; the base look\'s '
                 '`changesRigOutline` must be zero.'
                 % (table['attach'], grid.CELL_M * 1000, ', '.join(str(tier) for tier in RIG_TIERS),
                    table['replaces']),
        'looks': report,
    }


if __name__ == '__main__':
    main()
