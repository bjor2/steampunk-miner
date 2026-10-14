"""
Authors the first version of the bore gun mount's Blender source (#362, the art half of #315, for
the GD decision on spec #309): the brass bore gun the rig carries once `bore_gun` is bought,
visible on the vehicle because a major unlock must show on it (design 37.7).

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_bore_gun.py

It writes art/blender/vehicle-bore-gun/vehicle-bore-gun.blend. From then on that file is the
source (#52): change the art in Blender and re-export, rather than editing this script. Nothing
here is rigged (#51 acceptance 2); the code turns the barrel to the aim.

The asset is authored in its own frame with its mounting point at the origin, as the other gear
(K5: gear is drawn at its attach point's `atM`), so whichever attach id the TD gives it (#314,
#250, #235) places it with no offset in code. No attach empties are written: those ids are the
TD's.

- `t1-bore-mount`: a riveted iron saddle that bolts to the hull, its pivot the bolt plate's centre
  (the origin); a brass trunnion ring below it carries the barrel. It never moves.
- `t1-bore-barrel`: pivots on the trunnion and rests along +X, the facing bearing (the #309 tap
  and idle aim); the code turns it down through the arc, horizontal to 60 degrees below. A heavy
  bore tube in brass bands, a toothed crown at the muzzle (the gun cuts rock, it does not shoot
  it), a breech block with a steam feed at the back, a ring sight on top and a charge drum under
  the breech. Those five zones are where #310's modules hang (`bore.sight`, `bore.breech`,
  `bore.barrel`, `bore.muzzle`, `bore.magazine`), so each module has a place to sit.

Pieces, materials and the join into parts come from author_platform.py, so the gun shares the
platform's and the auto guns' dielectric brass-on-iron look.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import author_platform as kit  # noqa: E402
from author_platform import box, cylinder, sphere, stepped, torus  # noqa: E402

ASSET_ID = 'vehicle-bore-gun'
# The pieces below are drawn at 1:1.2; at 1:1 the barrel was 3 px thick at play zoom (90 px/m),
# too thin for a major unlock to read on the rig (design 37.7).
GUN_SCALE = 1.2
MOUNT_AT = (0.0, 0.0, 0.0)
# The trunnion hangs below the bolt plate, so the barrel swings clear of the hull above it.
TRUNNION_AT = (0.0, 0.0, -0.09 * GUN_SCALE)
# Draw order over the vehicle's parts (which stop at 9), under the auto guns' turret (10-12)
# that never overlaps it: mount, then the barrel in front of it.
Z_MOUNT, Z_BARREL = 8, 9
CROWN_TEETH = 8

kit.PALETTE.update({
    'gunmetal': ((0.30, 0.31, 0.33), 0.4, 0.0),
    'bore-glow': ((1.0, 0.55, 0.18), 0.3, 1.2),
})


def small_rivet(centre):
    """The platform's rivets are sized for metres of plate; gear this small takes finer ones."""
    return sphere('brass', 0.01, centre, flatten=0.6)


def main():
    kit.reset_scene()
    place_in_tier(build_scaled_part('t1-bore-mount', mount_pieces(), MOUNT_AT, Z_MOUNT), 1)
    place_in_tier(build_scaled_part('t1-bore-barrel', barrel_pieces(), TRUNNION_AT, Z_BARREL), 1)
    soften_small_bevels()
    kit.save_as(ASSET_ID)


def build_scaled_part(part_id, pieces, at, z_order):
    """The platform kit's part, grown by `GUN_SCALE` about its pivot and applied into the mesh."""
    part = kit.build_part(part_id, pieces, at, z_order)
    bpy.ops.object.select_all(action='DESELECT')
    part.select_set(True)
    bpy.context.view_layer.objects.active = part
    part.scale = (GUN_SCALE, GUN_SCALE, GUN_SCALE)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return part


def place_in_tier(part, tier):
    """Tiered parts sit in their `tier-<n>` collection (#52 "Blender scene conventions")."""
    name = 'tier-%d' % tier
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    kit.move_object_to(part, collection)


def soften_small_bevels():
    """The platform's 15 mm bevel would round a 30 mm barrel band away; this gear takes 4 mm."""
    for obj in bpy.data.objects:
        bevel = obj.modifiers.get('bevel')
        if bevel is not None:
            bevel.width = 0.004


# --- the mount (0.16 x 0.13 m before scaling, pivot at the bolt plate's centre) ---------------------------------


def mount_pieces():
    pieces = [
        box('dark-iron', (0.16, 0.06, 0.035), (0.0, 0.0, 0.0)),
        box('iron-plate', (0.03, 0.05, 0.09), (-0.045, -0.005, -0.05), turn_y=-0.3),
        box('iron-plate', (0.03, 0.05, 0.09), (0.045, -0.005, -0.05), turn_y=0.3),
        cylinder('brass', 0.045, 0.05, (0.0, 0.0, -0.09), 'Y'),
        cylinder('dark-iron', 0.028, 0.056, (0.0, 0.0, -0.09), 'Y'),
        cylinder('copper', 0.008, 0.12, (-0.03, -0.035, -0.01), 'X'),
    ]
    pieces += [small_rivet((x, -0.032, 0.0)) for x in stepped(-0.06, 0.06, 0.04)]
    return pieces


# --- the barrel (pivot at the trunnion, pointing along +X) ---------------------------------------


def barrel_pieces():
    return breech_pieces() + tube_pieces() + crown_pieces() + sight_pieces() + drum_pieces()


def breech_pieces():
    """The breech block behind the trunnion, with the steam feed curling up from it."""
    return [
        box('iron', (0.09, 0.07, 0.07), (-0.035, 0.0, 0.0)),
        box('brass', (0.012, 0.074, 0.074), (-0.08, 0.0, 0.0)),
        cylinder('brass', 0.03, 0.03, (0.0, -0.03, 0.0), 'Y'),
        torus('copper', 0.022, 0.006, (-0.05, -0.036, 0.0)),
        cylinder('copper', 0.007, 0.05, (-0.06, 0.0, 0.05), 'Z'),
        cylinder('steel', 0.014, 0.012, (-0.06, 0.0, 0.08), 'Z'),
    ]


def tube_pieces():
    """The heavy bore tube in three brass bands, the last one hot from the shot."""
    pieces = [
        cylinder('gunmetal', 0.03, 0.24, (0.13, 0.0, 0.0), 'X'),
        cylinder('dark-iron', 0.034, 0.06, (0.04, 0.0, 0.0), 'X'),
    ]
    pieces += [cylinder('brass', 0.036, 0.016, (x, 0.0, 0.0), 'X') for x in (0.075, 0.15)]
    pieces.append(cylinder('bore-glow', 0.034, 0.01, (0.215, 0.0, 0.0), 'X'))
    return pieces


def crown_pieces():
    """A toothed crown at the muzzle: the bore gun opens rock, so its mouth reads as a cutter."""
    pieces = [
        cylinder('brass', 0.042, 0.03, (0.26, 0.0, 0.0), 'X'),
        cylinder('enamel', 0.022, 0.032, (0.262, 0.0, 0.0), 'X'),
    ]
    pieces += [crown_tooth(index) for index in range(CROWN_TEETH)]
    return pieces


def crown_tooth(index):
    """A steel wedge on the crown's rim, pointing forward; the teeth spin round the bore axis."""
    angle = 2 * math.pi * index / CROWN_TEETH
    y, z = 0.034 * math.sin(angle), 0.034 * math.cos(angle)
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.011, radius2=0.0, depth=0.03,
                                    location=(0.288, y, z), rotation=(0.0, math.pi / 2, 0.0))
    return kit.finish_piece('steel')


def sight_pieces():
    """The ring sight on a post over the tube, where the gimbal sight module will sit."""
    return [
        box('iron', (0.012, 0.01, 0.03), (0.12, 0.0, 0.042)),
        torus('brass', 0.014, 0.004, (0.12, -0.006, 0.066)),
        box('iron', (0.008, 0.01, 0.018), (0.235, 0.0, 0.04)),
    ]


def drum_pieces():
    """The charge drum hung under the breech: the steam charge each shot spends."""
    pieces = [
        cylinder('iron', 0.03, 0.05, (-0.03, 0.0, -0.06), 'Y'),
        torus('brass', 0.03, 0.005, (-0.03, -0.026, -0.06)),
        cylinder('copper', 0.006, 0.04, (0.005, 0.0, -0.04), 'X'),
    ]
    pieces += [small_rivet((-0.03 + 0.02 * math.cos(a), -0.028, -0.06 + 0.02 * math.sin(a)))
               for a in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2)]
    return pieces


if __name__ == '__main__':
    main()
