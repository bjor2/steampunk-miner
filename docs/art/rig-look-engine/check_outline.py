"""
The outline check of the engine rig-look parts (ticket 586, #576 rules: a look stays inside the
rig outline and never changes collision or the hitbox). It rasterises the silhouette in the game's
front view (X right, Z up) of the rig at rest, at tiers 1 and 3, on a 4 mm grid, and of each look
standing on the `chassis.drive` slot, and writes outline.json: the cells of each look outside the
rig's silhouette (must be none at either tier) and, for the base look, the cells it adds to the
tier-1 rig inside the hub window (must be none: below the first step the rig is as it is). It
exits 1 on either.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-engine/check_outline.py

No rig part stands on the slot (the table's `replaces` is null): the looks lie over the middle
roller's hub, so every rig part stays and the check is against the whole rig. Tier 3 is checked
because its rollers are the larger grousered ones and its belly skirt comes down over the hubs.
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

LOOKS_TABLE = os.path.join(HERE, 'engineLooks.json')
REPORT = os.path.join(HERE, 'outline.json')
RIG_TIERS = (1, 3)


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
    entry = {'cells': int(look_mask.sum()), 'outsideRig': outside}
    if look.get('unnamedDefault'):
        entry['addsToRig'] = int((look_mask & ~rigs[RIG_TIERS[0]] & hub_window(table)).sum())
    return entry


def look_silhouette(table, look):
    grid.fresh_scene()
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name == look['part']]
    grid.move_by(placed, attach_point(table['attach'])['atM'])
    return grid.silhouette_of(placed)


def rig_silhouette(tier):
    driller.stage_vehicle(tier)
    return grid.silhouette_of([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])


def hub_window(table):
    """The cells of the table's footprint round the hub, where the base look must add nothing."""
    x0, z0, x1, z1 = table['footprintM']
    window = grid.np.zeros((grid.ROWS, grid.COLUMNS), dtype=bool)
    rows = grid.cell_range(z0, z1, grid.WINDOW_M[1], grid.ROWS)
    columns = grid.cell_range(x0, x1, grid.WINDOW_M[0], grid.COLUMNS)
    window[rows[0]:rows[1], columns[0]:columns[1]] = True
    return window


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def problems_in(report):
    problems = []
    for part, entry in report.items():
        problems += ['%s has %d cells outside the %s rig' % (part, cells, tier)
                     for tier, cells in entry['outsideRig'].items() if cells]
        if entry.get('addsToRig'):
            problems.append('%s adds %d cells to the tier-1 rig round the hub' % (part, entry['addsToRig']))
    return problems


def report_about(table, report):
    return {
        'about': 'Ticket 586: silhouette cells of each engine look on %s, on a %g mm grid, outside the rig at '
                 'rest at tiers %s, and, for the base look, the cells it adds to the tier-1 rig inside the hub '
                 'window %s; written by check_outline.py. `outsideRig` must be all zero; the base look\'s '
                 '`addsToRig` must be zero.'
                 % (table['attach'], grid.CELL_M * 1000, ' and '.join(str(tier) for tier in RIG_TIERS),
                    table['footprintM']),
        'looks': report,
    }


if __name__ == '__main__':
    main()
