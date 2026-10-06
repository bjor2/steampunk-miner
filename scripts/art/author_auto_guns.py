"""
Authors the first version of the auto guns' Blender source (#108, spec #107): the hull turret the
vehicle mounts when it buys `auto_guns`, visible on the vehicle at every visual tier (#81
acceptance 3), with three barrel looks for the gun-level breakpoints.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_auto_guns.py

It writes art/blender/vehicle-auto-guns/vehicle-auto-guns.blend. From then on that file is the
source (#52): change the art in Blender and re-export, rather than editing this script. Nothing
here is rigged (#51 acceptance 2); the code turns the barrel and head.

The parts sit in the vehicle's own frame (its chassis centre at the origin, the drill towards +X),
at the placeholder's `atM`, so the family draws on the hull wherever the vehicle is:

- `t1-turret-mount`: a pedestal on the chassis top, rising clear of the boilers; it never moves.
- `t1-turret-head`: a riveted brass cupola with a sight slit and an amber pilot lamp (the one
  glowing part, so Auto reads at a glance); its pivot is the trunnion.
- `t<n>-gun-barrel`: pivots on the same trunnion and rests pointing at the rear (-X), the arc the
  guns cover (the front cone is the drill's, #107). Look 1 is one plain barrel; look 2 a longer
  barrel with a perforated cooling jacket and a slotted muzzle brake; look 3 twin barrels with
  copper cooling fins, a glowing heat band and flared muzzles. Each look is its own silhouette, so
  the level reads without colour (#48).

Pieces, materials and the join into parts come from author_platform.py, so the guns share the
platform's dielectric brass-on-iron look.
"""

import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import author_platform as kit  # noqa: E402
from author_platform import box, cylinder, sphere, stepped, torus  # noqa: E402

ASSET_ID = 'vehicle-auto-guns'
# The placeholder's atM: the mount on the chassis top, the trunnion above the stacks.
MOUNT_AT = (0.04, 0.0, 0.13)
TRUNNION_AT = (0.04, 0.0, 0.64)
# Draw order over the vehicle's parts (which stop at 9): mount, then barrel, then the head on top.
Z_MOUNT, Z_BARREL, Z_HEAD = 10, 11, 12

kit.PALETTE.update({
    'gunmetal': ((0.30, 0.31, 0.33), 0.4, 0.0),
    'lamp-glow': ((1.0, 0.62, 0.22), 0.2, 1.5),
    'heat-glow': ((1.0, 0.36, 0.10), 0.3, 1.0),
})


def small_rivet(centre):
    """The platform's rivets are sized for metres of plate; a turret this small takes finer ones."""
    return sphere('brass', 0.011, centre, flatten=0.6)


def main():
    kit.reset_scene()
    place_in_tier(kit.build_part('t1-turret-mount', mount_pieces(), MOUNT_AT, Z_MOUNT), 1)
    place_in_tier(kit.build_part('t1-turret-head', head_pieces(), TRUNNION_AT, Z_HEAD), 1)
    for look, pieces in enumerate((barrel_look_1(), barrel_look_2(), barrel_look_3()), start=1):
        place_in_tier(kit.build_part('t%d-gun-barrel' % look, pieces, TRUNNION_AT, Z_BARREL), look)
    kit.save_as(ASSET_ID)


def place_in_tier(part, tier):
    """Tiered parts sit in their `tier-<n>` collection (#52 "Blender scene conventions")."""
    name = 'tier-%d' % tier
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    kit.move_object_to(part, collection)


# --- the mount (0.26 x 0.42 m, pivot at its bottom centre) ----------------------------------------


def mount_pieces():
    pieces = [
        box('dark-iron', (0.26, 0.2, 0.04), (0, 0, 0.02)),
        cylinder('brass', 0.1, 0.03, (0, 0, 0.055), 'Z'),
        cylinder('iron', 0.045, 0.34, (0, 0, 0.23), 'Z'),
        cylinder('brass', 0.056, 0.02, (0, 0, 0.15), 'Z'),
        cylinder('brass', 0.056, 0.02, (0, 0, 0.32), 'Z'),
        cylinder('brass', 0.09, 0.03, (0, 0, 0.405), 'Z'),
        cylinder('copper', 0.012, 0.3, (0.065, -0.06, 0.22), 'Z'),
        box('iron-plate', (0.03, 0.03, 0.13), (-0.07, -0.02, 0.1), turn_y=0.45),
        box('iron-plate', (0.03, 0.03, 0.13), (0.07, -0.02, 0.1), turn_y=-0.45),
    ]
    pieces += [small_rivet((x, -0.1, 0.02)) for x in (-0.1, -0.05, 0.05, 0.1)]
    return pieces


# --- the head (0.30 x 0.18 m, pivot at the trunnion, its centre) ----------------------------------


def head_pieces():
    pieces = [
        cylinder('dark-iron', 0.15, 0.05, (0, 0, -0.065), 'Z'),
        dome('brass', 0.135, 0.13, (0, 0, -0.04)),
        box('enamel', (0.12, 0.03, 0.026), (-0.03, -0.12, 0.025)),
        box('brass', (0.14, 0.03, 0.01), (-0.03, -0.122, 0.044)),
        sphere('lamp-glow', 0.022, (0.075, -0.115, 0.0)),
        torus('brass', 0.026, 0.007, (0.075, -0.125, 0.0)),
        cylinder('steel', 0.035, 0.03, (0, -0.15, 0), 'Y'),
        cylinder('brass', 0.008, 0.06, (-0.06, 0, 0.11), 'Z'),
    ]
    pieces += [small_rivet((x, -0.15, -0.065)) for x in stepped(-0.12, 0.12, 0.04)]
    return pieces


def dome(material, radius, height, centre):
    """The upper half of a sphere, squashed to `height`: the cupola sits flat on its ring."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius, location=centre)
    piece = bpy.context.view_layer.objects.active
    mesh = bmesh.new()
    mesh.from_mesh(piece.data)
    bmesh.ops.delete(mesh, geom=[vertex for vertex in mesh.verts if vertex.co.z < -1e-6], context='VERTS')
    mesh.to_mesh(piece.data)
    mesh.free()
    return kit.finish_piece(material, scale=(1.0, 1.0, height / radius), smooth=True)


# --- the barrels (pivot at the trunnion, pointing at -X) ------------------------------------------


def barrel_look_1():
    """One plain barrel on a breech block."""
    return [
        box('iron', (0.08, 0.08, 0.07), (0, 0, 0)),
        cylinder('steel', 0.022, 0.26, (-0.17, 0, 0), 'X'),
        cylinder('steel', 0.03, 0.03, (-0.285, 0, 0), 'X'),
    ]


def barrel_look_2():
    """A longer barrel in a perforated cooling jacket, with a slotted muzzle brake."""
    pieces = [
        box('iron', (0.08, 0.1, 0.1), (0, 0, 0)),
        cylinder('steel', 0.024, 0.32, (-0.2, 0, 0), 'X'),
        cylinder('dark-iron', 0.04, 0.18, (-0.15, 0, 0), 'X'),
        cylinder('brass', 0.044, 0.015, (-0.065, 0, 0), 'X'),
        cylinder('brass', 0.044, 0.015, (-0.235, 0, 0), 'X'),
        box('gunmetal', (0.05, 0.08, 0.08), (-0.335, 0, 0)),
    ]
    pieces += [sphere('enamel', 0.01, (x, -0.038, z)) for x in stepped(-0.21, -0.09, 0.04) for z in (-0.016, 0.016)]
    pieces += [box('enamel', (0.01, 0.03, 0.084), (x, -0.03, 0)) for x in (-0.345, -0.325)]
    return pieces


def barrel_look_3():
    """Twin barrels through copper cooling fins, a glowing heat band and flared muzzles."""
    pieces = [
        box('brass', (0.09, 0.12, 0.14), (0, 0, 0)),
        box('heat-glow', (0.014, 0.1, 0.12), (-0.055, 0, 0)),
    ]
    for z in (-0.038, 0.038):
        pieces += [
            cylinder('gunmetal', 0.02, 0.36, (-0.22, 0, z), 'X'),
            flared_muzzle('steel', (-0.38, 0, z)),
        ]
        pieces += [cylinder('copper', 0.03, 0.008, (x, 0, z), 'X') for x in stepped(-0.2, -0.1, 0.025)]
    return pieces


def flared_muzzle(material, centre):
    """A cone along X, wide end towards the muzzle (-X)."""
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.032, radius2=0.022, depth=0.04, location=centre,
                                    rotation=(0.0, math.pi / 2, 0.0))
    return kit.finish_piece(material, smooth=True)


if __name__ == '__main__':
    main()
