"""
Authors the coal tender's LK5 look steps (ticket 813, wave 647-7K of the P1-P5 map #647) into the
existing source, art/blender/vehicle-fuel-tank/vehicle-fuel-tank.blend: the GD lock of 24 Oct 14:54
(#813) wants at least 5 authored steps on every line, each a new outline or an added part in a
socket, never a recolour. The tender is exempt from the decade rule and keeps one step per
purchase: the #758 wagons stay the first steps at tank levels 1, 2, 3 and 5, and each step here is
the guild tender with one more part fitted, one level a purchase (6, 7, 8), in the order the ticket
named: a second tank, then a coal hopper, then a third tank with a sight glass.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/author_fuel_tender_steps.py

It opens the .blend (the source since #758), removes any earlier copy of these three parts and
rebuilds them from src/data/vehicle/fuelTender.json's steps, so a re-run rewrites the same objects;
the four wagons of #758 are left as they are. Conventions are author_fuel_tender.py's: the hitch at
the origin, 1 unit = 1 m, game right is +X, up is +Z, details stand out towards -Y, draw order `z`
0, the vehicle-scale 4 mm bevel. The wagon ships no emissive map (the tail's tint above the top
step is the kernel vehicle look's), so the drill nose stays the brightest part by construction.

Why every part sits where it does: the wagon is the socket. It trails the rig behind the stern,
clear of the rig's own outline, and the footprint the game lays out (the union of the four
wagons' boxes, x -0.572..0.029, z -0.179..0.31 in the asset frame) may not grow (#813: the
footprint and the drawn outline are unchanged), so the parts fill the room the guild tender
leaves inside it: over the middle post and the right bunker's near half (the second tank, under
the 0.31 ceiling the riveted tender's copper tank set and short of the rig's casing arms, which
reach back over the wagon's stern end), over the left bunker between the lantern and the tank (the
coal hopper), and slung under the frame between the two wheels, above the ground line (the third
tank). Each is sized to move a 360 px phone's pixels (#157: one visible step is at least a
4 x 4 patch at 45 px/m): copper over green enamel, iron plate and brass over coal and sky, pale
steel over the dark running gear.

| Part                | Step (tank level) | Adds                                                                    |
| ------------------- | ----------------- | ----------------------------------------------------------------------- |
| `twin-tank-tender`  | 6                 | a brass-banded copper water tank lying over the middle of the tender,   |
|                     |                   | a brass filler dome on its top                                          |
| `hopper-tender`     | 7                 | a riveted iron-plate coal hopper, wide side up, over the left bunker,   |
|                     |                   | braced to the body, its brass rim heaped with coal                      |
| `glass-tank-tender` | 8                 | a pale steel belly tank slung under the frame between the wheels on two |
|                     |                   | iron straps, brass-banded, with a water sight glass in brass fittings   |
"""

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
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, frustum, sphere  # noqa: E402

BLEND_PATH = os.path.join(REPO_ROOT, 'art', 'blender', 'vehicle-fuel-tank', 'vehicle-fuel-tank.blend')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). No emission.
kit.PALETTE.update({
    'water-glass': ((0.62, 0.84, 0.88), 0.1, 0.0),
})

# The guild tender's body (author_fuel_tender.guild_tender_pieces): its top and the bunkers' middles.
GUILD_HEIGHT = 0.22
BODY_TOP_Z = base.BODY_FOOT + GUILD_HEIGHT
BODY_MID_X = (base.BODY_X0 + base.BODY_X1) / 2
BUNKER_DX = 0.115
BODY_Y = base.BODY_Y
# The second tank: lying along X over the middle post and the right bunker's near half, its
# filler under the footprint's ceiling. Its stern end stops short of the rig's casing arms, which
# reach back to vehicle x -0.733 (asset x -0.213) over the wagon's body top: a part behind them
# would hide, and the outline check refuses it.
SECOND_TANK_X = BODY_MID_X + 0.03
SECOND_TANK_LENGTH = 0.15
SECOND_TANK_RADIUS = 0.048
SECOND_TANK_Z = BODY_TOP_Z + SECOND_TANK_RADIUS - 0.004
SECOND_TANK_BAND_DXS = (-0.069, 0.0, 0.069)
BAND_LENGTH = 0.012
FILLER_RADIUS = 0.016
# The coal hopper: a square funnel wide side up over the left bunker, between the lantern and the
# middle post, braced by two struts, its rim heaped with coal.
HOPPER_X = BODY_MID_X - BUNKER_DX
HOPPER_Y = BODY_Y - 0.01
HOPPER_TOP_HALF = 0.055
HOPPER_THROAT_HALF = 0.028
HOPPER_HEIGHT = 0.08
HOPPER_FOOT_Z = BODY_TOP_Z + 0.005
HOPPER_RIM_SIZE = (0.122, 0.122, 0.012)
HOPPER_RIM_Z = HOPPER_FOOT_Z + HOPPER_HEIGHT + 0.004
HOPPER_RIVET_XS = (-0.045, -0.015, 0.015, 0.045)
HOPPER_STRUT_SIZE = (0.012, 0.02, 0.09)
HOPPER_STRUT_DX = 0.06
HOPPER_COAL_RADIUS = 0.018
HOPPER_COAL_DXS = (-0.038, -0.013, 0.012, 0.037)
# The third tank: slung under the frame between the wheels, over the ground line, in front of the
# running gear, with a sight glass on its face.
BELLY_TANK_X = base.FRAME_X
BELLY_TANK_Y = -0.05
BELLY_TANK_LENGTH = 0.15
BELLY_TANK_RADIUS = 0.036
BELLY_TANK_Z = base.FRAME_Z - base.FRAME[2] / 2 - 0.032 - BELLY_TANK_RADIUS
BELLY_BAND_DXS = (-0.065, 0.065)
STRAP_SIZE = (0.012, 0.02, 0.046)
STRAP_DX = 0.045
STRAP_Z = base.FRAME_Z - base.FRAME[2] / 2 - 0.02
SIGHT_GLASS_RADIUS = 0.007
SIGHT_GLASS_LENGTH = 0.05
SIGHT_GLASS_Y = BELLY_TANK_Y - BELLY_TANK_RADIUS - 0.004
SIGHT_FITTING_SIZE = (0.02, 0.014, 0.009)
# The vehicle-scale 4 mm bevel of the first four wagons.
BEVEL_M = base.BEVEL_M
TOLERANCE_M = 1e-6


def main():
    table = base.read_table()
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)
    footprint = footprint_of_existing_wagons(table)
    remove_earlier_copies()
    built = [author_step(step, int(table['z'])) for step in table['steps'] if step['part'] in PIECES]
    check_steps_match_table(table, built, footprint)
    bpy.ops.wm.save_mainfile(filepath=BLEND_PATH, compress=True)
    print('authored ' + ', '.join(part.name for part in built))


def footprint_of_existing_wagons(table):
    """The union box of the #758 wagons as the file holds them: the socket the new parts fill."""
    wagons = [bpy.data.objects[step['part']] for step in table['steps']
              if step['part'] not in PIECES and step['part'] in bpy.data.objects]
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
    pieces = base.undercarriage_pieces() + PIECES[step['part']]()
    part = build_part(step['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def check_steps_match_table(table, built, footprint):
    names = sorted(part.name for part in built)
    wanted = sorted(step['part'] for step in table['steps'] if step['part'] in PIECES)
    if names != wanted or len(names) != len(PIECES):
        raise SystemExit('LK5 parts %s do not match the table %s' % (names, wanted))
    for part in built:
        (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(part)
        if not (min_x <= 0.0 <= max_x and min_z <= 0.0 <= max_z):
            raise SystemExit('%s: the hitch (origin) lies outside "%s"' % (table['assetId'], part.name))
        if min_z < base.GROUND_Z - TOLERANCE_M:
            raise SystemExit('%s: "%s" reaches below the ground line' % (table['assetId'], part.name))
        if not is_inside(((min_x, min_z), (max_x, max_z)), footprint):
            raise SystemExit('%s: "%s" grows the wagon footprint %s past %s'
                             % (table['assetId'], part.name, ((min_x, min_z), (max_x, max_z)), footprint))


def is_inside(bounds, footprint):
    (min_x, min_z), (max_x, max_z) = bounds
    (low_x, low_z), (high_x, high_z) = footprint
    return (low_x - TOLERANCE_M <= min_x and max_x <= high_x + TOLERANCE_M
            and low_z - TOLERANCE_M <= min_z and max_z <= high_z + TOLERANCE_M)


# --- the steps, each the one before with its part fitted --------------------------------------


def twin_tank_tender_pieces():
    return base.guild_tender_pieces() + second_tank_pieces()


def hopper_tender_pieces():
    return twin_tank_tender_pieces() + hopper_pieces()


def glass_tank_tender_pieces():
    return hopper_tender_pieces() + belly_tank_pieces()


# --- the fitted parts ----------------------------------------------------------------------------


def second_tank_pieces():
    """A copper water tank lying over the middle of the tender, brass-banded at both ends and the
    middle, a brass filler dome on its top."""
    centre = (SECOND_TANK_X, BODY_Y, SECOND_TANK_Z)
    pieces = [cylinder('copper', SECOND_TANK_RADIUS, SECOND_TANK_LENGTH, centre, 'X')]
    for dx in SECOND_TANK_BAND_DXS:
        pieces.append(cylinder('brass', SECOND_TANK_RADIUS + 0.004, BAND_LENGTH, (SECOND_TANK_X + dx, BODY_Y, SECOND_TANK_Z), 'X'))
    pieces.append(sphere('brass', FILLER_RADIUS, (SECOND_TANK_X, BODY_Y, SECOND_TANK_Z + SECOND_TANK_RADIUS - 0.002), flatten=0.8))
    return pieces


def hopper_pieces():
    """A riveted iron-plate coal hopper, wide side up, over the left bunker: a brass rim heaped
    with coal, two dark-iron struts bracing it to the body."""
    pieces = [frustum('iron-plate', HOPPER_TOP_HALF, HOPPER_THROAT_HALF, HOPPER_HEIGHT,
                      (HOPPER_X, HOPPER_Y, HOPPER_FOOT_Z + HOPPER_HEIGHT / 2))]
    pieces.append(box('brass', HOPPER_RIM_SIZE, (HOPPER_X, HOPPER_Y, HOPPER_RIM_Z)))
    rivet_y = HOPPER_Y - HOPPER_RIM_SIZE[1] / 2 - 0.003
    pieces += [driller.rivet(HOPPER_X + dx, rivet_y, HOPPER_RIM_Z, radius=base.RIVET_R) for dx in HOPPER_RIVET_XS]
    for dx in (-HOPPER_STRUT_DX, HOPPER_STRUT_DX):
        pieces.append(box('dark-iron', HOPPER_STRUT_SIZE, (HOPPER_X + dx, HOPPER_Y - 0.03, HOPPER_FOOT_Z + HOPPER_STRUT_SIZE[2] / 2)))
    for index, dx in enumerate(HOPPER_COAL_DXS):
        lump_z = HOPPER_RIM_Z + HOPPER_COAL_RADIUS * (0.5 if index % 2 else 0.3)
        pieces.append(sphere('coal', HOPPER_COAL_RADIUS, (HOPPER_X + dx, HOPPER_Y - 0.01, lump_z), flatten=0.8))
    return pieces


def belly_tank_pieces():
    """A pale steel belly tank slung under the frame between the wheels on two iron straps,
    brass-banded, with a water sight glass in brass fittings on its face."""
    centre = (BELLY_TANK_X, BELLY_TANK_Y, BELLY_TANK_Z)
    pieces = [cylinder('steel', BELLY_TANK_RADIUS, BELLY_TANK_LENGTH, centre, 'X')]
    for dx in BELLY_BAND_DXS:
        pieces.append(cylinder('brass', BELLY_TANK_RADIUS + 0.004, BAND_LENGTH, (BELLY_TANK_X + dx, BELLY_TANK_Y, BELLY_TANK_Z), 'X'))
    for dx in (-STRAP_DX, STRAP_DX):
        pieces.append(box('dark-iron', STRAP_SIZE, (BELLY_TANK_X + dx, BELLY_TANK_Y - 0.01, STRAP_Z)))
    pieces.append(cylinder('water-glass', SIGHT_GLASS_RADIUS, SIGHT_GLASS_LENGTH, (BELLY_TANK_X, SIGHT_GLASS_Y, BELLY_TANK_Z), 'Z'))
    for dz in (-SIGHT_GLASS_LENGTH / 2, SIGHT_GLASS_LENGTH / 2):
        pieces.append(box('brass', SIGHT_FITTING_SIZE, (BELLY_TANK_X, SIGHT_GLASS_Y, BELLY_TANK_Z + dz)))
    return pieces


PIECES = {
    'twin-tank-tender': twin_tank_tender_pieces,
    'hopper-tender': hopper_tender_pieces,
    'glass-tank-tender': glass_tank_tender_pieces,
}


if __name__ == '__main__':
    main()
