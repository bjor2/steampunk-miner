"""
Authors the first version of the casing driller (ticket 393), the player vehicle that replaces the
S7a box-and-wheels machine: a compact riveted bronze pod on three articulated tracked legs, a brass
pressure dome with gauges, a swivelling stepped drill nose on a gimbal, two brass vectored
thrusters under the belly and two rear robotic arms that set the steel casing rings and spray the
cement (the concept reference is casing-driller-ref.jpg beside this file).

    blender -b --factory-startup art/blender/vehicle/vehicle.blend --python-exit-code 1 \
        -P docs/art/casing-driller/author_casing_driller.py

It opens the vehicle's own source, removes every old part mesh and material, keeps the 32
`attach.*` empties where they are (the #162 sockets the slices' gear and the #321/#364 mounts hang
at), and builds the new parts in their place. From then on art/blender/vehicle/vehicle.blend is the
source (#52): change the art in Blender and re-export, rather than editing this script. Nothing is
rigged (#51 acceptance 2); the code turns, lifts and lights the parts (partMotion.ts).

Conventions are author_platform.py's (#52, docs/art-pipeline.md): 1 unit = 1 m, game right +X
(the drill), up +Z, the camera looks along +Y so details stand out towards -Y; dielectric
materials, since the albedo bake reads Cycles' diffuse colour. The part ids and tiers are the
S7a ones (the lint keeps them, and the Workshop milestones swap them), each re-cast:

| Slot            | The casing driller's piece                                                  |
| --------------- | --------------------------------------------------------------------------- |
| `chassis`       | the riveted bronze pod with its steel belly and the three articulated legs  |
| `wheel`         | a tracked roller at the foot of each leg, rolling with the ground speed     |
| `boiler`        | the brass pressure dome with its gauges and viewport, breathing             |
| `stack`         | the rear exhaust stacks                                                     |
| `hopper`        | the ore hatch on the fore deck                                              |
| `motor-housing` | the gimbal's drive rings on the bow                                         |
| `piston`        | the steam ram beside the hatch, pumping with thrust                         |
| `headlamp`      | the warm lamps                                                              |
| `armour-plate`  | the bow and stern shields (tier 2), the belly skirt (tier 3)                |
| `drill-head`    | the gimbal ball and the stepped drill cone, its seams glowing with the load |
| `drill-bit`     | the cutter crown at the tip (tier 1), the reamer ring round the gimbal (3)  |
| `thruster`      | the two vectored brass thrusters, glowing blue-orange while thrusting       |
| `casing-arm`    | the two rear arms: one holds a casing ring, one the cement nozzle           |
"""

import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

import author_platform as kit  # noqa: E402
from author_platform import box, cylinder, finish_piece, stepped  # noqa: E402

ASSET_PATH = os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle', 'vehicle.blend')

# Base colour, roughness, emission strength (author_platform's PALETTE shape).
kit.PALETTE.update({
    'bronze': ((0.44, 0.28, 0.12), 0.4, 0.0),
    'hull-steel': ((0.17, 0.165, 0.16), 0.55, 0.0),
    'rubber': ((0.055, 0.05, 0.045), 0.85, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'needle': ((0.55, 0.08, 0.06), 0.4, 0.0),
    'cement': ((0.55, 0.54, 0.50), 0.8, 0.0),
    'casing-steel': ((0.40, 0.42, 0.45), 0.4, 0.0),
    'lamp-lens': ((1.0, 0.80, 0.45), 0.15, 1.5),
    'nose-glow': ((1.0, 0.48, 0.12), 0.3, 1.6),
    'thrust-core': ((0.55, 0.78, 1.0), 0.2, 2.0),
    'thrust-rim': ((1.0, 0.52, 0.16), 0.3, 1.6),
})

# The platform's 15 mm bevel would round a 3 cm rivet band away; vehicle-scale parts take 4 mm.
BEVEL_M = 0.004
RIVET_M = 0.008

# The hull: a capsule along X, flattened in depth, its axis at z HULL_Z (vehicle frame).
HULL_Z = -0.07
HULL_RADIUS = 0.18
HULL_HALF_LENGTH = 0.26
HULL_DEPTH_SHARE = 0.7
# The three legs end at the S7a wheel hubs, so the rollers roll where the wheels did.
HUB_XS = (-0.32, 0.0, 0.32)
HUB_Z = -0.36
# The drill head sits where DrillHeadView draws it: its centre (collider + head width) / 2 ahead.
COLLIDER_M = 0.9
# Draw order (#52 `z`): rollers and arms behind the pod, the pod, its fittings, armour, the nose.
Z_BEHIND, Z_POD, Z_FITTING, Z_FRONT_FITTING, Z_ARMOUR, Z_BIT_COLLAR, Z_HEAD, Z_BIT = 1, 2, 3, 4, 5, 7, 8, 9


def main():
    clear_old_parts()
    author_tier_1()
    author_tier_2()
    author_tier_3()
    darken_glow_bases()
    for obj in bpy.data.objects:
        bevel = obj.modifiers.get('bevel')
        if bevel is not None:
            bevel.width = BEVEL_M
    bpy.ops.wm.save_as_mainfile(filepath=ASSET_PATH, compress=True)
    print('authored vehicle (casing driller)')


def darken_glow_bases():
    """The thrusters' glow is emission only: at rest the plug and lip read as dark steel."""
    for name in ('thrust-core', 'thrust-rim'):
        material = bpy.data.materials.get(name)
        if material is None:
            continue
        grime = next(node for node in material.node_tree.nodes if node.type == 'MIX')
        grime.inputs['A'].default_value = (0.12, 0.12, 0.13, 1.0)
        grime.inputs['B'].default_value = (0.08, 0.08, 0.085, 1.0)


def clear_old_parts():
    """The S7a machine is retired whole: its meshes and materials go, the attach empties stay."""
    for obj in [obj for obj in bpy.data.objects if obj.type == 'MESH']:
        bpy.data.objects.remove(obj)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for block in [block for block in blocks if block.users == 0]:
            blocks.remove(block)


def author_tier_1():
    part('t1-chassis', 1, chassis_pieces(heavy=False), (0.0, 0.0, HULL_Z), Z_POD)
    for index, hub_x in enumerate(HUB_XS):
        part(repeat_id('t1-wheel', index), 1, roller_pieces(0.12, grousers=False), (hub_x, 0.04, HUB_Z), Z_BEHIND)
    part('t1-boiler', 1, dome_pieces(), (-0.12, 0.0, 0.1), Z_FITTING)
    part('t1-stack', 1, stack_pieces(0.035, 0.24), (-0.38, 0.03, 0.15), Z_BEHIND)
    part('t1-hopper', 1, hatch_pieces(), (0.22, -0.04, 0.1), Z_FITTING)
    part('t1-motor-housing', 1, gimbal_drive_pieces(), (0.34, -0.06, -0.07), Z_FITTING)
    part('t1-piston', 1, ram_pieces(), (0.34, -0.06, 0.17), Z_FRONT_FITTING)
    part('t1-headlamp', 1, lamp_pieces(0.045), (0.41, -0.09, 0.07), Z_FRONT_FITTING)
    part('t1-thruster', 1, thruster_pieces(), (-0.17, -0.1, -0.2), Z_FRONT_FITTING)
    part('t1-thruster-2', 1, thruster_pieces(), (0.17, -0.1, -0.2), Z_FRONT_FITTING)
    part('t1-casing-arm', 1, arm_pieces(ring_tool_pieces, lift=0.07), (-0.36, 0.06, 0.04), Z_BEHIND)
    part('t1-casing-arm-2', 1, arm_pieces(nozzle_tool_pieces, lift=-0.05), (-0.38, 0.06, -0.14), Z_BEHIND)
    head = head_part('t1-drill-head', 1, nose_pieces(0.36, steps=3, glow_bands=1))
    tip_crown('t1-drill-bit', 1, head)


def author_tier_2():
    """Tier 2 (#7): side armour, a bigger drill head and lamp, a second stack."""
    part('t2-armour-plate', 2, shield_pieces(0.1, 0.22, rivets=3), (0.42, -0.14, -0.13), Z_ARMOUR)
    part('t2-armour-plate-2', 2, shield_pieces(0.1, 0.26, rivets=3), (-0.44, -0.12, -0.08), Z_ARMOUR)
    head_part('t2-drill-head', 2, nose_pieces(0.38, steps=3, glow_bands=2))
    part('t2-headlamp', 2, lamp_pieces(0.06), (0.41, -0.09, 0.07), Z_FRONT_FITTING)
    part('t2-stack-2', 2, stack_pieces(0.03, 0.22), (-0.24, 0.05, 0.3), Z_BEHIND)


def author_tier_3():
    """Tier 3 (#7): a heavier hull and rollers, the reamer collar, a second tank and lamp, more armour."""
    part('t3-chassis', 3, chassis_pieces(heavy=True), (0.0, 0.0, HULL_Z), Z_POD)
    for index, hub_x in enumerate(HUB_XS):
        part(repeat_id('t3-wheel', index), 3, roller_pieces(0.13, grousers=True), (hub_x, 0.04, HUB_Z), Z_BEHIND)
    part('t3-armour-plate', 3, shield_pieces(0.11, 0.24, rivets=4), (0.43, -0.14, -0.13), Z_ARMOUR)
    part('t3-armour-plate-2', 3, shield_pieces(0.11, 0.3, rivets=4), (-0.45, -0.12, -0.08), Z_ARMOUR)
    part('t3-armour-plate-3', 3, skirt_pieces(), (0.0, -0.16, -0.22), Z_ARMOUR)
    part('t3-boiler-2', 3, tank_pieces(), (0.23, -0.02, 0.27), Z_FITTING)
    head = head_part('t3-drill-head', 3, nose_pieces(0.42, steps=4, glow_bands=3, fixed_tip=True))
    reamer_collar('t3-drill-bit', 3, head)
    part('t3-headlamp-2', 3, lamp_pieces(0.045), (-0.42, -0.09, 0.07), Z_FRONT_FITTING)
    part('t3-stack', 3, stack_pieces(0.045, 0.28), (-0.38, 0.03, 0.17), Z_BEHIND)
    part('t3-stack-2', 3, stack_pieces(0.04, 0.26), (-0.24, 0.05, 0.32), Z_BEHIND)


def repeat_id(base, index):
    """`t1-wheel`, `t1-wheel-2`, `t1-wheel-3` (#52 repeat suffix)."""
    return base if index == 0 else '%s-%d' % (base, index + 1)


# --- parts ---------------------------------------------------------------------------------------


def part(part_id, tier, pieces, at, z_order):
    built = kit.build_part(part_id, pieces, at, z_order)
    place_in_tier(built, tier)
    return built


def head_part(part_id, tier, pieces):
    """
    The head's origin is its bounds' centre, placed where DrillHeadView draws it facing right:
    (collider + head width) / 2 ahead of the body's centre. Answers the head object.
    """
    head = part(part_id, tier, pieces, (0.0, -0.1, 0.0), Z_HEAD)
    (min_x, min_z), (max_x, max_z) = view_bounds_of(head)
    shift = ((min_x + max_x) / 2, (min_z + max_z) / 2)
    for vertex in head.data.vertices:
        vertex.co.x -= shift[0]
        vertex.co.z -= shift[1]
    head.location = ((COLLIDER_M + max_x - min_x) / 2, -0.1, 0.0)
    return head


def tip_crown(part_id, tier, head):
    """The cutter crown spins at the cone's tip (the bit turns per drilling tick, #48)."""
    (_, _), (max_x, _) = view_bounds_of(head)
    return part(part_id, tier, crown_pieces(0.055, teeth=8), (max_x - 0.01, -0.16, 0.0), Z_BIT)


def reamer_collar(part_id, tier, head):
    """Tier 3's bore collar: a toothed ring round the cone's base, behind the head (vehicleLook)."""
    (min_x, _), (_, _) = view_bounds_of(head)
    return part(part_id, tier, collar_pieces(0.235, teeth=14), (min_x + 0.07, -0.02, 0.0), Z_BIT_COLLAR)


def view_bounds_of(obj):
    """((min x, min z), (max x, max z)) of the object's mesh in the vehicle frame, as the export reads them."""
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    xs, zs = [point.x for point in points], [point.z for point in points]
    return (min(xs), min(zs)), (max(xs), max(zs))


def place_in_tier(obj, tier):
    """Tiered parts sit in their `tier-<n>` collection (#52 "Blender scene conventions")."""
    name = 'tier-%d' % tier
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    kit.move_object_to(obj, collection)


# --- primitives ----------------------------------------------------------------------------------


def ellipsoid(material, radii, centre, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=centre)
    return finish_piece(material, scale=radii, smooth=True)


def dome(material, radii, centre):
    """The upper half of an ellipsoid; the lower half would only hide inside the hull."""
    piece = ellipsoid(material, radii, centre, segments=40, rings=20)
    mesh = bmesh.new()
    mesh.from_mesh(piece.data)
    geometry = mesh.verts[:] + mesh.edges[:] + mesh.faces[:]
    bmesh.ops.bisect_plane(mesh, geom=geometry, plane_co=(0.0, 0.0, 0.0), plane_no=(0.0, 0.0, 1.0),
                           clear_inner=True)
    mesh.to_mesh(piece.data)
    mesh.free()
    return piece


def flat_cylinder_x(material, radius, length, centre, depth_share):
    """A cylinder along X squashed in depth, as the hull is."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=length, location=centre,
                                        rotation=(0.0, math.pi / 2, 0.0))
    return finish_piece(material, scale=(1.0, depth_share, 1.0), smooth=True)


def cone_x(material, back_radius, front_radius, length, centre):
    """A frustum along +X, its wide end at the back."""
    bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=back_radius, radius2=front_radius, depth=length,
                                    location=centre, rotation=(0.0, math.pi / 2, 0.0))
    return finish_piece(material, smooth=True)


def bell_down(material, mouth_radius, throat_radius, length, centre):
    """A nozzle bell opening downwards."""
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=mouth_radius, radius2=throat_radius, depth=length,
                                    location=centre)
    return finish_piece(material, smooth=True)


def disc(material, radius, thickness, centre, vertices=32):
    """A disc facing the camera (its axis along Y)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=thickness, location=centre,
                                        rotation=(math.pi / 2, 0.0, 0.0))
    return finish_piece(material, smooth=True)


def ring(material, major, minor, centre):
    return kit.torus(material, major, minor, centre)


def segment(material, start, end, thickness, depth, y):
    """A bar from `start` to `end` (x, z), `thickness` across in the view and `depth` deep."""
    dx, dz = end[0] - start[0], end[1] - start[1]
    centre = ((start[0] + end[0]) / 2, y, (start[1] + end[1]) / 2)
    return box(material, (math.hypot(dx, dz), depth, thickness), centre, turn_y=math.atan2(-dz, dx))


def rivet(x, y, z, radius=RIVET_M):
    return kit.sphere('brass', radius, (x, y, z), flatten=0.6)


def around(count, radius, phase=0.0):
    """`count` angles and their points on a circle of `radius` in the view plane (x, z)."""
    angles = [phase + 2 * math.pi * index / count for index in range(count)]
    return [(angle, radius * math.cos(angle), radius * math.sin(angle)) for angle in angles]


def tangent_box(material, size, angle, radius, y):
    """A box on a circle, its long side along the circle's tangent at `angle`."""
    x, z = radius * math.cos(angle), radius * math.sin(angle)
    return box(material, size, (x, y, z), turn_y=math.atan2(-math.cos(angle), -math.sin(angle)))


def hull_front_y(dz, extra=0.0):
    """Depth of the hull's camera-side skin at height `dz` off its axis (part frame)."""
    radius = HULL_RADIUS + extra
    return -HULL_DEPTH_SHARE * math.sqrt(max(radius * radius - dz * dz, 0.0))


# --- the pod and its legs (part frame: the hull's axis at the origin) ---------------------------


def chassis_pieces(heavy):
    half = HULL_HALF_LENGTH + (0.02 if heavy else 0.0)
    pieces = [
        flat_cylinder_x('bronze', HULL_RADIUS, 2 * half, (0.0, 0.0, 0.0), HULL_DEPTH_SHARE),
        ellipsoid('bronze', (HULL_RADIUS, HULL_RADIUS * HULL_DEPTH_SHARE, HULL_RADIUS), (-half, 0.0, 0.0)),
        ellipsoid('hull-steel', (HULL_RADIUS, HULL_RADIUS * HULL_DEPTH_SHARE, HULL_RADIUS), (half, 0.0, 0.0)),
    ]
    pieces += belly_pieces(half, heavy)
    pieces += band_pieces((-0.22, 0.0, 0.2) if not heavy else (-0.26, -0.09, 0.06, 0.2))
    pieces += porthole_pieces(0.08, 0.02)
    pieces += bow_socket_pieces(half)
    for hub_x in HUB_XS:
        pieces += leg_pieces(hub_x, heavy)
    return pieces


def belly_pieces(half, heavy):
    """The dark steel keel the legs hang from, riveted along its top edge."""
    depth_y = hull_front_y(-0.12) - 0.01
    pieces = [box('hull-steel', (2 * half + 0.1, 0.05, 0.1), (0.0, depth_y + 0.02, -0.12))]
    pieces += [rivet(x, depth_y - 0.006, -0.08) for x in stepped(-half, half, 0.065)]
    if heavy:
        pieces += [box('dark-iron', (2 * half - 0.05, 0.04, 0.03), (0.0, depth_y - 0.005, -0.15))]
        pieces += [rivet(x, depth_y - 0.03, -0.15) for x in stepped(-half + 0.03, half - 0.03, 0.065)]
    return pieces


def band_pieces(xs):
    """Brass hoops round the pod, riveted down their faces."""
    pieces = []
    for x in xs:
        pieces.append(flat_cylinder_x('brass', HULL_RADIUS + 0.008, 0.03, (x, 0.0, 0.0), HULL_DEPTH_SHARE))
        pieces += [rivet(x, hull_front_y(dz, 0.008) - 0.004, dz) for dz in stepped(-0.12, 0.12, 0.06)]
    return pieces


def porthole_pieces(x, z):
    y = hull_front_y(z) - 0.004
    return [
        ring('brass', 0.045, 0.011, (x, y, z)),
        disc('glass', 0.038, 0.01, (x, y + 0.004, z)),
        disc('amber-glass', 0.012, 0.012, (x + 0.012, y - 0.002, z + 0.012)),
    ]


def bow_socket_pieces(half):
    """The ring the gimbal sits in, on the pod's bow."""
    return [
        flat_cylinder_x('brass', 0.15, 0.05, (half + 0.11, 0.0, 0.0), 0.8),
        flat_cylinder_x('dark-iron', 0.12, 0.07, (half + 0.13, 0.0, 0.0), 0.8),
    ]


def leg_pieces(hub_x, heavy):
    """
    An articulated leg from a hip under the pod to the roller's axle, its knee turned away from
    the pod's middle (the middle leg's backwards), with a ram along the thigh.
    """
    side = -1.0 if hub_x < 0 else 1.0
    if hub_x == 0:
        hip, knee = (0.02, -0.11), (-0.06, -0.2)
    else:
        hip, knee = (hub_x + side * 0.02, -0.1), (hub_x + side * 0.11, -0.17)
    hub = (hub_x, HUB_Z - HULL_Z)
    y = -0.16
    thick = 0.056 if heavy else 0.05
    return [
        kit.sphere('brass', 0.036, (hip[0], y + 0.01, hip[1]), flatten=0.7),
        segment('hull-steel', hip, knee, thick, 0.04, y),
        segment('dark-iron', knee, hub, thick * 0.9, 0.04, y - 0.004),
        segment('copper', (hip[0] - side * 0.02, hip[1] + 0.02), (knee[0], knee[1] + 0.025), 0.016, 0.02, y - 0.03),
        kit.sphere('brass', 0.032, (knee[0], y - 0.02, knee[1]), flatten=0.7),
        disc('brass', 0.032, 0.03, (hub[0], y - 0.02, hub[1])),
        disc('dark-iron', 0.012, 0.035, (hub[0], y - 0.025, hub[1])),
    ]


# --- the rollers (part frame: the axle at the origin) --------------------------------------------


def roller_pieces(radius, grousers):
    """A track wrapped tight round a toothed sprocket, so the whole roller turns as a wheel."""
    shoe_radius = radius - 0.016
    pieces = [ring('rubber', shoe_radius - 0.01, 0.02, (0.0, 0.0, 0.0))]
    for angle, _, _ in around(18, shoe_radius):
        pieces.append(tangent_box('hull-steel', (0.036, 0.11, 0.028), angle, shoe_radius, -0.004))
    if grousers:
        for angle, _, _ in around(10, radius - 0.006):
            pieces.append(tangent_box('dark-iron', (0.016, 0.115, 0.016), angle, radius - 0.006, -0.002))
    pieces += [disc('dark-iron', shoe_radius - 0.024, 0.08, (0.0, 0.006, 0.0))]
    for angle, _, _ in around(12, shoe_radius - 0.03):
        pieces.append(tangent_box('iron', (0.016, 0.06, 0.02), angle, shoe_radius - 0.03, -0.04))
    for _, x, z in around(6, 0.045):
        pieces.append(disc('soot', 0.013, 0.01, (x, -0.04, z)))
    pieces.append(disc('iron', 0.03, 0.02, (0.0, -0.045, 0.0)))
    pieces.append(disc('brass', 0.016, 0.03, (0.0, -0.055, 0.0)))
    return pieces


# --- the dome, the deck and the stern (part frame: each part's own pivot at the origin) --------


def dome_pieces():
    """The brass pressure dome on the pod's back: riveted ribs, three gauges, a viewport, a valve."""
    radii = (0.24, 0.15, 0.22)
    pieces = [
        dome('bronze', radii, (0.0, 0.0, 0.0)),
        box('brass', (2 * radii[0] + 0.02, 2 * radii[1] + 0.02, 0.035), (0.0, 0.0, 0.0)),
        cylinder('brass', 0.022, 0.05, (0.0, 0.0, radii[2] + 0.015), 'Z'),
        ring('brass', 0.03, 0.006, (0.0, -0.02, radii[2] + 0.045)),
    ]
    pieces += [rivet(x, -radii[1] - 0.012, 0.0) for x in stepped(-0.22, 0.22, 0.055)]
    pieces += dome_rivet_row(radii, 0.045, 0.04)
    pieces += gauge_pieces(-0.12, 0.09, 0.034, needle_turn=0.6)
    pieces += gauge_pieces(-0.035, 0.15, 0.03, needle_turn=-0.4)
    pieces += gauge_pieces(-0.12, 0.17, 0.022, needle_turn=1.2)
    pieces += viewport_pieces(0.1, 0.1)
    return pieces


def dome_rivet_row(radii, z, step):
    """Rivets along a latitude of the dome, on its camera side."""
    pieces = []
    for x in stepped(-radii[0], radii[0], step):
        share = 1.0 - (x / radii[0]) ** 2 - (z / radii[2]) ** 2
        if share > 0.02:
            pieces.append(rivet(x, -radii[1] * math.sqrt(share) - 0.004, z))
    return pieces


def gauge_pieces(x, z, radius, needle_turn):
    y = -0.16
    return [
        ring('brass', radius, radius * 0.22, (x, y, z)),
        disc('dial', radius * 0.92, 0.01, (x, y + 0.002, z)),
        box('needle', (radius * 0.8, 0.006, radius * 0.12), (x + 0.35 * radius * math.cos(needle_turn), y - 0.006,
                                                           z + 0.35 * radius * math.sin(needle_turn)),
            turn_y=-needle_turn),
        kit.sphere('brass', radius * 0.14, (x, y - 0.008, z), flatten=0.6),
    ]


def viewport_pieces(x, z):
    """The dark glass the driver looks out of, towards the drill."""
    y = -0.12
    return [
        ellipsoid('glass', (0.07, 0.03, 0.055), (x, y, z)),
        ring('brass', 0.062, 0.01, (x, y - 0.012, z)),
        rivet(x - 0.05, y - 0.03, z + 0.04), rivet(x + 0.05, y - 0.03, z + 0.04),
        rivet(x - 0.05, y - 0.03, z - 0.04), rivet(x + 0.05, y - 0.03, z - 0.04),
    ]


def stack_pieces(radius, height):
    """An exhaust stack rising behind the dome; its foot hides behind the pod and dome."""
    return [
        cylinder('dark-iron', radius, height, (0.0, 0.0, 0.0), 'Z'),
        cylinder('brass', radius + 0.008, 0.025, (0.0, 0.0, height * 0.15), 'Z'),
        kit.frustum('brass', radius + 0.02, radius + 0.004, 0.05, (0.0, 0.0, height / 2 + 0.01)),
        cylinder('soot', radius * 0.8, 0.012, (0.0, 0.0, height / 2 + 0.036), 'Z'),
    ]


def hatch_pieces():
    """The ore hatch on the fore deck: a riveted lid on a grille, a brass hinge and catch."""
    pieces = [
        box('hull-steel', (0.17, 0.12, 0.06), (0.0, 0.0, 0.03)),
        box('brass', (0.18, 0.13, 0.014), (0.0, 0.0, 0.065)),
        cylinder('brass', 0.01, 0.13, (-0.085, 0.0, 0.07), 'Y'),
        box('copper', (0.02, 0.02, 0.03), (0.08, -0.065, 0.045)),
    ]
    pieces += [box('dark-iron', (0.008, 0.01, 0.034), (x, -0.062, 0.03)) for x in stepped(-0.06, 0.04, 0.02)]
    pieces += [rivet(x, -0.068, 0.065) for x in (-0.07, 0.0, 0.07)]
    return pieces


def gimbal_drive_pieces():
    """The gimbal's drive on the bow: two brass rings and the gear that turns the nose."""
    pieces = [
        flat_cylinder_x('brass', 0.13, 0.04, (-0.03, 0.0, 0.0), 0.8),
        flat_cylinder_x('dark-iron', 0.115, 0.05, (0.02, 0.0, 0.0), 0.8),
        flat_cylinder_x('brass', 0.12, 0.025, (0.065, 0.0, 0.0), 0.8),
        disc('copper', 0.045, 0.02, (-0.005, -0.11, -0.05)),
    ]
    pieces += [tangent_box('brass', (0.016, 0.02, 0.014), angle, 0.05, -0.118)
               for angle, _, _ in around(10, 0.05)]
    pieces += [rivet(x, -0.1, z) for x in (-0.03, 0.065) for z in (-0.09, -0.03, 0.03, 0.09)]
    return pieces


def ram_pieces():
    """A steam ram: the barrel bolted to the deck, the rod and a crosshead on top."""
    return [
        cylinder('brass', 0.02, 0.09, (0.0, 0.0, -0.025), 'Z'),
        cylinder('steel', 0.009, 0.06, (0.0, 0.0, 0.045), 'Z'),
        box('dark-iron', (0.05, 0.03, 0.014), (0.0, 0.0, 0.075)),
        ring('brass', 0.022, 0.005, (0.0, -0.02, -0.06)),
    ]


def lamp_pieces(radius):
    return [
        cylinder('brass', radius, 0.05, (0.0, 0.0, 0.0), 'Y'),
        disc('lamp-lens', radius * 0.75, 0.02, (0.0, -0.025, 0.0)),
        ring('brass', radius * 0.85, radius * 0.14, (0.0, -0.03, 0.0)),
        box('dark-iron', (radius * 0.5, 0.03, radius * 0.9), (-radius * 0.9, 0.0, -radius * 0.3)),
    ]


def thruster_pieces():
    """
    A brass vectored thruster under the belly: the swivel mount, the nozzle bell opening down
    and the plug in its mouth, dark steel at rest, glowing blue-white inside an orange lip while
    it fires (the emissive map, lit by partMotion's thrust).
    """
    return [
        flat_cylinder_x('dark-iron', 0.03, 0.09, (0.0, 0.0, 0.0), 1.0),
        disc('brass', 0.028, 0.1, (0.0, 0.0, 0.0)),
        disc('dark-iron', 0.01, 0.105, (0.0, 0.0, 0.0)),
        cylinder('brass', 0.022, 0.04, (0.0, 0.0, -0.035), 'Z'),
        bell_down('brass', 0.05, 0.024, 0.08, (0.0, 0.0, -0.09)),
        ring('copper', 0.03, 0.006, (0.0, -0.03, -0.068)),
        cylinder('thrust-rim', 0.051, 0.008, (0.0, 0.0, -0.131), 'Z'),
        bell_down('thrust-core', 0.03, 0.004, 0.045, (0.0, 0.0, -0.152)),
    ]


def arm_pieces(tool_pieces, lift):
    """
    A rear robotic arm, its shoulder at the origin (the code swings it from there while a casing
    ring is laid), reaching back: upper arm, elbow, forearm, wrist and the tool.
    """
    elbow, wrist = (-0.15, lift), (-0.27, lift * 0.3)
    y = 0.0
    pieces = [
        kit.sphere('brass', 0.03, (0.0, y - 0.01, 0.0), flatten=0.7),
        segment('hull-steel', (0.0, 0.0), elbow, 0.04, 0.035, y),
        segment('copper', (-0.01, 0.018), (elbow[0] + 0.02, elbow[1] + 0.018), 0.01, 0.02, y - 0.025),
        kit.sphere('brass', 0.024, (elbow[0], y - 0.012, elbow[1]), flatten=0.7),
        segment('dark-iron', elbow, wrist, 0.032, 0.03, y - 0.004),
        kit.sphere('brass', 0.017, (wrist[0], y - 0.014, wrist[1]), flatten=0.7),
    ]
    return pieces + tool_pieces(wrist, y)


def ring_tool_pieces(wrist, y):
    """Two fingers holding a casing ring, turned three-quarters away so it reads as a hoop."""
    x, z = wrist
    hoop = ring('casing-steel', 0.08, 0.014, (x - 0.07, y, z))
    hoop.scale = (0.35, 1.0, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return [
        segment('steel', (x, z), (x - 0.045, z + 0.03), 0.012, 0.02, y - 0.01),
        segment('steel', (x, z), (x - 0.045, z - 0.03), 0.012, 0.02, y - 0.01),
        hoop,
    ] + [rivet(x - 0.07 + 0.026 * math.cos(a), y - 0.016, z + 0.074 * math.sin(a), 0.006)
         for a in (0.6, 1.6, 2.6, 3.7, 4.7, 5.7)]


def nozzle_tool_pieces(wrist, y):
    """The cement gun: a hopper drum, the nozzle and a crust of cement on its lip."""
    x, z = wrist
    return [
        cylinder('cement', 0.026, 0.05, (x - 0.005, y, z + 0.03), 'Z'),
        ring('brass', 0.026, 0.005, (x - 0.005, y - 0.02, z + 0.055)),
        cone_x('brass', 0.016, 0.022, 0.06, (x - 0.035, y, z)),
        box('dark-iron', (0.012, 0.03, 0.05), (x - 0.07, y, z)),
        kit.sphere('cement', 0.012, (x - 0.075, y - 0.012, z + 0.018), flatten=0.6),
    ]


# --- armour --------------------------------------------------------------------------------------


def shield_pieces(width, height, rivets):
    """A riveted bow or stern shield with a brass edge."""
    pieces = [
        box('hull-steel', (width, 0.03, height), (0.0, 0.0, 0.0)),
        box('brass', (width + 0.01, 0.026, 0.016), (0.0, 0.004, height / 2)),
        box('brass', (width + 0.01, 0.026, 0.016), (0.0, 0.004, -height / 2)),
    ]
    pieces += [rivet(x, -0.02, z) for x in (-width / 3, width / 3)
               for z in stepped(-height / 2 + 0.04, height / 2 - 0.04, (height - 0.08) / (rivets - 1))]
    return pieces


def skirt_pieces():
    """Tier 3's belly skirt over the hips: dark plates on a brass rail."""
    pieces = [box('brass', (0.86, 0.03, 0.016), (0.0, 0.004, 0.032))]
    pieces += [box('hull-steel', (0.135, 0.028, 0.06), (x, 0.0, 0.0), turn_y=0.0) for x in stepped(-0.36, 0.36, 0.144)]
    pieces += [rivet(x + dx, -0.018, 0.0) for x in stepped(-0.36, 0.36, 0.144) for dx in (-0.04, 0.04)]
    return pieces


def tank_pieces():
    """Tier 3's second pressure tank on the fore deck: a riveted sphere in a brass cradle."""
    pieces = [
        ellipsoid('bronze', (0.075, 0.07, 0.075), (0.0, 0.0, 0.0)),
        ring('brass', 0.076, 0.008, (0.0, -0.01, 0.0)),
        box('dark-iron', (0.12, 0.05, 0.02), (0.0, 0.0, -0.075)),
        cylinder('brass', 0.012, 0.03, (0.0, 0.0, 0.085), 'Z'),
    ]
    pieces += [rivet(0.06 * math.cos(a), -0.06, 0.06 * math.sin(a)) for a, _, _ in around(6, 0.06)]
    return pieces


# --- the nose (part frame: the head's centre at the origin) --------------------------------------


def nose_pieces(width, steps, glow_bands, fixed_tip=False):
    """
    The gimbal collar, then the stepped drill cone along +X, the seams between the steps glowing
    (lit with the load, partMotion). Its bounds are centred on the origin so DrillHeadView's reach
    places it in front of the collider; the head is as tall as the cone's base is wide.
    """
    left, right = -width / 2, width / 2
    base_radius = 0.1 + (width - 0.36)
    pieces = [
        flat_cylinder_x('brass', base_radius + 0.012, 0.035, (left + 0.0175, 0.0, 0.0), 0.8),
        flat_cylinder_x('dark-iron', base_radius - 0.01, 0.03, (left + 0.045, 0.0, 0.0), 0.8),
        disc('brass', 0.028, 0.03, (left + 0.02, -base_radius * 0.8 - 0.015, 0.0)),
        disc('dark-iron', 0.011, 0.035, (left + 0.02, -base_radius * 0.8 - 0.018, 0.0)),
    ]
    pieces += [rivet(left + 0.0175, -(base_radius + 0.012) * 0.8 - 0.004, z) for z in (-0.07, 0.07)]
    cone_start = left + 0.06
    cone_end = right - (0.04 if not fixed_tip else 0.0)
    step_length = (cone_end - cone_start) / steps
    for index in range(steps):
        x0 = cone_start + index * step_length
        r0 = base_radius * (1.0 - index / (steps + 0.4))
        r1 = base_radius * (1.0 - (index + 0.8) / (steps + 0.4))
        material = 'steel' if index % 2 == 0 else 'brass'
        pieces.append(cone_x(material, r0, r1, step_length, (x0 + step_length / 2, 0.0, 0.0)))
        if index < glow_bands:
            pieces.append(cone_x('nose-glow', r1 + 0.006, r1 + 0.002, 0.01, (x0 + step_length - 0.003, 0.0, 0.0)))
        pieces += flute_pieces(x0, step_length, r0)
    if fixed_tip:
        pieces.append(cone_x('steel', base_radius * 0.12, 0.004, 0.03, (right - 0.015, 0.0, 0.0)))
    return pieces


def flute_pieces(x0, length, radius):
    """Spiral cutting flutes over a step, as dark slants on its camera side."""
    return [segment('dark-iron', (x0 + length * 0.2, radius * 0.55), (x0 + length * 0.8, -radius * 0.25), 0.008,
                    0.01, -radius * 0.82)]


def crown_pieces(radius, teeth):
    """The cutter crown at the tip, face-on: a toothed ring round a hot core."""
    pieces = [
        disc('steel', radius * 0.72, 0.03, (0.0, 0.0, 0.0)),
        disc('nose-glow', radius * 0.34, 0.034, (0.0, -0.002, 0.0)),
        ring('brass', radius * 0.55, radius * 0.08, (0.0, -0.016, 0.0)),
    ]
    for angle, _, _ in around(teeth, radius * 0.84):
        pieces.append(tangent_box('steel', (radius * 0.24, 0.028, radius * 0.36), angle, radius * 0.84, 0.0))
    for angle, x, z in around(4, radius * 0.4, phase=math.pi / 4):
        pieces.append(segment('dark-iron', (0.0, 0.0), (x, z), 0.006, 0.01, -0.02))
    return pieces


def collar_pieces(radius, teeth):
    """Tier 3's reamer: a ring of cutters round the gimbal, their tips glowing hot."""
    pieces = [
        ring('dark-iron', radius * 0.82, radius * 0.1, (0.0, 0.0, 0.0)),
        ring('brass', radius * 0.7, radius * 0.04, (0.0, -0.01, 0.0)),
    ]
    for angle, _, _ in around(teeth, radius * 0.9):
        pieces.append(tangent_box('steel', (radius * 0.16, 0.03, radius * 0.2), angle, radius * 0.92, 0.0))
        pieces.append(tangent_box('nose-glow', (radius * 0.08, 0.032, radius * 0.06), angle, radius * 0.99, -0.002))
    return pieces


if __name__ == '__main__':
    main()
