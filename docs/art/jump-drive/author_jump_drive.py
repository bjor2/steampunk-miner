"""
Authors the first version of the jump drive on the rig (ticket 759; the GD lock on #650: the jump
drive is "a money-priced node ... with a visible part on the rig"): one part, `jump-drive`, a brass
mast standing on the coal tender's frame behind the wagon body, with copper coil windings under an
aether globe in a brass orbit ring, wired along the frame to the wagon hitch.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/jump-drive/author_jump_drive.py

It writes art/blender/vehicle-jump-drive/vehicle-jump-drive.blend. From then on that file is the
source (#52): change the art in Blender rather than editing this script. Nothing is rigged (#51
acceptance 2); the kernel's `JumpDrivePiece` draws the part at the hitch once the drive is bought.

Conventions are the coal tender's (author_fuel_tender.py): 1 unit = 1 m, game right is +X, up is
+Z, details stand out towards -Y, and the asset is authored in its own frame with the wagon hitch,
`hull.hitch`, at the origin, so the game draws it at the hitch with no offset. The hitch is the
kernel's own point (no rig-look part or item takes it), so the drive shares it with the tender
alone: every tender body ends at x -0.56 on the same frame bar, so the mast stands just behind it,
clear of all four wagons, and the conduit runs in front of the frame to a junction at the hitch,
which keeps the origin inside the part's bounds. Draw order `z` 1, over the wagon. Nothing glows:
the globe is pale glass, so the drill nose stays the brightest part.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, reset_scene, save_as, sphere  # noqa: E402

ASSET_ID = 'vehicle-jump-drive'
PART_ID = 'jump-drive'
Z_ORDER = 1

kit.PALETTE.update({
    'aether-glass': ((0.55, 0.78, 0.92), 0.12, 0.0),
})

# The tender's frame bar (author_fuel_tender.py): its centre height and the bodies' rear end.
FRAME_Z = -0.045
BODY_REAR_X = -0.56
# The mast behind the bodies, standing from the frame's underside.
MAST_X = -0.615
MAST_FOOT_Z = -0.06
MAST_TOP_Z = 0.17
MAST_R = 0.011
# Four copper windings on the mast, and the globe over them.
WINDING_ZS = (0.055, 0.077, 0.099, 0.121)
WINDING_R = 0.032
GLOBE_R = 0.03
GLOBE_Z = MAST_TOP_Z + GLOBE_R - 0.004
FRONT_Y = -0.1
CONDUIT_Z = -0.036


def main():
    reset_scene()
    part = build_part(PART_ID, drive_pieces(), (0.0, 0.0, 0.0), Z_ORDER)
    part.modifiers['bevel'].width = driller.BEVEL_M
    check_part(part)
    save_as(ASSET_ID)


def drive_pieces():
    return bracket_pieces() + mast_pieces() + globe_pieces() + conduit_pieces()


def bracket_pieces():
    """An iron shoe bolted to the frame's rear end, which the mast stands on."""
    shoe_x = (BODY_REAR_X + MAST_X) / 2 - 0.01
    return [
        box('dark-iron', (BODY_REAR_X - MAST_X + 0.05, 0.05, 0.03), (shoe_x, -0.04, FRAME_Z)),
        driller.rivet(BODY_REAR_X - 0.012, -0.067, FRAME_Z, radius=0.006),
        driller.rivet(MAST_X - 0.02, -0.067, FRAME_Z, radius=0.006),
    ]


def mast_pieces():
    """The brass mast with four copper windings and iron spacers between them."""
    height = MAST_TOP_Z - MAST_FOOT_Z
    pieces = [cylinder('brass', MAST_R, height, (MAST_X, -0.04, MAST_FOOT_Z + height / 2), 'Z')]
    for z in WINDING_ZS:
        pieces.append(cylinder('copper', WINDING_R, 0.014, (MAST_X, -0.04, z), 'Z'))
    for low, high in zip(WINDING_ZS, WINDING_ZS[1:]):
        pieces.append(cylinder('dark-iron', WINDING_R - 0.009, 0.008, (MAST_X, -0.04, (low + high) / 2), 'Z'))
    pieces.append(cylinder('brass', WINDING_R + 0.004, 0.008, (MAST_X, -0.04, WINDING_ZS[0] - 0.012), 'Z'))
    pieces.append(cylinder('brass', WINDING_R + 0.004, 0.008, (MAST_X, -0.04, WINDING_ZS[-1] + 0.012), 'Z'))
    return pieces


def globe_pieces():
    """The aether globe in a brass orbit ring, under a small brass cap."""
    centre = (MAST_X, -0.05, GLOBE_Z)
    return [
        sphere('aether-glass', GLOBE_R, centre),
        kit.torus('brass', GLOBE_R + 0.006, 0.004, (MAST_X, -0.07, GLOBE_Z)),
        cylinder('brass', 0.012, 0.012, (MAST_X, -0.05, GLOBE_Z + GLOBE_R + 0.002), 'Z'),
    ]


def conduit_pieces():
    """A copper cable from the mast's foot along the front of the frame to a junction at the hitch."""
    return [
        sphere('brass', 0.014, (0.0, -0.06, 0.0)),
        driller.segment('copper', (-0.004, -0.006), (-0.12, CONDUIT_Z), 0.008, 0.008, FRONT_Y),
        driller.segment('copper', (-0.12, CONDUIT_Z), (MAST_X + 0.012, CONDUIT_Z), 0.008, 0.008, FRONT_Y),
    ]


def check_part(part):
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(part)
    if not (min_x <= 0.0 <= max_x and min_z <= 0.0 <= max_z):
        raise SystemExit('%s: the hitch (origin) lies outside "%s"' % (ASSET_ID, part.name))
    if max_x > 0.02:
        raise SystemExit('%s: "%s" reaches past the hitch into the rig' % (ASSET_ID, part.name))


if __name__ == '__main__':
    main()
