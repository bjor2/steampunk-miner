"""
Moves tier 3's drill bit to the tip in the vehicle's own .blend (ticket 789): the reamer ring round
the gimbal becomes `t3-drill-bit-2`, and `t3-drill-bit` is a heavier cutter crown at the cone's
point, drawn over the head like tier 1's. The bit then leads at every tier, and the Workshop's
drill_tip swap (`t3-drill-bit`) puts the heavier crown on the tip instead of a ring behind it.
`author_casing_driller.py` authors the same parts from scratch; this edits the shipped file in
place so every other part keeps its exported pixels.

    blender -b art/blender/vehicle/vehicle.blend --python-exit-code 1 \
        -P docs/art/casing-driller/retip_tier_3.py
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import author_casing_driller as driller  # noqa: E402

REAMER_ID = 't3-drill-bit-2'
CROWN_ID = 't3-drill-bit'


def main():
    rename_reamer()
    head = bpy.data.objects['t3-drill-head']
    crown = driller.tip_crown(CROWN_ID, 3, head, radius=driller.TIER_3_CROWN_RADIUS_M, teeth=10)
    crown.modifiers['bevel'].width = driller.BEVEL_M
    bpy.ops.wm.save_as_mainfile(filepath=driller.ASSET_PATH, compress=True)
    print('retipped tier 3 (ticket 789)')


def rename_reamer():
    if REAMER_ID in bpy.data.objects:
        raise SystemExit('%s already exists: the .blend is already retipped' % REAMER_ID)
    reamer = bpy.data.objects[CROWN_ID]
    reamer.name = REAMER_ID
    reamer.data.name = REAMER_ID


if __name__ == '__main__':
    main()
