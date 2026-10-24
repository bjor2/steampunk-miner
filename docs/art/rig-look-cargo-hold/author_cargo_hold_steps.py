"""
Authors the cargo_hold track's LK4 look steps (ticket 812, wave 647-7K of the P1-P5 map #647) into
the existing source, art/blender/vehicle-look-cargo-hold/vehicle-look-cargo-hold.blend: the GD lock
of 24 Oct 14:54 (#812) wants at least 5 authored steps on every line, each a new outline or an added
part in a socket, never a recolour, on the band edges LK1 (#809) froze for the hold (11, 22, 33,
...). The plank crate, ore hopper and riveted bin stay the first steps on 11, 22 and 33; each step
here is the riveted bin with one more part fitted, in the order the ticket named: side racks, then
strapped panniers. A pannier is a bag on the pod's flank, never an extra wagon: only real capacity
shows as a wagon (#812).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/author_cargo_hold_steps.py

It opens the .blend (the source since #580), removes any earlier copy of these two parts and
rebuilds them from cargoHoldLooks.json's rows, so a re-run rewrites the same objects; the four
parts of #580 are left as they are. Conventions are author_cargo_hold_looks.py's: the slot
`hull.cargo` at the origin, pieces laid out in the hatch's frame (its base centre) and shifted by
HATCH_OFFSET, draw order `z` 3, the vehicle-scale 4 mm bevel, the stay up to the slot behind the
ram.

Why every part sits where it does: the rig outline the steps may not leave (#812, #789,
check_outline.py) is the hatch itself above the deck, with the dome's plate against its left end,
the steam ram against its right and open sky over its lid, so the hold cannot grow. The one socket
left is the pod's flank under the hatch (vehicle x 0.135..0.305, z 0.012..0.1): the chassis
there is bare bronze with the brass hoop at x 0.2, the hull looks' armour (`vehicle-look-hull`)
stops at z 0.01, the motor housing starts at x 0.283 only below z 0.06, and the dome's plate
reaches x 0.13 only above z 0.083. The racks hang from under the hatch's ends down that flank,
and the panniers hang in them. Both parts stand in front of the hoop's rivets (vehicle y under
-0.128) so they draw over the pod, and are sized to move a 360 px phone's pixels (#157: one visible
step is at least a 4 x 4 patch at 45 px/m): dark iron over lit bronze for the racks, tan leather
over the dark racks for the panniers.

| Part          | Step (purchases) | Adds                                                                  |
| ------------- | ---------------- | --------------------------------------------------------------------- |
| `racked-bin`  | 44               | a dark-iron stake rack under each end of the bin, three rails on four  |
|               |                  | stakes with brass caps, bolted to the pod's flank                      |
| `pannier-bin` | 55               | a tan leather pannier hanging in each rack under a dark flap, two      |
|               |                  | canvas straps over the top rail with brass buckles                     |
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_cargo_hold_looks as base  # noqa: E402
import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, sphere  # noqa: E402

BLEND_PATH = os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle-look-cargo-hold', 'vehicle-look-cargo-hold.blend')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). No emission: the
# bin's sight glass stays the hold's one glow, so the drill nose stays the brightest part.
kit.PALETTE.update({
    'leather': ((0.58, 0.40, 0.22), 0.8, 0.0),
    'leather-dark': ((0.30, 0.18, 0.09), 0.85, 0.0),
    'canvas': ((0.72, 0.66, 0.50), 0.9, 0.0),
})

# The `hull.cargo` slot in the vehicle frame (vehicle.parts.json), where the asset's origin stands.
SLOT_AT_M = (0.2, 0.2)
# The flank under the hatch, in the hatch's frame (vehicle z 0.012..0.1 is hatch z -0.088..0).
FLANK_TOP = 0.0
FLANK_BOTTOM = -0.088
FLANK_MID = (FLANK_TOP + FLANK_BOTTOM) / 2
FLANK_HEIGHT = FLANK_TOP - FLANK_BOTTOM
# Where the racks stand: in front of the hoop's rivets (vehicle y -0.128 at the flank's foot), in
# the hatch frame (vehicle y + 0.04).
RACK_Y = -0.096
RAIL_SIZE = (0.17, 0.012, 0.012)
RAIL_ZS = (FLANK_TOP - 0.008, FLANK_MID, FLANK_BOTTOM + 0.006)
STAKE_SIZE = (0.012, 0.014, FLANK_HEIGHT)
STAKE_XS = (-0.079, -0.026, 0.026, 0.079)
STAKE_CAP_RADIUS = 0.008
STAKE_CAP_Z = FLANK_TOP - 0.004
RACK_BOLT_Z = FLANK_BOTTOM + 0.014
# The panniers: a bulging sack in each outer bay, in front of the rails, under a dark flap, with
# two canvas straps over the top rail and a brass buckle on each.
PANNIER_XS = (-0.044, 0.044)
PANNIER_RADII = (0.039, 0.015, 0.033)
PANNIER_Z = FLANK_MID - 0.002
PANNIER_Y = -0.118
FLAP_SIZE = (0.08, 0.034, 0.016)
FLAP_Z = FLANK_TOP - 0.02
STRAP_DX = 0.022
STRAP_SIZE = (0.012, 0.01, 0.084)
STRAP_Z = FLANK_MID
STRAP_Y = -0.137
BUCKLE_SIZE = (0.016, 0.008, 0.012)
BUCKLE_Z = FLANK_TOP - 0.03
# The vehicle-scale 4 mm bevel of the first four parts.
BEVEL_M = base.BEVEL_M


def main():
    table = base.read_table()
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    remove_earlier_copies()
    built = [author_step(look, int(table['z'])) for look in table['looks'] if look['part'] in PIECES]
    check_steps_match_table(table, built)
    bpy.ops.wm.save_mainfile(filepath=BLEND_PATH, compress=True)
    print('authored ' + ', '.join(part.name for part in built))


def remove_earlier_copies():
    for part_id in PIECES:
        earlier = bpy.data.objects.get(part_id)
        if earlier is not None:
            bpy.data.objects.remove(earlier)
    for mesh in [mesh for mesh in bpy.data.meshes if mesh.users == 0]:
        bpy.data.meshes.remove(mesh)


def author_step(look, z_order):
    pieces = PIECES[look['part']]() + base.stay_pieces()
    base.shift_pieces(pieces, base.HATCH_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def check_steps_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(look['part'] for look in table['looks'] if look['part'] in PIECES)
    if names != wanted or len(names) != len(PIECES):
        raise SystemExit('LK4 parts %s do not match the table %s' % (names, wanted))
    look_box = table['lookBoxM']
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)
        if not is_inside_look_box(part, look_box):
            raise SystemExit('part "%s" reaches past the look box %s' % (part.name, look_box))


def is_inside_look_box(obj, look_box):
    """The table's look box is in the vehicle frame; the asset's frame has the slot at the origin."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    slot_x, slot_z = SLOT_AT_M
    x0, z0, x1, z1 = look_box[0] - slot_x, look_box[1] - slot_z, look_box[2] - slot_x, look_box[3] - slot_z
    return x0 - 1e-6 <= min_x and max_x <= x1 + 1e-6 and z0 - 1e-6 <= min_z and max_z <= z1 + 1e-6


# --- the steps, each the one before with its part fitted --------------------------------------


def racked_bin_pieces():
    return base.bin_pieces() + rack_pieces()


def pannier_bin_pieces():
    return racked_bin_pieces() + pannier_pieces()


# --- the fitted parts ----------------------------------------------------------------------------


def rack_pieces():
    """A dark-iron stake rack down the flank under the bin: three rails on four stakes, a brass cap
    on each stake under the hatch and a brass bolt at its foot."""
    pieces = [box('dark-iron', RAIL_SIZE, (0.0, RACK_Y, z)) for z in RAIL_ZS]
    pieces += [box('dark-iron', STAKE_SIZE, (x, RACK_Y, FLANK_MID)) for x in STAKE_XS]
    pieces += [sphere('brass', STAKE_CAP_RADIUS, (x, RACK_Y - 0.006, STAKE_CAP_Z), flatten=0.7) for x in STAKE_XS]
    pieces += [driller.rivet(x, RACK_Y - 0.008, RACK_BOLT_Z) for x in STAKE_XS]
    return pieces


def pannier_pieces():
    pieces = []
    for x in PANNIER_XS:
        pieces += one_pannier_pieces(x)
    return pieces


def one_pannier_pieces(x):
    """A tan leather sack bulging out of its rack bay under a dark flap, strapped twice over the
    top rail with brass buckles."""
    pieces = [
        driller.ellipsoid('leather', PANNIER_RADII, (x, PANNIER_Y, PANNIER_Z)),
        box('leather-dark', FLAP_SIZE, (x, PANNIER_Y, FLAP_Z)),
    ]
    for dx in (-STRAP_DX, STRAP_DX):
        pieces.append(box('canvas', STRAP_SIZE, (x + dx, STRAP_Y, STRAP_Z)))
        pieces.append(box('brass', BUCKLE_SIZE, (x + dx, STRAP_Y - 0.005, BUCKLE_Z)))
    return pieces


PIECES = {
    'racked-bin': racked_bin_pieces,
    'pannier-bin': pannier_bin_pieces,
}


if __name__ == '__main__':
    main()
