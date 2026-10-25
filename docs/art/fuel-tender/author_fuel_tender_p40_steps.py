"""
Authors the coal tender's LK11 look steps (ticket 874, wave 647-7Z of the P1-P5 map #647) into the
existing source, art/blender/vehicle-fuel-tank/vehicle-fuel-tank.blend: the GD lock of 25 Oct 06:48
(the LK6/LK7 pattern) wants the LK1 input reused, parts added in sockets, a fixed footprint and
silhouette or part changes only, never a recolour; Systems' sizing row of 06:53 wants at least 13
steps on the line. The tender is exempt from the decade rule and keeps one step per purchase (LK1,
#809), so the #758 wagons and the LK5 parts (#813) stay the first steps at tank levels 1 to 8, and
each step here is the sight-glass tender with one more fitting, one level a purchase, 9 to 18.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/author_fuel_tender_p40_steps.py

It opens the .blend (the source since #758), removes any earlier copy of these ten parts and
rebuilds them from src/data/vehicle/fuelTender.json's steps, so a re-run rewrites the same objects;
the seven wagons of #758 and LK5 are left as they are. Conventions are author_fuel_tender.py's:
the hitch at the origin, 1 unit = 1 m, game right is +X, up is +Z, details stand out towards -Y,
draw order `z` 0, the vehicle-scale 4 mm bevel. The wagon still ships no emissive map (the aether
glass is a bright teal material, not a glow), so the drill nose stays the brightest part by
construction and the tail's tint above the top step stays the kernel vehicle look's.

Why every part sits where it does: the wagon is the socket, and LK5 filled the room over the body
and under the frame, so these fittings go on the faces the camera sees: the two bunkers' enamel
faces, the middle post, the frame's face, the wheels, the second tank's end and the hopper's and
belly tank's fronts. The footprint the game lays out (the union of the #758 wagons' boxes, x
-0.572..0.029, z -0.179..0.31 in the asset frame) may not grow, and the one place the rig reaches
the wagon is its casing arms, which hang over the wagon's stern end from asset x -0.22 and z 0.118
up (docs/art/fuel-tender/README.md "Where the parts sit"): a wagon part there hides behind the rig
(the wagon draws at `z` 0), so no new piece reaches into that shadow. Each is sized to move a 360
px phone's pixels at the closest zoom (#157: one visible step is at least 16 changed pixels at 45
px/m, where a pixel is 22 mm): bright steel over green enamel, black and brass over enamel, copper
over the iron frame, a pale dial over copper, teal glass over enamel and steel.

| Part                 | Step (tank level) | Adds                                                                   |
| -------------------- | ----------------- | ---------------------------------------------------------------------- |
| `tooled-tender`      | 9                 | a stoker's shovel hung on a hook and a pick leaning on the right       |
|                      |                   | bunker's face, bright steel on timber hafts                            |
| `plated-tender`      | 10                | a black-enamel works plate in a brass rim across the middle post       |
| `lamped-tender`      | 11                | a dark-iron head lamp with an amber lens on the left bunker's face     |
| `piped-tender`       | 12                | a copper feed pipe along the frame with brass unions and an injector   |
| `gauged-tender`      | 13                | a brass-rimmed water gauge with a pale dial on the second tank's face  |
| `sprung-tender`      | 14                | a bright steel leaf spring pack over each wheel                        |
| `guarded-tender`     | 15                | a bright steel mudguard arc on iron stays over each wheel              |
| `screened-tender`    | 16                | a bright steel slotted coal screen bolted over the hopper's mouth      |
| `aether-tank-tender` | 17                | a teal-glass aether tank in brass caps and straps on the left bunker   |
| `aether-coil-tender` | 18                | four teal-glass coils round the belly tank and a feed line to the tank |
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
import author_fuel_tender as base  # noqa: E402
import author_fuel_tender_steps as lk5  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, sphere  # noqa: E402

BLEND_PATH = lk5.BLEND_PATH

# Base colour, roughness, emission strength (author_platform's PALETTE shape). No emission.
kit.PALETTE.update({
    'bright-steel': ((0.70, 0.72, 0.76), 0.3, 0.0),
    'dial-face': ((0.86, 0.82, 0.68), 0.5, 0.0),
})

BODY_TOP_Z = lk5.BODY_TOP_Z
BODY_MID_X = lk5.BODY_MID_X
BUNKER_DX = lk5.BUNKER_DX
LEFT_BUNKER_X = BODY_MID_X - BUNKER_DX
RIGHT_BUNKER_X = BODY_MID_X + BUNKER_DX
# The body's face the camera sees, and the depth at which fittings stand clear of the filigree.
FACE_Y = base.BODY_Y - base.BODY_DEPTH / 2
FITTING_Y = FACE_Y - 0.03
# The rig's casing arms hang over the wagon's stern end from this x and z up (asset frame, from the
# outline check's rig silhouette at tiers 1 and 3, with 5 mm to spare): no new piece reaches in.
ARM_SHADOW_X = -0.225
ARM_SHADOW_Z = 0.113
# The stoker's tools, on the right bunker's face left of the arms' shadow: the shovel hangs from a
# hook under the top band, the pick leans head-up on the lower right, under the shadow.
SHOVEL_X = -0.25
SHOVEL_BLADE = (0.075, 0.012, 0.09)
SHOVEL_BLADE_Z = 0.045
SHOVEL_HAFT_R = 0.008
SHOVEL_HAFT_Z = (0.08, 0.16)
SHOVEL_HANDLE = (0.012, 0.004)
SHOVEL_HANDLE_Z = 0.168
HOOK = (0.016, 0.012, 0.012)
HOOK_Z = 0.183
PICK_HEAD = ((-0.205, 0.088), (-0.105, 0.098))
PICK_HEAD_THICKNESS = 0.02
PICK_HAFT = ((-0.155, 0.093), (-0.175, -0.02))
PICK_HAFT_THICKNESS = 0.014
# The works plate across the middle post, under the top band and between the two rings.
PLATE_X = BODY_MID_X + 0.005
PLATE_Z = 0.15
PLATE_RIM = (0.14, 0.01, 0.06)
PLATE_FIELD = (0.13, 0.01, 0.05)
PLATE_RIVET_DX = 0.06
PLATE_RIVET_DZ = 0.02
PLATE_CREST_R = 0.012
PLATE_LETTER = (0.04, 0.006, 0.008)
PLATE_LETTER_DX = 0.038
# The head lamp on the left bunker's upper face, under the lantern post, its chimney left of the hopper.
LAMP_X = -0.51
LAMP_Z = 0.145
LAMP_HOUSING = (0.085, 0.05, 0.09)
LAMP_LENS_R = 0.032
LAMP_RIM_MINOR = 0.004
LAMP_CHIMNEY_R = 0.008
LAMP_CHIMNEY_Z = (0.18, 0.2)
# The feed pipe along the frame's face from the left wheel to the stern end, with a brass injector
# over the belly tank and an elbow down to it.
PIPE_R = 0.017
PIPE_X = (-0.39, -0.12)
PIPE_Z = base.FRAME_Z - 0.002
PIPE_Y = -0.06
UNION_R = 0.022
UNION_LENGTH = 0.018
UNION_XS = (-0.37, -0.14)
INJECTOR = (0.07, 0.03, 0.05)
INJECTOR_X = -0.30
INJECTOR_WHEEL_R = 0.016
ELBOW_R = 0.012
# The water gauge on the second tank's face, over its middle band.
GAUGE_X = lk5.SECOND_TANK_X
GAUGE_Z = lk5.SECOND_TANK_Z
GAUGE_Y = base.BODY_Y - lk5.SECOND_TANK_RADIUS - 0.004
GAUGE_RIM_R = 0.054
GAUGE_FACE_R = 0.046
GAUGE_NEEDLE_END = (-0.028, 0.03)
GAUGE_NEEDLE_THICKNESS = 0.006
GAUGE_HUB_R = 0.006
GAUGE_MARK = (0.004, 0.006, 0.012)
GAUGE_MARK_R = 0.038
GAUGE_MARK_ANGLES = (math.radians(135), math.radians(90), math.radians(45))
# The leaf springs over each wheel's upper face: four leaves shortening downwards, a clamp, two eyes.
SPRING_Y = -0.062
SPRING_TOP_Z = -0.082
SPRING_LEAF_WIDTHS = (0.11, 0.09, 0.07, 0.05)
SPRING_LEAF = (0.016, 0.011)
SPRING_LEAF_PITCH = 0.012
SPRING_CLAMP = (0.024, 0.02, 0.046)
SPRING_EYE = (0.008, 0.004)
SPRING_EYE_DX = 0.055
# The mudguard arc over each wheel: eight bright steel boxes on the tangent, on two iron stays
# (brass read as the foot band's own at phone size; steel over the dark wheel and the band does not).
GUARD_Y = -0.05
GUARD_R = 0.084
GUARD_BOX = (0.04, 0.016, 0.03)
GUARD_ANGLES = tuple(math.radians(20 + 20 * index) for index in range(8))
GUARD_STAY = (0.01, 0.012, 0.03)
GUARD_STAY_DX = 0.06
GUARD_STAY_Z = -0.065
# The coal screen bolted over the hopper's mouth: a bright steel plate with three dark slots.
SCREEN_X = lk5.HOPPER_X
SCREEN_Z = 0.245
SCREEN_Y = -0.15
SCREEN_PLATE = (0.11, 0.008, 0.085)
SCREEN_SLOT = (0.08, 0.006, 0.012)
SCREEN_SLOT_DZS = (-0.02, 0.0, 0.02)
SCREEN_RIVET_DX = 0.047
SCREEN_RIVET_DZ = 0.035
# The aether tank on the left bunker's lower face, over the foot band, in brass caps and straps.
AETHER_TANK_X = LEFT_BUNKER_X
AETHER_TANK_Z = 0.0
AETHER_TANK_Y = FACE_Y - 0.03
AETHER_TANK_R = 0.03
AETHER_TANK_LENGTH = 0.14
AETHER_CAP_R = 0.034
AETHER_CAP_LENGTH = 0.016
AETHER_CAP_DX = 0.064
AETHER_STRAP = (0.012, 0.03, 0.07)
AETHER_STRAP_DX = 0.03
AETHER_BOSS_R = 0.01
# The aether coils: four teal sleeves round the belly tank either side of its sight glass, and a
# feed line from the aether tank's stern cap down to the belly tank.
COIL_R = 0.048
COIL_LENGTH = 0.018
COIL_DXS = (-0.048, -0.022, 0.022, 0.048)
COIL_Y = lk5.BELLY_TANK_Y
FEED_LINE_R = 0.009
FEED_LINE_X = -0.385
FEED_LINE_Y = -0.072
# The vehicle-scale 4 mm bevel of the first seven wagons.
BEVEL_M = base.BEVEL_M
TOLERANCE_M = 1e-6


def main():
    table = base.read_table()
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    footprint = footprint_of_earlier_wagons(table)
    remove_earlier_copies()
    built = [author_step(step, int(table['z'])) for step in table['steps'] if step['part'] in PIECES]
    check_steps_match_table(table, built, footprint)
    bpy.ops.wm.save_mainfile(filepath=BLEND_PATH, compress=True)
    print('authored ' + ', '.join(part.name for part in built))


def footprint_of_earlier_wagons(table):
    """The union box of the #758 wagons as the file holds them: the socket the new parts fill."""
    wagons = [bpy.data.objects[step['part']] for step in table['steps']
              if step['part'] not in PIECES and step['part'] not in lk5.PIECES and step['part'] in bpy.data.objects]
    bounds = [driller.view_bounds_of(wagon) for wagon in wagons]
    return ((min(low[0] for low, _ in bounds), min(low[1] for low, _ in bounds)),
            (max(high[0] for _, high in bounds), max(high[1] for _, high in bounds)))


def remove_earlier_copies():
    for part_id in PIECES:
        earlier = bpy.data.objects.get(part_id)
        if earlier is not None:
            bpy.data.objects.remove(earlier)
    for mesh in [mesh for mesh in bpy.data.meshes if mesh.users == 0]:
        bpy.data.meshes.remove(mesh)


def author_step(step, z_order):
    fitted = FITTINGS[step['part']]()
    check_clear_of_arms(step['part'], fitted)
    pieces = base.undercarriage_pieces() + PIECES[step['part']]() + fitted
    part = build_part(step['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def check_clear_of_arms(part_id, pieces):
    """No new piece reaches into the rig's casing arms' shadow, where the wagon would hide."""
    for piece in pieces:
        (_, _), (max_x, max_z) = driller.view_bounds_of(piece)
        if max_x > ARM_SHADOW_X and max_z > ARM_SHADOW_Z:
            raise SystemExit('%s: a piece reaches into the casing arms\' shadow at x %.3f, z %.3f'
                             % (part_id, max_x, max_z))


def check_steps_match_table(table, built, footprint):
    names = sorted(part.name for part in built)
    wanted = sorted(step['part'] for step in table['steps'] if step['part'] in PIECES)
    if names != wanted or len(names) != len(PIECES):
        raise SystemExit('LK11 parts %s do not match the table %s' % (names, wanted))
    for part in built:
        (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(part)
        if not (min_x <= 0.0 <= max_x and min_z <= 0.0 <= max_z):
            raise SystemExit('%s: the hitch (origin) lies outside "%s"' % (table['assetId'], part.name))
        if min_z < base.GROUND_Z - TOLERANCE_M:
            raise SystemExit('%s: "%s" reaches below the ground line' % (table['assetId'], part.name))
        if not lk5.is_inside(((min_x, min_z), (max_x, max_z)), footprint):
            raise SystemExit('%s: "%s" grows the wagon footprint %s past %s'
                             % (table['assetId'], part.name, ((min_x, min_z), (max_x, max_z)), footprint))


# --- the steps, each the one before with its fitting ------------------------------------------------


def body_pieces_before(part_id):
    """The wagon the step builds on: the sight-glass tender, then each LK11 step in turn."""
    order = list(PIECES)
    at = order.index(part_id)
    pieces = lk5.glass_tank_tender_pieces()
    for earlier in order[:at]:
        pieces += FITTINGS[earlier]()
    return pieces


# --- the fittings -----------------------------------------------------------------------------------


def tools_pieces():
    """A stoker's shovel hung blade-down from an iron hook, and a pick leaning head-up beside it."""
    pieces = [
        box('dark-iron', HOOK, (SHOVEL_X, FACE_Y - 0.025, HOOK_Z)),
        kit.torus('brass', SHOVEL_HANDLE[0], SHOVEL_HANDLE[1], (SHOVEL_X, FITTING_Y, SHOVEL_HANDLE_Z)),
        cylinder('timber', SHOVEL_HAFT_R, SHOVEL_HAFT_Z[1] - SHOVEL_HAFT_Z[0],
                 (SHOVEL_X, FITTING_Y, sum(SHOVEL_HAFT_Z) / 2), 'Z'),
        box('bright-steel', SHOVEL_BLADE, (SHOVEL_X, FITTING_Y, SHOVEL_BLADE_Z)),
        box('dark-iron', (0.03, 0.014, 0.02), (SHOVEL_X, FITTING_Y - 0.002, SHOVEL_BLADE_Z + SHOVEL_BLADE[2] / 2 + 0.005)),
        driller.segment('timber', PICK_HAFT[0], PICK_HAFT[1], PICK_HAFT_THICKNESS, 0.014, FITTING_Y),
        driller.segment('bright-steel', PICK_HEAD[0], PICK_HEAD[1], PICK_HEAD_THICKNESS, 0.016, FITTING_Y - 0.004),
    ]
    return pieces


def works_plate_pieces():
    """A black-enamel works plate in a brass rim with corner rivets, a crest boss and two name bars."""
    pieces = [
        box('brass', PLATE_RIM, (PLATE_X, FACE_Y - 0.023, PLATE_Z)),
        box('enamel', PLATE_FIELD, (PLATE_X, FACE_Y - 0.029, PLATE_Z)),
        sphere('brass', PLATE_CREST_R, (PLATE_X, FACE_Y - 0.033, PLATE_Z), flatten=0.6),
    ]
    for dx in (-PLATE_RIVET_DX, PLATE_RIVET_DX):
        for dz in (-PLATE_RIVET_DZ, PLATE_RIVET_DZ):
            pieces.append(driller.rivet(PLATE_X + dx, FACE_Y - 0.03, PLATE_Z + dz, radius=base.RIVET_R))
        pieces.append(box('brass', PLATE_LETTER, (PLATE_X + dx * PLATE_LETTER_DX / PLATE_RIVET_DX, FACE_Y - 0.034, PLATE_Z)))
    return pieces


def head_lamp_pieces():
    """A dark-iron head lamp with an amber lens in a brass rim and a short chimney, under the lantern."""
    housing_y = FACE_Y - LAMP_HOUSING[1] / 2
    lens_y = FACE_Y - LAMP_HOUSING[1] - 0.002
    return [
        box('dark-iron', LAMP_HOUSING, (LAMP_X, housing_y, LAMP_Z)),
        driller.disc('amber-glass', LAMP_LENS_R, 0.01, (LAMP_X, lens_y, LAMP_Z)),
        kit.torus('brass', LAMP_LENS_R + 0.002, LAMP_RIM_MINOR, (LAMP_X, lens_y, LAMP_Z)),
        cylinder('brass', LAMP_CHIMNEY_R, LAMP_CHIMNEY_Z[1] - LAMP_CHIMNEY_Z[0],
                 (LAMP_X, housing_y, sum(LAMP_CHIMNEY_Z) / 2), 'Z'),
    ]


def feed_pipe_pieces():
    """A copper feed pipe along the frame's face, brass unions, a brass injector and an elbow down
    to the belly tank."""
    pieces = [cylinder('copper', PIPE_R, PIPE_X[1] - PIPE_X[0], (sum(PIPE_X) / 2, PIPE_Y, PIPE_Z), 'X')]
    for x in UNION_XS:
        pieces.append(cylinder('brass', UNION_R, UNION_LENGTH, (x, PIPE_Y, PIPE_Z), 'X'))
    pieces.append(box('brass', INJECTOR, (INJECTOR_X, PIPE_Y - 0.002, PIPE_Z)))
    pieces.append(driller.disc('bright-steel', INJECTOR_WHEEL_R, 0.008, (INJECTOR_X, PIPE_Y - INJECTOR[1] / 2 - 0.004, PIPE_Z)))
    elbow_top = PIPE_Z - INJECTOR[2] / 2
    elbow_bottom = lk5.BELLY_TANK_Z + lk5.BELLY_TANK_RADIUS - 0.004
    pieces.append(cylinder('copper', ELBOW_R, elbow_top - elbow_bottom, (INJECTOR_X, PIPE_Y, (elbow_top + elbow_bottom) / 2), 'Z'))
    return pieces


def water_gauge_pieces():
    """A brass-rimmed water gauge on the second tank's face: a pale dial, three marks, a dark needle."""
    pieces = [
        driller.disc('brass', GAUGE_RIM_R, 0.012, (GAUGE_X, GAUGE_Y - 0.006, GAUGE_Z)),
        driller.disc('dial-face', GAUGE_FACE_R, 0.008, (GAUGE_X, GAUGE_Y - 0.014, GAUGE_Z)),
        driller.segment('enamel', (GAUGE_X, GAUGE_Z), (GAUGE_X + GAUGE_NEEDLE_END[0], GAUGE_Z + GAUGE_NEEDLE_END[1]),
                        GAUGE_NEEDLE_THICKNESS, 0.006, GAUGE_Y - 0.021),
        sphere('brass', GAUGE_HUB_R, (GAUGE_X, GAUGE_Y - 0.022, GAUGE_Z), flatten=0.6),
    ]
    for angle in GAUGE_MARK_ANGLES:
        mark = driller.tangent_box('enamel', GAUGE_MARK, angle, GAUGE_MARK_R, GAUGE_Y - 0.02)
        mark.location.x += GAUGE_X
        mark.location.z += GAUGE_Z
        pieces.append(mark)
    return pieces


def leaf_spring_pieces():
    """A bright steel leaf spring pack over each wheel: four leaves, an iron clamp and brass eyes."""
    pieces = []
    for hub_x in base.WHEEL_XS:
        for index, width in enumerate(SPRING_LEAF_WIDTHS):
            z = SPRING_TOP_Z - index * SPRING_LEAF_PITCH
            pieces.append(box('bright-steel', (width, SPRING_LEAF[0], SPRING_LEAF[1]), (hub_x, SPRING_Y, z)))
        clamp_z = SPRING_TOP_Z - (len(SPRING_LEAF_WIDTHS) - 1) * SPRING_LEAF_PITCH / 2
        pieces.append(box('dark-iron', SPRING_CLAMP, (hub_x, SPRING_Y - 0.003, clamp_z)))
        for dx in (-SPRING_EYE_DX, SPRING_EYE_DX):
            pieces.append(kit.torus('brass', SPRING_EYE[0], SPRING_EYE[1], (hub_x + dx, SPRING_Y - 0.004, SPRING_TOP_Z)))
    return pieces


def wheel_guard_pieces():
    """A bright steel mudguard arc over each wheel on two iron stays."""
    pieces = []
    for hub_x in base.WHEEL_XS:
        for angle in GUARD_ANGLES:
            arc = driller.tangent_box('bright-steel', GUARD_BOX, angle, GUARD_R, GUARD_Y)
            arc.location.x += hub_x
            arc.location.z += base.WHEEL_Z
            pieces.append(arc)
        for dx in (-GUARD_STAY_DX, GUARD_STAY_DX):
            pieces.append(box('dark-iron', GUARD_STAY, (hub_x + dx, GUARD_Y + 0.004, GUARD_STAY_Z)))
    return pieces


def coal_screen_pieces():
    """A bright steel slotted screen bolted over the hopper's mouth."""
    pieces = [box('bright-steel', SCREEN_PLATE, (SCREEN_X, SCREEN_Y, SCREEN_Z))]
    for dz in SCREEN_SLOT_DZS:
        pieces.append(box('enamel', SCREEN_SLOT, (SCREEN_X, SCREEN_Y - 0.005, SCREEN_Z + dz)))
    for dx in (-SCREEN_RIVET_DX, SCREEN_RIVET_DX):
        for dz in (-SCREEN_RIVET_DZ, SCREEN_RIVET_DZ):
            pieces.append(driller.rivet(SCREEN_X + dx, SCREEN_Y - 0.006, SCREEN_Z + dz, radius=base.RIVET_R))
    return pieces


def aether_tank_pieces():
    """A teal-glass aether tank lying over the left bunker's foot band, brass caps, straps and a boss."""
    centre = (AETHER_TANK_X, AETHER_TANK_Y, AETHER_TANK_Z)
    pieces = [cylinder('teal-glass', AETHER_TANK_R, AETHER_TANK_LENGTH, centre, 'X')]
    for dx in (-AETHER_CAP_DX, AETHER_CAP_DX):
        pieces.append(cylinder('brass', AETHER_CAP_R, AETHER_CAP_LENGTH, (AETHER_TANK_X + dx, AETHER_TANK_Y, AETHER_TANK_Z), 'X'))
    for dx in (-AETHER_STRAP_DX, AETHER_STRAP_DX):
        pieces.append(box('brass', AETHER_STRAP, (AETHER_TANK_X + dx, AETHER_TANK_Y + 0.004, AETHER_TANK_Z)))
    pieces.append(sphere('brass', AETHER_BOSS_R, (AETHER_TANK_X, AETHER_TANK_Y, AETHER_TANK_Z + AETHER_TANK_R - 0.002), flatten=0.8))
    return pieces


def aether_coil_pieces():
    """Four teal-glass coils round the belly tank either side of its sight glass, and a teal feed
    line from the aether tank's stern cap down to it."""
    pieces = []
    for dx in COIL_DXS:
        pieces.append(cylinder('teal-glass', COIL_R, COIL_LENGTH, (lk5.BELLY_TANK_X + dx, COIL_Y, lk5.BELLY_TANK_Z), 'X'))
    line_top = AETHER_TANK_Z
    line_bottom = lk5.BELLY_TANK_Z
    pieces.append(cylinder('teal-glass', FEED_LINE_R, line_top - line_bottom, (FEED_LINE_X, FEED_LINE_Y, (line_top + line_bottom) / 2), 'Z'))
    return pieces


FITTINGS = {
    'tooled-tender': tools_pieces,
    'plated-tender': works_plate_pieces,
    'lamped-tender': head_lamp_pieces,
    'piped-tender': feed_pipe_pieces,
    'gauged-tender': water_gauge_pieces,
    'sprung-tender': leaf_spring_pieces,
    'guarded-tender': wheel_guard_pieces,
    'screened-tender': coal_screen_pieces,
    'aether-tank-tender': aether_tank_pieces,
    'aether-coil-tender': aether_coil_pieces,
}

PIECES = {part_id: (lambda part_id=part_id: body_pieces_before(part_id)) for part_id in FITTINGS}


if __name__ == '__main__':
    main()
