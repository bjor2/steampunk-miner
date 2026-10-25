"""
Authors the drill_tip track's LK6 look steps (ticket 815, wave 647-7K of the P1-P5 map #647) into
the existing source, art/blender/vehicle-look-drill-tip/vehicle-look-drill-tip.blend: the GD lock
of 24 Oct 14:54 (#815) wants the line authored to about P40 on the band edges LK1 (#809) froze for
the drill tip (step 60: 60, 120, ..., 1200), each step a new outline or an added part in a socket,
never a recolour. The #578 parts stay the first five steps (60 to 300); each step here is the
aether-cut crown with one more part fitted, in the order the ticket named: the bit-finish steps
first (hardware on the bit's working surface, 360 to 780), then the spin-blur steps (the halos,
collars, streaks and fan of a bit spinning fast, 840 to 1200).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/author_drill_tip_steps.py

It opens the .blend (the source since #578), removes any earlier copy of these fifteen parts and
rebuilds them from drillTipLooks.json's rows, so a re-run rewrites the same objects; the six parts
of #578 are left as they are. Conventions are author_drill_tip_looks.py's: the slot `drill.head` at
the origin, +X towards the tip, details stand out towards -Y, draw order `z` 9, the vehicle-scale
4 mm bevel, every look's 6 mm shaft back to the slot.

Why every part sits where it does: the rig outline the steps may not leave (#815, #789,
check_outline.py) is, at tier 1, the head's stepped cone and the crown's disc with its eight
teeth. The bit layers onto the head and is never a second head sprite, so the sockets are the
cone's steps ahead of the gimbal, measured from the staged head's rings (CONE_STEPS: look x
-0.132..-0.045 at radius 0.100 down to 0.0765, -0.045..0.041 at 0.0706 down to 0.047, 0.041..0.128
at 0.041 down to 0.0176), the sheath and bridge the #578 looks already wear, and the crown's face
inside its disc (radius 0.0396). A part round the bit keeps its rim 1.5 mm under the cone's
radius and stands with its axis 40 mm nearer the camera than the head's, so its whole face is in
front of the cone's in the review renders, as the game draws the look sprite over the head
sprite. The drawn tip never moves: every part keeps the aether-cut crown's front edge (look x
0.1741), so `drillTipAheadOf` reads the same at every step; the script refuses a part that moves
it. Face-on rings stay inside the disc, because a face-on torus covers its whole radius in the
silhouette and the arc between the teeth is outside the rig. Materials are kept to strong
luminance pairs (dark iron over the brass cone step, bright steel over the steel one, glowing
teal over ceramic) so each step moves a 360 px phone's pixels at the closest zoom; the glows stay
at or under the aether crown's 1.2, so the nose seams' 1.6 keep the drill nose the brightest part.

| Part                  | Step | Adds                                                                  |
| --------------------- | ---- | --------------------------------------------------------------------- |
| `collared-crown`      | 360  | a dark-iron carbide collar over the cone's second step, a brass bead  |
| `ferruled-crown`      | 420  | a bright steel ferrule on the first step, dark rim bands              |
| `knurled-crown`       | 480  | bright knurl bands and studs on the collar, a dark band on the ferrule|
| `reamed-crown`        | 540  | a dark-iron reamer ring ahead of the gimbal, brass rim, steel teeth   |
| `chromed-crown`       | 600  | a polished-chrome face ring on the wheel, chrome collars on the stem  |
| `bossed-crown`        | 660  | brass bosses on the reamer ring and the ferrule                       |
| `cooled-crown`        | 720  | a copper coolant ring and two copper lines along the bit to a fitting |
| `inlaid-crown`        | 780  | eight diamond inlays set in the chrome ring at the teeth              |
| `haloed-crown`        | 840  | a glowing spin halo round the wheel's face                            |
| `blur-collar-crown`   | 900  | glowing blur collars on the ferrule's and the collar's front edges    |
| `streaked-crown`      | 960  | eight glowing spin streaks between the inlays                         |
| `double-halo-crown`   | 1020 | a second, inner halo round the core                                   |
| `fanned-crown`        | 1080 | eight glowing fan blades radiating between the teeth                  |
| `vortex-crown`        | 1140 | a bright vortex core over the hot core, a chrome hub                  |
| `aether-vortex-crown` | 1200 | glow collars along the whole bit: reamer ring, ferrule, sheath, bridge|
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

import author_casing_driller as driller  # noqa: E402
import author_drill_tip_looks as base  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, sphere  # noqa: E402

BLEND_PATH = os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle-look-drill-tip', 'vehicle-look-drill-tip.blend')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). Every glow here stays
# at or under the aether crown's 1.2 (`aether-glow`), under the nose seams' 1.6 (`nose-glow`).
kit.PALETTE.update({
    'polished-chrome': ((0.90, 0.92, 0.95), 0.08, 0.0),
    'diamond': ((0.85, 0.97, 1.0), 0.05, 0.4),
    'spin-blur': ((0.55, 0.95, 0.90), 0.2, 0.9),
    'spin-core': ((0.80, 1.0, 0.95), 0.2, 1.2),
})

# The tier-1 head cone the parts layer onto, measured from the staged `t1-drill-head`'s vertex
# rings in the look frame (slot at the origin): three steps, each a frustum from (x, radius) to
# (x, radius). The hot seam band at x -0.053..-0.043 stands out to 0.0825 between the first two.
CONE_STEPS = (((-0.132, 0.1000), (-0.045, 0.0765)),
              ((-0.045, 0.0706), (0.041, 0.0471)),
              ((0.041, 0.0410), (0.128, 0.0176)))
# How far under the cone's own radius a part's rim stays, so its silhouette is the cone's.
CLEAR_M = 0.0015
# The head's axis is at y -0.1 (author_casing_driller.head_part). A part round the bit stands
# with its axis 40 mm nearer the camera, so its whole camera-side face is in front of the cone's
# (for a rim 1.5 mm under the cone's radius the cone's face is at most 24 mm proud of its axis),
# as the game draws the look sprite over the head sprite (draw order 9 over 8).
AXIS_Y = -0.14
# The crown's centre along the bit and the depth a part proud of its face stands at.
CROWN_X = base.CROWN_AT[0]
FACE_Y = base.CROWN_FACE_Y - 0.006
FACE_PROUD_Y = FACE_Y - 0.006
FACE_DEPTH = 0.005

# The carbide collar over the cone's second step, from 26 mm behind the slot to the step's end,
# where a brass bead hides the seam; the steel ferrule and the reamer ring on the first step, the
# ferrule ahead of the hot seam band and the ring just ahead of the gimbal, a bare brass band of
# the cone and the seam left between the ferrule and the collar.
COLLAR_X = (-0.026, 0.040)
COLLAR_BEAD = (0.044, 0.037, 0.003)
FERRULE_X = (-0.092, -0.056)
FERRULE_BANDS_X = ((-0.090, 0.003), (-0.058, 0.003))
REAMER_X = (-0.128, -0.098)
REAMER_RIM_X = (-0.100, 0.0035)
REAMER_TEETH_X = -0.106
REAMER_TEETH_Z = (-0.070, -0.045, -0.020, 0.020, 0.045, 0.070)
REAMER_TOOTH_SIZE = (0.010, 0.008, 0.009)
# The knurl bands round the collar and the ferrule, and the studs on the collar's camera side.
KNURL_BANDS_X = (('bright-steel', -0.012, 0.0035), ('bright-steel', 0.020, 0.0035), ('dark-iron', -0.074, 0.003))
KNURL_STUDS = ((-0.004, (-0.033, -0.015, 0.0, 0.015, 0.033)), (0.028, (-0.026, -0.013, 0.0, 0.013, 0.026)))
KNURL_STUD_RADIUS = 0.005
# The chrome face ring inside the wheel's disc (radius 0.0396), over the #578 teal ring, and chrome
# collars on the sheath (under the cone's last step) and on the bridge (inside the disc's chord).
CHROME_RING = (0.0275, 0.004)
CHROME_COLLARS = ((0.060, 0.032, 0.0025), (0.100, 0.020, 0.003))
# The brass bosses on the reamer ring's and the ferrule's camera sides.
REAMER_BOSSES = (-0.120, (0.0, -0.030, 0.030, -0.058, 0.058), 0.0075)
FERRULE_BOSSES = (-0.070, (-0.020, 0.020, -0.045, 0.045), 0.006)
# The coolant ring in the gap between the ferrule and the reamer ring, two copper lines along the
# camera side at z +-0.02 (on the ferrule, over the bare brass band at the cone's own face, on
# the collar), and the fitting on the ferrule they run from.
COOLANT_RING_X = (-0.095, 0.0035)
COOLANT_Z = 0.020
COOLANT_PIPE = (0.007, 0.008)
COOLANT_FITTING = (-0.070, (0.014, 0.010, 0.012))
# The diamond inlays on the chrome ring where the rig's teeth stand, the spin streaks between
# them, and the fan blades over the annulus between the teeth.
INLAY_SIZE = (0.007, FACE_DEPTH, 0.0065)
STREAK_SIZE = (0.011, FACE_DEPTH, 0.005)
FAN_RADIUS = 0.030
FAN_BLADE_SIZE = (0.005, FACE_DEPTH, 0.014)
# The spin halos: face-on rings inside the disc, the outer one at the fins' roots and the inner
# one round the hot core.
SPIN_HALO = (0.035, 0.003)
INNER_HALO = (0.0205, 0.0025)
# The blur collars on the ferrule's and the collar's front edges, and the aether vortex's glow
# collars along the whole bit: reamer ring, ferrule, sheath, bridge.
BLUR_COLLARS_X = ((-0.057, 0.003), (0.0395, 0.003))
VORTEX_COLLARS = ((-0.113, None, 0.003), (-0.080, None, 0.003), (0.075, 0.028, 0.0025), (0.106, 0.019, 0.003))
# The vortex core over the hot core, and its chrome hub.
VORTEX_CORE = (0.0165, 0.006)
VORTEX_HUB = 0.005
# The platform's 15 mm bevel would round a 3 cm band away; vehicle-scale parts take 4 mm.
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
    pieces = step_pieces(look['part']) + base.shaft_pieces()
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def step_pieces(part_id):
    """The aether-cut crown with every LK6 part up to and including this step's fitted."""
    pieces = base.aether_cut_crown_pieces()
    for step_part, fitted_pieces in STEPS:
        pieces += fitted_pieces()
        if step_part == part_id:
            return pieces
    raise SystemExit('no LK6 step named "%s"' % part_id)


def check_steps_match_table(table, built):
    names = [part.name for part in built]
    wanted = [look['part'] for look in table['looks'] if look['part'] in STEP_PARTS]
    if names != wanted or sorted(names) != sorted(STEP_PARTS):
        raise SystemExit('LK6 parts %s do not match the table %s' % (names, wanted))
    for part in built:
        if not base.is_origin_inside(part):
            raise SystemExit('part "%s" has its origin outside its bounds' % part.name)
        if abs(front_edge_of(part) - front_edge_of(bpy.data.objects['aether-cut-crown'])) > 1e-4:
            raise SystemExit('part "%s" moves the drill tip' % part.name)


def front_edge_of(part):
    (_, _), (max_x, _) = driller.view_bounds_of(part)
    return max_x


# --- the bit-finish steps (360 to 780) -----------------------------------------------------------


def carbide_collar_pieces():
    """A dark-iron carbide collar over the cone's second step, a brass bead on the seam ahead."""
    return [frustum('dark-iron', COLLAR_X), collar('brass', COLLAR_BEAD)]


def steel_ferrule_pieces():
    """A bright steel ferrule on the first step, dark iron rim bands at both ends."""
    return [frustum('bright-steel', FERRULE_X)] + [band('dark-iron', x, minor) for x, minor in FERRULE_BANDS_X]


def knurled_band_pieces():
    """Bright knurl bands and studs across the dark collar, a dark band across the bright ferrule."""
    pieces = [band(material, x, minor) for material, x, minor in KNURL_BANDS_X]
    for x, zs in KNURL_STUDS:
        pieces += [stud('bright-steel', KNURL_STUD_RADIUS, x, part_radius_at(x), z) for z in zs]
    return pieces


def reamer_ring_pieces():
    """A dark-iron reamer ring ahead of the gimbal, a brass rim, six steel teeth on its camera side."""
    pieces = [frustum('dark-iron', REAMER_X), band('brass', *REAMER_RIM_X)]
    radius = part_radius_at(REAMER_TEETH_X)
    for z in REAMER_TEETH_Z:
        pieces.append(box('steel', REAMER_TOOTH_SIZE, (REAMER_TEETH_X, surface_y(radius, z) - 0.002, z)))
    return pieces


def chrome_face_pieces():
    """A polished-chrome ring on the wheel's face, chrome collars on the bridge and the sheath."""
    major, minor = CHROME_RING
    pieces = [driller.ring('polished-chrome', major, minor, (CROWN_X, FACE_Y, 0.0))]
    return pieces + [collar('polished-chrome', each) for each in CHROME_COLLARS]


def brass_boss_pieces():
    """Brass bosses on the reamer ring's and the ferrule's camera sides."""
    pieces = []
    for x, zs, radius in (REAMER_BOSSES, FERRULE_BOSSES):
        pieces += [stud('brass', radius, x, part_radius_at(x), z) for z in zs]
    return pieces


def coolant_line_pieces():
    """A copper coolant ring behind the ferrule and two copper lines along the bit from a fitting."""
    pieces = [band('copper', *COOLANT_RING_X)]
    for sign in (-1.0, 1.0):
        pieces += coolant_run_pieces(sign * COOLANT_Z)
    x, size = COOLANT_FITTING
    pieces.append(box('copper', size, (x, surface_y(part_radius_at(x), 0.0) - 0.004, 0.0)))
    return pieces


def coolant_run_pieces(z):
    """One copper line as a bar per stretch of the bit, each lying on that stretch's camera-side
    face: the ferrule's, the cone's own over the bare brass band, the collar's."""
    thickness, depth = COOLANT_PIPE
    runs = ((FERRULE_X[0] + 0.002, FERRULE_X[1], surface_y(part_radius_at(-0.07), z)),
            (FERRULE_X[1], COLLAR_X[0], cone_surface_y(cone_radius_at(-0.04), z)),
            (COLLAR_X[0], COLLAR_X[1] - 0.002, surface_y(part_radius_at(0.0), z)))
    pieces = []
    for start_x, end_x, y in runs:
        pieces.append(driller.segment('copper', (start_x, z), (end_x, z), thickness, depth, y - 0.001))
        pieces.append(sphere('copper', thickness * 0.6, (start_x, y - 0.001, z)))
    return pieces


def diamond_inlay_pieces():
    """Eight diamond inlays set in the chrome ring where the rig's teeth stand."""
    major, _ = CHROME_RING
    return [face_box('diamond', INLAY_SIZE, angle, major) for angle, _, _ in driller.around(8, major)]


# --- the spin-blur steps (840 to 1200) -----------------------------------------------------------


def spin_halo_pieces():
    """A glowing halo round the wheel's face, inside the disc at the fins' roots."""
    major, minor = SPIN_HALO
    return [driller.ring('spin-blur', major, minor, (CROWN_X, FACE_Y, 0.0))]


def blur_collar_pieces():
    """Glowing blur collars on the ferrule's and the collar's front edges."""
    return [band('spin-blur', x, minor) for x, minor in BLUR_COLLARS_X]


def spin_streak_pieces():
    """Eight glowing streaks along the chrome ring between the inlays."""
    major, _ = CHROME_RING
    return [face_box('spin-blur', STREAK_SIZE, angle, major)
            for angle, _, _ in driller.around(8, major, phase=math.pi / 8)]


def double_halo_pieces():
    """A second, inner halo round the hot core."""
    major, minor = INNER_HALO
    return [driller.ring('spin-blur', major, minor, (CROWN_X, FACE_Y, 0.0))]


def blur_fan_pieces():
    """Eight glowing fan blades radiating between the teeth, proud of the streaks and the halo."""
    return [face_box('spin-blur', FAN_BLADE_SIZE, angle, FAN_RADIUS, y=FACE_PROUD_Y)
            for angle, _, _ in driller.around(8, FAN_RADIUS, phase=math.pi / 8)]


def vortex_core_pieces():
    """A bright vortex core over the hot core, a chrome hub at its centre."""
    radius, thickness = VORTEX_CORE
    return [
        driller.disc('spin-core', radius, thickness, (CROWN_X, FACE_PROUD_Y, 0.0)),
        sphere('polished-chrome', VORTEX_HUB, (CROWN_X, FACE_PROUD_Y - 0.004, 0.0), flatten=0.6),
    ]


def aether_vortex_pieces():
    """Glow collars along the whole bit: on the reamer ring, the ferrule, the sheath and the bridge."""
    return [collar('spin-blur', (x, major, minor)) if major is not None else band('spin-blur', x, minor)
            for x, major, minor in VORTEX_COLLARS]


# --- shapes on the bit ---------------------------------------------------------------------------


def frustum(material, xs):
    """A frustum along +X on the bit's axis from `xs[0]` to `xs[1]`, its rim under the cone's."""
    back_x, front_x = xs
    length = front_x - back_x
    return driller.cone_x(material, part_radius_at(back_x), part_radius_at(front_x), length,
                          (back_x + length / 2, AXIS_Y, 0.0))


def cone_radius_at(x):
    """The tier-1 head cone's radius at look x, from its measured rings."""
    for (back_x, back_radius), (front_x, front_radius) in CONE_STEPS:
        if back_x <= x <= front_x:
            share = (x - back_x) / (front_x - back_x)
            return back_radius + (front_radius - back_radius) * share
    raise SystemExit('look x %.3f is off the head cone' % x)


def part_radius_at(x):
    """A part's rim at look x: under the cone's radius there, so the silhouette stays the cone's."""
    return cone_radius_at(x) - CLEAR_M


def cone_surface_y(radius, z):
    """The depth of the head cone's own camera-side face at height `z`, its axis at y -0.1."""
    return -0.1 - math.sqrt(max(radius * radius - z * z, 0.0))


def band(material, x, minor):
    """An edge-on ring round the bit at `x`, its outer edge under the cone's radius there."""
    return collar(material, (x, part_radius_at(x) - minor, minor))


def collar(material, at):
    """An edge-on ring round the bit (author_drill_tip_looks.collar) at `at` (x, major, minor)."""
    x, major, minor = at
    return base.collar(material, major, minor, (x, AXIS_Y, 0.0))


def surface_y(radius, z):
    """The depth of the bit's camera-side surface at height `z` off its axis, for a radius."""
    return AXIS_Y - math.sqrt(max(radius * radius - z * z, 0.0))


def stud(material, radius, x, surface_radius, z):
    """A domed stud on the bit's camera side, a millimetre into the surface so it sits on it."""
    return sphere(material, radius, (x, surface_y(surface_radius, z) + 0.001, z), flatten=0.6)


def face_box(material, size, angle, radius, y=FACE_Y):
    """A box on the crown's face along the circle of `radius`, in the crown's frame."""
    piece = driller.tangent_box(material, size, angle, radius, y)
    piece.location.x += CROWN_X
    return piece


STEPS = (
    ('collared-crown', carbide_collar_pieces),
    ('ferruled-crown', steel_ferrule_pieces),
    ('knurled-crown', knurled_band_pieces),
    ('reamed-crown', reamer_ring_pieces),
    ('chromed-crown', chrome_face_pieces),
    ('bossed-crown', brass_boss_pieces),
    ('cooled-crown', coolant_line_pieces),
    ('inlaid-crown', diamond_inlay_pieces),
    ('haloed-crown', spin_halo_pieces),
    ('blur-collar-crown', blur_collar_pieces),
    ('streaked-crown', spin_streak_pieces),
    ('double-halo-crown', double_halo_pieces),
    ('fanned-crown', blur_fan_pieces),
    ('vortex-crown', vortex_core_pieces),
    ('aether-vortex-crown', aether_vortex_pieces),
)
STEP_PARTS = tuple(part for part, _ in STEPS)


if __name__ == '__main__':
    main()
