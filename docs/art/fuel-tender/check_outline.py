"""
The outline check of the coal tender's LK5 steps (ticket 813; the GD lock of 24 Oct 14:54: no part
pushes the drawn outline past the current rig bounds or moves the drill tip, and the footprint and
collider are unchanged). The wagon trails the rig behind the stern, so for the tender the rule
reads: a new part fills the room inside the wagons' own footprint and never reaches the rig. It
rasterises the silhouette in the game's front view (X right, Z up) of the rig at rest, at tiers 1
and 3, on a 4 mm grid, and of each wagon hung at `hull.hitch`, and writes outline.json: the cells
each LK5 wagon adds over the guild tender (its base) that lie inside the rig's silhouette (must be
none at either tier), the cells of every wagon inside the rig (the hitch ring and drawbar are the
#758 wagons' own, so a new wagon may have no more than the guild tender), and each wagon's box
against the union of the #758 wagons' (the footprint the game lays out; must not grow). It exits 1
on any.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/check_outline.py

The drill tip needs no check here: the wagon is a `vehicle-fuel-tank` part on the hitch, and
nothing in `vehicle.blend` or the drill head's draw moves. Collision needs none either: the
collider is a code constant (`COLLIDER_M` in author_casing_driller.py mirrors it) that no art feeds.
"""

import json
import os
import sys

import bpy
import numpy as np

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

LADDER_TABLE = os.path.join(REPO_ROOT, 'src', 'data', 'vehicle', 'fuelTender.json')
REPORT = os.path.join(HERE, 'outline.json')
RIG_TIERS = (1, 3)
# The LK5 steps and the wagon they are built on (ticket 813).
LK5_PARTS = ('twin-tank-tender', 'hopper-tender', 'glass-tank-tender')
BASE_WAGON = 'guild-tender'
# The grid's window, widened to the left of the aetheric check's so the whole wagon fits.
WINDOW_M = (-1.3, -0.7, 1.2, 1.0)


def main():
    widen_grid()
    table = read_table()
    hitch = attach_point(table['attach'])['atM']
    rigs = {tier: rig_silhouette(tier) for tier in RIG_TIERS}
    wagons = {step['part']: wagon_silhouette(table, step['part'], hitch) for step in table['steps']}
    footprint = footprint_of(wagons, [step['part'] for step in table['steps'] if step['part'] not in LK5_PARTS])
    report = {part: outline_of(part, mask, wagons[BASE_WAGON], rigs, footprint) for part, mask in wagons.items()}
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_about(table, footprint, report), file, indent=2)
    problems = problems_in(report)
    for problem in problems:
        print('outline check failed: ' + problem, file=sys.stderr)
    if problems:
        raise SystemExit(1)
    print('outline check passed: ' + ', '.join(report))


def widen_grid():
    grid.WINDOW_M = WINDOW_M
    grid.COLUMNS = int(round((WINDOW_M[2] - WINDOW_M[0]) / grid.CELL_M))
    grid.ROWS = int(round((WINDOW_M[3] - WINDOW_M[1]) / grid.CELL_M))
    grid.CELL_X = WINDOW_M[0] + (np.arange(grid.COLUMNS) + 0.5) * grid.CELL_M
    grid.CELL_Z = WINDOW_M[1] + (np.arange(grid.ROWS) + 0.5) * grid.CELL_M


def read_table():
    with open(LADDER_TABLE, encoding='utf8') as file:
        return json.load(file)


def outline_of(part, mask, base_mask, rigs, footprint):
    added = mask & ~base_mask if part in LK5_PARTS else np.zeros_like(mask)
    return {
        'cells': int(mask.sum()),
        'insideRig': {'tier-%d' % tier: int((mask & rig_mask).sum()) for tier, rig_mask in rigs.items()},
        'addedInsideRig': {'tier-%d' % tier: int((added & rig_mask).sum()) for tier, rig_mask in rigs.items()},
        'boxM': box_of(mask),
        'insideFootprint': is_inside(box_of(mask), footprint),
    }


def wagon_silhouette(table, part_id, hitch):
    grid.fresh_scene()
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name == part_id]
    grid.move_by(placed, hitch)
    return grid.silhouette_of(placed)


def rig_silhouette(tier):
    driller.stage_vehicle(tier)
    return grid.silhouette_of([obj for obj in bpy.context.scene.objects if obj.type == 'MESH'])


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


def footprint_of(wagons, part_ids):
    """The union box, in the vehicle frame, of the wagons the game laid out before LK5."""
    boxes = [box_of(wagons[part_id]) for part_id in part_ids]
    return [min(box[0] for box in boxes), min(box[1] for box in boxes),
            max(box[2] for box in boxes), max(box[3] for box in boxes)]


def box_of(mask):
    """The covered cells' box in metres: x0, z0, x1, z1 in the vehicle frame."""
    rows, columns = np.nonzero(mask)
    return [round(float(grid.CELL_X[columns.min()] - grid.CELL_M / 2), 4),
            round(float(grid.CELL_Z[rows.min()] - grid.CELL_M / 2), 4),
            round(float(grid.CELL_X[columns.max()] + grid.CELL_M / 2), 4),
            round(float(grid.CELL_Z[rows.max()] + grid.CELL_M / 2), 4)]


def is_inside(box, footprint):
    return (footprint[0] <= box[0] and footprint[1] <= box[1]
            and box[2] <= footprint[2] and box[3] <= footprint[3])


def problems_in(report):
    problems = []
    base_inside = report[BASE_WAGON]['insideRig']
    for part in LK5_PARTS:
        entry = report[part]
        problems += ['%s adds %d cells inside the %s rig' % (part, cells, tier)
                     for tier, cells in entry['addedInsideRig'].items() if cells]
        problems += ['%s has %d cells inside the %s rig, the guild tender %d' % (part, cells, tier, base_inside[tier])
                     for tier, cells in entry['insideRig'].items() if cells > base_inside[tier]]
        if not entry['insideFootprint']:
            problems.append('%s grows the wagon footprint to %s' % (part, entry['boxM']))
    return problems


def report_about(table, footprint, report):
    return {
        'about': 'Ticket 813: silhouette cells of each %s wagon hung at %s, on a %g mm grid, inside the rig at rest at '
                 'tiers %s (`insideRig`, the hitch ring and drawbar of every wagon; an LK5 wagon may have no more than '
                 'the guild tender), the cells an LK5 wagon adds over the guild tender that lie inside the rig '
                 '(`addedInsideRig`, must be all zero), and each wagon\'s box against the #758 wagons\' union '
                 '(`footprintM`; every LK5 wagon must fit inside). Written by check_outline.py.'
                 % (table['assetId'], table['attach'], grid.CELL_M * 1000, ', '.join(str(tier) for tier in RIG_TIERS)),
        'footprintM': footprint,
        'wagons': report,
    }


if __name__ == '__main__':
    main()
