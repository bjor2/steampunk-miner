"""
Authors the first version of the cargo_hold track's rig-look parts (ticket 580, wave 576-1A of the
rig look ladder, #576): the base look and the three steps Systems' table puts at 23, 31 and 33
purchases (#157 comment 6300543785), named by Progression (comment 6300549964).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/author_cargo_hold_looks.py

It writes art/blender/vehicle-look-cargo-hold/vehicle-look-cargo-hold.blend from cargoHoldLooks.json
(the table this script, the renders and the outline check share). From then on that file is the
source (#52): change the art in Blender rather than editing this script. Nothing is rigged (#51
acceptance 2) and nothing is registered: the registry row, the manifest entry, the placeholder
sidecar and the piece that swaps the part on the slot are the registry's (#577) and the wiring's
(#581).

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in its own frame with the track's attach slot, `hull.cargo`, at the origin, as the tech gear is
(#166), so the game draws a part at `attachPointOf(vehicleSidecar, 'hull.cargo')` with no offset.
Every look stands in place of the rig's ore hatch on the fore deck, `t1-hopper`, whose base sits
0.02 m right of and 0.1 m under the slot (its `atM` against the slot's in vehicle.parts.json), and
keeps to the hatch's own footprint: 180 mm wide, 72 mm above the deck, the hinge's bump at the
left. The #576 rules say cargo stays inside the rig's outline, which check_outline.py proves
against the whole rig at tiers 1 and 3, so the looks differ by colour, material and what fills
the box, not by growing the hold.

| Part          | Step (purchases) | Look                                                                  |
| ------------- | ---------------- | --------------------------------------------------------------------- |
| `ore-hatch`   | 0, the default   | the rig's own hatch, the same pieces as `t1-hopper`, re-based         |
| `plank-crate` | 23               | an oak crate: five planks over a dark hold, iron straps, a brass hasp |
| `ore-hopper`  | 31               | an open brass hopper on corner posts, heaped with ore over its lip    |
| `riveted-bin` | 33               | a pale blued-steel bin with two riveted bands and a lit sight glass   |

The slot sits 28 mm above the hatch lid and the export refuses a part whose origin is outside its
bounds, so every look carries a dark iron stay (stay_pieces) up to the slot's height, 10 mm wide,
standing behind the steam ram's rod and barrel (`t1-piston`, drawn in front of the hold): the ram
covers it at rest and at both ends of its 30 mm stroke (PISTON_TRAVEL_M). The bin's sight glass
is the one glow, at a quarter of the drill nose's (0.4 against the nose seams' 1.6), so the nose
stays the brightest part (#576 rules).
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, reset_scene, save_as, sphere, stepped  # noqa: E402

LOOKS_TABLE = os.path.join(HERE, 'cargoHoldLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The hues follow the
# registry's placeholder colours for the steps (rigLook.json: tan, pale brass, pale blue) so the
# art lands where the placeholder glow pointed; the sight glass glows under the nose seams' 1.6.
kit.PALETTE.update({
    'plank': ((0.50, 0.30, 0.13), 0.75, 0.0),
    'plank-light': ((0.64, 0.41, 0.18), 0.75, 0.0),
    'plank-dark': ((0.20, 0.12, 0.06), 0.85, 0.0),
    'ore-lump': ((0.86, 0.66, 0.28), 0.45, 0.0),
    'bin-steel': ((0.52, 0.66, 0.80), 0.3, 0.0),
    'sight-glass': ((0.60, 0.95, 0.90), 0.15, 0.4),
})

# Where the rig's `t1-hopper` hatch sits against the `hull.cargo` slot (vehicle.parts.json: the
# hatch's `atM` (0.22, 0.1) less the slot's (0.2, 0.2)), at the hatch's own depth (-0.04). Every
# piece is laid out in the hatch's own frame (its base centre) and shifted here.
HATCH_OFFSET = (0.02, -0.04, -0.1)
# The hatch's footprint (author_casing_driller.hatch_pieces): the frame, the lid over it, the
# hinge along the left edge. Every look keeps inside it.
FRAME_SIZE = (0.17, 0.12, 0.06)
LID_SIZE = (0.18, 0.13, 0.014)
LID_Z = 0.065
LID_TOP = LID_Z + LID_SIZE[2] / 2
FRONT_Y = -FRAME_SIZE[1] / 2
HINGE = (0.01, 0.13, (-0.085, 0.0, 0.07))
# The stay up to the slot, behind the ram's rod (`t1-piston` at (0.34, -0.06, 0.17), rod radius
# 0.009): in the hatch frame the rod is at x 0.12, the stay 10 mm wide inside it, from the lid's
# height to 2 mm over the slot, 10 mm deep and clear behind the rod's back.
STAY_SIZE = (0.01, 0.01, 0.037)
STAY_AT = (0.12, 0.01, 0.0835)
# The crate's five planks across the front, their straps and the hasp on the lid's edge.
PLANK_XS = (-0.068, -0.034, 0.0, 0.034, 0.068)
PLANK_SIZE = (0.026, 0.012, 0.056)
STRAP_X = 0.076
STRAP_SIZE = (0.014, 0.012, LID_TOP)
BAND_SIZE = (0.17, 0.012, 0.012)
BAND_Z = 0.018
NAIL_RADIUS = 0.005
HASP_SIZE = (0.02, 0.008, 0.016)
# The hopper: a square funnel wide side up, stretched along X to the hatch's width, brass corner
# posts the hatch's height, a lip along the front edge and the ore heaped over it. Below the lid
# (z 0.058) the hatch is its 170 mm frame, so every piece there keeps to that; the lid band alone
# reaches the 180 mm.
FUNNEL_HALF_WIDTHS = (0.057, 0.042)
FUNNEL_HEIGHT = 0.058
FUNNEL_STRETCH = 0.056
POST_SIZE = (0.012, 0.12, LID_TOP)
POST_X = 0.077
LIP_SIZE = (0.17, 0.012, 0.008)
LIP_Z = 0.054
ORE_LUMPS = ((-0.062, 0.009), (-0.038, 0.011), (-0.012, 0.0095), (0.014, 0.011), (0.04, 0.0085), (0.064, 0.01))
ORE_Y = -0.044
ORE_Z = 0.061
# The bin: two riveted bands, corner plates, a steel hinge in the hatch's own bump, a brass
# handle on the lid's edge and the sight glass on the front.
BAND_ZS = (0.01, 0.05)
RIVET_XS = tuple(stepped(-0.07, 0.07, 0.02))
RIVET_RADIUS = 0.0055
PLATE_SIZE = (0.016, 0.012, LID_TOP)
PLATE_X = 0.075
HANDLE_SIZE = (0.04, 0.01, 0.01)
SIGHT_GLASS = (0.045, 0.03)
SIGHT_RADIUS = 0.011
# No piece is thinner than twice the bevel (8 mm) in any direction, or the bevel clamps everywhere.
SIGHT_DEPTH = 0.01
# The platform's 15 mm bevel would round a 3 cm rivet band away; vehicle-scale parts take 4 mm.
BEVEL_M = driller.BEVEL_M


def main():
    table = read_table()
    reset_scene()
    built = [author_look(look, int(table['z'])) for look in table['looks']]
    check_parts_match_table(table, built)
    save_as(table['assetId'])


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


def author_look(look, z_order):
    pieces = PIECES[look['part']]() + stay_pieces()
    shift_pieces(pieces, HATCH_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def shift_pieces(pieces, offset):
    for piece in pieces:
        piece.location.x += offset[0]
        piece.location.y += offset[1]
        piece.location.z += offset[2]


def check_parts_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(look['part'] for look in table['looks'])
    if names != wanted:
        raise SystemExit('%s parts %s do not match the table %s' % (table['assetId'], names, wanted))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (table['assetId'], part.name))


def is_origin_inside(obj):
    """The export refuses a part whose origin (here the slot) is outside its own bounds."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


def stay_pieces():
    """The reach up to the slot behind the ram, so the slot lies inside every look's bounds."""
    return [box('dark-iron', STAY_SIZE, STAY_AT)]


# --- the ore hatch (the default look) ------------------------------------------------------------


def hatch_pieces():
    """The rig's own hatch, piece for piece (author_casing_driller.hatch_pieces), so the look below
    the first step is the rig as it is."""
    return driller.hatch_pieces()


# --- the plank crate (the step at 23 purchases) --------------------------------------------------


def crate_pieces():
    pieces = [
        box('plank-dark', FRAME_SIZE, (0.0, 0.0, FRAME_SIZE[2] / 2)),
        box('plank-light', (LID_SIZE[0], LID_SIZE[1] / 2, LID_SIZE[2]), (0.0, -LID_SIZE[1] / 4, LID_Z)),
        box('plank', (LID_SIZE[0], LID_SIZE[1] / 2, LID_SIZE[2]), (0.0, LID_SIZE[1] / 4, LID_Z)),
        box('brass', HASP_SIZE, (0.0, FRONT_Y - 0.009, 0.052)),
    ]
    pieces += [box('plank', PLANK_SIZE, (x, FRONT_Y - 0.002, FRAME_SIZE[2] / 2)) for x in PLANK_XS]
    pieces += strap_pieces()
    return pieces


def strap_pieces():
    """Iron straps down the crate's corners and a band across its planks, nailed."""
    y = FRONT_Y - 0.004
    pieces = [box('iron-plate', STRAP_SIZE, (x, y, STRAP_SIZE[2] / 2)) for x in (-STRAP_X, STRAP_X)]
    pieces.append(box('iron-plate', BAND_SIZE, (0.0, y, BAND_Z)))
    for x in (-STRAP_X, STRAP_X):
        pieces += [sphere('iron', NAIL_RADIUS, (x, y - 0.006, z), flatten=0.6) for z in (BAND_Z, 0.06)]
    return pieces


# --- the ore hopper (the step at 31 purchases) ---------------------------------------------------


def hopper_pieces():
    top, bottom = FUNNEL_HALF_WIDTHS
    pieces = [
        kit.frustum('brass', top, bottom, FUNNEL_HEIGHT, (0.0, 0.0, FUNNEL_HEIGHT / 2), long_x=FUNNEL_STRETCH),
        box('brass', LIP_SIZE, (0.0, FRONT_Y - 0.002, LIP_Z)),
    ]
    pieces += [box('brass', POST_SIZE, (x, 0.0, POST_SIZE[2] / 2)) for x in (-POST_X, POST_X)]
    pieces += [driller.rivet(x, FRONT_Y - 0.006, z, radius=RIVET_RADIUS)
               for x in (-POST_X, POST_X) for z in (0.015, 0.057)]
    pieces += ore_pieces()
    return pieces


def ore_pieces():
    """Ore heaped in the mouth, showing over the front lip and under the hatch's height."""
    return [sphere('ore-lump', radius, (x, ORE_Y, ORE_Z), flatten=0.8) for x, radius in ORE_LUMPS]


# --- the riveted bin (the step at 33 purchases) --------------------------------------------------


def bin_pieces():
    pieces = [
        box('bin-steel', FRAME_SIZE, (0.0, 0.0, FRAME_SIZE[2] / 2)),
        box('bin-steel', LID_SIZE, (0.0, 0.0, LID_Z)),
        cylinder('steel', HINGE[0], HINGE[1], HINGE[2], 'Y'),
        box('brass', HANDLE_SIZE, (0.0, FRONT_Y - 0.008, 0.062)),
    ]
    pieces += [box('steel', PLATE_SIZE, (x, FRONT_Y - 0.003, PLATE_SIZE[2] / 2)) for x in (-PLATE_X, PLATE_X)]
    pieces += band_pieces()
    pieces += sight_glass_pieces()
    return pieces


def band_pieces():
    """Two steel bands across the front, each riveted along its length in brass."""
    y = FRONT_Y - 0.004
    pieces = [box('steel', (0.168, 0.012, 0.012), (0.0, y, z)) for z in BAND_ZS]
    pieces += [driller.rivet(x, y - 0.006, z, radius=RIVET_RADIUS) for z in BAND_ZS for x in RIVET_XS]
    return pieces


def sight_glass_pieces():
    """A brass-rimmed sight glass on the front, lit faintly from inside. Discs, not a ring: the
    bevel modifier clamps the whole part's width to its thinnest edge, and a ring's 3 mm minor
    radius squared off the lid's corners (one cell outside the rig's own hatch)."""
    x, z = SIGHT_GLASS
    y = FRONT_Y - 0.004
    return [
        driller.disc('brass', SIGHT_RADIUS, SIGHT_DEPTH, (x, y, z)),
        driller.disc('sight-glass', SIGHT_RADIUS - 0.003, SIGHT_DEPTH, (x, y - 0.004, z)),
    ]


PIECES = {
    'ore-hatch': hatch_pieces,
    'plank-crate': crate_pieces,
    'ore-hopper': hopper_pieces,
    'riveted-bin': bin_pieces,
}


if __name__ == '__main__':
    main()
