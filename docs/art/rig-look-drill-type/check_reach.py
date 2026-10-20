"""
The reach check of the drill-type rig-look parts (ticket 622): the #308 close-out asks that each
type reads at a 360 px phone's width, with the cutters sticking out to the sides, the reamers a wide
ring and the crown a long spike ahead, and the wiring's sweep (#623, #590) that every type differs
from bare and from every other. It rasterises the silhouette in the game's front view (X right, Z
up) of the rig at rest, at tiers 1, 2 and 3, on a 4 mm grid, and of each look standing on the
`drill.head` slot in place of the rig's `t1-drill-bit`, and writes reach.json: how far each look
stands out of the rig's silhouette up and down (beside the nose) and ahead of the rig's tip, in metres and in a 360 px phone's pixels
(30 px/m over the 12 m zoom, #39), whether the reamers' ring has a hole, and how many phone pixels
each pair of looks (bare included) differ by, by silhouette alone. It exits 1 when a look falls
short of its line of the table below.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-type/check_reach.py

| Look                  | Must                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| every look            | stand out of the rig at every tier, and differ from bare and each other by 10 px    |
| `side-cutters-mark-*` | reach 0.10 m (3 px) past the rig both up and down; Mark 2 further than Mark 1       |
| `gallery-reamers`     | reach 0.10 m past the rig up and down, with a hole inside the ring (not a disc)     |
| `plunge-crown`        | reach 0.20 m (6 px) ahead of the rig and no wider than the crown it replaces (0.06) |
| `twin-bit`            | reach 0.10 m ahead of the rig                                                       |
| `reach-boom`          | reach 0.20 m ahead of the rig                                                       |

Collision needs no check here: the collider is a code constant (`COLLIDER_M` in
author_casing_driller.py mirrors it) and vehicle.blend is untouched, so nothing a look does can
reach it.
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

LOOKS_TABLE = os.path.join(HERE, 'drillTypeLooks.json')
REPORT = os.path.join(HERE, 'reach.json')
RIG_TIERS = (1, 2, 3)
# 360 CSS px across the default 12 m zoom (#39), the phone width the looks are judged at.
PHONE_PX_PER_M = 360 / 12
# A phone pixel differs between two silhouettes when its coverage moves by more than half.
COVERAGE_STEP = 0.5
PAIR_PX_MIN = 10
SIDE_REACH_M = 0.10
SPIKE_REACH_M = 0.20
SPIKE_SIDE_MAX_M = 0.06
TWIN_REACH_M = 0.10
# The ring's hole is looked for inside this radius of the ring's centre (RING_RADIUS less its tube).
RING_CENTRE = (0.07, 0.0)
HOLE_RADIUS_M = 0.2


def main():
    table = read_table()
    rigs = {tier: rig_silhouette(tier) for tier in RIG_TIERS}
    rigs_without = {tier: rig_silhouette(tier, leave_out=table['replaces']) for tier in RIG_TIERS}
    masks = {look['look']: look_silhouette(table, look) for look in table['looks']}
    report = {name: reach_of(table, name, mask, rigs, rigs_without) for name, mask in masks.items()}
    pairs = pair_differences(table, masks, rigs_without[RIG_TIERS[0]])
    with open(REPORT, 'w', encoding='utf8') as file:
        json.dump(report_about(table, report, pairs), file, indent=2)
    problems = problems_in(report, pairs)
    for problem in problems:
        print('reach check failed: ' + problem, file=sys.stderr)
    if problems:
        raise SystemExit(1)
    print('reach check passed: ' + ', '.join(report))


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


# --- silhouettes -----------------------------------------------------------------------------------


def look_silhouette(table, look):
    grid.fresh_scene()
    wanted = [part['id'] for part in look['parts']]
    placed = [obj for obj in stage.append_parts_of(table['assetId']) if obj.name in wanted]
    for obj in [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj not in placed]:
        bpy.data.objects.remove(obj)
    grid.move_by(placed, attach_point(table['attach'])['atM'])
    return grid.silhouette_of(placed)


def rig_silhouette(tier, leave_out=None):
    driller.stage_vehicle(tier)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name != leave_out]
    return grid.silhouette_of(meshes)


def attach_point(attach_id):
    return next(point for point in rig.read_json(rig.VEHICLE_SIDECAR)['attach'] if point['id'] == attach_id)


# --- the reach of one look -------------------------------------------------------------------------


def reach_of(table, name, mask, rigs, rigs_without):
    entry = {'cells': int(mask.sum()), 'tiers': {}}
    for tier in RIG_TIERS:
        outside = mask & ~rigs[tier]
        entry['tiers']['tier-%d' % tier] = {'outsideRig': int(outside.sum()), 'beyondRigM': beyond_rig(outside, rigs[tier])}
    if name == 'gallery-reamers':
        entry['holeCells'] = hole_cells(table, mask)
    return entry


def beyond_rig(outside, rig_mask):
    """How far the look's cells outside the rig reach past the rig's own extent: up and down past
    the rig's top and bottom in the look's columns (the nose, not the stacks or the rollers; a
    column the rig never reaches is ahead of it, not above), and ahead of the rig's own tip."""
    rows, columns = np.nonzero(outside)
    if rows.size == 0:
        return {'up': 0.0, 'down': 0.0, 'ahead': 0.0}
    beside = [(int(row), int(column)) for row, column in zip(rows, columns) if rig_mask[:, column].any()]
    up = max([row - rig_top_in_column(rig_mask, column) for row, column in beside] + [0])
    down = max([rig_bottom_in_column(rig_mask, column) - row for row, column in beside] + [0])
    ahead = max(0, int(columns.max()) - int(np.nonzero(rig_mask)[1].max()))
    return {'up': metres(up), 'down': metres(down), 'ahead': metres(ahead)}


def rig_top_in_column(rig_mask, column):
    return int(np.nonzero(rig_mask[:, column])[0].max())


def rig_bottom_in_column(rig_mask, column):
    return int(np.nonzero(rig_mask[:, column])[0].min())


def metres(cells):
    return round(cells * grid.CELL_M, 4)


def hole_cells(table, mask):
    """Cells inside the ring's reach the look leaves open (a ring reads as a ring, not a disc)."""
    at_x, at_z = attach_point(table['attach'])['atM']
    inside = grid.disk_at((at_x + RING_CENTRE[0], at_z + RING_CENTRE[1]), HOLE_RADIUS_M)
    return int((inside & ~mask).sum())


# --- phone-pixel differences -----------------------------------------------------------------------


def pair_differences(table, masks, rig_without):
    """Phone pixels (30 px/m) whose coverage differs by more than half between two swapped rigs."""
    names = [look['look'] for look in table['looks']]
    coverage = {name: phone_coverage(rig_without | masks[name]) for name in names}
    pairs = {}
    for index, first in enumerate(names):
        for second in names[index + 1:]:
            differing = np.abs(coverage[first] - coverage[second]) > COVERAGE_STEP
            pairs['%s vs %s' % (first, second)] = int(differing.sum())
    return pairs


def phone_coverage(mask):
    """The share of each 30 px/m phone pixel the mask covers, binning the 4 mm cells by position."""
    column_bins = np.floor((grid.CELL_X - grid.WINDOW_M[0]) * PHONE_PX_PER_M).astype(int)
    row_bins = np.floor((grid.CELL_Z - grid.WINDOW_M[1]) * PHONE_PX_PER_M).astype(int)
    shape = (row_bins.max() + 1, column_bins.max() + 1)
    flat = (row_bins[:, None] * shape[1] + column_bins[None, :]).ravel()
    covered = np.bincount(flat, weights=mask.ravel(), minlength=shape[0] * shape[1])
    cells = np.bincount(flat, minlength=shape[0] * shape[1])
    return (covered / cells).reshape(shape)


# --- the verdict -----------------------------------------------------------------------------------


def problems_in(report, pairs):
    problems = []
    for name, entry in report.items():
        if name == 'bare':
            continue
        problems += ['%s has no cell outside the %s rig' % (name, tier)
                     for tier, cells in entry['tiers'].items() if cells['outsideRig'] == 0]
        problems += shape_problems(name, entry['tiers']['tier-1']['beyondRigM'], entry)
    if report['side-cutters-mark-2']['tiers']['tier-1']['beyondRigM']['up'] <= report['side-cutters-mark-1']['tiers']['tier-1']['beyondRigM']['up']:
        problems.append('side-cutters-mark-2 reaches no further out than mark 1')
    problems += ['%s differ by only %d phone px' % (pair, pixels) for pair, pixels in pairs.items() if pixels < PAIR_PX_MIN]
    return problems


def shape_problems(name, beyond, entry):
    rules = {
        'side-cutters-mark-1': lambda: short_sides(name, beyond, SIDE_REACH_M),
        'side-cutters-mark-2': lambda: short_sides(name, beyond, SIDE_REACH_M),
        'gallery-reamers': lambda: short_sides(name, beyond, SIDE_REACH_M) + no_hole(name, entry),
        'plunge-crown': lambda: short_ahead(name, beyond, SPIKE_REACH_M) + too_wide(name, beyond, SPIKE_SIDE_MAX_M),
        'twin-bit': lambda: short_ahead(name, beyond, TWIN_REACH_M),
        'reach-boom': lambda: short_ahead(name, beyond, SPIKE_REACH_M),
    }
    return rules[name]()


def short_sides(name, beyond, least):
    return ['%s reaches only %g m %s past the rig (needs %g)' % (name, beyond[side], side, least)
            for side in ('up', 'down') if beyond[side] < least]


def short_ahead(name, beyond, least):
    return ['%s reaches only %g m ahead of the rig (needs %g)' % (name, beyond['ahead'], least)] if beyond['ahead'] < least else []


def too_wide(name, beyond, most):
    return ['%s reaches %g m %s past the rig, more than a spike\'s %g' % (name, beyond[side], side, most)
            for side in ('up', 'down') if beyond[side] > most]


def no_hole(name, entry):
    return ['%s has no hole inside its ring' % name] if entry['holeCells'] == 0 else []


def report_about(table, report, pairs):
    return {
        'about': 'Ticket 622: silhouette cells of each drill-type look on %s, on a %g mm grid, outside the rig at rest at '
                 'tiers %s, and how far they reach up and down past the rig beside them and ahead of its tip (metres; a 360 px phone '
                 'shows %g px/m); `holeCells` is the open area inside the reamers\' ring; `pairs` counts the phone pixels '
                 'two swapped tier-1 rigs differ by, by silhouette alone (coverage moving more than %g); written by '
                 'check_reach.py. Every look must leave the rig, differ from every other by %d px, and keep its line of '
                 'the table in the script.'
                 % (table['attach'], grid.CELL_M * 1000, ', '.join(str(tier) for tier in RIG_TIERS), PHONE_PX_PER_M,
                    COVERAGE_STEP, PAIR_PX_MIN),
        'phonePxPerM': PHONE_PX_PER_M,
        'looks': report,
        'pairs': pairs,
    }


if __name__ == '__main__':
    main()
