"""
Authors the first version of the Workshop showcase's Blender sources (#182, for the spec #180
section 7): the rig that works on the car on the Workshop's turntable, and the reaction pieces it
brings to the car, one small-step tool and one big-level-up component per upgrade row.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_workshop_showcase.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for platform-workshop-showcase and prop-workshop-reactions.
From then on those files are the sources (#52): change the art in Blender (through the MCP or by
hand) and re-export, rather than editing this script. Nothing here is rigged (#51 acceptance 2):
the arms, hoist and pieces are rigid parts the workshop build (#177) poses in code.

Conventions are author_platform.py's (#52, docs/art-pipeline.md): 1 unit = 1 m, game right +X,
up +Z, the camera looks along +Y so details stand out towards -Y.

- The rig sits in the Workshop building's frame (`platform-building-upgrade`): the origin is the
  turntable's centre, `workshop.platform`, so #177 places both assets at the rest point. An
  overhead I-beam rail hangs under the roof with the hoist that runs it (a trolley with its drum, a
  one-metre chain the code stretches to the drop, and the hook block the component hangs from), two
  brass gantry arms hang from shoulder bearings on the rail's mount pads (an upper arm from the
  shoulder, a forearm with a two-finger gripper from the elbow; both authored hanging straight
  down, their origins at the bearing the code turns them around), and a cradle lift on the
  turntable raises the car for work on its drive (its ram posts rest inside the turntable's band).
- The reaction pieces are vehicle-scale, so they bake at the vehicle's 512 px/m (#52), in the
  `prop` category. Every piece is gripped (a tool) or hoisted (a component) at its top centre and
  its origin is its bottom centre, the point that meets the car's attach point. They stand in a
  row in the file so the review sheet reads them side by side; the game never draws them there.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import author_platform as platform  # noqa: E402
from author_shop_buildings import funnel, ring  # noqa: E402

platform.PALETTE.update({
    'gunmetal': ((0.16, 0.17, 0.19), 0.45, 0.0),
    'charge-red': ((0.62, 0.11, 0.07), 0.55, 0.0),
    'bristle': ((0.28, 0.22, 0.14), 0.9, 0.0),
    'gem': ((0.25, 0.85, 0.82), 0.1, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
})

# The rig in the building's frame (metres): the rail under the roof (the eave is at 4.0), the
# shoulders on its mount pads, the hoist at the rail's centre and the lift on the turntable.
RAIL_Z = 3.3
RAIL_LENGTH = 6.4
RAIL_Y = 0.2
# The shoulders hang under the rail, close enough in for either arm to reach every part of the
# car with its tool: the far side of the chassis is 2.8 m from a shoulder.
SHOULDER_X = 1.3
SHOULDER_Z = 3.05
UPPER_ARM_LENGTH = 1.4
FOREARM_LENGTH = 1.2
HOIST_Y = 0.0
TROLLEY_DROP = 0.5
CHAIN_LENGTH = 0.8
HOOK_HEIGHT = 0.45
ARM_Y = -0.45
# The turntable's top is 0.12 above the pad; the lift's posts hide in its band at rest.
LIFT_POST_BOTTOM = -0.1
LIFT_POST_LENGTH = 0.3
# Reaction pieces stand this far apart in the file, for the review sheet.
PIECE_PITCH = 0.8
# Rivets at vehicle scale (the platform's 3 cm rivets would swamp a 15 cm tool).
SMALL_RIVET_RADIUS = 0.008

Z_RAIL, Z_HOIST, Z_HOOK, Z_UPPER_ARM, Z_FOREARM, Z_LIFT = 1, 2, 3, 3, 4, 2


def main():
    for asset_id in requested_asset_ids():
        AUTHORS[asset_id]()


def requested_asset_ids():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return requested or list(AUTHORS)


# --- the rig --------------------------------------------------------------------------------------


def author_showcase_rig():
    platform.reset_scene()
    platform.build_part('showcase-rail', rail_pieces(), at=(0.0, RAIL_Y, RAIL_Z), z_order=Z_RAIL)
    platform.build_part('showcase-trolley', trolley_pieces(), at=(0.0, HOIST_Y, RAIL_Z), z_order=Z_HOIST)
    platform.build_part('showcase-chain', chain_pieces(), at=(0.0, HOIST_Y, RAIL_Z - TROLLEY_DROP), z_order=Z_HOIST)
    platform.build_part('showcase-hook', hook_pieces(),
                        at=(0.0, HOIST_Y - 0.02, RAIL_Z - TROLLEY_DROP - CHAIN_LENGTH - HOOK_HEIGHT), z_order=Z_HOOK)
    for side, sign in (('left', -1.0), ('right', 1.0)):
        platform.build_part('showcase-arm-upper-' + side, upper_arm_pieces(sign),
                            at=(sign * SHOULDER_X, ARM_Y, SHOULDER_Z), z_order=Z_UPPER_ARM)
        platform.build_part('showcase-arm-fore-' + side, forearm_pieces(sign),
                            at=(sign * SHOULDER_X, ARM_Y - 0.05, SHOULDER_Z - UPPER_ARM_LENGTH), z_order=Z_FOREARM)
    platform.build_part('showcase-lift', lift_pieces(), at=(0.0, -0.1, LIFT_POST_BOTTOM), z_order=Z_LIFT)
    platform.save_as('platform-workshop-showcase')


def rail_pieces():
    """An I-beam under the roof on hanger brackets, with a riveted shoulder pad on its face at each arm."""
    half = RAIL_LENGTH / 2
    pieces = [
        platform.box('gunmetal', (RAIL_LENGTH, 0.2, 0.04), (0.0, 0.0, 0.12)),
        platform.box('gunmetal', (RAIL_LENGTH, 0.06, 0.2), (0.0, 0.0, 0.0)),
        platform.box('gunmetal', (RAIL_LENGTH, 0.2, 0.04), (0.0, 0.0, -0.12)),
        platform.box('brass', (0.12, 0.22, 0.06), (-half + 0.06, 0.0, 0.0)),
        platform.box('brass', (0.12, 0.22, 0.06), (half - 0.06, 0.0, 0.0)),
    ]
    for x in platform.stepped(-2.8, 2.8, 1.4):
        pieces.append(platform.box('dark-iron', (0.1, 0.12, 0.56), (x, 0.0, 0.42)))
        pieces.append(platform.box('brass', (0.3, 0.14, 0.06), (x, 0.0, 0.67)))
    for x in (-SHOULDER_X, SHOULDER_X):
        pieces.append(platform.box('dark-iron', (0.6, 0.16, 0.5), (x, -0.15, -0.08)))
        pieces.append(platform.box('brass', (0.52, 0.06, 0.42), (x, -0.25, -0.08)))
        pieces += [platform.rivet((x + dx, -0.29, z)) for dx in (-0.2, 0.2) for z in (-0.24, 0.08)]
    pieces += platform.rivet_row(-half + 0.3, half - 0.3, 0.4, y=-0.11, z=0.0)
    return pieces


def trolley_pieces():
    """The carriage riding the rail's lower flange on four flanged wheels, its drum and motor below."""
    pieces = [
        platform.box('gunmetal', (0.56, 0.3, 0.16), (0.0, 0.0, -0.24)),
        platform.box('dark-iron', (0.44, 0.34, 0.08), (0.0, 0.0, -0.36)),
        platform.cylinder('dark-iron', 0.09, 0.3, (0.0, 0.0, -0.4), 'X'),
        platform.cylinder('brass', 0.11, 0.04, (-0.17, 0.0, -0.4), 'X'),
        platform.cylinder('brass', 0.11, 0.04, (0.17, 0.0, -0.4), 'X'),
        platform.box('brass', (0.16, 0.16, 0.14), (0.3, 0.0, -0.3)),
        platform.cylinder('copper', 0.03, 0.2, (0.3, 0.0, -0.1), 'Z'),
    ]
    for x in (-0.2, 0.2):
        for y in (-0.12, 0.12):
            pieces.append(platform.cylinder('brass', 0.06, 0.04, (x, y, -0.1), 'Y'))
    pieces += platform.rivet_row(-0.2, 0.2, 0.2, y=-0.16, z=-0.24)
    return pieces


def chain_pieces():
    """One metre of alternating links from the drum; the code stretches the part to the drop."""
    pieces = []
    for link, z in enumerate(platform.stepped(-0.04, -CHAIN_LENGTH + 0.04, -0.06)):
        pieces.append(chain_link((0.0, 0.0, z), flat=link % 2 == 0))
    return pieces


def chain_link(centre, flat):
    """A link facing the camera, or edge-on as the next one is."""
    if flat:
        return platform.torus('dark-iron', 0.035, 0.009, centre)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.035, minor_radius=0.009, major_segments=24,
                                     minor_segments=8, location=centre, rotation=(0.0, 0.0, math.pi / 2))
    return platform.finish_piece('dark-iron', scale=(1.0, 1.0, 1.0), smooth=True)


def hook_pieces():
    """The hook block: a sheave in an iron housing, a shank and the brass ring the load hangs from."""
    top = HOOK_HEIGHT
    return [
        platform.box('gunmetal', (0.16, 0.1, 0.2), (0.0, 0.0, top - 0.1)),
        platform.cylinder('brass', 0.07, 0.12, (0.0, 0.0, top - 0.1), 'Y'),
        platform.cylinder('dark-iron', 0.02, 0.14, (0.0, 0.0, top - 0.1), 'Y'),
        platform.cylinder('steel', 0.025, 0.1, (0.0, 0.0, top - 0.25), 'Z'),
        platform.torus('brass', 0.1, 0.025, (0.0, 0.0, 0.12)),
        platform.rivet((-0.05, -0.06, top - 0.04)),
        platform.rivet((0.05, -0.06, top - 0.04)),
    ]


def upper_arm_pieces(sign):
    """From the shoulder bearing at the origin: two bars with braces, a ram alongside, the elbow cap."""
    length = UPPER_ARM_LENGTH
    pieces = [
        platform.cylinder('brass', 0.17, 0.3, (0.0, 0.0, 0.0), 'Y'),
        platform.cylinder('dark-iron', 0.06, 0.34, (0.0, 0.0, 0.0), 'Y'),
        platform.box('gunmetal', (0.1, 0.07, length), (-0.1, 0.0, -length / 2)),
        platform.box('gunmetal', (0.1, 0.07, length), (0.1, 0.0, -length / 2)),
        platform.cylinder('steel', 0.035, length * 0.55, (sign * 0.22, 0.02, -length * 0.42), 'Z'),
        platform.cylinder('dark-iron', 0.05, length * 0.3, (sign * 0.22, 0.02, -length * 0.15), 'Z'),
        platform.cylinder('brass', 0.11, 0.22, (0.0, 0.0, -length), 'Y'),
    ]
    for z in platform.stepped(-0.3, -length + 0.2, -0.25):
        pieces.append(platform.box('gunmetal', (0.26, 0.05, 0.05), (0.0, 0.0, z)))
    for z in platform.stepped(-0.42, -length + 0.32, -0.25):
        pieces.append(platform.box('gunmetal', (0.24, 0.04, 0.04), (0.0, 0.0, z), turn_y=math.radians(40)))
    pieces += [platform.rivet((x, -0.04, z)) for x in (-0.1, 0.1) for z in platform.stepped(-0.2, -length + 0.1, -0.5)]
    return pieces


def forearm_pieces(sign):
    """From the elbow at the origin: a tapered bar, a wrist bearing and a two-finger gripper, open."""
    length = FOREARM_LENGTH
    wrist = -length + 0.3
    pieces = [
        platform.cylinder('brass', 0.08, 0.2, (0.0, 0.0, 0.0), 'Y'),
        platform.box('gunmetal', (0.16, 0.06, length - 0.32), (0.0, 0.0, (wrist + 0.02) / 2)),
        platform.box('brass', (0.2, 0.08, 0.05), (0.0, 0.0, -0.12)),
        platform.cylinder('steel', 0.02, length - 0.5, (sign * 0.1, 0.03, (wrist + 0.12) / 2), 'Z'),
        platform.cylinder('brass', 0.07, 0.16, (0.0, 0.0, wrist), 'Y'),
        platform.box('dark-iron', (0.22, 0.1, 0.1), (0.0, 0.0, wrist - 0.08)),
    ]
    for finger_sign in (-1.0, 1.0):
        pieces += gripper_finger(finger_sign, wrist - 0.13, -length)
    return pieces


def gripper_finger(sign, top, tip_z):
    """A brass finger splayed outwards, its pad turned in at the tip."""
    height = top - tip_z
    return [
        platform.box('brass', (0.05, 0.08, height), (sign * 0.09, 0.0, top - height / 2), turn_y=-sign * math.radians(12)),
        platform.box('brass', (0.08, 0.08, 0.04), (sign * 0.1, 0.0, tip_z + 0.02)),
    ]


def lift_pieces():
    """The cradle: a brass plate on two ram posts, wheel chocks at each end; the posts' feet at the origin."""
    post_top = LIFT_POST_LENGTH
    plate_z = post_top + 0.03
    pieces = [
        platform.cylinder('dark-iron', 0.09, LIFT_POST_LENGTH, (-0.6, 0.0, post_top / 2), 'Z'),
        platform.cylinder('dark-iron', 0.09, LIFT_POST_LENGTH, (0.6, 0.0, post_top / 2), 'Z'),
        platform.cylinder('brass', 0.11, 0.05, (-0.6, 0.0, post_top - 0.08), 'Z'),
        platform.cylinder('brass', 0.11, 0.05, (0.6, 0.0, post_top - 0.08), 'Z'),
        platform.box('brass', (1.9, 0.9, 0.06), (0.0, 0.0, plate_z)),
        platform.box('iron-plate', (1.7, 0.6, 0.03), (0.0, -0.2, plate_z + 0.045)),
        platform.box('dark-iron', (0.1, 0.9, 0.1), (-0.9, 0.0, plate_z + 0.08)),
        platform.box('dark-iron', (0.1, 0.9, 0.1), (0.9, 0.0, plate_z + 0.08)),
    ]
    pieces += platform.rivet_row(-0.8, 0.8, 0.2, y=-0.46, z=plate_z)
    return pieces


# --- the reaction pieces ---------------------------------------------------------------------------


def author_reaction_pieces():
    platform.reset_scene()
    for column, row_id in enumerate(REACTION_ROWS):
        step, major = REACTION_PIECES[row_id]
        x = column * PIECE_PITCH
        platform.build_part(row_id.replace('_', '-') + '-step', step(), at=(x, 0.0, 0.0), z_order=0)
        platform.build_part(row_id.replace('_', '-') + '-major', major(), at=(x, 0.0, 0.6), z_order=0)
    platform.save_as('prop-workshop-reactions')


def small_rivet(centre):
    return platform.sphere('brass', SMALL_RIVET_RADIUS, centre, flatten=0.6)


def hanging_rod(material, radius, bottom, top, x=0.0, y=0.0):
    return platform.cylinder(material, radius, top - bottom, (x, y, (bottom + top) / 2), 'Z')


def grip_knurl(z, radius=0.016, length=0.05):
    """The knurled brass grip at a tool's top, where the gripper takes it."""
    return [platform.cylinder('brass', radius, length, (0.0, 0.0, z), 'Z'),
            platform.cylinder('dark-iron', radius + 0.004, 0.006, (0.0, 0.0, z + length / 2 - 0.003), 'Z')]


def lift_lug(z, width=0.06):
    """A brass hoist lug on a component's top, where the hook takes it."""
    return [platform.box('brass', (width, 0.03, 0.03), (0.0, 0.0, z + 0.015)),
            platform.torus('brass', 0.02, 0.007, (0.0, 0.0, z + 0.045))]


# drill_power: a box-end wrench for the head bolts; a motor housing with a gearbox for the housing.


def head_wrench_pieces():
    return [
        platform.torus('steel', 0.045, 0.014, (0.0, 0.0, 0.052)),
        platform.cylinder('dark-iron', 0.02, 0.03, (0.0, 0.0, 0.052), 'Y'),
        hanging_rod('steel', 0.012, 0.09, 0.3),
        *grip_knurl(0.3),
    ]


def motor_housing_pieces():
    pieces = [
        platform.cylinder('brass', 0.09, 0.22, (0.0, 0.0, 0.09), 'X'),
        platform.cylinder('dark-iron', 0.1, 0.03, (-0.095, 0.0, 0.09), 'X'),
        platform.cylinder('steel', 0.07, 0.03, (0.125, 0.0, 0.09), 'Y'),
        platform.cylinder('dark-iron', 0.025, 0.05, (0.125, 0.0, 0.09), 'Y'),
        platform.cylinder('copper', 0.014, 0.14, (-0.02, -0.03, 0.17), 'X'),
        platform.box('dark-iron', (0.2, 0.06, 0.03), (0.0, 0.0, 0.015)),
        *lift_lug(0.18),
    ]
    for x in platform.stepped(-0.06, 0.06, 0.03):
        pieces.append(platform.box('dark-iron', (0.012, 0.2, 0.18), (x, 0.0, 0.09)))
    for tooth in range(10):
        angle = tooth * math.tau / 10
        pieces.append(platform.box('steel', (0.02, 0.03, 0.018), (0.125 + 0.075 * math.cos(angle), 0.0, 0.09 + 0.075 * math.sin(angle)), turn_y=-angle))
    return pieces


# drill_tip: an angle grinder that kisses the tip; a gem-set tip for the finish.


def grinder_pieces():
    return [
        platform.cylinder('steel', 0.06, 0.012, (0.0, -0.01, 0.06), 'Y'),
        platform.cylinder('dark-iron', 0.02, 0.03, (0.0, -0.01, 0.06), 'Y'),
        platform.box('gunmetal', (0.1, 0.05, 0.03), (0.0, 0.015, 0.1)),
        platform.cylinder('gunmetal', 0.03, 0.14, (0.0, 0.0, 0.19), 'Z'),
        platform.cylinder('brass', 0.034, 0.02, (0.0, 0.0, 0.13), 'Z'),
        platform.cylinder('dark-iron', 0.012, 0.09, (-0.06, 0.0, 0.17), 'X'),
        *grip_knurl(0.28, radius=0.02),
    ]


def gem_tip_pieces():
    pieces = [
        funnel('steel', 0.075, 0.012, 0.17, (0.0, 0.0, 0.085)),
        platform.cylinder('brass', 0.08, 0.03, (0.0, 0.0, 0.185), 'Z'),
        *lift_lug(0.2, width=0.05),
    ]
    for stud in range(6):
        angle = stud * math.tau / 6
        radius = 0.045
        pieces.append(platform.sphere('gem', 0.012, (radius * math.cos(angle), -radius * math.sin(angle) * 0.6 - 0.02, 0.1)))
    return pieces


# engine: a T-bar hub wrench; a drive unit with a gearbox, two pistons and a flywheel.


def hub_wrench_pieces():
    return [
        platform.cylinder('dark-iron', 0.026, 0.04, (0.0, 0.0, 0.02), 'Z'),
        hanging_rod('steel', 0.011, 0.04, 0.26),
        platform.cylinder('steel', 0.011, 0.16, (0.0, 0.0, 0.26), 'X'),
        platform.cylinder('brass', 0.015, 0.03, (-0.08, 0.0, 0.26), 'X'),
        platform.cylinder('brass', 0.015, 0.03, (0.08, 0.0, 0.26), 'X'),
    ]


def drive_unit_pieces():
    pieces = [
        platform.box('dark-iron', (0.24, 0.14, 0.13), (0.0, 0.0, 0.065)),
        platform.box('brass', (0.26, 0.15, 0.02), (0.0, 0.0, 0.14)),
        platform.cylinder('brass', 0.075, 0.04, (0.14, 0.0, 0.08), 'Y'),
        platform.cylinder('dark-iron', 0.02, 0.06, (0.14, 0.0, 0.08), 'Y'),
        platform.box('steel', (0.08, 0.02, 0.02), (0.11, -0.035, 0.11), turn_y=math.radians(30)),
        *lift_lug(0.235, width=0.08),
    ]
    for x in (-0.06, 0.02):
        pieces += [
            platform.cylinder('steel', 0.025, 0.08, (x, 0.0, 0.19), 'Z'),
            platform.cylinder('brass', 0.03, 0.02, (x, 0.0, 0.225), 'Z'),
            platform.cylinder('copper', 0.008, 0.07, (x, -0.03, 0.17), 'Z'),
        ]
    pieces += [small_rivet((x, -0.072, 0.03)) for x in (-0.09, -0.03, 0.03, 0.09)]
    return pieces


# boiler: a valve key; a boiler drum with its own gauge and a second stack.


def valve_key_pieces():
    pieces = [
        platform.box('dark-iron', (0.03, 0.03, 0.03), (0.0, 0.0, 0.015)),
        hanging_rod('steel', 0.009, 0.03, 0.2),
        platform.torus('brass', 0.05, 0.008, (0.0, 0.0, 0.2)),
        platform.cylinder('brass', 0.014, 0.03, (0.0, 0.0, 0.2), 'Y'),
    ]
    for spoke in range(4):
        angle = spoke * math.tau / 4
        pieces.append(platform.box('brass', (0.1, 0.012, 0.012), (0.0, 0.0, 0.2), turn_y=angle))
    pieces += grip_knurl(0.27, radius=0.012, length=0.04)
    return pieces


def boiler_drum_pieces():
    pieces = [
        platform.cylinder('copper', 0.11, 0.28, (0.0, 0.0, 0.11), 'X'),
        platform.sphere('copper', 0.11, (-0.14, 0.0, 0.11), flatten=1.0),
        platform.sphere('copper', 0.11, (0.14, 0.0, 0.11), flatten=1.0),
        platform.cylinder('brass', 0.115, 0.03, (-0.07, 0.0, 0.11), 'X'),
        platform.cylinder('brass', 0.115, 0.03, (0.07, 0.0, 0.11), 'X'),
        platform.cylinder('brass', 0.035, 0.02, (0.0, -0.1, 0.11), 'Y'),
        platform.cylinder('dial', 0.028, 0.025, (0.0, -0.105, 0.11), 'Y'),
        platform.box('charge-red', (0.003, 0.004, 0.022), (0.0, -0.12, 0.118), turn_y=math.radians(-30)),
        platform.cylinder('soot', 0.028, 0.19, (0.08, 0.0, 0.3), 'Z'),
        platform.cylinder('brass', 0.034, 0.02, (0.08, 0.0, 0.39), 'Z'),
        platform.cylinder('brass', 0.032, 0.015, (0.08, 0.0, 0.25), 'Z'),
        platform.box('dark-iron', (0.26, 0.1, 0.02), (0.0, 0.0, 0.01)),
        *lift_lug(0.215, width=0.05),
    ]
    pieces += [small_rivet((x, -0.102, z)) for x in (-0.07, 0.07) for z in (0.03, 0.19)]
    return pieces


# cargo_hold: an ore crate; a pannier segment with its hatch.


def crate_pieces():
    pieces = [
        platform.box('iron-plate', (0.14, 0.12, 0.12), (0.0, 0.0, 0.06)),
        platform.box('brass', (0.15, 0.13, 0.015), (0.0, 0.0, 0.03)),
        platform.box('brass', (0.15, 0.13, 0.015), (0.0, 0.0, 0.1)),
        platform.box('brass', (0.015, 0.13, 0.12), (-0.07, 0.0, 0.06)),
        platform.box('brass', (0.015, 0.13, 0.12), (0.07, 0.0, 0.06)),
        platform.box('brass', (0.08, 0.02, 0.012), (0.0, 0.0, 0.126)),
        platform.torus('brass', 0.018, 0.006, (0.0, 0.0, 0.15)),
    ]
    pieces += [platform.sphere('gem', 0.01, (x, -0.07, 0.07)) for x in (-0.03, 0.02)]
    return pieces


def pannier_pieces():
    pieces = [
        platform.box('iron-plate', (0.3, 0.12, 0.18), (0.0, 0.0, 0.09)),
        platform.box('dark-iron', (0.2, 0.02, 0.1), (0.0, -0.065, 0.1)),
        platform.box('brass', (0.32, 0.13, 0.02), (0.0, 0.0, 0.17)),
        platform.box('brass', (0.32, 0.13, 0.02), (0.0, 0.0, 0.01)),
        platform.cylinder('brass', 0.012, 0.2, (0.0, -0.07, 0.15), 'X'),
        platform.box('brass', (0.05, 0.02, 0.015), (0.0, -0.08, 0.06)),
        *lift_lug(0.18, width=0.08),
    ]
    pieces += [small_rivet((x, -0.062, z)) for x in platform.stepped(-0.13, 0.13, 0.052) for z in (0.03, 0.15)]
    return pieces


# hull: a rivet gun; a plating set on its spreader beam.


def rivet_gun_pieces():
    return [
        funnel('brass', 0.025, 0.012, 0.05, (0.0, 0.0, 0.025)),
        platform.cylinder('gunmetal', 0.03, 0.16, (0.0, 0.0, 0.13), 'Z'),
        platform.cylinder('brass', 0.034, 0.015, (0.0, 0.0, 0.06), 'Z'),
        platform.box('dark-iron', (0.04, 0.03, 0.1), (0.05, 0.0, 0.1), turn_y=math.radians(-20)),
        platform.torus('copper', 0.025, 0.007, (-0.04, 0.0, 0.2)),
        *grip_knurl(0.24, radius=0.02),
    ]


def plating_set_pieces():
    pieces = [
        platform.box('brass', (0.3, 0.05, 0.04), (0.0, 0.0, 0.41)),
        platform.box('iron-plate', (0.1, 0.04, 0.38), (-0.09, 0.0, 0.19)),
        platform.box('iron-plate', (0.1, 0.04, 0.38), (0.09, 0.0, 0.19)),
        platform.cylinder('dark-iron', 0.006, 0.05, (-0.09, 0.0, 0.405), 'Z'),
        platform.cylinder('dark-iron', 0.006, 0.05, (0.09, 0.0, 0.405), 'Z'),
        *lift_lug(0.43, width=0.06),
    ]
    for x in (-0.09, 0.09):
        pieces += [small_rivet((x + dx, -0.022, z)) for dx in (-0.03, 0.03) for z in platform.stepped(0.04, 0.34, 0.1)]
    return pieces


# gun: a barrel brush; a turret unit with its barrel.


def barrel_brush_pieces():
    return [
        platform.cylinder('bristle', 0.024, 0.07, (0.0, 0.0, 0.035), 'Z'),
        hanging_rod('steel', 0.007, 0.07, 0.26),
        platform.cylinder('brass', 0.011, 0.08, (0.0, 0.0, 0.26), 'X'),
    ]


def turret_unit_pieces():
    return [
        platform.box('dark-iron', (0.16, 0.1, 0.05), (0.0, 0.0, 0.025)),
        platform.cylinder('brass', 0.09, 0.1, (0.0, 0.0, 0.1), 'Z'),
        platform.sphere('brass', 0.09, (0.0, 0.0, 0.15), flatten=1.0),
        platform.box('dark-iron', (0.06, 0.02, 0.015), (0.0, -0.085, 0.12)),
        platform.cylinder('gunmetal', 0.02, 0.28, (-0.18, 0.0, 0.11), 'X'),
        platform.cylinder('brass', 0.026, 0.03, (-0.3, 0.0, 0.11), 'X'),
        platform.cylinder('dark-iron', 0.03, 0.06, (-0.06, 0.0, 0.11), 'X'),
        *lift_lug(0.235, width=0.05),
    ]


# blasting_charges: one charge stick; a rack row of two slots.


def charge_stick_pieces():
    return [
        platform.cylinder('charge-red', 0.02, 0.14, (0.0, 0.0, 0.07), 'Z'),
        platform.cylinder('brass', 0.022, 0.012, (0.0, 0.0, 0.05), 'Z'),
        platform.cylinder('brass', 0.022, 0.012, (0.0, 0.0, 0.1), 'Z'),
        platform.cylinder('copper', 0.005, 0.05, (0.0, 0.0, 0.16), 'Z'),
        platform.cylinder('copper', 0.005, 0.03, (0.012, 0.0, 0.185), 'X'),
    ]


def rack_row_pieces():
    pieces = [
        platform.box('iron-plate', (0.2, 0.02, 0.1), (0.0, 0.03, 0.05)),
        platform.box('brass', (0.2, 0.07, 0.012), (0.0, 0.0, 0.006)),
        platform.box('brass', (0.2, 0.07, 0.012), (0.0, 0.0, 0.094)),
    ]
    for x in (-0.1, 0.0, 0.1):
        pieces.append(platform.box('brass', (0.012, 0.07, 0.1), (x, 0.0, 0.05)))
    pieces += lift_lug(0.1, width=0.05)
    return pieces


# casing: a lining spool; the liner cassette of the new grade.


def lining_spool_pieces():
    pieces = [
        platform.cylinder('iron', 0.03, 0.1, (0.0, 0.0, 0.05), 'X'),
        platform.cylinder('dark-iron', 0.05, 0.012, (-0.056, 0.0, 0.05), 'X'),
        platform.cylinder('dark-iron', 0.05, 0.012, (0.056, 0.0, 0.05), 'X'),
        platform.cylinder('steel', 0.008, 0.14, (0.0, 0.0, 0.05), 'X'),
        platform.box('brass', (0.02, 0.02, 0.06), (0.0, 0.0, 0.12)),
        platform.torus('brass', 0.015, 0.005, (0.0, 0.0, 0.16)),
    ]
    for x in platform.stepped(-0.04, 0.04, 0.02):
        pieces.append(platform.cylinder('copper', 0.042, 0.012, (x, 0.0, 0.05), 'X'))
    return pieces


def liner_cassette_pieces():
    pieces = [
        platform.box('dark-iron', (0.22, 0.08, 0.14), (0.0, 0.0, 0.07)),
        platform.box('brass', (0.2, 0.02, 0.12), (0.0, -0.045, 0.07)),
        platform.box('soot', (0.16, 0.02, 0.02), (0.0, -0.05, 0.02)),
        platform.cylinder('gem', 0.028, 0.015, (-0.05, -0.055, 0.085), 'Y'),
        platform.box('enamel', (0.08, 0.015, 0.03), (0.05, -0.055, 0.085)),
        *lift_lug(0.14, width=0.06),
    ]
    pieces += [small_rivet((x, -0.058, z)) for x in (-0.09, 0.09) for z in (0.02, 0.12)]
    return pieces


REACTION_ROWS = ('drill_power', 'drill_tip', 'engine', 'boiler', 'cargo_hold', 'hull', 'gun', 'blasting_charges', 'casing')

REACTION_PIECES = {
    'drill_power': (head_wrench_pieces, motor_housing_pieces),
    'drill_tip': (grinder_pieces, gem_tip_pieces),
    'engine': (hub_wrench_pieces, drive_unit_pieces),
    'boiler': (valve_key_pieces, boiler_drum_pieces),
    'cargo_hold': (crate_pieces, pannier_pieces),
    'hull': (rivet_gun_pieces, plating_set_pieces),
    'gun': (barrel_brush_pieces, turret_unit_pieces),
    'blasting_charges': (charge_stick_pieces, rack_row_pieces),
    'casing': (lining_spool_pieces, liner_cassette_pieces),
}

AUTHORS = {
    'platform-workshop-showcase': author_showcase_rig,
    'prop-workshop-reactions': author_reaction_pieces,
}

if __name__ == '__main__':
    main()
