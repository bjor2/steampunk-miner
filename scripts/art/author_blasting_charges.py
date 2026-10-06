"""
Authors the first version of the blasting charges' Blender sources (#110, for the #109 spec): the
charge rack mounted on the vehicle and the charge the player plants on a wall.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_blasting_charges.py

It writes art/blender/<id>/<id>.blend for vehicle-blasting-charges and prop-blasting-charge, or
only the ids given after `--`. From then on those files are the sources (#52): change the art in
Blender and re-export, rather than editing this script. Nothing here is rigged (#51 acceptance 2).

Conventions are author_platform.py's, whose piece builders and materials this reuses: 1 unit = 1 m,
game right is +X, up is +Z, details stand out towards -Y. Each part is one mesh object named for its
placeholder id, its origin the placeholder's pivot (the part's centre), at the placeholder's `atM`.

- The rack sits in the vehicle's frame, behind the chassis at the rear: an iron back plate in a brass
  cage, two columns of four shelves, bolted to the chassis by one arm. `charge-1` to `charge-8` are
  one red stick pair each, filled bottom row first, left to right (#109: the charges shown match the
  count carried, so a charge part is hidden once it is used).
- The planted charge is three red sticks strapped in brass with a clockwork timer on top; the fuse
  lamp on the timer is its own part and the only thing that glows, so the game can blink it.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from author_platform import (  # noqa: E402
    PALETTE,
    box,
    build_part,
    cylinder,
    reset_scene,
    save_as,
    sphere,
    torus,
)

# Base colour, roughness, emission strength (0 for none); dynamite red reads against brass and iron.
PALETTE.update({
    'charge-red': ((0.62, 0.11, 0.07), 0.55, 0.0),
    'fuse-cord': ((0.30, 0.24, 0.16), 0.8, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'fuse-glow': ((1.0, 0.16, 0.08), 0.2, 1.0),
})

RACK_AT = (-0.58, 0.0, -0.04)
# Charge slot centres in the vehicle's frame, matching the placeholder: two columns, four rows.
SLOT_COLUMNS = (-0.615, -0.545)
SLOT_ROWS = (-0.165, -0.085, -0.005, 0.075)
SHELF_DROP = 0.042
# The platform's rivets are 3 cm; on parts this small they would swamp the brass.
SMALL_RIVET_RADIUS = 0.009


def main():
    for asset_id in requested_asset_ids():
        AUTHORS[asset_id]()


def requested_asset_ids():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return requested or list(AUTHORS)


# --- the rack on the vehicle (frame 0.18 x 0.36 m, eight 0.06 x 0.075 m charges) ------------------


def author_charge_rack():
    reset_scene()
    build_part('charge-rack', rack_frame_pieces(), at=RACK_AT, z_order=0)
    for slot, (x, z) in enumerate(slot_centres(), start=1):
        build_part('charge-%d' % slot, rack_charge_pieces(), at=(x, 0.0, z), z_order=1)
    save_as('vehicle-blasting-charges')


def slot_centres():
    return [(x, z) for z in SLOT_ROWS for x in SLOT_COLUMNS]


def rack_frame_pieces():
    pieces = [
        box('dark-iron', (0.16, 0.03, 0.34), (0.0, 0.03, 0.0)),
        box('brass', (0.014, 0.05, 0.36), (-0.083, 0.0, 0.0)),
        box('brass', (0.014, 0.05, 0.36), (0.083, 0.0, 0.0)),
        box('brass', (0.18, 0.05, 0.016), (0.0, 0.0, -0.172)),
        box('brass', (0.18, 0.05, 0.016), (0.0, 0.0, 0.172)),
        box('iron', (0.08, 0.03, 0.05), (0.12, 0.02, 0.02)),
        box('charge-red', (0.15, 0.01, 0.012), (0.0, -0.022, 0.158)),
    ]
    rack_z = RACK_AT[2]
    pieces += [box('brass', (0.16, 0.035, 0.008), (0.0, -0.005, row - rack_z - SHELF_DROP)) for row in SLOT_ROWS]
    pieces += [small_rivet((x, -0.03, z)) for x in (-0.083, 0.083) for z in (-0.15, 0.15)]
    pieces += [small_rivet((0.14, -0.01, 0.02))]
    return pieces


def rack_charge_pieces():
    """A pair of red sticks in a brass band, a stub of fuse cord on top."""
    pieces = [cylinder('charge-red', 0.012, 0.062, (x, 0.0, -0.006), 'Z') for x in (-0.016, 0.016)]
    pieces += [cylinder('dial', 0.012, 0.006, (x, 0.0, 0.027), 'Z') for x in (-0.016, 0.016)]
    pieces += [
        box('brass', (0.062, 0.034, 0.012), (0.0, 0.0, -0.004)),
        cylinder('fuse-cord', 0.003, 0.012, (0.0, -0.005, 0.034), 'Z'),
    ]
    return pieces


# --- the planted charge (0.32 x 0.28 m, its fuse lamp 0.06 m) ------------------------------------


def author_planted_charge():
    reset_scene()
    build_part('prop-blasting-charge', planted_charge_pieces(), at=(0.0, 0.0, 0.0), z_order=0)
    build_part('fuse-lamp', fuse_lamp_pieces(), at=(0.07, 0.0, 0.1), z_order=1)
    save_as('prop-blasting-charge')


def planted_charge_pieces():
    pieces = [cylinder('charge-red', 0.036, 0.22, (x, 0.0, -0.02), 'Z') for x in (-0.085, 0.0, 0.085)]
    pieces += [cylinder('dial', 0.036, 0.012, (x, 0.0, -0.136), 'Z') for x in (-0.085, 0.0, 0.085)]
    pieces += [box('brass', (0.26, 0.08, 0.022), (0.0, 0.0, z)) for z in (-0.09, 0.05)]
    pieces += [small_rivet((x, -0.042, z)) for x in (-0.042, 0.042) for z in (-0.09, 0.05)]
    pieces += [
        box('iron', (0.13, 0.07, 0.07), (0.05, -0.03, 0.105)),
        cylinder('dial', 0.022, 0.01, (0.015, -0.068, 0.105), 'Y'),
        box('dark-iron', (0.003, 0.004, 0.018), (0.015, -0.074, 0.11)),
        cylinder('fuse-cord', 0.004, 0.08, (-0.05, -0.02, 0.11), 'X'),
        torus('fuse-cord', 0.018, 0.004, (-0.09, -0.04, 0.105)),
    ]
    return pieces


def small_rivet(centre):
    return sphere('brass', SMALL_RIVET_RADIUS, centre, flatten=0.6)


def fuse_lamp_pieces():
    return [
        cylinder('brass', 0.03, 0.02, (0.0, -0.075, 0.0), 'Y'),
        sphere('fuse-glow', 0.022, (0.0, -0.088, 0.0), flatten=0.7),
    ]


AUTHORS = {
    'vehicle-blasting-charges': author_charge_rack,
    'prop-blasting-charge': author_planted_charge,
}

if __name__ == '__main__':
    main()
