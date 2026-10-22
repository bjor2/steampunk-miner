"""
The outline check of the drive rig-look parts (ticket 731; #576 rules: a look never changes
collision or the hitbox, and the GD on #726 keeps the tracks and wheels on the rollers' own line).
It rasterises the silhouette in the game's front view (X right, Z up) of the rig at rest, at tiers 1
and 3, on a 4 mm grid, and of each look standing on the `chassis.drive` slot, and writes
outline.json: the cells of each look outside the rig's silhouette that are also outside the
undercarriage window (the table's `windowM`: between the end rollers' outer edges, from the roller
bottoms, the ground line, up to the roller tops), which must be none at either tier, the cells
outside the rig but inside the window (the belt's runs over the gaps between the rollers, allowed),
and, for the base look, the cells it adds to the tier-1 rig inside the window (must be none: below
the first step the rig is as it is). It exits 1 on a cell outside the window or a base-look cell.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/check_outline.py

No rig part stands on the slot (the table's `replaces` is null): the looks lie over the rollers and
the chassis's legs, so every rig part stays and the check is against the whole rig. Tier 3 is
checked because its rollers are the larger grousered ones and its belly skirt comes down over the
hubs. Collision needs no check here: the collider is a code constant (`COLLIDER_M` in
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

LOOKS_TABLE = os.path.join(HERE, 'driveLooks.json')
REPORT = os.path.join(HERE, 'outline.json')
RIG_TIERS = (1, 3)


def main():
    table = read_table()
    rigs = {tier: rig_silhouette(tier) for tier in RIG_TIERS}
    window = window_cells(table['windowM'])
    report = {look['part']: outline_of(table, look, rigs, window) for look in table['looks']}
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


def outline_of(table, look, rigs, window):
    look_mask = look_silhouette(table, look)
    outside = {('tier-%d' % tier): int((look_mask & ~rig_mask).sum()) for tier, rig_mask in rigs.items()}
    beyond = {('tier-%d' % tier): int((look_mask & ~rig_mask & ~window).sum()) for tier, rig_mask in rigs.items()}
    entry = {'cells': int(look_mask.sum()), 'outsideRigInWindow': outside, 'outsideRigAndWindow': beyond}
    if look.get('unnamedDefault'):
        entry['addsToRig'] = int((look_mask & ~rigs[RIG_TIERS[0]] & window).sum())
    return entry


def look_silhouette(table, look):
    grid.fresh_scene()
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name == look['part']]
    grid.move_by(placed, attach_point(table['attach'])['atM'])
    return grid.silhouette_of(placed)


def rig_silhouette(tier):
    driller.stage_vehicle(tier)
    return grid.silhouette_of([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])


def window_cells(window_m):
    """The cells of the undercarriage window, where a look may stand beyond the rig's silhouette."""
    x0, z0, x1, z1 = window_m
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
        problems += ['%s has %d cells outside the %s rig and the undercarriage window' % (part, cells, tier)
                     for tier, cells in entry['outsideRigAndWindow'].items() if cells]
        if entry.get('addsToRig'):
            problems.append('%s adds %d cells to the tier-1 rig inside the window' % (part, entry['addsToRig']))
    return problems


def report_about(table, report):
    return {
        'about': 'Ticket 731: silhouette cells of each drive look on %s, on a %g mm grid, at tiers %s: outside '
                 'the rig at rest but inside the undercarriage window %s (`outsideRigInWindow`, the belt over '
                 'the gaps between the rollers, allowed), outside both (`outsideRigAndWindow`, must be all '
                 'zero), and, for the base look, the cells it adds to the tier-1 rig inside the window '
                 '(`addsToRig`, must be zero); written by check_outline.py.'
                 % (table['attach'], grid.CELL_M * 1000, ' and '.join(str(tier) for tier in RIG_TIERS),
                    table['windowM']),
        'looks': report,
    }


if __name__ == '__main__':
    main()
