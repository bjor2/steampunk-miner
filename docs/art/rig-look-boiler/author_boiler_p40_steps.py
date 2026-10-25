"""
Authors the boiler line's LK10 look steps (ticket 873, wave 647-7Z of the P1-P5 map #647) into the
existing source, art/blender/vehicle-look-boiler/vehicle-look-boiler.blend: the GD lock of 25 Oct
06:48 (#873) wants the line authored to about P40 on the band edges LK1 (#809) froze for the boiler
(step 5: 5, 10, ..., 115), at least 13 steps (Systems' sizing row), each a new outline or an added
part in a socket, never a recolour. The six steps of #582 and LK2 (#810) stay the first steps (5 to
30); each step here is the firebox-door boiler with one more part fitted, from 35 to 115. The boiler
is the cooling line (heatEconomy.ts, as LK2 read it), so the parts are cooling fittings: the
water-side fittings first, then the condensing gear, then the ice-blue aether chill glows.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_p40_steps.py

It opens the .blend (the source since #582), removes any earlier copy of these seventeen parts and
rebuilds them from boilerLooks.json's rows, so a re-run rewrites the same objects; the seven parts
of #582 and #810 are left as they are. Conventions are author_boiler_looks.py's: the slot
`hull.boiler` at the origin, pieces laid out in the dome's frame and shifted by DOME_OFFSET, draw
order `z` 3, the vehicle-scale 4 mm bevel, details towards -Y (nearer the camera).

Why every part sits where it does: the rig outline a look may not leave (#873, #789,
check_outline.py) is the kettle dome's half-ellipse (x +-0.24, z 0..0.22), its base plate (x
+-0.25, z +-0.0175), its valve stem (x +-0.022 to z 0.26) and the stem's ring, and after LK2 the
drum heads, the plate front, the column and the firebox front are taken, so the sockets are what
those leave open: the ring round each drum head outside its rivets (the water jackets, the aether
frost), each head's inboard lower quarter beside the door (the sight glasses), the left head's
lower band under the whistle rack (the feed pump, the cryo coils), the header line between the
handwheels and the plate front under it (the blow-down cocks and their drip trays, the frost
lines), the ring round the steam drum's head under the stem (the cooling fins, the aether chiller),
the right head's lower band under the gauge's empty dial half (the radiator grille), the left
head's upper-outboard quarter over the first whistle (the blower fan), the steam drum's left rim
beside the tallest whistle (the feedwater tank, the cryo coils), the steam drum's boss (the
thermometer dial, a chill lens), the gauge's dial face behind its needle (a chill lens), the
outline's own edge just inside it (the brass hoop, the frost lines) and the jackets' upper arcs
(the frost rime). A later part stands nearer the camera than what it is fitted over, so it draws
over it; LK2's own fittings (y -0.165 and nearer) keep their depth, and the water jackets stand
behind them. Every part keeps inside the dome's outline, so nothing moves the rig outline, the
drawn drill tip or the collider.

| Part                  | Step | Adds                                                                  |
| --------------------- | ---- | --------------------------------------------------------------------- |
| `jacketed-boiler`     | 35   | a bolted steel water jacket ring round each drum head                  |
| `sight-glass-boiler`  | 40   | a brass-guarded glass level tube on each head beside the door          |
| `pumped-boiler`       | 45   | a brass feed pump with its flywheel on the left head's lower band      |
| `cocked-boiler`       | 50   | a brass blow-down cock with an iron handle and a steel drip tray each  |
|                       |      | side of the door                                                       |
| `finned-boiler`       | 55   | bright steel cooling fins round the steam drum's head                  |
| `radiator-boiler`     | 60   | a finned radiator grille in an iron frame under the gauge              |
| `blower-boiler`       | 65   | an iron blower housing with steel blades on the left head              |
| `feed-tank-boiler`    | 70   | a standing steel feedwater tank with a brass filler cap by the drum    |
| `condenser-boiler`    | 75   | copper condenser coils round the feed tank and the pump cylinder       |
| `thermometer-boiler`  | 80   | a brass-rimmed thermometer dial over the steam drum's boss             |
| `hooped-boiler`       | 85   | a brass hoop rail following the dome's outline from plate to plate    |
| `rimed-boiler`        | 90   | pale frost rime on the jackets' upper arcs, the drip trays and the tank|
| `cryo-coil-boiler`    | 95   | glowing ice-blue coils over the condenser coils                        |
| `chill-lens-boiler`   | 100  | glowing ice-blue dial faces behind the gauge's and thermometer's      |
|                       |      | needles, and the blower's hub                                         |
| `chiller-boiler`      | 105  | a glowing halo round the steam drum inside the fins, and one round    |
|                       |      | the blower                                                            |
| `frost-line-boiler`   | 110  | glow lines along the plate front over the trays and inside the hoop   |
| `aether-frost-boiler` | 115  | glow rings along both water jackets and the whistles' collars         |
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

import author_boiler_looks as base  # noqa: E402
import author_boiler_steps as lk2  # noqa: E402
import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, finish_piece, sphere  # noqa: E402

BLEND_PATH = lk2.BLEND_PATH

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The chill glows sit
# at the drive's aether glow emission (0.3, under a fifth of the nose seams' 1.6 and under the
# firebox port's 0.5), so the drill nose stays the brightest part of the rig. The rime and the
# lagging are pale and unlit: a frost that reads by its paleness, not by glow.
kit.PALETTE.update({
    'bright-steel': ((0.72, 0.74, 0.78), 0.25, 0.0),
    'sight-glass': ((0.70, 0.86, 0.92), 0.1, 0.0),
    'rime': ((0.86, 0.93, 0.98), 0.55, 0.0),
    'chill-glow': ((0.55, 0.85, 1.0), 0.2, 0.3),
})

# The dome's outline the parts keep inside (author_boiler_looks.DOME_RADII): x +-0.24, z 0..0.22.
DOME_X, _, DOME_Z = base.DOME_RADII
# Depth planes, nearer the camera as y falls: the heads' bosses reach -0.154, LK2's fittings stand
# at -0.165 and nearer (handwheels -0.19, the door's front -0.212).
JACKET_Y = -0.16
FITTED_Y = -0.2
FRONT_Y = -0.215

# The water jackets: a steel ring round each drum head over its brass rim, outside its rivets
# (0.065) and inside the dome's ellipse, which lets a circle round a drum's axis reach 0.091 at
# its 45-degree point (a first cut at 0.098 left 40 cells outside the rig); a dark-iron bolt lug
# outboard and on top. The ring tops at 0.175, so the safety valve's lever and ball show over it.
# A first pass at a 10 mm band moved 11 phone pixels at the closest zoom; the band is 14 mm now.
DRUM_XS = (-base.DRUM_X, base.DRUM_X)
JACKET = (0.083, 0.007)
JACKET_LUG = (0.022, 0.01, 0.022)
JACKET_LUG_ANGLES = {-1.0: (math.pi, math.pi / 2), 1.0: (0.0, math.pi / 2)}
# The sight glasses: a brass guard with a glass tube and a cock at each end, on each head's inboard
# lower quarter, beside the door frame (x +-0.05) and under the steam drum (its rim at z 0.124 there).
GLASS_XS = (-0.062, 0.062)
GLASS_GUARD = (0.03, 0.012, 0.07)
GLASS_Z = 0.07
GLASS_TUBE = (0.007, 0.054)
GLASS_COCK = 0.009
# The feed pump on the left head's lower band, under the whistle rack (its base from z 0.085): a
# brass cylinder along the axle line with iron end caps, a flywheel outboard and a crank rod.
PUMP = (0.019, 0.075, (-0.125, 0.058))
PUMP_CAP = (0.021, 0.006)
PUMP_FLYWHEEL = (0.026, 0.008, (-0.183, 0.06))
PUMP_ROD = ((-0.17, 0.072), (-0.14, 0.066))
# The blow-down cocks on the header line between the handwheels, each side of the door, and the
# steel drip tray under each along the plate front (the plate spans z +-0.0175).
COCK_XS = (-0.115, 0.115)
COCK = (0.011, 0.03)
COCK_HANDLE = (0.026, 0.006, 0.006)
COCK_HANDLE_Z = 0.012
TRAY = (0.12, 0.012, 0.016)
TRAY_XS = (-0.13, 0.13)
TRAY_Z = -0.0085
# The cooling fins round the steam drum's head (radius 0.065 at z 0.135): sixteen bright steel
# plates from inside its rim (over the head's rivets, inside the thermometer's rim) out to 0.084,
# so the top fin ends at 0.219 under the dome's crown (0.22); the fins pointing down stand behind
# the firebox door. A first pass of 5 mm fins from the rim moved no phone pixel at the closest
# zoom (a 45 px/m pixel is 22 mm); the fins are 14 mm thick and 34 mm long now.
FINS = (16, 0.05, 0.084, 0.014, 0.012)
FINS_AT = (0.0, lk2.STEAM_DRUM_Z)
FINS_Y = -0.158
FIN_LOWEST_Z = 0.04
# The radiator grille on the right head's lower band, over the gauge's empty lower dial, in a
# dark-iron frame with bright steel fins and a brass top bar.
GRILLE_FRAME = (0.1, 0.01, 0.036)
GRILLE_AT = (0.135, 0.056)
GRILLE_FIN = (0.004, 0.008, 0.03)
GRILLE_FIN_XS = tuple(0.095 + 0.01 * index for index in range(9))
GRILLE_BAR = (0.1, 0.012, 0.006)
# The blower fan on the left head's upper-outboard quarter, over the first whistle's top: an iron
# housing ring, six bright steel blades and a brass hub, inside the dome's side there (its housing
# reaches 0.027 from its axis; the ellipse allows 0.151 at the housing's 45-degree point, 0.143).
BLOWER_AT = (-0.155, 0.124)
BLOWER_HOUSING = (0.022, 0.005)
BLOWER_BLADES = (6, 0.004, 0.019, 0.009)
BLOWER_HUB = (0.007, 0.006)
# The feedwater tank standing on the steam drum's left rim beside the tallest whistle: a steel
# cylinder with brass bands and a filler cap (steel, so the copper condenser coils round it read:
# copper on a copper tank moved no phone pixel in the first pass).
TANK_X = -0.06
TANK = (0.015, 0.075, 0.1325)
TANK_BANDS = (0.11, 0.155)
TANK_CAP = (0.012, 0.176)
# The condenser coils: copper rings round the tank and round the pump cylinder, 12 mm thick.
TANK_COIL = (0.02, 0.006, (0.1, 0.113, 0.126, 0.139, 0.152))
PUMP_COIL = (0.024, 0.006, (-0.15, -0.125, -0.1))
# The thermometer dial over the steam drum's boss, inside its rivets (0.045).
THERMOMETER = (0.036, 0.3)
THERMOMETER_Y_SHIFT = (FITTED_Y + 0.011) - (-0.16)
# The brass hoop rail just inside the dome's outline, from the plate up over the crown and down
# to the plate again, in segments; its crown passes under the fins' roots (0.201).
HOOP = (0.218, 0.2, 0.006, 20)
HOOP_Y = FRONT_Y
# The frost rime: pale slabs on the jackets' upper arcs, over both drip trays and on the tank's
# cap. A first pass of 8 mm caps along the arcs moved one phone pixel; the slabs are 14 mm deep
# and the trays are frosted over.
RIME_SLAB = (0.03, 0.01, 0.014)
RIME_RADIUS = 0.082
RIME_ANGLES = tuple(math.radians(degrees) for degrees in (70, 90, 110))
RIME_TRAY = (0.12, 0.012, 0.016)
# The chill lenses: glowing dial faces behind the gauge's and the thermometer's needles (the gauge
# dial at -0.174, its needle at -0.182) and the blower's hub.
GAUGE_LENS = (0.04, -0.179)
THERMOMETER_LENS = (0.03, FITTED_Y - 0.002)
# The aether chiller: a halo round the steam drum inside the fins and one round the blower.
CHILLER_HALO = (0.057, 0.0035)
BLOWER_HALO = (0.017, 0.003)
# The frost lines: glow strips along the plate front over the drip trays and a glow hoop inside
# the brass hoop.
FROST_STRIP = (0.17, 0.004, 0.006)
FROST_STRIP_XS = (-0.155, 0.155)
FROST_STRIP_Z = 0.008
FROST_HOOP = (0.206, 0.188, 0.0035, 20)
# The aether frost: glow rings along both water jackets and round the whistles' collars.
FROST_RING = (0.083, 0.0045)
WHISTLE_RING = (0.017, 0.003)
# The vehicle-scale 4 mm bevel of the first seven parts.
BEVEL_M = base.BEVEL_M


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
    pieces = step_pieces(look['part'])
    base.shift_pieces(pieces, base.DOME_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def step_pieces(part_id):
    """The firebox-door boiler with every LK10 part up to and including this step's fitted."""
    pieces = lk2.firebox_door_pieces()
    for step_part, fitted_pieces in STEPS:
        pieces += fitted_pieces()
        if step_part == part_id:
            return pieces
    raise SystemExit('no LK10 step named "%s"' % part_id)


def check_steps_match_table(table, built):
    names = [part.name for part in built]
    wanted = [look['part'] for look in table['looks'] if look['part'] in STEP_PARTS]
    if names != wanted or sorted(names) != sorted(STEP_PARTS):
        raise SystemExit('LK10 parts %s do not match the table %s' % (names, wanted))
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)


# --- piece helpers beyond the kit's ------------------------------------------------------------


def coil(material, major, minor, centre, axis):
    """A ring round an axis: 'Z' standing (round a tank), 'X' lying (round a cylinder)."""
    rotation = {'Z': (0.0, 0.0, 0.0), 'X': (0.0, math.pi / 2, 0.0)}[axis]
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=10, location=centre, rotation=rotation)
    return finish_piece(material, smooth=True)


def radial(material, centre, angle, inner, outer, thickness, depth, y):
    """A bar along a radius of the circle round `centre`, from `inner` to `outer`."""
    cx, cz = centre
    start = (cx + inner * math.cos(angle), cz + inner * math.sin(angle))
    end = (cx + outer * math.cos(angle), cz + outer * math.sin(angle))
    return driller.segment(material, start, end, thickness, depth, y)


def hoop_pieces(material, half_x, top_z, radius, count, y):
    """A rail of `count` segments along the half-ellipse (half_x, top_z) from plate to plate."""
    points = [(-half_x * math.cos(t), top_z * math.sin(t))
              for t in [math.pi * index / count for index in range(count + 1)]]
    return [driller.segment(material, start, end, 2 * radius, 2 * radius, y)
            for start, end in zip(points, points[1:])]


def fin_angles():
    count, _, _, _, _ = FINS
    cx, cz = FINS_AT
    _, _, outer, _, _ = FINS
    return [angle for angle, _, _ in driller.around(count, outer) if cz + outer * math.sin(angle) >= FIN_LOWEST_Z]


# --- the fitted parts: the water-side fittings --------------------------------------------------


def jacket_pieces():
    """A bolted steel water jacket ring round each drum head, behind LK2's fittings."""
    major, minor = JACKET
    pieces = []
    for x in DRUM_XS:
        pieces.append(kit.torus('steel', major, minor, (x, JACKET_Y, base.DRUM_Z)))
        for angle in JACKET_LUG_ANGLES[1.0 if x > 0 else -1.0]:
            lug = driller.tangent_box('dark-iron', JACKET_LUG, angle, major, JACKET_Y - 0.004)
            lug.location.x += x
            lug.location.z += base.DRUM_Z
            pieces.append(lug)
    return pieces


def sight_glass_pieces():
    """A brass-guarded glass level tube with a cock at each end on each head's inboard quarter."""
    tube_radius, tube_length = GLASS_TUBE
    pieces = []
    for x in GLASS_XS:
        pieces.append(box('brass', GLASS_GUARD, (x, FITTED_Y + 0.005, GLASS_Z)))
        pieces.append(cylinder('sight-glass', tube_radius, tube_length, (x, FITTED_Y - 0.004, GLASS_Z), 'Z'))
        for end in (-1.0, 1.0):
            pieces.append(sphere('brass', GLASS_COCK, (x, FITTED_Y - 0.003, GLASS_Z + end * tube_length / 2), flatten=0.7))
    return pieces


def pump_pieces():
    """A brass feed pump lying on the left head's lower band, its flywheel outboard."""
    radius, length, (x, z) = PUMP
    cap_radius, cap_length = PUMP_CAP
    wheel_radius, wheel_thickness, (wheel_x, wheel_z) = PUMP_FLYWHEEL
    pieces = [cylinder('brass', radius, length, (x, FITTED_Y, z), 'X')]
    for end in (-1.0, 1.0):
        pieces.append(cylinder('iron', cap_radius, cap_length, (x + end * (length / 2 - 0.003), FITTED_Y, z), 'X'))
    pieces.append(driller.disc('dark-iron', wheel_radius, wheel_thickness, (wheel_x, FITTED_Y - 0.004, wheel_z)))
    pieces.append(kit.torus('brass', wheel_radius - 0.004, 0.003, (wheel_x, FITTED_Y - 0.009, wheel_z)))
    pieces.append(sphere('brass', 0.006, (wheel_x, FITTED_Y - 0.01, wheel_z), flatten=0.6))
    pieces.append(driller.segment('steel', PUMP_ROD[0], PUMP_ROD[1], 0.006, 0.005, FITTED_Y - 0.012))
    return pieces


def cock_pieces():
    """A brass blow-down cock with an iron T-handle each side of the door, a steel drip tray under each."""
    body_radius, _ = COCK
    pieces = []
    for x in COCK_XS:
        pieces.append(sphere('brass', body_radius, (x, FITTED_Y, lk2.HEADER_Z)))
        pieces.append(cylinder('brass', 0.005, 0.02, (x, FITTED_Y, 0.025), 'Z'))
        pieces.append(box('dark-iron', COCK_HANDLE, (x, FITTED_Y - 0.004, COCK_HANDLE_Z)))
    for x in TRAY_XS:
        pieces.append(box('steel', TRAY, (x, FITTED_Y, TRAY_Z)))
    return pieces


# --- the fitted parts: the condensing gear ------------------------------------------------------


def fin_pieces():
    """Bright steel cooling fins round the steam drum's head, under the dome's crown."""
    _, inner, outer, thickness, depth = FINS
    return [radial('bright-steel', FINS_AT, angle, inner, outer, thickness, depth, FINS_Y) for angle in fin_angles()]


def grille_pieces():
    """A finned radiator grille in an iron frame under the gauge, a brass bar over it."""
    x, z = GRILLE_AT
    pieces = [box('dark-iron', GRILLE_FRAME, (x, FITTED_Y, z))]
    for fin_x in GRILLE_FIN_XS:
        pieces.append(box('bright-steel', GRILLE_FIN, (fin_x, FITTED_Y - 0.006, z)))
    pieces.append(box('brass', GRILLE_BAR, (x, FITTED_Y - 0.002, z + GRILLE_FRAME[2] / 2 + GRILLE_BAR[2] / 2)))
    return pieces


def blower_pieces():
    """An iron blower housing with bright steel blades and a brass hub on the left head."""
    x, z = BLOWER_AT
    major, minor = BLOWER_HOUSING
    count, inner, outer, thickness = BLOWER_BLADES
    pieces = [
        driller.disc('dark-iron', major, 0.008, (x, FITTED_Y + 0.004, z)),
        kit.torus('iron', major, minor, (x, FITTED_Y - 0.002, z)),
    ]
    for angle, _, _ in driller.around(count, outer, phase=math.pi / 6):
        pieces.append(radial('bright-steel', (x, z), angle, inner, outer, thickness, 0.006, FITTED_Y - 0.003))
    pieces.append(sphere('brass', BLOWER_HUB[0], (x, FITTED_Y - 0.006, z), flatten=0.6))
    return pieces


def tank_pieces():
    """A standing copper feedwater tank with brass bands and a filler cap by the steam drum."""
    radius, length, z = TANK
    pieces = [cylinder('steel', radius, length, (TANK_X, FITTED_Y, z), 'Z')]
    for band_z in TANK_BANDS:
        pieces.append(cylinder('brass', radius + 0.002, 0.006, (TANK_X, FITTED_Y, band_z), 'Z'))
    pieces.append(sphere('brass', TANK_CAP[0], (TANK_X, FITTED_Y, TANK_CAP[1]), flatten=0.8))
    return pieces


def condenser_pieces():
    """Copper condenser coils round the feedwater tank and round the pump cylinder."""
    major, minor, zs = TANK_COIL
    pieces = [coil('copper', major, minor, (TANK_X, FITTED_Y, z), 'Z') for z in zs]
    pump_major, pump_minor, xs = PUMP_COIL
    _, _, (_, pump_z) = PUMP
    pieces += [coil('copper', pump_major, pump_minor, (x, FITTED_Y, pump_z), 'X') for x in xs]
    return pieces


def thermometer_pieces():
    """A brass-rimmed thermometer dial over the steam drum's boss, its needle low in the blue."""
    radius, needle_turn = THERMOMETER
    x, z = FINS_AT
    return base.shifted(driller.gauge_pieces(x, z, radius, needle_turn=needle_turn), THERMOMETER_Y_SHIFT)


def hoop_rail_pieces():
    """A brass hoop rail just inside the dome's outline, plate to plate over the crown."""
    half_x, top_z, radius, count = HOOP
    return hoop_pieces('brass', half_x, top_z, radius, count, HOOP_Y)


def rime_pieces():
    """Pale frost rime: slabs on the jackets' upper arcs, over both drip trays and on the tank's cap."""
    pieces = []
    for x in DRUM_XS:
        for angle in RIME_ANGLES:
            slab = driller.tangent_box('rime', RIME_SLAB, angle, RIME_RADIUS, JACKET_Y - 0.012)
            slab.location.x += x
            slab.location.z += base.DRUM_Z
            pieces.append(slab)
    pieces += [box('rime', RIME_TRAY, (x, FITTED_Y - 0.007, TRAY_Z)) for x in TRAY_XS]
    pieces.append(sphere('rime', TANK_CAP[0] - 0.002, (TANK_X, FITTED_Y - 0.004, TANK_CAP[1] + 0.004), flatten=0.5))
    return pieces


# --- the fitted parts: the aether chill glows ---------------------------------------------------


def cryo_coil_pieces():
    """Glowing ice-blue coils over the condenser coils, round the tank and the pump."""
    major, minor, zs = TANK_COIL
    pieces = [coil('chill-glow', major + 0.001, minor * 0.8, (TANK_X, FITTED_Y - 0.004, z), 'Z') for z in zs]
    pump_major, pump_minor, xs = PUMP_COIL
    _, _, (_, pump_z) = PUMP
    pieces += [coil('chill-glow', pump_major + 0.001, pump_minor * 0.8, (x, FITTED_Y - 0.004, pump_z), 'X') for x in xs]
    return pieces


def chill_lens_pieces():
    """Glowing dial faces behind the gauge's and the thermometer's needles, and the blower's hub."""
    gauge_x, gauge_z = lk2.GAUGE_AT
    gauge_radius, gauge_y = GAUGE_LENS
    lens_radius, lens_y = THERMOMETER_LENS
    x, z = FINS_AT
    blower_x, blower_z = BLOWER_AT
    return [
        driller.disc('chill-glow', gauge_radius, 0.004, (gauge_x, gauge_y, gauge_z)),
        driller.disc('chill-glow', lens_radius, 0.004, (x, lens_y, z)),
        driller.disc('chill-glow', BLOWER_HUB[0] + 0.004, 0.004, (blower_x, FITTED_Y - 0.004, blower_z)),
    ]


def chiller_pieces():
    """A glowing halo round the steam drum inside the fins and one round the blower."""
    x, z = FINS_AT
    blower_x, blower_z = BLOWER_AT
    return [
        kit.torus('chill-glow', CHILLER_HALO[0], CHILLER_HALO[1], (x, FINS_Y - 0.012, z)),
        kit.torus('chill-glow', BLOWER_HALO[0], BLOWER_HALO[1], (blower_x, FITTED_Y - 0.008, blower_z)),
    ]


def frost_line_pieces():
    """Glow lines along the plate front over the drip trays and a glow hoop inside the brass one."""
    pieces = [box('chill-glow', FROST_STRIP, (x, FRONT_Y - 0.002, FROST_STRIP_Z)) for x in FROST_STRIP_XS]
    half_x, top_z, radius, count = FROST_HOOP
    return pieces + hoop_pieces('chill-glow', half_x, top_z, radius, count, HOOP_Y - 0.002)


def aether_frost_pieces():
    """Glow rings along both water jackets and round the whistles' collars."""
    major, minor = FROST_RING
    pieces = [kit.torus('chill-glow', major, minor, (x, JACKET_Y - 0.026, base.DRUM_Z)) for x in DRUM_XS]
    for x, top in lk2.WHISTLE_TUBES:
        pieces.append(kit.torus('chill-glow', WHISTLE_RING[0], WHISTLE_RING[1], (x, lk2.FITTED_Y - 0.02, top - 0.02)))
    return pieces


STEPS = (
    ('jacketed-boiler', jacket_pieces),
    ('sight-glass-boiler', sight_glass_pieces),
    ('pumped-boiler', pump_pieces),
    ('cocked-boiler', cock_pieces),
    ('finned-boiler', fin_pieces),
    ('radiator-boiler', grille_pieces),
    ('blower-boiler', blower_pieces),
    ('feed-tank-boiler', tank_pieces),
    ('condenser-boiler', condenser_pieces),
    ('thermometer-boiler', thermometer_pieces),
    ('hooped-boiler', hoop_rail_pieces),
    ('rimed-boiler', rime_pieces),
    ('cryo-coil-boiler', cryo_coil_pieces),
    ('chill-lens-boiler', chill_lens_pieces),
    ('chiller-boiler', chiller_pieces),
    ('frost-line-boiler', frost_line_pieces),
    ('aether-frost-boiler', aether_frost_pieces),
)
STEP_PARTS = tuple(part for part, _ in STEPS)


if __name__ == '__main__':
    main()
