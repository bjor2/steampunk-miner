"""
Authors the drill_power track's LK12 look steps (ticket 875, wave 878-1A of the P1-P5 map #647)
into a new source, art/blender/vehicle-look-drill-power/vehicle-look-drill-power.blend: the GD
lock of 25 Oct 06:48 (#875) wants the line authored to about P40 on the band edges LK1 (#809)
froze for it (step 6: 6, 12, ..., 126), at least 13 steps (Systems' sizing row), each a new
outline or an added part in a socket, never a recolour. #554's nine glow rows stay the first nine
steps (6 to 54, glow only); each step here, 60 to 126, is the drill housing with one more part
fitted: the steam fittings first, then heavier hardware, then the aether glows.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-power/author_drill_power_looks.py

It writes the .blend from drillPowerLooks.json (the table this script, the renders and the
outline check share); from then on that file is the source (#52). Conventions are
author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit = 1 m, game right
is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored in its own
frame with the track's attach slot, `drill.housing`, at the origin (vehicle.parts.json: (0.26,
0.04), the GD's drill_power showcase point on #180), so the game draws a part at the slot's `atM`
with no offset, body-fixed, over the rig (`replaces` is null), at draw order `z` 4: over the
housing drum (3) and the chassis (2), under the armour (5) and the drill head (8). The drill head,
its tip and the drill_tip crowns on it (#815) are untouched: the parts are on the drill's body,
never a second head sprite (#875, #789).

Why every part sits where it does: the rig outline the steps may not leave (#875, check_outline.py)
is, round the slot, the housing drum (`t1-motor-housing`, the gimbal drive: a brass and iron drum
of radius 0.13 at (0.34, -0.07), its face at y -0.164 to -0.178) on the pod's bow. What is drawn
over the drum at the tiers these steps show on (#20: 200 drill power puts the rig on tier 3) is
the bow armour plate (`t2-/t3-armour-plate`, z 5, x 0.365 to 0.49, z -0.258 to -0.002) and the
headlamp (z 4, x 0.346 to 0.475, z 0.01 up); the cargo hold's looks reach the drum's top-left (x
to 0.345, z 0.009 up, z 3) and the hull's bow cap plate its left edge (x to 0.31, z 5). The
sockets are the drum's face those leave open: a panel 5.5 cm wide and 20 cm tall, x 0.31 to 0.365,
z -0.195 to 0.009 in the vehicle frame (PANEL in the look frame), read top down as a power train:
the gauge, the relief valve, the feed pipes down both sides, the fins, the clamp band, the
flywheel at the bottom. Every part stands with its face at FACE_Y, nearer the camera than the
drum's face and the bow leg's hip, so the composite review renders show it as the game draws the
look sprite over the housing sprite. Every part reaches back to the slot by a 5 mm bronze strut
in the pod's own colour (strut_pieces), because the export requires a part's origin inside its
bounds. Materials are kept to strong luminance pairs against the drum's brass and dark iron
(bright steel, copper, dark iron, glowing teal) so each step moves a 360 px phone's pixels at the
closest zoom; the glows stay at 0.3, under a fifth of the nose seams' 1.6, so the drill nose
stays the brightest part of the rig.

| Part               | Step | Adds                                                                  |
| ------------------ | ---- | --------------------------------------------------------------------- |
| `gauged-housing`   | 60   | a brass-bezelled pressure gauge with a red needle at the panel's top  |
| `valved-housing`   | 66   | a brass relief valve with a steel stem and a handwheel under it       |
| `piped-housing`    | 72   | two copper feed pipes down the panel's sides, with brass unions       |
| `finned-housing`   | 78   | five dark-iron cooling fins across the panel between the pipes        |
| `clamped-housing`  | 84   | a bright steel clamp band across the drum under the fins              |
| `flywheel-housing` | 90   | a dark-iron power flywheel with bright steel spokes at the bottom     |
| `bolted-housing`   | 96   | bright steel hex bolts on the band, the valve and round the gauge     |
| `ribbed-housing`   | 102  | two dark-iron ribs down the panel's edges, outside the pipes          |
| `coiled-housing`   | 108  | copper coils round both pipes between the gauge and the valve        |
| `lensed-housing`   | 114  | a glowing teal ring round the dial and two lamp lenses on the valve   |
| `haloed-housing`   | 120  | a glowing teal halo inside the flywheel's rim and on its hub          |
| `aether-housing`   | 126  | glow strips along both pipes and along every fin                      |
"""

import json
import math
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

LOOKS_TABLE = os.path.join(HERE, 'drillPowerLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The glows sit at the
# drive look's 0.3 (author_drive_p40_steps.py), under a fifth of the nose seams' 1.6.
kit.PALETTE.update({
    'bright-steel': ((0.72, 0.74, 0.78), 0.25, 0.0),
    'aether-glow': ((0.30, 0.90, 0.85), 0.2, 0.3),
})

# The slot, `drill.housing`, at (0.26, 0.04) in the vehicle frame: the look frame is the vehicle's
# less that. The housing drum's centre, (0.34, -0.07), is at (0.08, -0.11) here, radius 0.13.
SLOT_AT = (0.26, 0.04)
DRUM_CENTRE = (0.08, -0.11)
DRUM_RADIUS = 0.13
# The panel the over-drawn rig parts leave open (the docstring), in the look frame:
# (left x, bottom z, right x, top z).
PANEL = (0.05, -0.235, 0.105, -0.031)
PANEL_X = (PANEL[0] + PANEL[2]) / 2
# The drum's face is at y -0.164 to -0.178; the parts' back faces stand here, nearer the camera.
FACE_Y = -0.19
# The pressure gauge at the panel's top: bezel, dial, needle, hub.
GAUGE_Z = -0.053
GAUGE_BEZEL = (0.0215, 0.012)
GAUGE_DIAL = (0.0165, 0.006)
GAUGE_NEEDLE = (0.014, 0.004, 0.0025)
GAUGE_NEEDLE_TURN = 0.55
GAUGE_HUB = 0.003
# The relief valve under it: a brass body, a steel stem and a handwheel facing the camera.
VALVE_Z = -0.1
VALVE_BODY = (0.03, 0.02, 0.022)
VALVE_STEM = (0.0035, 0.02)
VALVE_WHEEL = (0.012, 0.0025)
VALVE_SPOKES = 3
# The feed pipes down both sides of the panel, from the gauge's level to the flywheel's, their
# brass unions, and the elbows that cap them.
PIPE_XS = (0.062, 0.093)
PIPE_Z = (-0.195, -0.08)
PIPE_RADIUS = 0.0045
PIPE_UNION = (0.0065, 0.008)
PIPE_UNION_ZS = (-0.1, -0.15)
# The cooling fins across the panel between the pipes.
FIN = (0.026, 0.012, 0.004)
FIN_ZS = (-0.128, -0.138, -0.148, -0.158, -0.168)
# The clamp band across the drum under the fins, and the flywheel at the bottom.
BAND_Z = -0.182
BAND = (0.06, 0.01, 0.012)
FLYWHEEL_Z = -0.21
FLYWHEEL_RIM = (0.02, 0.004)
FLYWHEEL_SPOKES = (4, (0.037, 0.006, 0.005))
FLYWHEEL_HUB = (0.006, 0.014)
# The hex bolts: on the band's ends, the valve body's corners and round the gauge's bezel.
BOLT = (0.0045, 0.006)
BOLT_BAND_XS = (0.052, 0.103)
BOLT_VALVE = ((-0.011, -0.007), (0.011, -0.007), (-0.011, 0.007), (0.011, 0.007))
BOLT_GAUGE_RING = 0.0245
BOLT_GAUGE_COUNT = 4
# The ribs down the panel's edges, outside the pipes.
RIB_XS = (0.0525, 0.1025)
RIB = (0.005, 0.01, 0.2)
RIB_Z = -0.133
# The copper coils round each pipe between the gauge and the valve.
COIL = (0.0095, 0.0026)
COIL_ZS = (-0.0765, -0.0815)
# The sight lenses: a glowing ring round the dial inside the bezel, two lenses on the valve body.
LENS_RING = (0.0185, 0.0024)
LENS_VALVE = (0.0045, 0.004)
LENS_VALVE_DXS = (-0.0115, 0.0115)
# The flywheel halo inside the rim, and its hub glow.
HALO = (0.0135, 0.0022)
HALO_HUB = (0.0045, 0.004)
# The aether housing: glow strips along the pipes' faces and along every fin's face.
PIPE_STRIP = (0.0028, 0.0025)
PIPE_STRIP_Z = (-0.19, -0.088)
FIN_STRIP = (0.024, 0.002, 0.0015)
# Every part's reach back to the slot: a strut in the pod's bronze from the origin to the panel's
# top-left corner, 5 mm wide, under the panel's face.
STRUT_WIDTH = 0.005
STRUT_Y = -0.12
# The platform's 15 mm bevel would round a 4 mm fin away; vehicle-scale parts take 4 mm.
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
    pieces = step_pieces(look['part']) + strut_pieces()
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def step_pieces(part_id):
    """The housing with every part up to and including this step's fitted."""
    pieces = []
    for step_part, fitted_pieces in STEPS:
        pieces += fitted_pieces()
        if step_part == part_id:
            return pieces
    raise SystemExit('no LK12 step named "%s"' % part_id)


def check_parts_match_table(table, built):
    names = [part.name for part in built]
    wanted = [look['part'] for look in table['looks']]
    if names != wanted or sorted(names) != sorted(STEP_PARTS):
        raise SystemExit('LK12 parts %s do not match the table %s' % (names, wanted))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)
        if not is_inside_panel_or_strut(part):
            raise SystemExit('part "%s" reaches past the panel %s' % (part.name, PANEL))


def is_origin_inside(obj):
    """The export refuses a part whose origin (here the slot) is outside its own bounds."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


def is_inside_panel_or_strut(obj):
    """Nothing but the strut stands outside the panel: its bounds are the panel's plus the slot."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    tolerance = STRUT_WIDTH + 1e-6
    return (min_x >= -tolerance and max_x <= PANEL[2] + tolerance
            and min_z >= PANEL[1] - tolerance and max_z <= tolerance)


# --- the steam fittings (60 to 90) ---------------------------------------------------------------


def pressure_gauge_pieces():
    """A brass-bezelled gauge with a pale dial and a red needle at the panel's top."""
    bezel_radius, bezel_depth = GAUGE_BEZEL
    dial_radius, dial_depth = GAUGE_DIAL
    needle_width, needle_depth, needle_height = GAUGE_NEEDLE
    at = (PANEL_X, GAUGE_Z)
    return [
        driller.disc('brass', bezel_radius, bezel_depth, (at[0], FACE_Y - bezel_depth / 2, at[1])),
        driller.disc('dial', dial_radius, dial_depth, (at[0], FACE_Y - bezel_depth - dial_depth / 2 + 0.002, at[1])),
        box('needle', (needle_width, needle_depth, needle_height),
            (at[0] + 0.004, FACE_Y - bezel_depth - dial_depth - 0.001, at[1] + 0.003), turn_y=GAUGE_NEEDLE_TURN),
        sphere('dark-iron', GAUGE_HUB, (at[0], FACE_Y - bezel_depth - dial_depth - 0.001, at[1]), flatten=0.6),
    ]


def relief_valve_pieces():
    """A brass valve body, a steel stem out of it and a brass handwheel facing the camera."""
    width, depth, height = VALVE_BODY
    stem_radius, stem_length = VALVE_STEM
    wheel_major, wheel_minor = VALVE_WHEEL
    wheel_y = FACE_Y - depth - stem_length + 0.002
    pieces = [
        box('brass', (width, depth, height), (PANEL_X, FACE_Y - depth / 2, VALVE_Z)),
        cylinder('steel', stem_radius, stem_length, (PANEL_X, FACE_Y - depth - stem_length / 2 + 0.002, VALVE_Z), 'Y'),
        kit.torus('brass', wheel_major, wheel_minor, (PANEL_X, wheel_y, VALVE_Z)),
    ]
    for angle, _, _ in driller.around(VALVE_SPOKES, wheel_major):
        pieces.append(driller.segment('brass', (PANEL_X, VALVE_Z),
                                      (PANEL_X + wheel_major * math.cos(angle), VALVE_Z + wheel_major * math.sin(angle)),
                                      0.003, 0.003, wheel_y))
    return pieces


def steam_feed_pieces():
    """Two copper feed pipes down the panel's sides with brass unions, capped by elbows."""
    bottom_z, top_z = PIPE_Z
    length = top_z - bottom_z
    union_radius, union_length = PIPE_UNION
    pieces = []
    for x in PIPE_XS:
        y = FACE_Y - PIPE_RADIUS
        pieces.append(cylinder('copper', PIPE_RADIUS, length, (x, y, (bottom_z + top_z) / 2), 'Z'))
        pieces += [cylinder('brass', union_radius, union_length, (x, y, z), 'Z') for z in PIPE_UNION_ZS]
        pieces += [sphere('copper', PIPE_RADIUS * 1.3, (x, y, z)) for z in PIPE_Z]
    return pieces


def cooling_fin_pieces():
    """Five dark-iron fins across the panel between the pipes."""
    width, depth, height = FIN
    return [box('dark-iron', (width, depth, height), (PANEL_X, FACE_Y - depth / 2, z)) for z in FIN_ZS]


def clamp_band_pieces():
    """A bright steel clamp band across the drum under the fins."""
    width, depth, height = BAND
    return [box('bright-steel', (width, depth, height), (PANEL_X, FACE_Y - depth / 2, BAND_Z))]


def power_flywheel_pieces():
    """A dark-iron-rimmed flywheel with four bright steel spokes and a brass hub at the panel's
    bottom: dark over the gimbal drive's brass gear face, so the step reads at a phone's size."""
    rim_major, rim_minor = FLYWHEEL_RIM
    spoke_count, spoke_size = FLYWHEEL_SPOKES
    hub_radius, hub_depth = FLYWHEEL_HUB
    y = FACE_Y - rim_minor - 0.004
    pieces = [kit.torus('dark-iron', rim_major, rim_minor, (PANEL_X, y, FLYWHEEL_Z))]
    for index in range(spoke_count // 2):
        turn = math.pi * index / (spoke_count // 2) + math.pi / 4
        pieces.append(box('bright-steel', spoke_size, (PANEL_X, y, FLYWHEEL_Z), turn_y=turn))
    pieces.append(driller.disc('brass', hub_radius, hub_depth, (PANEL_X, y - 0.002, FLYWHEEL_Z)))
    return pieces


# --- the heavier hardware (96 to 108) ------------------------------------------------------------


def hex_bolt_pieces():
    """Bright steel hex bolts on the band's ends, the valve body's corners and round the gauge."""
    _, band_depth, _ = BAND
    _, valve_depth, _ = VALVE_BODY
    bezel_radius, bezel_depth = GAUGE_BEZEL
    pieces = [hex_bolt((x, FACE_Y - band_depth, BAND_Z)) for x in BOLT_BAND_XS]
    pieces += [hex_bolt((PANEL_X + dx, FACE_Y - valve_depth, VALVE_Z + dz)) for dx, dz in BOLT_VALVE]
    for angle, dx, dz in driller.around(BOLT_GAUGE_COUNT, BOLT_GAUGE_RING, phase=math.pi / 4):
        pieces.append(hex_bolt((PANEL_X + dx, FACE_Y - 0.002, GAUGE_Z + dz)))
    return pieces


def hex_bolt(centre):
    radius, depth = BOLT
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=depth,
                                        location=(centre[0], centre[1] - depth / 2 + 0.001, centre[2]),
                                        rotation=(math.pi / 2, 0.0, 0.0))
    return kit.finish_piece('bright-steel', smooth=False)


def iron_rib_pieces():
    """Two dark-iron ribs down the panel's edges, outside the pipes."""
    width, depth, height = RIB
    return [box('dark-iron', (width, depth, height), (x, FACE_Y - depth / 2, RIB_Z)) for x in RIB_XS]


def copper_coil_pieces():
    """Copper coils round each pipe between the gauge and the valve."""
    major, minor = COIL
    pieces = []
    for x in PIPE_XS:
        for z in COIL_ZS:
            bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24,
                                             minor_segments=8, location=(x, FACE_Y - PIPE_RADIUS, z))
            pieces.append(kit.finish_piece('copper', smooth=True))
    return pieces


# --- the aether glows (114 to 126) ---------------------------------------------------------------


def sight_lens_pieces():
    """A glowing teal ring round the dial inside the bezel, and a lens on each side of the valve."""
    ring_major, ring_minor = LENS_RING
    lens_radius, lens_depth = LENS_VALVE
    _, bezel_depth = GAUGE_BEZEL
    _, valve_depth, _ = VALVE_BODY
    pieces = [kit.torus('aether-glow', ring_major, ring_minor, (PANEL_X, FACE_Y - bezel_depth - 0.001, GAUGE_Z))]
    for dx in LENS_VALVE_DXS:
        pieces.append(driller.disc('aether-glow', lens_radius, lens_depth,
                                   (PANEL_X + dx, FACE_Y - valve_depth - lens_depth / 2 + 0.001, VALVE_Z + 0.0005)))
    return pieces


def flywheel_halo_pieces():
    """A glowing teal halo inside the flywheel's rim and a glow on its hub."""
    halo_major, halo_minor = HALO
    hub_radius, hub_depth = HALO_HUB
    rim_minor = FLYWHEEL_RIM[1]
    y = FACE_Y - rim_minor - 0.004
    return [
        kit.torus('aether-glow', halo_major, halo_minor, (PANEL_X, y - 0.002, FLYWHEEL_Z)),
        driller.disc('aether-glow', hub_radius, hub_depth, (PANEL_X, y - FLYWHEEL_HUB[1] / 2 - 0.003, FLYWHEEL_Z)),
    ]


def aether_housing_pieces():
    """Glow strips along both pipes' faces and along every fin's face."""
    strip_width, strip_depth = PIPE_STRIP
    bottom_z, top_z = PIPE_STRIP_Z
    fin_width, fin_depth, fin_height = FIN_STRIP
    pieces = [box('aether-glow', (strip_width, strip_depth, top_z - bottom_z),
                  (x, FACE_Y - 2 * PIPE_RADIUS - strip_depth / 2 + 0.001, (bottom_z + top_z) / 2)) for x in PIPE_XS]
    pieces += [box('aether-glow', (fin_width, fin_depth, fin_height), (PANEL_X, FACE_Y - FIN[1] - fin_depth / 2 + 0.001, z))
               for z in FIN_ZS]
    return pieces


# --- the strut to the slot -----------------------------------------------------------------------


def strut_pieces():
    """Every look's reach back to the slot: a bar 5 mm wide in the pod's bronze from the origin to
    the panel's top-left corner, under the panel's face and proud of the pod's skin, so the part's
    origin (the slot) lies inside its bounds, as the export requires. The sub-pixel line it draws
    over the pod in the game is the pod's own colour."""
    corner = (PANEL[0] + 0.004, PANEL[3] - 0.004)
    return [driller.segment('bronze', (0.0, 0.0), corner, STRUT_WIDTH, 0.006, STRUT_Y)]


STEPS = (
    ('gauged-housing', pressure_gauge_pieces),
    ('valved-housing', relief_valve_pieces),
    ('piped-housing', steam_feed_pieces),
    ('finned-housing', cooling_fin_pieces),
    ('clamped-housing', clamp_band_pieces),
    ('flywheel-housing', power_flywheel_pieces),
    ('bolted-housing', hex_bolt_pieces),
    ('ribbed-housing', iron_rib_pieces),
    ('coiled-housing', copper_coil_pieces),
    ('lensed-housing', sight_lens_pieces),
    ('haloed-housing', flywheel_halo_pieces),
    ('aether-housing', aether_housing_pieces),
)
STEP_PARTS = tuple(part for part, _ in STEPS)


if __name__ == '__main__':
    main()
