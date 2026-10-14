"""
Authors the first version of the service station (ticket 398), the Sell bay's building that
replaces the #174 "Assay & Exchange" tower: one steampunk building with three arched bays over the
one Sell zone (sell, repair and recharge all belong to the Sell bay), from the concept Bjor approved
on 14 Oct 2026 (service-station-ref.jpg beside this file).

    blender -b --factory-startup --python-exit-code 1 -P docs/art/service-station/author_service_station.py

It writes art/blender/platform-building-sell/platform-building-sell.blend from an empty scene, so
nothing of the old tower is left in it. From then on the `.blend` is the source (#52): change the
art in Blender and re-export with `npm run art:export -- platform-building-sell`, rather than
editing this script. Nothing is rigged (#51 acceptance 2); the code moves the idle parts
(src/systems/render/stationIdleMotion.ts).

Conventions are author_platform.py's (#52, docs/art-pipeline.md): 1 unit = 1 m, game right +X, up
+Z, the camera looks along +Y so details stand out towards -Y, z = 0 is the top of the pad, and the
origin is the Sell zone's centre column, where `bayRestPointOf` parks the vehicle (in the middle,
repair bay). The building keeps the old tower's 6 m width, which is all the pad has between its
left edge and the Refinery's yard, so the three bays are 2 m each around a 1.6 m casing driller.

| Part              | What it is                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| (the asset id)    | the static shell: plinth, pillars, arches, facade, sign, roof machinery     |
| `sell-arc`        | the lightning between the two Tesla coils on the left roof                  |
| `sell-arc-2`      | the lightning between the charging bay's floor coils                        |
| `sell-conveyor`   | the ore and cleats riding the conveyor up into the hopper                   |
| `sell-spark`, -2  | the welding sparks at the two repair arms' torches                          |

The palette is the #174 buildings' brass, iron and soot with the #393 driller's bronze; the light
is warm window and lamp glass, the charging bay's blue, and the white-hot weld. Orange stays
reserved for heat (#170). The sign reads the game's existing name, "ASSAY & EXCHANGE".
"""

import math
import os
import random
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

import author_platform as kit  # noqa: E402

ASSET_ID = 'platform-building-sell'
ICON_PATH = os.path.join(REPO_ROOT, 'src', 'ui', 'icons', 'emblem-bay-sell.svg')
ATTACH_PREFIX = 'attach.'

kit.PALETTE.update({
    'window-glow': ((1.0, 0.80, 0.50), 0.3, 1.6),
    'lamp-glow': ((1.0, 0.88, 0.64), 0.3, 2.2),
    'gunmetal': ((0.16, 0.17, 0.19), 0.45, 0.0),
    'bronze': ((0.44, 0.28, 0.12), 0.4, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'needle': ((0.55, 0.08, 0.06), 0.4, 0.0),
    'insulator': ((0.34, 0.20, 0.12), 0.25, 0.0),
    'winding': ((0.62, 0.30, 0.15), 0.35, 0.0),
    'belt': ((0.06, 0.055, 0.05), 0.85, 0.0),
    'ore-rock': ((0.17, 0.15, 0.14), 0.8, 0.0),
    'ore-copper': ((0.62, 0.36, 0.18), 0.4, 0.0),
    'ore-silver': ((0.62, 0.64, 0.68), 0.35, 0.0),
    'ore-gold': ((0.86, 0.68, 0.26), 0.35, 0.0),
    'charge-glow': ((0.16, 0.42, 1.0), 0.2, 1.0),
    'facade-iron': ((0.15, 0.115, 0.09), 0.55, 0.0),
    'facade-plate': ((0.24, 0.17, 0.11), 0.5, 0.0),
    'arc-glow': ((0.5, 0.74, 1.0), 0.2, 1.0),
    'spark-glow': ((1.0, 0.96, 0.78), 0.2, 1.0),
})

WIDTH = 6.0
HALF = WIDTH / 2
FACE_Y = -0.7
SPRING_Z = 1.85
FACADE_TOP = 3.9
# The three bays, left to right: (centre x, inner arch radius). The vehicle rests in the middle.
CHARGE_BAY = (-1.92, 0.8)
REPAIR_BAY = (0.0, 0.88)
SELL_BAY = (1.92, 0.8)
ARCH_BAND = 0.16
PILLARS = ((-3.0, -2.72), (-1.12, -0.88), (0.88, 1.12), (2.72, 3.0))
BACK_Y = 0.65

# The left roof's two Tesla coils: x of each, and the height of the spheres the arc leaps between.
COIL_XS = (-2.45, -1.45)
COIL_BASE_Z = 4.45
COIL_SPHERE_Z = 6.85
# The charging bay's floor coils, either side of the bay's centre.
FLOOR_COIL_XS = (CHARGE_BAY[0] - 0.5, CHARGE_BAY[0] + 0.5)
FLOOR_COIL_SPHERE_Z = 1.38

STACK_X = 0.72
STACK_TOP = 8.4
RIGHT_BLOCK = (1.0, 3.0)
RIGHT_BLOCK_TOP = 5.3

# The conveyor rises from its intake beside the parked vehicle to the hopper's mouth. The code
# slides the ore along the same line (SELL_CONVEYOR_* in src/constants/scene.ts).
BELT_LOW = (0.95, 0.52)
BELT_HIGH = (1.86, 1.98)
BELT_Y = -0.98
CONVEYOR_PITCH = 0.2
HOPPER_X = 2.2
HOPPER_MOUTH_Z = 1.98
HOPPER_HALF = 0.42
COUNTER_TOP = 1.0

# The repair arms hang from the middle arch: (shoulder, elbow, torch tip) in x, z.
WELD_ARMS = (
    ((-0.62, 2.45), (-0.62, 1.7), (-0.3, 1.08)),
    ((0.62, 2.45), (0.66, 1.62), (0.34, 1.02)),
)


def main():
    clear_scene()
    kit.build_part(ASSET_ID, shell_pieces(), at=(0.0, 0.0, 0.0), z_order=0)
    build_moving_part('sell-arc', roof_arc_pieces(), pivot=(sum(COIL_XS) / 2, -0.95, COIL_SPHERE_Z))
    build_moving_part('sell-arc-2', bay_arc_pieces(), pivot=(CHARGE_BAY[0], -0.4, FLOOR_COIL_SPHERE_Z))
    build_moving_part('sell-conveyor', conveyor_load_pieces(), pivot=belt_point(0.5, BELT_Y - 0.06))
    for index, (_, _, tip) in enumerate(WELD_ARMS):
        name = 'sell-spark' if index == 0 else 'sell-spark-%d' % (index + 1)
        centre = (tip[0], -0.55, tip[1] - 0.06)
        build_moving_part(name, spark_pieces(index, centre), pivot=centre)
    add_attach_point('sell.chute', (BELT_LOW[0], BELT_LOW[1] + 0.12), z_order=2)
    add_attach_point('sell.ticker', (HOPPER_X, HOPPER_MOUTH_Z), z_order=2)
    add_attach_point('sell.stack', (STACK_X, STACK_TOP), z_order=-1)
    kit.save_as(ASSET_ID)


def clear_scene():
    """An empty metric scene, by removing data blocks, so the script also runs inside the MCP's Blender."""
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.curves,
                       bpy.data.lights, bpy.data.cameras):
        for block in list(collection):
            collection.remove(block)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def build_moving_part(part_id, pieces, pivot):
    """
    Joins pieces built where they stand into one part drawn over the shell, its origin the pivot
    the code moves it about. No bevel: the platform's 15 mm would eat the 3 cm bolts and streaks.
    """
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    part = bpy.context.view_layer.objects.active
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    part.name = part_id
    part.data.name = part_id
    part['z'] = 1
    return part


# --- the shell ------------------------------------------------------------------------------------


def shell_pieces():
    return (plinth_pieces() + back_wall_pieces() + pillar_pieces() + arch_pieces() + facade_pieces()
            + sign_pieces() + charge_bay_pieces() + repair_bay_pieces() + sell_bay_pieces()
            + conveyor_frame_pieces() + coil_pieces() + roof_pieces() + stack_pieces()
            + right_block_pieces())


def plinth_pieces():
    pieces = [
        kit.box('dark-iron', (WIDTH, 1.9, 0.22), (0.0, -0.1, 0.09)),
        kit.box('brass', (WIDTH - 0.2, 0.06, 0.05), (0.0, -1.06, 0.17)),
    ]
    pieces += kit.rivet_row(-2.85, 2.85, 0.3, y=-1.07, z=0.07)
    return pieces


def back_wall_pieces():
    """The dark interior behind the three arches, with a pipe run along it."""
    face = BACK_Y - 0.12
    pieces = [
        kit.box('enamel', (WIDTH - 0.2, 0.24, FACADE_TOP - 0.2), (0.0, BACK_Y, 0.2 + (FACADE_TOP - 0.2) / 2)),
        kit.cylinder('copper', 0.05, WIDTH - 0.4, (0.0, face - 0.04, 2.35), 'X'),
        kit.cylinder('brass', 0.035, WIDTH - 0.4, (0.0, face - 0.04, 2.5), 'X'),
    ]
    pieces += kit.rivet_row(-2.7, 2.7, 0.3, y=face - 0.02, z=0.45)
    return pieces


def pillar_pieces():
    """Iron pillars, banded in brass at foot and capital, carrying the arches up to the cornice."""
    pieces = []
    for left, right in PILLARS:
        x, width = (left + right) / 2, right - left
        pieces += [
            kit.box('facade-iron', (width, 0.5, FACADE_TOP - 0.2), (x, -0.62, 0.2 + (FACADE_TOP - 0.2) / 2)),
            kit.box('brass', (width + 0.04, 0.56, 0.12), (x, -0.62, 0.38)),
            kit.box('brass', (width + 0.04, 0.58, 0.1), (x, -0.62, SPRING_Z)),
            kit.box('bronze', (width - 0.08, 0.04, SPRING_Z - 0.7), (x, -0.885, 1.12)),
        ]
        pieces += [kit.rivet((x, -0.89, z)) for z in kit.stepped(0.6, 3.6, 0.3)]
    for x in (-2.86, 2.86):
        pieces += lantern((x, -1.0, 1.3))
    return pieces


def lantern(centre):
    """A caged brass lantern on a bracket, warm glass inside."""
    x, y, z = centre
    return [
        kit.box('dark-iron', (0.06, 0.3, 0.05), (x, y + 0.14, z + 0.24)),
        kit.frustum('brass', 0.1, 0.07, 0.28, (x, y, z)),
        kit.box('lamp-glow', (0.12, 0.12, 0.2), (x, y, z - 0.01)),
        kit.frustum('dark-iron', 0.02, 0.12, 0.07, (x, y, z + 0.18)),
    ]


def arch_pieces():
    """A brass voussoir ring round each bay, a keystone with a pressure gauge on it."""
    pieces = []
    for centre, radius in (CHARGE_BAY, REPAIR_BAY, SELL_BAY):
        pieces.append(prism('brass', half_annulus(centre, SPRING_Z, radius, radius + ARCH_BAND), -0.84, -0.74))
        pieces += [
            kit.box('iron', (0.04, 0.12, ARCH_BAND + 0.02), arch_point(centre, radius + ARCH_BAND / 2, angle, -0.85),
                    turn_y=-angle + math.pi / 2)
            for angle in (math.radians(degrees) for degrees in range(15, 180, 30))
        ]
        keystone_z = SPRING_Z + radius + ARCH_BAND / 2
        pieces.append(kit.box('bronze', (0.3, 0.14, 0.34), (centre, -0.86, keystone_z)))
        pieces += gauge((centre, -0.95, keystone_z + 0.02), 0.13, needle_turn=0.7 + centre * 0.4)
    return pieces


def facade_pieces():
    """The iron spandrels over each arch, a brass band, and the cornice the roof machinery sits on."""
    pieces = []
    for centre, radius in (CHARGE_BAY, REPAIR_BAY, SELL_BAY):
        pieces.append(prism('facade-plate', spandrel(centre, radius), -0.74, -0.4))
    pieces += [
        kit.box('facade-iron', (WIDTH, 0.34, 0.75), (0.0, -0.57, 3.4)),
        kit.box('brass', (WIDTH, 0.4, 0.08), (0.0, -0.57, 3.0)),
        kit.box('brass', (WIDTH, 0.44, 0.07), (0.0, -0.6, FACADE_TOP - 0.16)),
        kit.box('dark-iron', (WIDTH, 0.6, 0.14), (0.0, -0.5, FACADE_TOP - 0.05)),
    ]
    pieces += kit.rivet_row(-2.85, 2.85, 0.3, y=-0.78, z=3.0)
    return pieces


def sign_pieces():
    """The game's own name in brass letters on a soot board across the facade."""
    pieces = [
        kit.box('soot', (4.5, 0.06, 0.42), (0.0, -0.76, 3.42)),
        kit.box('brass', (4.62, 0.05, 0.05), (0.0, -0.77, 3.65)),
        kit.box('brass', (4.62, 0.05, 0.05), (0.0, -0.77, 3.19)),
        sign_text('ASSAY & EXCHANGE', (0.0, -0.8, 3.42), height=0.27, width=4.2),
    ]
    pieces += [kit.rivet((x, -0.8, 3.42)) for x in (-2.15, 2.15)]
    return pieces


def sign_text(text, centre, height, width):
    curve = bpy.data.curves.new('sign', 'FONT')
    curve.body = text
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.extrude = 0.015
    obj = bpy.data.objects.new('sign', curve)
    bpy.context.scene.collection.objects.link(obj)
    select_only(obj)
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.view_layer.objects.active
    scale = min(height / obj.dimensions.y, width / obj.dimensions.x)
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (math.pi / 2, 0.0, 0.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    obj.location = centre
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    obj.data.materials.append(kit.material_of('brass'))
    return obj


# --- the left bay: charging -----------------------------------------------------------------------


def charge_bay_pieces():
    """A blue charging portal on the back wall between two floor coils, with bus bars and a charger lead."""
    cx = CHARGE_BAY[0]
    pieces = [
        kit.cylinder('charge-glow', 0.62, 0.06, (cx, BACK_Y - 0.16, 1.3), 'Y'),
        kit.torus('copper', 0.66, 0.07, (cx, BACK_Y - 0.2, 1.3)),
        kit.torus('brass', 0.4, 0.03, (cx, BACK_Y - 0.2, 1.3)),
        kit.box('copper', (0.08, 0.06, 1.0), (cx - 0.76, BACK_Y - 0.18, 1.0)),
        kit.box('copper', (0.08, 0.06, 1.0), (cx + 0.76, BACK_Y - 0.18, 1.0)),
        kit.cylinder('dark-iron', 0.03, 0.8, (cx, -0.2, 2.15), 'Z'),
        kit.box('brass', (0.12, 0.12, 0.2), (cx, -0.2, 1.72)),
    ]
    for spoke in range(8):
        angle = spoke * math.pi / 4
        pieces.append(kit.box('brass', (0.5, 0.03, 0.025), (cx + 0.42 * math.cos(angle), BACK_Y - 0.21,
                                                            1.3 + 0.42 * math.sin(angle)), turn_y=-angle))
    for x in FLOOR_COIL_XS:
        pieces += coil((x, -0.2), base_z=0.22, top_z=FLOOR_COIL_SPHERE_Z - 0.081, radius=0.09, sphere=0.09)
    return pieces


def coil(at, base_z, top_z, radius, sphere):
    """A Tesla coil: an insulated base, a copper winding banded in brass, a toroid and a sphere on top."""
    x, y = at
    height = top_z - base_z
    pieces = [
        kit.cylinder('dark-iron', radius * 1.6, height * 0.12, (x, y, base_z + height * 0.06), 'Z'),
        kit.cylinder('winding', radius, height * 0.7, (x, y, base_z + height * 0.47), 'Z'),
        kit.cylinder('insulator', radius * 0.5, height * 0.2, (x, y, base_z + height * 0.9), 'Z'),
        ring('brass', radius * 1.3, radius * 0.35, (x, y, top_z)),
        kit.sphere('brass', sphere, (x, y, top_z + sphere * 0.9)),
    ]
    pieces += [ring('brass', radius * 1.08, radius * 0.12, (x, y, z))
               for z in kit.stepped(base_z + height * 0.18, base_z + height * 0.78, height * 0.12)]
    return pieces


def coil_pieces():
    """The two big coils on the left roof, on a riveted brass-banded plinth."""
    left, right = -3.0, -0.95
    pieces = [
        kit.box('facade-iron', (right - left, 0.9, COIL_BASE_Z - FACADE_TOP + 0.05), ((left + right) / 2, -0.35,
                                                                             (FACADE_TOP + COIL_BASE_Z) / 2)),
        kit.box('brass', (right - left, 0.94, 0.08), ((left + right) / 2, -0.35, COIL_BASE_Z)),
    ]
    pieces += kit.rivet_row(left + 0.1, right - 0.1, 0.25, y=-0.81, z=FACADE_TOP + 0.2)
    for x in COIL_XS:
        pieces += coil((x, -0.4), base_z=COIL_BASE_Z, top_z=COIL_SPHERE_Z - 0.18, radius=0.17, sphere=0.2)
    pieces += gauge((-1.95, -0.82, FACADE_TOP + 0.28), 0.12, needle_turn=-0.5)
    return pieces


# --- the middle bay: repair -----------------------------------------------------------------------


def repair_bay_pieces():
    """Two welding arms hanging from the arch, a lamp between them and tool racks on the back wall."""
    pieces = [
        kit.cylinder('dark-iron', 0.02, 0.35, (0.0, -0.1, 2.5), 'Z'),
        kit.frustum('dark-iron', 0.18, 0.06, 0.14, (0.0, -0.1, 2.27)),
        kit.cylinder('lamp-glow', 0.1, 0.08, (0.0, -0.1, 2.18), 'Z'),
        kit.box('gunmetal', (1.5, 0.12, 0.12), (0.0, -0.35, 2.55)),
    ]
    racks = kit.stepped(-0.7, -0.3, 0.1) + kit.stepped(0.3, 0.7, 0.1)
    pieces += [kit.box('gunmetal', (0.05, 0.06, 0.32), (x, BACK_Y - 0.17, 1.65)) for x in racks]
    pieces += [kit.box('brass', (0.6, 0.05, 0.04), (x, BACK_Y - 0.15, 1.85)) for x in (-0.5, 0.5)]
    for shoulder, elbow, tip in WELD_ARMS:
        pieces += weld_arm(shoulder, elbow, tip)
    return pieces


def weld_arm(shoulder, elbow, tip):
    """Two gunmetal links with brass knuckles and a hose, ending in a torch nozzle."""
    pieces = [
        kit.cylinder('brass', 0.09, 0.2, (shoulder[0], -0.4, shoulder[1]), 'Y'),
        kit.cylinder('brass', 0.07, 0.2, (elbow[0], -0.45, elbow[1]), 'Y'),
        link('bronze', shoulder, elbow, 0.1, y=-0.42),
        link('brass', elbow, tip, 0.075, y=-0.46),
        link('copper', (shoulder[0] + 0.08, shoulder[1]), (elbow[0] + 0.07, elbow[1]), 0.025, y=-0.5),
    ]
    reach = math.atan2(tip[1] - elbow[1], tip[0] - elbow[0])
    nozzle = (tip[0] - 0.05 * math.cos(reach), tip[1] - 0.05 * math.sin(reach))
    pieces.append(kit.box('brass', (0.12, 0.08, 0.05), (nozzle[0], -0.47, nozzle[1]), turn_y=-reach))
    return pieces


def link(material, start, end, thickness, y):
    """A bar from `start` to `end` in the XZ plane."""
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = math.hypot(end[0] - start[0], end[1] - start[1])
    centre = ((start[0] + end[0]) / 2, y, (start[1] + end[1]) / 2)
    return kit.box(material, (length, thickness, thickness), centre, turn_y=-angle)


# --- the right bay: selling -----------------------------------------------------------------------


def sell_bay_pieces():
    """The ore hopper over the assay scales, on the exchange counter with its lit teller's window."""
    return hopper_pieces() + counter_pieces() + scale_pieces()


def hopper_pieces():
    mouth = HOPPER_MOUTH_Z
    depth = 0.5
    pieces = [
        kit.frustum('copper', HOPPER_HALF, 0.1, depth, (HOPPER_X, -0.3, mouth - depth / 2)),
        kit.box('brass', (2 * HOPPER_HALF + 0.1, 0.62, 0.06), (HOPPER_X, -0.3, mouth)),
        kit.cylinder('brass', 0.06, 0.12, (HOPPER_X, -0.3, mouth - depth - 0.05), 'Z'),
        kit.box('dark-iron', (0.06, 0.06, 0.5), (HOPPER_X - HOPPER_HALF, -0.3, mouth + 0.25)),
        kit.box('dark-iron', (0.06, 0.06, 0.5), (HOPPER_X + HOPPER_HALF, -0.3, mouth + 0.25)),
    ]
    rng = random.Random(398)
    for _ in range(9):
        x = HOPPER_X + rng.uniform(-HOPPER_HALF + 0.08, HOPPER_HALF - 0.08)
        pieces.append(ore_chunk(rng, (x, -0.62, mouth + rng.uniform(0.0, 0.07)), 0.07))
    return pieces


def counter_pieces():
    left, right = 1.22, 2.68
    middle = (left + right) / 2
    pieces = [
        kit.box('bronze', (right - left, 0.5, COUNTER_TOP - 0.2), (middle, -0.05, 0.2 + (COUNTER_TOP - 0.2) / 2)),
        kit.box('brass', (right - left + 0.08, 0.56, 0.06), (middle, -0.05, COUNTER_TOP)),
        kit.box('window-glow', (0.5, 0.06, 0.4), (2.38, -0.32, 0.58)),
        kit.cylinder('window-glow', 0.25, 0.06, (2.38, -0.32, 0.78), 'Y'),
        kit.box('brass', (0.04, 0.08, 0.6), (2.38, -0.34, 0.62)),
        kit.box('brass', (0.6, 0.08, 0.04), (2.38, -0.34, 0.38)),
    ]
    pieces += [kit.rivet((x, -0.32, z)) for x in (left + 0.08, right - 0.08) for z in (0.32, 0.88)]
    return pieces


def scale_pieces():
    """The assay balance on the counter; its left pan sits under the hopper's spout."""
    post_x, beam_z = 2.42, 1.52
    pieces = [
        kit.box('dark-iron', (0.2, 0.2, 0.06), (post_x, -0.42, COUNTER_TOP + 0.04)),
        kit.cylinder('brass', 0.03, beam_z - COUNTER_TOP, (post_x, -0.42, (COUNTER_TOP + beam_z) / 2), 'Z'),
        kit.box('brass', (0.5, 0.04, 0.04), (post_x, -0.46, beam_z)),
        kit.sphere('brass', 0.05, (post_x, -0.47, beam_z)),
    ]
    for pan_x in (post_x - 0.22, post_x + 0.22):
        pieces += [
            kit.cylinder('brass', 0.008, 0.3, (pan_x - 0.06, -0.46, beam_z - 0.15), 'Z'),
            kit.cylinder('brass', 0.008, 0.3, (pan_x + 0.06, -0.46, beam_z - 0.15), 'Z'),
            kit.cylinder('brass', 0.08, 0.025, (pan_x, -0.46, beam_z - 0.3), 'Z'),
        ]
    return pieces


def conveyor_frame_pieces():
    """The belt bed, its end drums and front rail, a stand to the plinth and the intake hood."""
    angle = belt_angle()
    length = belt_length()
    mid = belt_point(0.5, BELT_Y + 0.08)
    pieces = [
        kit.box('belt', (length + 0.1, 0.22, 0.07), mid, turn_y=-angle),
        kit.box('brass', (length + 0.1, 0.03, 0.05), offset_from_belt(0.5, -0.07, BELT_Y - 0.1), turn_y=-angle),
        kit.box('dark-iron', (length, 0.03, 0.06), offset_from_belt(0.5, -0.12, BELT_Y - 0.08), turn_y=-angle),
    ]
    for share in (0.0, 1.0):
        x, _, z = belt_point(share, 0.0)
        pieces += [
            kit.cylinder('brass', 0.07, 0.26, (x, BELT_Y + 0.08, z - 0.02), 'Y'),
            kit.cylinder('dark-iron', 0.03, 0.28, (x, BELT_Y + 0.08, z - 0.02), 'Y'),
        ]
    for share in (0.15, 0.6):
        x, _, z = belt_point(share, 0.0)
        pieces.append(kit.box('iron', (0.05, 0.05, z - 0.2), (x, BELT_Y + 0.1, 0.2 + (z - 0.2) / 2)))
    x, _, z = belt_point(0.0, 0.0)
    pieces += [
        kit.box('copper', (0.32, 0.26, 0.2), (x - 0.06, BELT_Y - 0.02, z - 0.08)),
        kit.box('brass', (0.36, 0.28, 0.04), (x - 0.06, BELT_Y - 0.04, z + 0.03)),
    ]
    return pieces


def conveyor_load_pieces():
    """Cleats and ore riding the belt, one chunk and one cleat per pitch; the code slides them a pitch."""
    angle = belt_angle()
    rng = random.Random(1398)
    pieces = []
    for along in kit.stepped(0.1, belt_length() - 0.25, CONVEYOR_PITCH):
        share = along / belt_length()
        cleat = offset_from_belt(share, 0.045, BELT_Y - 0.02)
        pieces.append(kit.box('gunmetal', (0.02, 0.2, 0.05), cleat, turn_y=-angle))
        chunk = offset_from_belt(share + CONVEYOR_PITCH / 2 / belt_length(), 0.08, BELT_Y - 0.06)
        pieces.append(ore_chunk(rng, chunk, 0.055))
    return pieces


def ore_chunk(rng, centre, size):
    """A rough lump of rock, a third of them glinting copper, silver or gold."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=centre)
    piece = bpy.context.view_layer.objects.active
    for vertex in piece.data.vertices:
        vertex.co *= rng.uniform(0.75, 1.2)
    material = rng.choice(('ore-rock', 'ore-rock', 'ore-copper', 'ore-rock', 'ore-silver', 'ore-gold'))
    return kit.finish_piece(material, scale=(1.0, 0.8, rng.uniform(0.75, 1.0)))


def belt_angle():
    return math.atan2(BELT_HIGH[1] - BELT_LOW[1], BELT_HIGH[0] - BELT_LOW[0])


def belt_length():
    return math.hypot(BELT_HIGH[0] - BELT_LOW[0], BELT_HIGH[1] - BELT_LOW[1])


def belt_point(share, y):
    """A point `share` of the way up the belt's top line."""
    return (BELT_LOW[0] + (BELT_HIGH[0] - BELT_LOW[0]) * share, y,
            BELT_LOW[1] + (BELT_HIGH[1] - BELT_LOW[1]) * share)


def offset_from_belt(share, normal_offset, y):
    """`belt_point`, moved `normal_offset` m off the belt along its upward normal."""
    angle = belt_angle()
    x, _, z = belt_point(share, y)
    return (x - normal_offset * math.sin(angle), y, z + normal_offset * math.cos(angle))


# --- the roof -------------------------------------------------------------------------------------


def roof_pieces():
    """A brass boiler on the middle roof with its pressure dome, a big cog in front, pipes and gauges."""
    tank_z = FACADE_TOP + 0.45
    pieces = [
        kit.cylinder('brass', 0.42, 1.2, (-0.15, -0.1, tank_z), 'X'),
        kit.sphere('brass', 0.42, (-0.75, -0.1, tank_z)),
        kit.sphere('brass', 0.42, (0.45, -0.1, tank_z)),
        kit.sphere('copper', 0.22, (-0.2, -0.1, tank_z + 0.42)),
        kit.box('dark-iron', (1.9, 0.6, 0.12), (-0.25, -0.1, FACADE_TOP + 0.06)),
        kit.cylinder('copper', 0.05, 0.9, (-0.85, -0.55, tank_z + 0.55), 'Z'),
        kit.cylinder('copper', 0.05, 0.75, (-0.48, -0.55, tank_z + 1.0), 'X'),
    ]
    pieces += [band_round_x('dark-iron', 0.43, 0.025, (x, -0.1, tank_z)) for x in (-0.6, -0.15, 0.3)]
    pieces += cog((0.15, -0.62, FACADE_TOP + 0.5), 0.42, teeth=12)
    pieces += cog((-0.55, -0.6, FACADE_TOP + 0.3), 0.22, teeth=8)
    pieces += gauge((-0.95, -0.6, FACADE_TOP + 0.62), 0.11, needle_turn=0.3)
    return pieces


def cog(centre, radius, teeth):
    x, y, z = centre
    pieces = [
        kit.cylinder('brass', radius, 0.08, centre, 'Y'),
        kit.cylinder('dark-iron', radius * 0.3, 0.12, (x, y - 0.02, z), 'Y'),
        kit.torus('bronze', radius * 0.65, radius * 0.06, (x, y - 0.04, z)),
    ]
    for tooth in range(teeth):
        angle = tooth * 2 * math.pi / teeth
        pieces.append(kit.box('brass', (radius * 0.24, 0.08, radius * 0.2),
                              (x + radius * math.cos(angle), y, z + radius * math.sin(angle)), turn_y=-angle))
    for spoke in range(4):
        angle = spoke * math.pi / 4
        pieces.append(kit.box('bronze', (radius * 1.3, 0.04, radius * 0.1), (x, y - 0.045, z), turn_y=-angle))
    return pieces


def stack_pieces():
    """The tall smokestack (its top is `sell.stack`, where the sale's coins burst) and a shorter one."""
    pieces = []
    for x, top, radius in ((STACK_X, STACK_TOP, 0.22), (-0.62, 7.25, 0.16)):
        bottom = FACADE_TOP + 0.1
        pieces += [
            kit.cylinder('soot', radius, top - bottom, (x, 0.15, (bottom + top) / 2), 'Z'),
            kit.cylinder('dark-iron', radius * 1.4, 0.5, (x, 0.15, bottom + 0.25), 'Z'),
            kit.cylinder('brass', radius * 1.25, 0.1, (x, 0.15, top - 0.05), 'Z'),
            kit.cylinder('dark-iron', radius * 1.15, 0.16, (x, 0.15, top - 0.18), 'Z'),
        ]
        pieces += [kit.cylinder('brass', radius * 1.12, 0.06, (x, 0.15, z), 'Z')
                   for z in kit.stepped(bottom + 0.9, top - 0.6, 0.8)]
    return pieces


def right_block_pieces():
    """The raised assay house over the selling bay: riveted plates, the bay's emblem and an ore window."""
    left, right = RIGHT_BLOCK
    middle = (left + right) / 2
    height = RIGHT_BLOCK_TOP - FACADE_TOP
    pieces = [
        kit.box('facade-iron', (right - left, 1.0, height), (middle, -0.2, FACADE_TOP + height / 2)),
        kit.box('facade-plate', (right - left - 0.2, 0.04, height - 0.25), (middle, -0.72, FACADE_TOP + height / 2)),
        kit.box('brass', (right - left + 0.08, 1.06, 0.08), (middle, -0.2, FACADE_TOP + 0.55)),
        kit.box('dark-iron', (right - left + 0.1, 1.2, 0.14), (middle - 0.05, -0.2, RIGHT_BLOCK_TOP - 0.07)),
        kit.box('brass', (right - left + 0.06, 1.1, 0.06), (middle - 0.03, -0.2, RIGHT_BLOCK_TOP - 0.17)),
        kit.box('window-glow', (0.42, 0.05, 0.34), (2.55, -0.75, FACADE_TOP + 0.95)),
        kit.box('brass', (0.5, 0.04, 0.42), (2.55, -0.74, FACADE_TOP + 0.95)),
    ]
    pieces += kit.rivet_frame(middle, FACADE_TOP + height / 2, right - left - 0.2, height - 0.25, y=-0.75)
    pieces += emblem_plaque((1.55, -0.76, FACADE_TOP + 0.95), 0.36)
    return pieces


def emblem_plaque(centre, radius):
    """The Sell bay's #158 emblem (scale and coin), extruded in brass on a soot plaque, as on #174's signs."""
    x, y, z = centre
    return [
        kit.cylinder('brass', radius + 0.05, 0.06, (x, y + 0.02, z), 'Y'),
        kit.cylinder('soot', radius, 0.08, (x, y, z), 'Y'),
        emblem_glyph((x, y - 0.05, z), 2 * radius * 0.78),
    ]


def emblem_glyph(centre, size):
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=ICON_PATH)
    curves = [obj for obj in bpy.data.objects if obj not in before]
    filled = [obj for obj in curves if obj.dimensions.x > 0 and obj.dimensions.y > 0]
    for stray in (obj for obj in curves if obj not in filled):
        bpy.data.objects.remove(stray, do_unlink=True)
    for curve in filled:
        curve.data.extrude = 0.0002
        curve.data.fill_mode = 'BOTH'
    bpy.ops.object.select_all(action='DESELECT')
    for curve in filled:
        curve.select_set(True)
    bpy.context.view_layer.objects.active = filled[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    glyph = bpy.context.view_layer.objects.active
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    scale = size / max(glyph.dimensions.x, glyph.dimensions.y)
    glyph.scale = (scale, scale, scale)
    glyph.rotation_euler = (math.pi / 2, 0.0, 0.0)
    glyph.location = centre
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    remove_import_collection()
    glyph.data.materials.clear()
    glyph.data.materials.append(kit.material_of('brass'))
    return glyph


def remove_import_collection():
    collection = bpy.data.collections.get(os.path.basename(ICON_PATH))
    if collection is None:
        return
    for obj in list(collection.objects):
        bpy.context.scene.collection.objects.link(obj)
        collection.objects.unlink(obj)
    bpy.data.collections.remove(collection)


# --- the moving parts -----------------------------------------------------------------------------


def roof_arc_pieces():
    """Lightning leaping sphere to sphere over the left roof, with short forks off each sphere."""
    rng = random.Random(3981)
    y = -0.95
    left, right = (COIL_XS[0] + 0.2, COIL_SPHERE_Z), (COIL_XS[1] - 0.2, COIL_SPHERE_Z)
    pieces = bolt(rng, left, right, y, jag=0.16, thickness=0.045)
    pieces += bolt(rng, (left[0] + 0.25, left[1] + 0.05), (left[0] + 0.55, left[1] + 0.42), y, jag=0.07, thickness=0.03)
    pieces += bolt(rng, (right[0] - 0.3, right[1] - 0.04), (right[0] - 0.6, right[1] - 0.36), y, jag=0.06,
                   thickness=0.028)
    pieces += bolt(rng, (COIL_XS[0] - 0.18, COIL_SPHERE_Z + 0.1), (COIL_XS[0] - 0.42, COIL_SPHERE_Z + 0.48), y,
                   jag=0.06, thickness=0.028)
    pieces += bolt(rng, (COIL_XS[1] + 0.18, COIL_SPHERE_Z + 0.1), (COIL_XS[1] + 0.4, COIL_SPHERE_Z + 0.5), y,
                   jag=0.06, thickness=0.028)
    return pieces


def bay_arc_pieces():
    """Lightning between the charging bay's floor coils, forking into the portal behind them."""
    rng = random.Random(3982)
    y = -0.4
    left, right = (FLOOR_COIL_XS[0] + 0.08, FLOOR_COIL_SPHERE_Z), (FLOOR_COIL_XS[1] - 0.08, FLOOR_COIL_SPHERE_Z)
    pieces = bolt(rng, left, right, y, jag=0.1, thickness=0.032)
    pieces += bolt(rng, (CHARGE_BAY[0] - 0.1, FLOOR_COIL_SPHERE_Z + 0.05), (CHARGE_BAY[0] - 0.3, 1.72), y,
                   jag=0.05, thickness=0.022)
    pieces += bolt(rng, (CHARGE_BAY[0] + 0.15, FLOOR_COIL_SPHERE_Z - 0.03), (CHARGE_BAY[0] + 0.35, 1.0), y,
                   jag=0.05, thickness=0.022)
    return pieces


def bolt(rng, start, end, y, jag, thickness):
    """A jagged bolt from `start` to `end` in the XZ plane: segments kinked off the straight line."""
    steps = max(4, int(math.hypot(end[0] - start[0], end[1] - start[1]) / 0.09))
    normal = (-(end[1] - start[1]), end[0] - start[0])
    norm = math.hypot(*normal)
    points = [start]
    for step in range(1, steps):
        share = step / steps
        kink = rng.uniform(-jag, jag) * math.sin(math.pi * share) ** 0.5
        points.append((start[0] + (end[0] - start[0]) * share + kink * normal[0] / norm,
                       start[1] + (end[1] - start[1]) * share + kink * normal[1] / norm))
    points.append(end)
    return [link('arc-glow', a, b, thickness, y) for a, b in zip(points, points[1:])]


def spark_pieces(index, centre):
    """A white-hot star of streaks round a bright core, at the torch tip, and a few falling beads."""
    rng = random.Random(3990 + index)
    x, y, z = centre
    pieces = [kit.sphere('spark-glow', 0.05, centre)]
    for streak in range(11):
        angle = streak * 2 * math.pi / 11 + rng.uniform(-0.2, 0.2)
        length = rng.uniform(0.1, 0.26)
        middle = (x + length / 2 * math.cos(angle), y, z + length / 2 * math.sin(angle))
        pieces.append(kit.box('spark-glow', (length, 0.02, 0.016), middle, turn_y=-angle))
    for _ in range(6):
        pieces.append(kit.sphere('spark-glow', 0.012, (x + rng.uniform(-0.25, 0.25), y, z + rng.uniform(-0.3, 0.05))))
    return pieces


# --- shapes ---------------------------------------------------------------------------------------


def gauge(centre, radius, needle_turn):
    """A brass-bezelled pressure dial with its needle."""
    x, y, z = centre
    return [
        kit.cylinder('brass', radius, 0.05, (x, y + 0.02, z), 'Y'),
        kit.cylinder('dial', radius * 0.8, 0.05, (x, y, z), 'Y'),
        kit.box('needle', (radius * 0.7, 0.02, 0.016),
                (x + radius * 0.3 * math.cos(needle_turn), y - 0.03, z + radius * 0.3 * math.sin(needle_turn)),
                turn_y=-needle_turn),
    ]


def band_round_x(material, major, minor, centre):
    """A ring round a tank lying along X."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=8, location=centre, rotation=(0.0, math.pi / 2, 0.0))
    return kit.finish_piece(material, smooth=True)


def ring(material, major, minor, centre):
    """A ring lying flat (its axis along Z): a coil band, a toroid."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=8, location=centre)
    return kit.finish_piece(material, smooth=True)


def half_annulus(cx, spring_z, inner, outer):
    """The arch band's profile: the outer half circle left to right, then the inner one back."""
    outer_arc = [(cx + outer * math.cos(a), spring_z + outer * math.sin(a)) for a in arc_angles(math.pi, 0.0)]
    inner_arc = [(cx + inner * math.cos(a), spring_z + inner * math.sin(a)) for a in arc_angles(0.0, math.pi)]
    return outer_arc + inner_arc


def spandrel(cx, radius):
    """The wall over an arch: the bay's width up to the facade band, less the half circle of the opening."""
    left, right = cx - radius - ARCH_BAND, cx + radius + ARCH_BAND
    opening = [(cx + radius * math.cos(a), SPRING_Z + radius * math.sin(a)) for a in arc_angles(math.pi, 0.0)]
    return [(left, SPRING_Z)] + opening + [(right, SPRING_Z), (right, 3.05), (left, 3.05)]


def arc_angles(start, stop, count=24):
    return [start + (stop - start) * index / count for index in range(count + 1)]


def arch_point(cx, radius, angle, y):
    return (cx + radius * math.cos(angle), y, SPRING_Z + radius * math.sin(angle))


def prism(material, profile, y_from, y_to):
    """A straight prism along Y from an XZ profile, wound either way."""
    if signed_area(profile) < 0:
        profile = profile[::-1]
    front = [(x, y_from, z) for x, z in profile]
    back = [(x, y_to, z) for x, z in profile]
    count = len(profile)
    faces = [list(range(count))[::-1], [count + i for i in range(count)]]
    faces += [[i, (i + 1) % count, count + (i + 1) % count, count + i] for i in range(count)]
    mesh = bpy.data.meshes.new('prism')
    mesh.from_pydata(front + back, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('prism', mesh)
    bpy.context.scene.collection.objects.link(obj)
    select_only(obj)
    return kit.finish_piece(material, smooth=False)


def signed_area(profile):
    return sum(x0 * z1 - x1 * z0 for (x0, z0), (x1, z1) in zip(profile, profile[1:] + profile[:1])) / 2


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def add_attach_point(attach_id, at_xz, z_order):
    """An `attach.<id>` empty: a named point of the asset frame the export writes, never baked."""
    empty = bpy.data.objects.new(ATTACH_PREFIX + attach_id, None)
    empty.empty_display_type = 'PLAIN_AXES'
    empty.empty_display_size = 0.3
    empty.location = (at_xz[0], -1.2, at_xz[1])
    empty['z'] = z_order
    bpy.context.scene.collection.objects.link(empty)
    return empty


if __name__ == '__main__':
    main()
