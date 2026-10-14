"""
Authors the first version of the upgrade workshop hangar (ticket 395), the "Engineering Works" over
the Workshop zone that replaces the #174 sawtooth hall, from the concept Bjor approved on
14 Oct 2026 (`upgrade-workshop-ref.jpg` beside this file): a towering brass-and-iron hangar with a
huge open arched door, smokestacks, cogwheels on the facade and amber windows; inside, the service
turntable the car parks on, a ceiling gantry arm, and racks of drill heads, thrusters and armour.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/upgrade-workshop/author_upgrade_workshop.py

It writes art/blender/platform-building-upgrade/platform-building-upgrade.blend over the old hall:
nothing of the old meshes or materials is kept. The asset id, the three part ids
(`platform-building-upgrade`, the shell; `workshop-gantry`; `workshop-turntable`) and the four
`attach.workshop.*` points are the #170 ones. From then on the `.blend` is the source (#52):
change the art in Blender and re-export, rather than editing this script. Nothing is rigged
(#51 acceptance 2); the dock-buildings slice turns the turntable, sways the gantry and vents the
steam.

Conventions are author_platform.py's (#52, docs/art-pipeline.md): 1 unit = 1 m, game right +X,
up +Z, the camera looks along +Y so details stand out towards -Y, z = 0 is the top of the pad and
the origin is the Workshop zone's centre column, where `bayRestPointOf` puts the car. The palette
is the casing driller's bronze and brass on the shop buildings' iron and soot; the only light is
warm glass (window, lamp, the turntable's rim lamps), so orange stays reserved for heat (#170).

Fit (what the code and the other art read from this file):
- The door is wide and tall enough for the showcase rig (#182): its rail hangs at 3.3 m, 6.4 m
  long and 4.0 m at its top, so the opening is 6.9 m across up to its 4.05 m springline.
- The turntable's rim repeats every `RIM_PERIOD_DEGREES` (a lamp, then a seam), with a lamp
  facing the camera: the slice turns the baked band by remapping it on a cylinder of the band's
  half-width, and a periodic rim turns seamlessly (`turntableSpin.ts`).
- The shell is wider than tall (shopBuildingArt.test.ts: the Works is told from the Sell tower by
  its silhouette), and `workshop.stack` is the top of its tallest stack.
"""

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

import author_platform as kit  # noqa: E402
import author_shop_buildings as shops  # noqa: E402
from author_platform import box, cylinder, rivet, stepped  # noqa: E402

ASSET_ID = 'platform-building-upgrade'

# The casing driller's bronze (ticket 393) on the shop buildings' iron, plus warm glass only.
kit.PALETTE.update({
    'bronze': ((0.44, 0.28, 0.12), 0.4, 0.0),
    'hull-steel': ((0.17, 0.165, 0.16), 0.55, 0.0),
    'rim-lamp': ((1.0, 0.74, 0.38), 0.2, 2.0),
    'sign-glow': ((1.0, 0.82, 0.52), 0.3, 1.4),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
})

# The shell, metres in the asset frame.
HALF_WIDTH = 5.1
FACE_Y = -0.95
BACK_Y = 1.5
TOWER_INNER = 3.85
LEFT_TOWER_TOP = 6.6
RIGHT_TOWER_TOP = 5.6
FACADE_TOP = 7.2
# Right of the sign the facade steps down to a shoulder: with the right tower's roof it is the
# stepped terrace the drone hangar (#197) stands on, its short legs on the shoulder, its long ones
# on the tower (dockAddOns.json `atM`).
SHOULDER_X = 2.6
SHOULDER_TOP = 6.07
CORNICE = 0.22
# The door: straight jambs to the springline, then a half ellipse to the crown.
DOOR_HALF = 3.45
DOOR_SPRING = 4.05
DOOR_RISE = 1.75
ARCH_BAND = 0.34
# The stacks on the left tower; the tallest one's top is `workshop.stack`.
MAIN_STACK = (-4.6, 0.3, 9.6)
SECOND_STACK = (-3.9, 0.21, 8.7)
# The parts.
GANTRY_ROOT = (-2.45, -0.3, 4.85)
TURNTABLE_RADIUS = 1.75
TURNTABLE_TOP = 0.16
TURNTABLE_Y = 0.1
RIM_PERIOD_DEGREES = 15
SHOWCASE_CAM_Z = 1.8


def main():
    clear_scene()
    kit.build_part(ASSET_ID, shell_pieces(), at=(0.0, 0.0, 0.0), z_order=0)
    kit.build_part('workshop-gantry', gantry_pieces(), at=GANTRY_ROOT, z_order=1)
    kit.build_part('workshop-turntable', turntable_pieces(), at=(0.0, TURNTABLE_Y, 0.0), z_order=1)
    shops.add_attach_point('workshop.gantry', (GANTRY_ROOT[0], GANTRY_ROOT[2]), z_order=2)
    shops.add_attach_point('workshop.platform', (0.0, 0.0), z_order=1)
    shops.add_attach_point('workshop.showcase_cam', (0.0, SHOWCASE_CAM_Z), z_order=0)
    shops.add_attach_point('workshop.stack', (MAIN_STACK[0], MAIN_STACK[2] + 0.05), z_order=-1)
    kit.save_as(ASSET_ID)


def clear_scene():
    """An empty metric scene with no data blocks left over (read_factory_settings in -b is fine)."""
    kit.reset_scene()


def shell_pieces():
    return (floor_pieces() + interior_pieces() + rack_pieces() + facade_pieces() + arch_pieces()
            + tower_pieces() + stack_pieces() + sign_pieces() + cog_pieces() + lantern_pieces())


# --- the floor and the hall behind the door ------------------------------------------------------


def floor_pieces():
    """The hall floor: iron plates with a brass edge strip, flush with the pad top."""
    pieces = [
        box('dark-iron', (2 * HALF_WIDTH, BACK_Y + 0.9, 0.1), (0.0, (BACK_Y - 0.9) / 2, 0.05)),
        box('brass', (2 * DOOR_HALF, 0.06, 0.03), (0.0, -0.86, 0.1)),
    ]
    pieces += [box('iron-plate', (0.85, 1.6, 0.02), (x, 0.55, 0.1)) for x in stepped(-3.0, 3.0, 0.9)]
    return pieces


def interior_pieces():
    """The back wall seen through the door: a vault rib, a rose window, clerestory glass, pipes and lamps."""
    face = BACK_Y - 0.16
    pieces = [
        box('wall', (2 * TOWER_INNER, 0.3, DOOR_SPRING + DOOR_RISE + 0.4), (0.0, BACK_Y, (DOOR_SPRING + DOOR_RISE + 0.4) / 2)),
        box('iron-plate', (2 * DOOR_HALF - 0.3, 0.05, 0.9), (0.0, face, 0.55)),
        cylinder('copper', 0.07, 2 * DOOR_HALF - 0.4, (0.0, face - 0.06, 2.95), 'X'),
        cylinder('copper', 0.05, 2 * DOOR_HALF - 0.4, (0.0, face - 0.06, 3.15), 'X'),
    ]
    pieces += rose_window_pieces((0.0, face - 0.04, 4.95), 0.62)
    for x in (-2.15, -1.25, 1.25, 2.15):
        pieces += shops.arched_window((x, face - 0.03, 4.35), width=0.42, height=0.5)
    for x in (-3.15, 3.15):
        pieces.append(cylinder('copper', 0.07, 3.6, (x, face - 0.08, 1.95), 'Z'))
        pieces += gauge_pieces((x, face - 0.16, 2.45), 0.17)
    pieces += kit.rivet_row(-3.2, 3.2, 0.4, y=face - 0.04, z=1.05)
    pieces += hanging_lamp_pieces()
    pieces += back_hatch_pieces(face)
    return pieces


def rose_window_pieces(centre, radius):
    """A round window glazed amber, its brass tracery a gear's spokes."""
    x, y, z = centre
    pieces = [
        cylinder('brass', radius + 0.09, 0.08, (x, y + 0.02, z), 'Y'),
        cylinder('window-glow', radius, 0.08, (x, y, z), 'Y'),
        cylinder('brass', radius * 0.22, 0.1, (x, y - 0.02, z), 'Y'),
    ]
    for spoke in range(6):
        angle = math.radians(30 * spoke)
        pieces.append(spoke_piece('brass', (x, y - 0.02, z), angle, 2 * radius, 0.05))
    return pieces


def spoke_piece(material, centre, angle, length, width):
    """A flat bar through `centre` in the XZ plane, turned `angle` from the X axis."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre, rotation=(0.0, -angle, 0.0))
    return kit.finish_piece(material, scale=(length, 0.04, width))


def gauge_pieces(centre, radius):
    x, y, z = centre
    return [
        cylinder('brass', radius + 0.03, 0.06, (x, y + 0.02, z), 'Y'),
        cylinder('dial', radius, 0.06, (x, y, z), 'Y'),
        spoke_piece('dark-iron', (x + radius * 0.3, y - 0.04, z + radius * 0.25), math.radians(40), radius * 0.9, 0.025),
    ]


def hanging_lamp_pieces():
    """Two lamps hung from the vault, high over the showcase rail (its top is 4.0 m)."""
    pieces = []
    for x in (-1.75, 1.75):
        pieces += [
            cylinder('dark-iron', 0.015, 0.7, (x, 0.6, 5.0), 'Z'),
            shops.funnel('brass', 0.07, 0.22, 0.18, (x, 0.6, 4.58)),
            cylinder('lamp-glow', 0.12, 0.1, (x, 0.6, 4.45), 'Z'),
        ]
    return pieces


def back_hatch_pieces(face):
    """The pressure hatch behind the turntable: a riveted iron door in a brass frame."""
    pieces = [
        box('brass', (1.5, 0.05, 2.25), (0.0, face - 0.02, 1.2)),
        box('hull-steel', (1.34, 0.07, 2.12), (0.0, face - 0.04, 1.16)),
        cylinder('brass', 0.67, 0.05, (0.0, face - 0.02, 2.25), 'Y'),
        cylinder('hull-steel', 0.6, 0.07, (0.0, face - 0.04, 2.22), 'Y'),
        cylinder('brass', 0.16, 0.08, (0.0, face - 0.1, 1.35), 'Y'),
    ]
    for spoke in range(3):
        pieces.append(spoke_piece('brass', (0.0, face - 0.12, 1.35), math.radians(60 * spoke), 0.4, 0.04))
    pieces += kit.rivet_frame(0.0, 1.16, 1.34, 2.12, y=face - 0.09)
    return pieces


# --- the racks of parts on the back wall ---------------------------------------------------------


def rack_pieces():
    """Racks either side of the hatch: drill heads and armour plates left, thrusters right."""
    face = BACK_Y - 0.3
    pieces = []
    for x0, x1 in ((-3.0, -0.95), (0.95, 3.0)):
        pieces += rack_frame_pieces(x0, x1, face)
    for x in (-2.7, -2.1, -1.5):
        pieces += drill_head_pieces((x, face - 0.15, 2.32), 0.17)
        pieces += drill_head_pieces((x + 0.18, face - 0.15, 1.52), 0.13)
    for x in (-2.55, -1.75):
        pieces += armour_plate_pieces((x, face - 0.1, 0.62))
    for x in (1.35, 1.95, 2.55):
        pieces += thruster_pieces((x, face - 0.15, 2.05), 0.16)
    for x in (1.45, 2.3):
        pieces += armour_plate_pieces((x, face - 0.1, 0.62))
    pieces += [box('bronze', (0.22, 0.12, 0.2), (x, face - 0.12, 1.3)) for x in (1.3, 1.75, 2.2, 2.65)]
    return pieces


def rack_frame_pieces(x0, x1, face):
    width = x1 - x0
    middle = (x0 + x1) / 2
    pieces = [box('gunmetal', (0.08, 0.2, 2.8), (x, face, 1.45)) for x in (x0, x1)]
    pieces += [box('gunmetal', (width, 0.28, 0.06), (middle, face - 0.05, z)) for z in (0.25, 1.2, 1.95, 2.8)]
    return pieces


def drill_head_pieces(at, radius):
    """A spare stepped drill cone on a peg, point to the right like the driller's nose."""
    x, y, z = at
    pieces = [cylinder('dark-iron', 0.03, 0.12, (x - 0.02, y + 0.08, z), 'Y')]
    steps = 3
    for step in range(steps):
        share = step / steps
        r0 = radius * (1.0 - share)
        r1 = radius * (1.0 - (step + 1) / steps) + 0.015
        length = radius * 0.75
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=r0, radius2=r1, depth=length,
                                        location=(x + step * length, y, z), rotation=(0.0, math.pi / 2, 0.0))
        pieces.append(kit.finish_piece('brass' if step % 2 == 0 else 'bronze', smooth=True))
    pieces.append(cylinder('hull-steel', radius * 1.05, 0.06, (x - radius * 0.4, y, z), 'X'))
    return pieces


def thruster_pieces(at, radius):
    """A spare vectored thruster: a brass bell, mouth down, on a bronze collar."""
    x, y, z = at
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius, radius2=radius * 0.45, depth=radius * 2.0,
                                    location=(x, y, z))
    return [
        kit.finish_piece('brass', smooth=True),
        cylinder('bronze', radius * 0.55, radius * 0.5, (x, y, z + radius * 1.2), 'Z'),
        cylinder('soot', radius * 0.8, 0.02, (x, y, z - radius * 0.99), 'Z'),
    ]


def armour_plate_pieces(at):
    """A curved bronze armour plate hung on a hook, riveted along its edge."""
    x, y, z = at
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.6, depth=0.5, location=(x, y + 0.5, z),
                                        rotation=(0.0, 0.0, 0.0))
    shell = kit.finish_piece('bronze', smooth=True)
    trim_to_front_arc(shell, half_width=0.26)
    pieces = [shell, box('dark-iron', (0.04, 0.1, 0.12), (x, y + 0.02, z + 0.3))]
    pieces += [rivet((x + dx, y - 0.11, z + dz)) for dx in (-0.2, 0.2) for dz in (-0.18, 0.18)]
    return pieces


def trim_to_front_arc(piece, half_width):
    """Keeps only the front sliver of a cylinder: the plate's curve, `half_width` either side."""
    centre_x = sum(v.co.x for v in piece.data.vertices) / len(piece.data.vertices)
    centre_y = sum(v.co.y for v in piece.data.vertices) / len(piece.data.vertices)
    for vertex in piece.data.vertices:
        offset = vertex.co.x - centre_x
        if abs(offset) > half_width:
            vertex.co.x = centre_x + math.copysign(half_width, offset)
        vertex.co.y = min(vertex.co.y, centre_y - 0.45)


# --- the facade, the door and the towers ---------------------------------------------------------


def facade_pieces():
    """The front wall between the towers with the arched door cut out of it, and its cornices."""
    pieces = [shops.prism('iron', door_cut_profile(), y_from=FACE_Y + 0.05, y_to=FACE_Y + 0.6)]
    for x0, x1, top in ((-TOWER_INNER - 0.2, SHOULDER_X, FACADE_TOP), (SHOULDER_X, TOWER_INNER + 0.2, SHOULDER_TOP)):
        middle = (x0 + x1) / 2
        pieces += [
            box('dark-iron', (x1 - x0, 1.8, CORNICE), (middle, FACE_Y + 0.75, top + CORNICE / 2)),
            box('brass', (x1 - x0 - 0.1, 0.08, 0.1), (middle, FACE_Y - 0.02, top - 0.1)),
        ]
        pieces += kit.rivet_row(x0 + 0.25, x1 - 0.25, 0.3, y=FACE_Y - 0.06, z=top - 0.1)
    return pieces


def door_cut_profile():
    """The wall's outline seen from the front, counter-clockwise, with the door's arch cut up into it."""
    inner = arch_curve(DOOR_HALF, DOOR_SPRING, DOOR_RISE, segments=40)
    return ([(-TOWER_INNER, 0.0), (-DOOR_HALF, 0.0)] + inner
            + [(DOOR_HALF, 0.0), (TOWER_INNER, 0.0), (TOWER_INNER, SHOULDER_TOP), (SHOULDER_X, SHOULDER_TOP),
               (SHOULDER_X, FACADE_TOP), (-TOWER_INNER, FACADE_TOP)])


def arch_curve(half_width, spring, rise, segments):
    """The half ellipse from the left springline over the crown to the right, left to right."""
    points = []
    for index in range(segments + 1):
        angle = math.pi - math.pi * index / segments
        points.append((half_width * math.cos(angle), spring + rise * math.sin(angle)))
    return points


def arch_band(material, half_width, spring, rise, thickness, y_from, y_to):
    """An arch-shaped band down to the floor: the inner edge is the door, `thickness` wide."""
    inner = arch_curve(half_width, spring, rise, segments=40)
    outer = arch_curve(half_width + thickness, spring, rise + thickness, segments=40)
    profile = ([(-half_width - thickness, 0.0), (-half_width, 0.0)] + inner + [(half_width, 0.0),
               (half_width + thickness, 0.0)] + outer[::-1])
    return shops.prism(material, profile, y_from=y_from, y_to=y_to)


def arch_pieces():
    """The door's riveted brass arch, studded with warm lamps like the concept's."""
    pieces = [
        arch_band('brass', DOOR_HALF, DOOR_SPRING, DOOR_RISE, ARCH_BAND, FACE_Y - 0.12, FACE_Y + 0.1),
        arch_band('dark-iron', DOOR_HALF + 0.08, DOOR_SPRING, DOOR_RISE + 0.08, ARCH_BAND - 0.16, FACE_Y - 0.15, FACE_Y - 0.1),
    ]
    middle = DOOR_HALF + ARCH_BAND / 2
    for x in (-middle, middle):
        pieces += [arch_stud((x, FACE_Y - 0.17, z), lit=index % 2 == 0)
                   for index, z in enumerate(stepped(0.4, DOOR_SPRING - 0.1, 0.45))]
    for index in range(1, 12):
        angle = math.pi - math.pi * index / 12
        x = middle * math.cos(angle)
        z = DOOR_SPRING + (DOOR_RISE + ARCH_BAND / 2) * math.sin(angle)
        pieces.append(arch_stud((x, FACE_Y - 0.17, z), lit=index % 2 == 1))
    pieces += keystone_pieces((0.0, FACE_Y - 0.18, DOOR_SPRING + DOOR_RISE + ARCH_BAND / 2))
    return pieces


def arch_stud(centre, lit):
    """A lamp in a brass bezel, or a big rivet, alternating round the arch."""
    if not lit:
        return kit.sphere('brass', 0.06, centre, flatten=0.6)
    return kit.sphere('lamp-glow', 0.07, centre, flatten=0.6)


def keystone_pieces(centre):
    x, y, z = centre
    return [
        box('bronze', (0.5, 0.12, 0.62), (x, y + 0.02, z)),
        box('brass', (0.56, 0.06, 0.08), (x, y - 0.03, z - 0.27)),
        box('brass', (0.56, 0.06, 0.08), (x, y - 0.03, z + 0.27)),
        cylinder('lamp-glow', 0.1, 0.06, (x, y - 0.05, z), 'Y'),
        cylinder('brass', 0.14, 0.04, (x, y - 0.02, z), 'Y'),
    ]


def tower_pieces():
    """The two flanking towers: riveted iron storeys banded in brass, amber windows, pipes and gauges."""
    pieces = []
    for side, top in ((-1, LEFT_TOWER_TOP), (1, RIGHT_TOWER_TOP)):
        middle = side * (TOWER_INNER + HALF_WIDTH) / 2
        width = HALF_WIDTH - TOWER_INNER
        pieces += [
            box('iron', (width, 1.9, top), (middle, FACE_Y + 0.95, top / 2)),
            box('dark-iron', (width + 0.2, 2.0, 0.2), (middle, FACE_Y + 0.95, top + 0.1)),
            box('dark-iron', (width + 0.1, 2.0, 0.5), (middle, FACE_Y + 0.95, 0.25)),
        ]
        pieces += [box('brass', (width + 0.12, 2.0, 0.1), (middle, FACE_Y + 0.95, z)) for z in (0.55, 2.95, top - 0.3)]
        pieces += [rivet((middle + dx, FACE_Y - 0.03, z)) for dx in (-0.48, 0.48) for z in stepped(0.8, top - 0.6, 0.4)]
        pieces += shops.arched_window((middle, FACE_Y - 0.02, 1.85), width=0.55, height=1.0)
        pieces += porthole_pieces((middle, FACE_Y - 0.02, 3.75), 0.3)
        pieces.append(cylinder('copper', 0.08, top - 0.4, (side * (HALF_WIDTH - 0.08), FACE_Y + 0.15, top / 2 + 0.1), 'Z'))
    pieces += gauge_pieces((-4.48, FACE_Y - 0.06, 4.6), 0.2)
    pieces += terrace_rail_pieces()
    return pieces


def porthole_pieces(centre, radius):
    x, y, z = centre
    pieces = [
        cylinder('brass', radius + 0.08, 0.08, (x, y + 0.02, z), 'Y'),
        cylinder('window-glow', radius, 0.08, (x, y, z), 'Y'),
        box('brass', (2 * radius, 0.1, 0.035), (x, y - 0.02, z)),
        box('brass', (0.035, 0.1, 2 * radius), (x, y - 0.02, z)),
    ]
    pieces += [rivet((x + (radius + 0.04) * math.cos(a), y - 0.04, z + (radius + 0.04) * math.sin(a)))
               for a in (math.radians(d) for d in range(0, 360, 45))]
    return pieces


def terrace_rail_pieces():
    """A railing round the right tower's flat roof, where the drone hangar (#197) lands."""
    x0, x1 = TOWER_INNER + 0.05, HALF_WIDTH - 0.05
    top = RIGHT_TOWER_TOP + 0.2
    pieces = [box('brass', (x1 - x0, 0.05, 0.04), (0.5 * (x0 + x1), FACE_Y - 0.0, top + 0.5))]
    pieces += [box('dark-iron', (0.04, 0.04, 0.5), (x, FACE_Y - 0.0, top + 0.25)) for x in stepped(x0, x1, 0.31)]
    return pieces


def stack_pieces():
    """Two smokestacks on the left tower, banded in brass and crowned; the slice vents steam from them."""
    pieces = []
    for x, radius, top in (MAIN_STACK, SECOND_STACK):
        bottom = LEFT_TOWER_TOP + 0.2
        pieces += [
            cylinder('soot', radius, top - bottom, (x, 0.2, (top + bottom) / 2), 'Z'),
            cylinder('dark-iron', radius + 0.12, 0.4, (x, 0.2, bottom + 0.2), 'Z'),
            shops.funnel('brass', radius + 0.1, radius + 0.02, 0.22, (x, 0.2, top - 0.05)),
        ]
        pieces += [cylinder('brass', radius + 0.035, 0.08, (x, 0.2, z), 'Z')
                   for z in stepped(bottom + 0.9, top - 0.6, 0.85)]
    pieces.append(cylinder('copper', 0.07, 1.0, (-4.15, -0.2, LEFT_TOWER_TOP + 0.75), 'X'))
    return pieces


# --- the sign, the cogs, the lanterns ------------------------------------------------------------


def sign_pieces():
    """
    The game's own name for the building on a soot plaque in a brass frame (the concept's
    "Aetherdrill Upgrade Works" sign is not used), crested with the bay's #158 emblem in a gear.
    """
    plaque_z = 6.62
    pieces = [
        box('brass', (4.5, 0.08, 0.9), (0.0, FACE_Y - 0.06, plaque_z)),
        box('soot', (4.3, 0.1, 0.74), (0.0, FACE_Y - 0.08, plaque_z)),
        text_piece('sign-glow', 'ENGINEERING WORKS', 0.36, (0.0, FACE_Y - 0.15, plaque_z)),
    ]
    for x in (-2.32, 2.32):
        pieces += [cylinder('brass', 0.2, 0.08, (x, FACE_Y - 0.08, plaque_z), 'Y'),
                   cylinder('bronze', 0.12, 0.1, (x, FACE_Y - 0.1, plaque_z), 'Y')]
    pieces += kit.rivet_row(-2.0, 2.0, 0.4, y=FACE_Y - 0.12, z=plaque_z + 0.4)
    pieces += emblem_crest_pieces((0.0, FACE_Y + 0.2, FACADE_TOP + 0.62), 0.55)
    return pieces


def text_piece(material, body, size, centre):
    """Letters in the built-in font, extruded, standing in the XZ plane facing the camera."""
    curve = bpy.data.curves.new('sign-text', 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = 0.015
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.space_character = 1.05
    text = bpy.data.objects.new('sign-text', curve)
    bpy.context.scene.collection.objects.link(text)
    bpy.ops.object.select_all(action='DESELECT')
    text.select_set(True)
    bpy.context.view_layer.objects.active = text
    bpy.ops.object.convert(target='MESH')
    piece = bpy.context.view_layer.objects.active
    piece.rotation_euler = (math.pi / 2, 0.0, 0.0)
    piece.location = centre
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    piece.data.materials.append(kit.material_of(material))
    return piece


def emblem_crest_pieces(centre, radius):
    """The `emblem-bay-upgrade` glyph (wrench and gear) on a soot disc inside a brass cogwheel."""
    x, y, z = centre
    return [
        gear_piece('brass', radius + 0.16, 16, 0.12, (x, y + 0.04, z)),
        cylinder('soot', radius, 0.14, (x, y, z), 'Y'),
        shops.emblem_glyph('emblem-bay-upgrade', 'brass', (x, y - 0.08, z), 2 * radius * 0.8),
    ]


def cog_pieces():
    """Cogwheels on the facade, as the concept has them: a big one on the left tower, two meshing on the right."""
    pieces = []
    for x, z, radius, teeth in ((-4.35, 5.6, 0.62, 14), (-3.6, 6.55, 0.34, 9), (4.45, 4.65, 0.5, 12), (3.9, 5.25, 0.3, 8)):
        pieces += cogwheel_pieces((x, FACE_Y - 0.1, z), radius, teeth)
    return pieces


def cogwheel_pieces(centre, radius, teeth):
    x, y, z = centre
    pieces = [
        gear_piece('brass', radius, teeth, 0.1, centre),
        cylinder('dark-iron', radius * 0.68, 0.11, (x, y - 0.01, z), 'Y'),
        cylinder('brass', radius * 0.22, 0.14, (x, y - 0.03, z), 'Y'),
    ]
    for spoke in range(3):
        pieces.append(spoke_piece('brass', (x, y - 0.02, z), math.radians(60 * spoke), radius * 1.36, radius * 0.12))
    return pieces


def gear_piece(material, radius, teeth, thickness, centre):
    """A cogwheel facing the camera: a disc with square teeth round its rim."""
    x, y, z = centre
    profile = []
    root = radius * 0.86
    for tooth in range(teeth):
        base = 2 * math.pi * tooth / teeth
        step = 2 * math.pi / teeth
        for share, r in ((0.0, root), (0.18, radius), (0.5, radius), (0.68, root)):
            angle = base + share * step
            profile.append((x + r * math.cos(angle), z + r * math.sin(angle)))
    return shops.prism(material, profile, y_from=y - thickness / 2, y_to=y + thickness / 2)


def lantern_pieces():
    """A lantern each side of the door, hung out from the towers."""
    pieces = []
    for x in (-3.95, 3.95):
        pieces += shops.lantern((x, FACE_Y - 0.25, 2.55))
    return pieces


# --- the gantry arm and the turntable ------------------------------------------------------------


def gantry_pieces():
    """
    A jointed service arm folded up under the vault: a bearing housing at its root, an upper arm
    out to the elbow, a forearm ending in a gripper claw. The slice sways it about its root.
    """
    elbow = (1.0, 0.0, -0.2)
    wrist = (1.75, 0.0, -0.38)
    pieces = [
        cylinder('brass', 0.24, 0.3, (0.0, 0.0, 0.0), 'Y'),
        cylinder('dark-iron', 0.11, 0.34, (0.0, 0.0, 0.0), 'Y'),
        box('dark-iron', (0.5, 0.3, 0.16), (0.0, 0.05, 0.2)),
        segment_piece('bronze', (0.0, 0.0), (elbow[0], elbow[2]), 0.16),
        cylinder('brass', 0.13, 0.26, elbow, 'Y'),
        segment_piece('hull-steel', (elbow[0], elbow[2]), (wrist[0], wrist[2]), 0.11),
        cylinder('brass', 0.09, 0.22, wrist, 'Y'),
        cylinder('copper', 0.035, 0.9, (0.55, -0.13, -0.08), 'X'),
    ]
    pieces += claw_pieces(wrist)
    return pieces


def segment_piece(material, start, end, width):
    """A flat arm segment between two joints in the XZ plane."""
    dx, dz = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dz)
    centre = ((start[0] + end[0]) / 2, 0.0, (start[1] + end[1]) / 2)
    return spoke_piece(material, centre, math.atan2(dz, dx), length, width)


def claw_pieces(wrist):
    x, _, z = wrist
    return [
        box('dark-iron', (0.16, 0.18, 0.12), (x, 0.0, z - 0.12)),
        spoke_piece('hull-steel', (x - 0.07, -0.02, z - 0.26), math.radians(-70), 0.22, 0.04),
        spoke_piece('hull-steel', (x + 0.07, -0.02, z - 0.26), math.radians(70), 0.22, 0.04),
    ]


def turntable_pieces():
    """
    The service turntable, a low dais the car parks on: an iron drum rising `TURNTABLE_TOP` over the
    pad between two brass rings, with a rim lamp every `RIM_PERIOD_DEGREES` (one facing the camera)
    and a seam strap between each pair. The rim's period is what lets the slice turn the flat band
    seamlessly; its base sinks below the pad top, so the origin is inside the part.
    """
    radius = TURNTABLE_RADIUS
    bottom = -0.13
    pieces = [
        cylinder('dark-iron', radius, TURNTABLE_TOP - bottom, (0.0, 0.0, (TURNTABLE_TOP + bottom) / 2), 'Z'),
        cylinder('iron-plate', radius - 0.05, 0.03, (0.0, 0.0, TURNTABLE_TOP), 'Z'),
        flat_ring('brass', radius + 0.02, 0.035, TURNTABLE_TOP - 0.01),
        flat_ring('brass', radius + 0.02, 0.035, -0.02),
    ]
    lamp_z = (TURNTABLE_TOP - 0.02) / 2
    count = 360 // RIM_PERIOD_DEGREES
    for index in range(count):
        lamp = math.radians(index * RIM_PERIOD_DEGREES)
        seam = lamp + math.radians(RIM_PERIOD_DEGREES / 2)
        pieces.append(kit.sphere('rim-lamp', 0.04, rim_point(lamp, radius, lamp_z), flatten=0.6))
        pieces.append(rim_seam(seam, radius, lamp_z))
    return pieces


def flat_ring(material, major, minor, z):
    """A ring lying flat; its bottom reaches below z by its minor radius, so origins stay inside."""
    return shops.ring(material, major, minor, (0.0, 0.0, z))


def rim_point(angle, radius, z):
    """A point on the rim, `angle` round from the one facing the camera (-Y), turning to +X."""
    return (radius * math.sin(angle), -radius * math.cos(angle), z)


def rim_seam(angle, radius, z):
    """A brass seam strap up the drum's side between the rings, facing out."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=rim_point(angle, radius + 0.005, z),
                                    rotation=(0.0, 0.0, angle))
    return kit.finish_piece('brass', scale=(0.04, 0.02, TURNTABLE_TOP - 0.06))


if __name__ == '__main__':
    main()
