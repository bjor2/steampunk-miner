"""
Authors the cargo_hold track's LK9 look steps (ticket 872, wave 647-7Z of the P1-P5 map #647) into
the existing source, art/blender/vehicle-look-cargo-hold/vehicle-look-cargo-hold.blend: the GD lock
of 25 Oct 06:48 (#872) wants the line authored to about P40 on the band edges LK1 (#809) froze for
the hold (step 11: 11, 22, ..., 231), at least 13 steps (Systems' sizing row), each a new outline
or an added part in a socket, never a recolour. The five steps of #580 and LK4 (#812) stay the
first steps (11 to 55); each step here is the pannier bin with one more part fitted, from 66 to
231, extending LK4's racks and panniers as the ticket asks: securing gear first (nets, a tarp, a
lock bar, a bumper), then the bin's own fittings (a lantern, lid clamps, a lock plate, a load
gauge, a lid handrail), then heavier gear (pannier plates, copper lines, a hoist tackle), then the
aetheric glows of the guild's hold (seals, a stasis field, halos, the aether hold).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/author_cargo_hold_p40_steps.py

It opens the .blend (the source since #580), removes any earlier copy of these sixteen parts and
rebuilds them from cargoHoldLooks.json's rows, so a re-run rewrites the same objects; the six
parts of #580 and LK4 are left as they are. Conventions are author_cargo_hold_looks.py's: the slot
`hull.cargo` at the origin, pieces laid out in the hatch's frame (its base centre) and shifted by
HATCH_OFFSET, draw order `z` 3, the vehicle-scale 4 mm bevel, the stay up to the slot behind the
ram, and no piece thinner than twice the bevel (8 mm) across the view, and rings with 16 facets, or the
bevel clamps the whole part.

Why every part sits where it does: the rig outline the steps may not leave (#872, #789,
check_outline.py) is the hatch itself above the deck, boxed in by the dome's plate, the steam ram
and open sky, and the one socket under it is the pod's flank LK4 hung its racks and panniers on
(vehicle x 0.135..0.305, z 0.012..0.1), so every LK9 part is fitted onto those two: over the
panniers (the nets, the tarp over their tops and flaps, the lock bar across the racks at
mid-height, the brass bumper along the racks' foot, the plates over the panniers' bellies), hung
from the top rail (the lantern at the right end, the hoist tackle at the centre), or on the bin's
own face inside the hatch's outline (the clamps under the lid's edge, the lock plate at the
centre, the gauge mirroring the sight glass, the handrail along the lid, the copper line along
the deck's edge). Every part stands in front of what it is fitted to (vehicle y under -0.128,
the LK4 parts' plane), keeps inside cargoHoldLooks.json's look box, and the bumper and the field
strip stop at vehicle z 0.011, over the hull looks' armour line (0.01). Each is sized to move a
360 px phone's pixels where its socket allows (#157: one visible step is at least a 4 x 4 patch at
45 px/m): a dark net over tan leather, an olive tarp over the dark flaps, bright steel over tan
and dark iron, brass over dark iron; the bin's fittings are small by the bin's nature and read at
90 px/m. The glows (the lantern's lens, the aether parts) sit at 0.3, under the sight glass's 0.4
and a fifth of the nose seams' 1.6, so the drill nose stays the brightest part of the rig.

| Part           | Step | Adds                                                                   |
| -------------- | ---- | ---------------------------------------------------------------------- |
| `netted-bin`   | 66   | a knotted tarred-rope cargo net over each pannier                      |
| `tarped-bin`   | 77   | an olive oilcloth tarp over both panniers' tops, a scalloped hem       |
| `barred-bin`   | 88   | a bright steel lock bar across the racks with a brass padlock          |
| `bumpered-bin` | 99   | a brass bumper tube along the racks' foot on dark-iron hangers         |
| `lamped-bin`   | 110  | a brass cargo lantern with an amber lens hung from the top rail        |
| `clamped-bin`  | 121  | four dark-iron toggle clamps with steel levers under the lid's edge    |
| `locked-bin`   | 132  | a dark-iron lock plate with a brass escutcheon on the bin's face       |
| `gauged-bin`   | 143  | a brass load gauge with a dark face and a steel needle by the glass    |
| `railed-bin`   | 154  | a dark-iron grab rail on brass stanchions along the lid                |
| `plated-bin`   | 165  | a riveted bright steel plate over each pannier's belly                 |
| `piped-bin`    | 176  | a copper line from the gauge along the deck's edge, brass unions       |
| `hoisted-bin`  | 187  | a dark-iron hoist block with a brass sheave and a steel hook           |
| `sealed-bin`   | 198  | a glowing teal seal on each pannier plate and on the lock plate        |
| `field-bin`    | 209  | glowing teal strips along the lock bar and the bumper                  |
| `haloed-bin`   | 220  | glowing teal halos round the glass, the gauge, the lantern, the block  |
| `aether-bin`   | 231  | glow strips along the bin's bands and the pannier plates               |
"""

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_cargo_hold_looks as base  # noqa: E402
import author_cargo_hold_steps as lk4  # noqa: E402
import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, sphere  # noqa: E402

BLEND_PATH = lk4.BLEND_PATH

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The glows sit at
# 0.3 (LK8's aether and lamp values), under the sight glass's 0.4.
kit.PALETTE.update({
    'tar-rope': ((0.14, 0.11, 0.08), 0.9, 0.0),
    'oilcloth': ((0.33, 0.37, 0.20), 0.9, 0.0),
    'bright-steel': ((0.72, 0.74, 0.78), 0.25, 0.0),
    'aether-glow': ((0.30, 0.90, 0.85), 0.2, 0.3),
    'lamp-amber': ((1.0, 0.72, 0.30), 0.2, 0.3),
})

FLANK_TOP, FLANK_BOTTOM, FLANK_MID = lk4.FLANK_TOP, lk4.FLANK_BOTTOM, lk4.FLANK_MID
FRONT_Y = base.FRONT_Y
# The thinnest a piece may be: twice the bevel, or the modifier clamps the whole part (#580).
THIN = 2 * base.BEVEL_M
# The cargo nets: three tarred ropes down and two across each pannier, in front of its straps.
NET_Y = -0.152
NET_DXS = (-0.03, 0.0, 0.03)
NET_ZS = (-0.034, -0.06)
NET_HEIGHT = 0.066
NET_WIDTH = 0.07
NET_Z = -0.046
# The oilcloth tarp over both panniers' tops and flaps, its scalloped hem hanging over the nets.
TARP = (0.172, 0.04, 0.024)
TARP_AT = (0.0, -0.14, -0.016)
HEM = (0.022, 0.03, 0.012)
HEM_XS = (-0.07, -0.042, -0.014, 0.014, 0.042, 0.07)
HEM_AT = (-0.146, -0.032)
# The lock bar across both racks at mid-height, hung on the outer stakes, a brass padlock at centre.
BAR = (0.172, 0.012, 0.014)
BAR_AT = (0.0, -0.166, -0.05)
BAR_HANGER = (0.016, 0.014, 0.02)
BAR_HANGER_XS = lk4.STAKE_XS[0], lk4.STAKE_XS[-1]
PADLOCK = (0.02, 0.012, 0.022)
PADLOCK_AT = (0.0, -0.17, -0.064)
SHACKLE = (0.009, 0.004)
# The brass bumper along the racks' foot: its underside at vehicle z 0.011, over the armour line.
BUMPER = (0.011, 0.172)
BUMPER_AT = (0.0, -0.14, -0.078)
BUMPER_CAP = (0.013, 0.012)
BUMPER_CAP_XS = (-0.08, 0.08)
BUMPER_HANGER = (0.014, 0.03, 0.012)
BUMPER_HANGER_XS = (-0.05, 0.05)
BUMPER_HANGER_Y = -0.11
# The cargo lantern hung from the top rail at the right end, over the tarp.
LANTERN = (0.013, 0.03)
LANTERN_AT = (0.07, -0.165, -0.028)
LANTERN_LENS = (0.009, 0.01)
LANTERN_RING = (0.012, 0.004)
LANTERN_HANGER = (0.01, 0.012, 0.012)
LANTERN_HANGER_Z = -0.01
# The lid clamps under the lid's edge on the bin's face, clear of the lock plate and the glass.
CLAMP_XS = (-0.064, -0.027, 0.027, 0.064)
CLAMP_BASE = (0.016, 0.012, 0.02)
CLAMP_BASE_Z = 0.052
CLAMP_LEVER = (0.01, 0.01, 0.024)
CLAMP_LEVER_Z = 0.046
# The lock plate at the bin's centre between the bands, a brass escutcheon and four steel bolts.
LOCK_PLATE = (0.036, 0.01, 0.026)
LOCK_PLATE_AT = (0.0, -0.066, 0.03)
ESCUTCHEON = (0.008, 0.01)
LOCK_BOLT_R = 0.004
LOCK_BOLT_DXS = (-0.013, 0.013)
LOCK_BOLT_DZS = (-0.008, 0.008)
# The load gauge mirroring the sight glass on the bin's face.
GAUGE_AT = (-0.048, 0.03)
GAUGE_RIM = (0.013, 0.01)
GAUGE_FACE = (0.01, 0.01)
GAUGE_NEEDLE_TIP = (-0.041, 0.038)
# The grab rail along the lid's front on three brass stanchions.
RAIL = (0.006, 0.15)
RAIL_AT = (0.0, -0.08, 0.064)
STANCHION = (0.01, 0.016, 0.012)
STANCHION_XS = (-0.06, 0.0, 0.06)
STANCHION_Y = -0.072
# The pannier plates under the lock bar, three dark-iron rivets each.
PLATE = (0.066, 0.01, 0.02)
PLATE_AT = (-0.17, -0.067)
PLATE_RIVET_R = 0.004
PLATE_RIVET_DXS = (-0.022, 0.0, 0.022)
# The copper line: down from the gauge to the deck's edge, then along it over the tarp's top.
PIPE_R = 0.006
PIPE_Y = -0.165
PIPE_DECK_Z = -0.004
PIPE_RUN_XS = (-0.084, 0.084)
PIPE_DROP = (GAUGE_AT[0], -0.076, 0.016)
UNION_R = 0.008
# The hoist tackle at the centre: a block under the deck, a sheave, a hook ringing the lock bar.
HOIST_BLOCK = (0.013, 0.012)
HOIST_AT = (0.0, -0.17, -0.02)
HOIST_SHEAVE = (0.008, 0.01)
HOIST_HOOK = (0.008, 0.004)
HOIST_HOOK_Z = -0.036
HOIST_STRAP = (0.012, 0.012, 0.012)
HOIST_STRAP_Z = -0.006
# The aether seals: a glowing lens on each pannier plate and over the lock plate's escutcheon.
SEAL = (0.009, 0.01)
SEAL_Y = -0.18
LOCK_SEAL = (0.007, 0.01)
LOCK_SEAL_Y = -0.078
# The stasis field: glow strips along the lock bar's upper edge and the bumper's underside.
FIELD_STRIP = (0.16, 0.008, 0.008)
FIELD_BAR_AT = (-0.178, -0.043)
FIELD_BUMPER_AT = (-0.158, -0.085)
# The aether halos round the glass, the gauge, the lantern's lens and the hoist block.
HALO = (0.016, 0.004)
HALO_FACE_Y = -0.08
LANTERN_HALO_Y = -0.192
HOIST_HALO_Y = -0.184
# The aether hold: glow strips along the bin's two bands and the pannier plates' top edges.
BAND_STRIP = (0.16, 0.008, 0.008)
BAND_STRIP_Y = -0.08
PLATE_STRIP = (0.056, 0.008, 0.008)
PLATE_STRIP_AT = (-0.182, -0.058)
BEVEL_M = base.BEVEL_M
# A ring's tube facets: 16 keep every facet under the bevel's 30 degree angle limit, so a ring
# neither takes a bevel nor clamps the whole part's bevel to its 2 mm facets (the sight glass's
# finding on #580: a 10-facet ring squared the lid's corners off, one cell outside the rig).
RING_FACETS = 16


def main():
    table = base.read_table()
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    remove_earlier_copies()
    built = [author_step(look, int(table['z'])) for look in table['looks'] if look['part'] in STEP_PARTS]
    check_steps_match_table(table, built)
    bpy.ops.wm.save_mainfile(filepath=BLEND_PATH, compress=True)
    print('authored ' + ', '.join(part.name for part in built))


def remove_earlier_copies():
    for part_id in STEP_PARTS:
        earlier = bpy.data.objects.get(part_id)
        if earlier is not None:
            bpy.data.objects.remove(earlier)
    for mesh in [mesh for mesh in bpy.data.meshes if mesh.users == 0]:
        bpy.data.meshes.remove(mesh)


def author_step(look, z_order):
    fitted = fitted_pieces_of(look['part'])
    refuse_thin_pieces(look['part'], fitted)
    pieces = lk4.pannier_bin_pieces() + fitted + base.stay_pieces()
    base.shift_pieces(pieces, base.HATCH_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def fitted_pieces_of(part_id):
    """Every LK9 part up to and including this step's, fitted on the pannier bin."""
    pieces = []
    for step_part, step_pieces in STEPS:
        pieces += step_pieces()
        if step_part == part_id:
            return pieces
    raise SystemExit('no LK9 step named "%s"' % part_id)


def refuse_thin_pieces(part_id, pieces):
    """A piece under twice the bevel across the view clamps the bevel on the whole part (#580)."""
    bpy.context.view_layer.update()
    for piece in pieces:
        across = min(piece.dimensions.x, piece.dimensions.z)
        if across < THIN - 1e-6:
            raise SystemExit('%s: piece "%s" is %.1f mm across, under %g mm' % (part_id, piece.name, across * 1000, THIN * 1000))


def check_steps_match_table(table, built):
    names = [part.name for part in built]
    wanted = [look['part'] for look in table['looks'] if look['part'] in STEP_PARTS]
    if names != wanted or sorted(names) != sorted(STEP_PARTS):
        raise SystemExit('LK9 parts %s do not match the table %s' % (names, wanted))
    look_box = table['lookBoxM']
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)
        if not lk4.is_inside_look_box(part, look_box):
            raise SystemExit('part "%s" reaches past the look box %s' % (part.name, look_box))


def ring(material, major, minor, centre):
    """A ring facing the camera whose facets stay under the bevel's angle limit (RING_FACETS)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=RING_FACETS, location=centre, rotation=(math.pi / 2, 0.0, 0.0))
    return kit.finish_piece(material, smooth=True)


# --- the fitted parts: securing gear ------------------------------------------------------------


def net_pieces():
    """A knotted tarred-rope cargo net over each pannier, in front of its straps and buckles."""
    pieces = []
    for x in lk4.PANNIER_XS:
        pieces += [box('tar-rope', (THIN + 0.001, THIN + 0.001, NET_HEIGHT), (x + dx, NET_Y, NET_Z)) for dx in NET_DXS]
        pieces += [box('tar-rope', (NET_WIDTH, THIN + 0.001, THIN + 0.001), (x, NET_Y, z)) for z in NET_ZS]
    return pieces


def tarp_pieces():
    """An olive oilcloth tarp over both panniers' tops, the flaps and the top rail, its scalloped
    hem hanging over the nets."""
    pieces = [box('oilcloth', TARP, TARP_AT)]
    pieces += [box('oilcloth', HEM, (x, HEM_AT[0], HEM_AT[1])) for x in HEM_XS]
    return pieces


def bar_pieces():
    """A bright steel lock bar across both racks at mid-height, hung on the outer stakes, a brass
    padlock at the centre with its steel shackle ringing the bar."""
    pieces = [box('bright-steel', BAR, BAR_AT)]
    pieces += [box('dark-iron', BAR_HANGER, (x, BAR_AT[1] + 0.006, BAR_AT[2])) for x in BAR_HANGER_XS]
    pieces.append(box('brass', PADLOCK, PADLOCK_AT))
    pieces.append(ring('bright-steel', SHACKLE[0], SHACKLE[1], (PADLOCK_AT[0], PADLOCK_AT[1], BAR_AT[2])))
    return pieces


def bumper_pieces():
    """A brass bumper tube along the racks' foot, dark-iron end caps, two hangers to the rail."""
    radius, length = BUMPER
    pieces = [cylinder('brass', radius, length, BUMPER_AT, 'X')]
    pieces += [cylinder('dark-iron', BUMPER_CAP[0], BUMPER_CAP[1], (x, BUMPER_AT[1], BUMPER_AT[2]), 'X')
               for x in BUMPER_CAP_XS]
    pieces += [box('dark-iron', BUMPER_HANGER, (x, BUMPER_HANGER_Y, BUMPER_AT[2])) for x in BUMPER_HANGER_XS]
    return pieces


# --- the fitted parts: the bin's fittings -------------------------------------------------------


def lantern_pieces():
    """A brass cargo lantern with a lit amber lens, hung from the top rail at the right end."""
    radius, length = LANTERN
    x, y, z = LANTERN_AT
    return [
        cylinder('brass', radius, length, (x, y, z), 'Y'),
        driller.disc('lamp-amber', LANTERN_LENS[0], LANTERN_LENS[1], (x, y - length / 2 - 0.002, z)),
        ring('brass', LANTERN_RING[0], LANTERN_RING[1], (x, y - length / 2 - 0.004, z)),
        box('dark-iron', LANTERN_HANGER, (x, y, LANTERN_HANGER_Z)),
    ]


def clamp_pieces():
    """Four dark-iron toggle clamps under the lid's edge, each with a bright steel lever."""
    pieces = []
    for x in CLAMP_XS:
        pieces.append(box('dark-iron', CLAMP_BASE, (x, FRONT_Y - 0.006, CLAMP_BASE_Z)))
        pieces.append(box('bright-steel', CLAMP_LEVER, (x, FRONT_Y - 0.014, CLAMP_LEVER_Z)))
    return pieces


def lock_plate_pieces():
    """A dark-iron lock plate at the bin's centre, a brass escutcheon and four steel bolts."""
    x, y, z = LOCK_PLATE_AT
    pieces = [
        box('dark-iron', LOCK_PLATE, LOCK_PLATE_AT),
        driller.disc('brass', ESCUTCHEON[0], ESCUTCHEON[1], (x, y - 0.006, z + 0.004)),
    ]
    pieces += [sphere('bright-steel', LOCK_BOLT_R, (x + dx, y - 0.006, z + dz), flatten=0.6)
               for dx in LOCK_BOLT_DXS for dz in LOCK_BOLT_DZS]
    return pieces


def gauge_pieces():
    """A brass load gauge with a dark face and a bright steel needle, mirroring the sight glass."""
    x, z = GAUGE_AT
    y = FRONT_Y - 0.006
    return [
        driller.disc('brass', GAUGE_RIM[0], GAUGE_RIM[1], (x, y, z)),
        driller.disc('dark-iron', GAUGE_FACE[0], GAUGE_FACE[1], (x, y - 0.004, z)),
        driller.segment('bright-steel', (x, z), GAUGE_NEEDLE_TIP, THIN, THIN, y - 0.01),
    ]


def rail_pieces():
    """A dark-iron grab rail along the lid's front on three brass stanchions."""
    radius, length = RAIL
    pieces = [cylinder('dark-iron', radius, length, RAIL_AT, 'X')]
    pieces += [box('brass', STANCHION, (x, STANCHION_Y, RAIL_AT[2])) for x in STANCHION_XS]
    return pieces


# --- the fitted parts: heavier gear -------------------------------------------------------------


def plate_pieces():
    """A riveted bright steel plate over each pannier's belly, under the lock bar."""
    y, z = PLATE_AT
    pieces = []
    for x in lk4.PANNIER_XS:
        pieces.append(box('bright-steel', PLATE, (x, y, z)))
        pieces += [sphere('dark-iron', PLATE_RIVET_R, (x + dx, y - 0.006, z), flatten=0.6) for dx in PLATE_RIVET_DXS]
    return pieces


def pipe_pieces():
    """A copper line down from the gauge to the deck's edge, then along it over the tarp's top,
    brass unions at the elbow and the ends."""
    drop_x, drop_y, drop_top = PIPE_DROP
    pieces = [
        driller.segment('copper', (drop_x, drop_top), (drop_x, PIPE_DECK_Z), 2 * PIPE_R, 2 * PIPE_R, drop_y),
        driller.segment('copper', (PIPE_RUN_XS[0], PIPE_DECK_Z), (PIPE_RUN_XS[1], PIPE_DECK_Z),
                        2 * PIPE_R, 2 * PIPE_R, PIPE_Y),
        sphere('brass', UNION_R, (drop_x, PIPE_Y, PIPE_DECK_Z)),
    ]
    pieces += [sphere('brass', UNION_R, (x, PIPE_Y, PIPE_DECK_Z)) for x in PIPE_RUN_XS]
    return pieces


def hoist_pieces():
    """A dark-iron hoist block strapped under the deck at the centre, a brass sheave and a bright
    steel hook ringing the lock bar."""
    x, y, z = HOIST_AT
    return [
        box('dark-iron', HOIST_STRAP, (x, y, HOIST_STRAP_Z)),
        driller.disc('dark-iron', HOIST_BLOCK[0], HOIST_BLOCK[1], (x, y, z)),
        driller.disc('brass', HOIST_SHEAVE[0], HOIST_SHEAVE[1], (x, y - 0.008, z)),
        ring('bright-steel', HOIST_HOOK[0], HOIST_HOOK[1], (x, y, HOIST_HOOK_Z)),
    ]


# --- the fitted parts: the aetheric glows -------------------------------------------------------


def seal_pieces():
    """A glowing teal seal on each pannier plate and over the lock plate's escutcheon."""
    pieces = [driller.disc('aether-glow', SEAL[0], SEAL[1], (x, SEAL_Y, PLATE_AT[1])) for x in lk4.PANNIER_XS]
    pieces.append(driller.disc('aether-glow', LOCK_SEAL[0], LOCK_SEAL[1],
                               (LOCK_PLATE_AT[0], LOCK_SEAL_Y, LOCK_PLATE_AT[2] + 0.004)))
    return pieces


def field_pieces():
    """Glowing teal strips along the lock bar's upper edge and the bumper's underside."""
    return [
        box('aether-glow', FIELD_STRIP, (0.0, FIELD_BAR_AT[0], FIELD_BAR_AT[1])),
        box('aether-glow', FIELD_STRIP, (0.0, FIELD_BUMPER_AT[0], FIELD_BUMPER_AT[1])),
    ]


def halo_pieces():
    """Glowing teal halos round the sight glass, the gauge, the lantern's lens and the hoist block."""
    major, minor = HALO
    return [
        ring('aether-glow', major, minor, (base.SIGHT_GLASS[0], HALO_FACE_Y, base.SIGHT_GLASS[1])),
        ring('aether-glow', major, minor, (GAUGE_AT[0], HALO_FACE_Y, GAUGE_AT[1])),
        ring('aether-glow', major, minor, (LANTERN_AT[0], LANTERN_HALO_Y, LANTERN_AT[2])),
        ring('aether-glow', major, minor, (HOIST_AT[0], HOIST_HALO_Y, HOIST_AT[2])),
    ]


def aether_hold_pieces():
    """Glow strips along the bin's two bands and the pannier plates' top edges."""
    pieces = [box('aether-glow', BAND_STRIP, (0.0, BAND_STRIP_Y, z)) for z in base.BAND_ZS]
    pieces += [box('aether-glow', PLATE_STRIP, (x, PLATE_STRIP_AT[0], PLATE_STRIP_AT[1])) for x in lk4.PANNIER_XS]
    return pieces


STEPS = (
    ('netted-bin', net_pieces),
    ('tarped-bin', tarp_pieces),
    ('barred-bin', bar_pieces),
    ('bumpered-bin', bumper_pieces),
    ('lamped-bin', lantern_pieces),
    ('clamped-bin', clamp_pieces),
    ('locked-bin', lock_plate_pieces),
    ('gauged-bin', gauge_pieces),
    ('railed-bin', rail_pieces),
    ('plated-bin', plate_pieces),
    ('piped-bin', pipe_pieces),
    ('hoisted-bin', hoist_pieces),
    ('sealed-bin', seal_pieces),
    ('field-bin', field_pieces),
    ('haloed-bin', halo_pieces),
    ('aether-bin', aether_hold_pieces),
)
STEP_PARTS = [part for part, _ in STEPS]


if __name__ == '__main__':
    main()
