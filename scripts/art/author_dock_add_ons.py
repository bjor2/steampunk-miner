"""
Authors the first version of the three in-place dock add-ons' Blender sources (#197a, the #170
amendment "upgrades in place"): the scanner mast up the Assay & Exchange's right flank
(`scanner_station`, P14), the research annex behind the Engineering Works (`research_lab`, P15)
and the drone hangar on the Works' roof (`drone_bay`, P20), from the #174 kit: brass, rusted
iron sheet, rivets, warm glass on the emissive map only.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_dock_add_ons.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for platform-scanner-station, platform-research-lab and
platform-drone-bay. From then on those files are the sources (#52): change the art in Blender
and re-export, rather than editing this script. Nothing here is rigged (#51 acceptance 2).

Conventions are author_shop_buildings.py's: 1 unit = 1 m, game right +X, up +Z, the camera looks
along +Y so details stand out towards -Y. Each add-on is authored in its own frame: its origin is
the point the slice bolts onto its host building (`atM` in
src/features/dock-buildings/dockAddOns.json, metres from the host's origin at the zone centre on
the pad top), so the host frame's coordinates below are only to clear the host's own pieces. Each
add-on is at most two parts (#170 amendment "Parts"): the static shell, named for the asset, and
the one part the code can move (the dish, the orrery, the drone), checked before the file is saved.
Integer `z` custom properties order the parts against the host's: the annex behind the Works'
shell (0), the mast and the hangar over it and over the gantry (1).
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import author_platform as platform  # noqa: E402
import author_shop_buildings as shops  # noqa: E402

MAX_ADD_ON_PARTS = 2
ADD_ON_IDS = ('platform-scanner-station', 'platform-research-lab', 'platform-drone-bay')

# The mast's frame: its foot is the origin, bolted at host (2.4, 5.3) beside the Sell tower's
# right wall (x 1.9), under the funnel's rim (x 2.0 at z 8.6). The wall is 0.5 m left of the foot.
MAST_HEIGHT = 7.0
MAST_WALL_X = shops.SELL_BODY_HALF - 2.4
MAST_BAND_Z = 6.1 - 5.3
MAST_CORNICE_Z = shops.SELL_BODY_TOP + 0.2 - 5.3
DISH_BEARING = (0.0, -0.25, 6.6)
DISH_ELEVATION = math.radians(35)

# The annex's frame: the foot of its block at pad level, host (-2.9, 0), behind the Works' back
# wall (y 1.2) and roof plate (y to 1.7), so it shows above the sawtooth roofline (z 4.1 to 5.5).
ANNEX_FRONT_Y = 2.0
ANNEX_DEPTH_Y = 3.3
ANNEX_WIDTH = 3.4
ANNEX_TOP = 7.2
DOME_CENTRE = (0.0, ANNEX_DEPTH_Y, 7.4)
DOME_RADIUS = 1.1
COLUMN_X = -1.1
ORRERY_AT = (0.0, ANNEX_DEPTH_Y - 0.2, DOME_CENTRE[2] + DOME_RADIUS + 0.65)

# The hangar's frame: the landing deck's top at the origin, host (1.9, 5.6) over the third and
# fourth sawtooth teeth, right of the gantry's reach (x 0.5) and left of the stack (x 3.25).
DECK_SIZE = (2.3, 1.6)
DECK_CENTRE_X = 0.05
SHED_CENTRE_X = 0.48
SHED_RADIUS = 0.72
SHED_WALL_TOP = 0.95
SHED_DEPTH = 1.5
LANDING_X = -0.6
DRONE_AT = (LANDING_X, 0.3, 0.75)


def main():
    for asset_id in requested_asset_ids():
        AUTHORS[asset_id]()


def requested_asset_ids():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return requested or list(AUTHORS)


# --- the scanner mast (Assay & Exchange) ---------------------------------------------------------


def author_scanner_station():
    platform.reset_scene()
    platform.build_part('platform-scanner-station', mast_pieces(), at=(0.0, 0.0, 0.0), z_order=1)
    platform.build_part('scanner-dish', dish_pieces(), at=DISH_BEARING, z_order=2)
    save_add_on('platform-scanner-station')


def mast_pieces():
    return (mast_foot_pieces() + mast_bracket_pieces() + mast_lattice_pieces()
            + crows_nest_pieces() + mast_lantern_pieces())


def mast_lantern_pieces():
    """A lantern on an arm off the mast, lighting the crow's nest ladder."""
    return [platform.box('dark-iron', (0.36, 0.06, 0.06), (0.24, -0.3, 5.62))] + shops.lantern((0.42, -0.3, 5.3))


def mast_foot_pieces():
    return [
        platform.box('dark-iron', (0.5, 0.5, 0.12), (0.0, -0.05, 0.06)),
        platform.box('brass', (0.4, 0.4, 0.04), (0.0, -0.05, 0.14)),
    ]


def mast_bracket_pieces():
    """Two brass arms into the tower's wall at the foot and the band, and a strut off the cornice."""
    arm_x = MAST_WALL_X / 2
    strut_from, strut_to = (MAST_WALL_X + 0.1, MAST_CORNICE_Z), (-0.12, 2.3)
    turn = math.atan2(strut_to[1] - strut_from[1], strut_to[0] - strut_from[0])
    length = math.hypot(strut_to[0] - strut_from[0], strut_to[1] - strut_from[1])
    pieces = [
        platform.box('brass', (MAST_WALL_X * -1 + 0.1, 0.3, 0.12), (arm_x, -0.05, 0.08)),
        platform.box('brass', (MAST_WALL_X * -1 + 0.1, 0.3, 0.12), (arm_x, -0.05, MAST_BAND_Z)),
        platform.box('gunmetal', (length, 0.1, 0.08),
                     ((strut_from[0] + strut_to[0]) / 2, -0.05, (strut_from[1] + strut_to[1]) / 2),
                     turn_y=-turn),
    ]
    pieces += [platform.rivet((x, -0.21, z)) for x in (MAST_WALL_X + 0.08, -0.18) for z in (0.08, MAST_BAND_Z)]
    return pieces


def mast_lattice_pieces():
    """Four gunmetal rails with zigzag braces between the front pair, banded in brass."""
    pieces = [platform.cylinder('gunmetal', 0.05, MAST_HEIGHT, (x, y, MAST_HEIGHT / 2), 'Z')
              for x in (-0.12, 0.12) for y in (-0.1, 0.15)]
    for index, z in enumerate(platform.stepped(0.4, MAST_HEIGHT - 0.6, 0.45)):
        turn = math.radians(40 if index % 2 == 0 else -40)
        pieces.append(platform.box('gunmetal', (0.32, 0.04, 0.04), (0.0, -0.1, z), turn_y=turn))
    pieces += [platform.cylinder('brass', 0.19, 0.08, (0.0, 0.02, z), 'Z') for z in (1.5, 3.0, 4.5, 6.0)]
    pieces += [
        platform.cylinder('brass', 0.1, 0.3, (0.0, 0.02, MAST_HEIGHT + 0.1), 'Z'),
        platform.sphere('brass', 0.08, (0.0, 0.02, MAST_HEIGHT + 0.3)),
    ]
    return pieces


def crows_nest_pieces():
    """The platform the dish bearing stands on, railed in brass."""
    pieces = [
        platform.cylinder('dark-iron', 0.45, 0.08, (0.0, 0.02, 6.2), 'Z'),
        shops.ring('brass', 0.42, 0.02, (0.0, 0.02, 6.55)),
    ]
    pieces += [platform.cylinder('brass', 0.02, 0.35, (0.42 * math.cos(a), 0.02 + 0.42 * math.sin(a), 6.4), 'Z')
               for a in (math.radians(d) for d in (0, 60, 120, 180, 240, 300))]
    return pieces


def dish_pieces():
    """The dish on its bearing, in profile, pointed up and right; its pivot is the bearing."""
    axis = (math.cos(DISH_ELEVATION), math.sin(DISH_ELEVATION))
    along = lambda d, y=0.0: (axis[0] * d, y, axis[1] * d)  # noqa: E731
    tilt = (0.0, math.pi / 2 - DISH_ELEVATION, 0.0)
    pieces = [
        platform.cylinder('brass', 0.14, 0.3, (0.0, 0.0, 0.0), 'Y'),
        platform.cylinder('dark-iron', 0.07, 0.36, (0.0, 0.0, 0.0), 'Y'),
        platform.box('gunmetal', (0.55, 0.12, 0.12), along(0.28), turn_y=-DISH_ELEVATION),
        tilted_cone('iron-plate', 0.12, 0.8, 0.35, along(0.62), tilt),
        tilted_torus('brass', 0.8, 0.03, along(0.8), tilt),
        platform.cylinder('gunmetal', 0.03, 0.75, along(1.15), 'Z'),
        platform.box('dark-iron', (0.1, 0.1, 0.1), along(1.5)),
        platform.sphere('lamp-glow', 0.07, along(1.58)),
        platform.box('dark-iron', (0.3, 0.2, 0.2), along(-0.35)),
    ]
    feed = pieces[5]
    feed.rotation_euler = tilt
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return pieces


# --- the research annex (behind the Engineering Works) ---------------------------------------


def author_research_lab():
    platform.reset_scene()
    platform.build_part('platform-research-lab', annex_pieces(), at=(0.0, 0.0, 0.0), z_order=-2)
    platform.build_part('lab-orrery', orrery_pieces(), at=ORRERY_AT, z_order=-1)
    save_add_on('platform-research-lab')


def annex_pieces():
    return (annex_block_pieces() + annex_face_pieces() + dome_pieces() + condenser_pieces()
            + annex_stack_pieces() + shops.lantern((1.45, ANNEX_FRONT_Y - 0.15, 6.5)))


def annex_block_pieces():
    """A riveted iron block, brass-banded, sunk a little into the pad so its foot is inside it."""
    body = ANNEX_TOP - 0.3
    pieces = [
        platform.box('dark-iron', (ANNEX_WIDTH + 0.2, 2.6, 0.4), (0.0, ANNEX_DEPTH_Y, 0.1)),
        platform.box('iron', (ANNEX_WIDTH, 2.4, body), (0.0, ANNEX_DEPTH_Y, 0.3 + body / 2)),
        platform.box('brass', (ANNEX_WIDTH + 0.1, 2.5, 0.12), (0.0, ANNEX_DEPTH_Y, 4.6)),
        platform.box('dark-iron', (ANNEX_WIDTH + 0.3, 2.7, 0.2), (0.0, ANNEX_DEPTH_Y, ANNEX_TOP + 0.1)),
    ]
    return pieces


def annex_face_pieces():
    """Above the Works' roofline: two tall arched windows in riveted plates and a brass nameplate."""
    face = ANNEX_FRONT_Y - 0.02
    pieces = []
    for x in (-0.85, 0.85):
        pieces.append(platform.box('iron-plate', (1.4, 0.05, 1.7), (x, face, 5.9)))
        pieces += platform.rivet_frame(x, 5.9, 1.4, 1.7, y=face - 0.03)
        pieces += shops.arched_window((x, face - 0.01, 5.75), width=0.6, height=1.2)
    pieces += [
        platform.box('brass', (0.9, 0.06, 0.26), (0.0, face - 0.01, 6.75)),
        platform.box('enamel', (0.78, 0.08, 0.16), (0.0, face - 0.02, 6.75)),
        platform.cylinder('brass', 0.2, 0.08, (0.0, face - 0.02, 5.6), 'Y'),
        platform.cylinder('window-glow', 0.14, 0.1, (0.0, face - 0.03, 5.6), 'Y'),
    ]
    pieces += platform.rivet_row(-1.5, 1.5, 0.5, y=face - 0.03, z=4.6)
    return pieces


def dome_pieces():
    """The observatory dome: glazing on a brass drum, ribbed in brass."""
    x, y, z = DOME_CENTRE
    pieces = [
        platform.cylinder('brass', DOME_RADIUS + 0.05, 0.3, (x, y, z - 0.05), 'Z'),
        platform.sphere('glazing', DOME_RADIUS, (x, y, z)),
        shops.ring('brass', DOME_RADIUS, 0.04, (x, y, z + 0.1)),
        shops.ring('brass', DOME_RADIUS * 0.72, 0.03, (x, y, z + DOME_RADIUS * 0.68)),
        platform.cylinder('brass', 0.08, 0.3, (x, y, z + DOME_RADIUS + 0.1), 'Z'),
    ]
    for turn in (0.0, math.pi / 3, 2 * math.pi / 3):
        pieces.append(tilted_torus('brass', DOME_RADIUS, 0.03, (x, y, z), (math.pi / 2, 0.0, turn)))
    return pieces


def condenser_pieces():
    """A glass condenser column, banded in brass, capped in copper and piped into the dome."""
    x, y = COLUMN_X, ANNEX_DEPTH_Y - 0.7
    top = ANNEX_TOP + 2.0
    pieces = [
        platform.cylinder('glazing', 0.3, 2.0, (x, y, ANNEX_TOP + 1.0), 'Z'),
        platform.cylinder('window-glow', 0.2, 1.2, (x, y, ANNEX_TOP + 0.8), 'Z'),
        platform.cylinder('dark-iron', 0.38, 0.2, (x, y, ANNEX_TOP + 0.1), 'Z'),
        shops.funnel('copper', 0.12, 0.36, 0.35, (x, y, top + 0.17)),
        platform.cylinder('copper', 0.06, 0.95, (x + 0.47, y, top + 0.3), 'X'),
        platform.cylinder('copper', 0.06, 1.1, (x + 0.95, y, top - 0.25), 'Z'),
    ]
    pieces += [platform.cylinder('brass', 0.34, 0.08, (x, y, z), 'Z') for z in (ANNEX_TOP + 0.3, ANNEX_TOP + 1.0, ANNEX_TOP + 1.7)]
    return pieces


def annex_stack_pieces():
    x, y = 1.25, ANNEX_DEPTH_Y + 0.4
    return [
        platform.cylinder('soot', 0.2, 1.5, (x, y, ANNEX_TOP + 0.75), 'Z'),
        platform.cylinder('brass', 0.24, 0.08, (x, y, ANNEX_TOP + 1.45), 'Z'),
        platform.cylinder('dark-iron', 0.3, 0.3, (x, y, ANNEX_TOP + 0.15), 'Z'),
    ]


def orrery_pieces():
    """An armillary sphere on the dome's finial: brass rings round a copper sun; pivot at its centre."""
    pieces = [
        platform.cylinder('brass', 0.04, 0.45, (0.0, 0.0, -0.5), 'Z'),
        platform.torus('brass', 0.35, 0.025, (0.0, 0.0, 0.0)),
        tilted_torus('brass', 0.33, 0.02, (0.0, 0.0, 0.0), (math.pi / 2, 0.0, math.pi / 3)),
        shops.ring('brass', 0.3, 0.02, (0.0, 0.0, 0.0)),
        platform.sphere('copper', 0.08, (0.0, 0.0, 0.0)),
        platform.sphere('brass', 0.04, (0.33 * math.cos(0.9), 0.0, 0.33 * math.sin(0.9))),
    ]
    return pieces


# --- the drone hangar (on the Engineering Works' roof) ---------------------------------------


def author_drone_bay():
    platform.reset_scene()
    platform.build_part('platform-drone-bay', hangar_pieces(), at=(0.0, 0.0, 0.0), z_order=2)
    platform.build_part('hangar-drone', drone_pieces(), at=DRONE_AT, z_order=3)
    save_add_on('platform-drone-bay')


def hangar_pieces():
    return deck_pieces() + stilt_pieces() + shed_pieces() + landing_pieces()


def deck_pieces():
    width, depth = DECK_SIZE
    pieces = [
        platform.box('dark-iron', (width, depth, 0.12), (DECK_CENTRE_X, 0.4, -0.06)),
        platform.box('brass', (width, 0.06, 0.04), (DECK_CENTRE_X, -0.4, -0.02)),
    ]
    pieces += platform.rivet_row(-1.0, 1.1, 0.3, y=-0.44, z=-0.06)
    return pieces


def stilt_pieces():
    """Short legs down to the sawtooth slope under each corner of the deck, cross-braced."""
    bottoms = {-0.9: -0.93, -0.1: -0.49, 0.7: -1.42, 1.1: -1.2}
    pieces = []
    for x, bottom in bottoms.items():
        for y in (-0.25, 1.05):
            pieces.append(platform.cylinder('dark-iron', 0.05, -bottom - 0.1, (x, y, (bottom - 0.1) / 2), 'Z'))
    pieces += [
        platform.box('gunmetal', (0.9, 0.04, 0.04), (-0.5, -0.25, -0.5), turn_y=math.radians(-28)),
        platform.box('gunmetal', (0.6, 0.04, 0.04), (0.9, -0.25, -0.9), turn_y=math.radians(30)),
    ]
    return pieces


def shed_pieces():
    """An arched iron shed open to the camera: a matte soot mouth under a lit lintel, rimmed in brass."""
    x, r = SHED_CENTRE_X, SHED_RADIUS
    front = -0.3
    pieces = [
        platform.box('iron', (2 * r, SHED_DEPTH, SHED_WALL_TOP), (x, 0.45, SHED_WALL_TOP / 2)),
        platform.cylinder('iron', r, SHED_DEPTH, (x, 0.45, SHED_WALL_TOP), 'Y'),
        platform.box('soot', (2 * r - 0.2, 0.1, SHED_WALL_TOP - 0.1), (x, front - 0.03, SHED_WALL_TOP / 2)),
        platform.cylinder('soot', r - 0.1, 0.1, (x, front - 0.03, SHED_WALL_TOP), 'Y'),
        platform.torus('brass', r, 0.04, (x, front - 0.02, SHED_WALL_TOP)),
        platform.box('brass', (0.06, 0.1, SHED_WALL_TOP), (x - r, front - 0.02, SHED_WALL_TOP / 2)),
        platform.box('brass', (0.06, 0.1, SHED_WALL_TOP), (x + r, front - 0.02, SHED_WALL_TOP / 2)),
        platform.box('lamp-glow', (0.5, 0.05, 0.08), (x, front - 0.06, SHED_WALL_TOP + 0.35)),
        platform.box('brass', (0.1, SHED_DEPTH, 0.06), (x, 0.45, SHED_WALL_TOP + r)),
        platform.cylinder('gunmetal', 0.03, 0.8, (x + 0.5, 0.3, SHED_WALL_TOP + r + 0.1), 'Z'),
        platform.sphere('window-glow', 0.07, (x + 0.5, 0.3, SHED_WALL_TOP + r + 0.55)),
    ]
    pieces += [platform.rivet((x + r + 0.06, -0.21, z)) for z in platform.stepped(0.2, 0.8, 0.3)]
    pieces += [platform.rivet((x - r - 0.06, -0.21, z)) for z in platform.stepped(0.2, 0.8, 0.3)]
    return pieces


def landing_pieces():
    """The landing ring on the deck's left and a brass rail along its front edge."""
    pieces = [shops.ring('brass', 0.3, 0.02, (LANDING_X, 0.4, 0.02)),
              platform.box('brass', (0.8, 0.03, 0.03), (-0.7, -0.38, 0.45))]
    pieces += [platform.cylinder('brass', 0.02, 0.45, (x, -0.38, 0.225), 'Z') for x in (-1.05, -0.7, -0.35)]
    return pieces


def drone_pieces():
    """A hauler drone: a small gas bag with a brass gondola, a stern screw and a hook; pivot at its centre."""
    pieces = [
        spheroid('iron-plate', (0.57, 0.3, 0.3), (0.0, 0.0, 0.12)),
        tilted_torus('brass', 0.3, 0.02, (0.0, 0.0, 0.12), (0.0, math.pi / 2, 0.0)),
        platform.box('enamel', (0.16, 0.02, 0.22), (-0.5, 0.0, 0.16)),
        platform.box('enamel', (0.16, 0.22, 0.02), (-0.5, 0.0, 0.16)),
        platform.cylinder('gunmetal', 0.1, 0.02, (-0.62, 0.0, 0.08), 'X'),
        platform.box('brass', (0.3, 0.14, 0.12), (0.0, 0.0, -0.18)),
        platform.sphere('lamp-glow', 0.04, (0.17, -0.04, -0.18)),
        platform.cylinder('dark-iron', 0.012, 0.2, (0.0, 0.0, -0.34), 'Z'),
        platform.torus('brass', 0.05, 0.012, (0.0, -0.01, -0.48)),
    ]
    pieces += [platform.cylinder('dark-iron', 0.01, 0.12, (x, 0.0, -0.06), 'Z') for x in (-0.1, 0.1)]
    return pieces


# --- kit additions ------------------------------------------------------------------------------


def tilted_cone(material, bottom_radius, top_radius, height, centre, rotation):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=bottom_radius, radius2=top_radius,
                                    depth=height, location=centre, rotation=rotation)
    return platform.finish_piece(material, smooth=True)


def tilted_torus(material, major, minor, centre, rotation):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48,
                                     minor_segments=10, location=centre, rotation=rotation)
    return platform.finish_piece(material, smooth=True)


def spheroid(material, radii, centre):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0, location=centre)
    return platform.finish_piece(material, scale=radii, smooth=True)


# --- the two-part check -------------------------------------------------------------------------


def save_add_on(asset_id):
    problems = add_on_problems(asset_id)
    if problems:
        raise SystemExit('refused ' + asset_id + ': ' + '; '.join(problems))
    platform.save_as(asset_id)


def add_on_problems(asset_id):
    """At most two parts, the shell named for the asset, every pivot inside its part (#170, #52)."""
    parts = sorted((obj for obj in bpy.context.scene.objects if obj.type == 'MESH'), key=lambda o: o.name)
    problems = []
    if len(parts) > MAX_ADD_ON_PARTS:
        problems.append('%d parts, the add-on cap is %d' % (len(parts), MAX_ADD_ON_PARTS))
    if asset_id not in [part.name for part in parts]:
        problems.append('no shell part named ' + asset_id)
    problems += ['part "%s" has its origin outside its bounds' % part.name
                 for part in parts if not is_origin_inside(part)]
    return problems


def is_origin_inside(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    corners = [evaluated.matrix_world @ vertex.co for vertex in evaluated.to_mesh().vertices]
    evaluated.to_mesh_clear()
    origin = obj.matrix_world.translation
    return (min(c.x for c in corners) - 1e-6 <= origin.x <= max(c.x for c in corners) + 1e-6
            and min(c.z for c in corners) - 1e-6 <= origin.z <= max(c.z for c in corners) + 1e-6)


AUTHORS = {
    'platform-scanner-station': author_scanner_station,
    'platform-research-lab': author_research_lab,
    'platform-drone-bay': author_drone_bay,
}

if __name__ == '__main__':
    main()
