"""
Authors the first version of the coal tender, the fuel tank track's wagon on the rig (ticket 758,
the map art pass of the GD lock on #650: the tank "shows on the rig as a coal tender wagon on the
#576 ladder"): one wagon per step of the tender's ladder, src/data/vehicle/fuelTender.json, which
this script, the renders and the game read.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/author_fuel_tender.py

It writes art/blender/vehicle-fuel-tank/vehicle-fuel-tank.blend. From then on that file is the
source (#52): change the art in Blender rather than editing this script. Nothing is rigged (#51
acceptance 2); the kernel's `FuelTenderPiece` hangs the level's wagon at the hitch and the vehicle
look paints the tail's tint above the top step.

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in its own frame with the wagon hitch, `hull.hitch`, at the origin (K5), so the game draws a wagon
at `attachPointOf(vehicleSidecar, 'hull.hitch')` with no offset. The hitch is at (-0.52, -0.30) in
the vehicle frame (vehicle.parts.json), under the stern behind the casing arms, 0.18 m over the
ground line the rollers stand on (hub z -0.36, radius 0.12), so the wagon's wheels stand on that
line and the wagon trails the rig to the left. Draw order `z` 0: behind every rig part, as the
hitch's own `z` 1 is behind the pod.

Every wagon is one part: the hitch ring and drawbar at the origin, a riveted iron frame on two
small wheels, and the step's body with its coal. The steps differ in body material, height and
fittings, which is what reads at a 360 px phone's width:

| Part             | Step (tank level)   | Look                                                                      |
| ---------------- | ------------------- | ------------------------------------------------------------------------- |
| `coal-cart`      | 1, the starting tank | a low timber bin on iron straps, a small heap of coal                     |
| `bunker-tender`  | 2                   | a taller riveted iron bunker under a brass rail, a full heap of coal      |
| `riveted-tender` | 3                   | a steel bunker in a brass rivet frame carrying a banded copper water tank |
| `guild-tender`   | 5                   | a guild-green enamel tender in brass filigree, twin bunkers and a lantern |

Nothing on the wagon glows (no emissive map): the tail's tint and glow above the top step are the
kernel's vehicle look paint, under the rig body's cap, so the drill nose stays the brightest part.
"""

import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import box, build_part, cylinder, reset_scene, save_as, sphere  # noqa: E402

LADDER_TABLE = os.path.join(REPO_ROOT, 'src', 'data', 'vehicle', 'fuelTender.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape).
kit.PALETTE.update({
    'timber': ((0.34, 0.22, 0.11), 0.75, 0.0),
    'timber-dark': ((0.22, 0.14, 0.07), 0.8, 0.0),
    'coal': ((0.03, 0.028, 0.03), 0.55, 0.0),
    'guild-enamel': ((0.10, 0.22, 0.20), 0.35, 0.0),
    'lantern-glass': ((0.92, 0.62, 0.22), 0.15, 0.0),
})

# The vehicle frame's ground line (hub z -0.36 less the roller radius 0.12), in the asset frame.
HITCH_VEHICLE = (-0.52, -0.30)
GROUND_Z = -0.48 - HITCH_VEHICLE[1]
# The wheels: two small rollers standing on the ground line.
WHEEL_R = 0.07
WHEEL_XS = (-0.20, -0.46)
WHEEL_Z = GROUND_Z + WHEEL_R
WHEEL_Y = -0.02
# The frame bar over the wheels and the body's foot on it.
FRAME = (0.46, 0.03, 0.03)
FRAME_X = -0.33
FRAME_Z = -0.045
BODY_X0, BODY_X1 = -0.56, -0.10
BODY_FOOT = FRAME_Z + FRAME[2] / 2
BODY_DEPTH = 0.07
BODY_Y = -0.06
FRONT_Y = -0.1
# The drawbar from the hitch ring to the frame's near end.
DRAWBAR_END = (-0.12, -0.045)
HITCH_RING = (0.022, 0.007)
# Rivets: the platform's 15 mm bevel would round them away; vehicle-scale parts take 4 mm.
BEVEL_M = driller.BEVEL_M
RIVET_R = 0.006


def main():
    table = read_table()
    reset_scene()
    built = [author_wagon(step, int(table['z'])) for step in table['steps']]
    check_parts_match_table(table, built)
    save_as(table['assetId'])


def read_table():
    with open(LADDER_TABLE, encoding='utf8') as file:
        return json.load(file)


def author_wagon(step, z_order):
    pieces = undercarriage_pieces() + BODIES[step['part']]()
    part = build_part(step['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def check_parts_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(step['part'] for step in table['steps'])
    if names != wanted:
        raise SystemExit('%s parts %s do not match the table %s' % (table['assetId'], names, wanted))
    for part in built:
        (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(part)
        if not (min_x <= 0.0 <= max_x and min_z <= 0.0 <= max_z):
            raise SystemExit('%s: the hitch (origin) lies outside "%s"' % (table['assetId'], part.name))
        if min_z < GROUND_Z - 1e-6:
            raise SystemExit('%s: "%s" reaches below the ground line' % (table['assetId'], part.name))


# --- what every wagon shares: the hitch, the frame and the wheels ---------------------------------


def undercarriage_pieces():
    pieces = [
        kit.torus('brass', HITCH_RING[0], HITCH_RING[1], (0.0, -0.03, 0.0)),
        sphere('dark-iron', 0.009, (0.0, -0.03, 0.0)),
        driller.segment('brass', (-HITCH_RING[0] + 0.004, -0.004), DRAWBAR_END, 0.02, 0.02, -0.03),
        box('iron-plate', FRAME, (FRAME_X, -0.03, FRAME_Z)),
    ]
    for x in WHEEL_XS:
        pieces += wheel_pieces(x)
        pieces.append(box('dark-iron', (0.05, 0.04, 0.03), (x, -0.035, FRAME_Z - 0.03)))
    pieces += [driller.rivet(x, -0.047, FRAME_Z, radius=RIVET_R) for x in driller.stepped(-0.54, -0.12, 0.06)]
    return pieces


def wheel_pieces(x):
    """A small spoked roller: a rubber tyre, an iron disc, six bolts and a brass hub cap."""
    centre = (x, WHEEL_Y, WHEEL_Z)
    pieces = [
        kit.torus('rubber', WHEEL_R - 0.014, 0.013, centre),
        driller.disc('dark-iron', WHEEL_R - 0.018, 0.04, centre),
    ]
    for _, dx, dz in driller.around(6, WHEEL_R - 0.034):
        pieces.append(driller.disc('soot', 0.007, 0.01, (x + dx, WHEEL_Y - 0.021, WHEEL_Z + dz)))
    pieces.append(driller.disc('brass', 0.016, 0.02, (x, WHEEL_Y - 0.03, WHEEL_Z)))
    return pieces


# --- the bodies -----------------------------------------------------------------------------------


def body_box(material, height, depth=BODY_DEPTH, inset=0.0):
    width = BODY_X1 - BODY_X0 - 2 * inset
    centre_x = (BODY_X0 + BODY_X1) / 2
    return box(material, (width, depth, height), (centre_x, BODY_Y, BODY_FOOT + height / 2))


def coal_heap(top_z, x0, x1, rows=2, radius=0.03):
    """Lumps of coal heaped over the bunker's mouth, higher in the middle."""
    pieces = []
    count = max(2, int((x1 - x0) / (radius * 1.5)))
    for row in range(rows):
        for index in range(count - row):
            share = (index + 0.5 + row * 0.5) / count
            x = x0 + share * (x1 - x0)
            hump = math.sin(share * math.pi) * radius * 0.8
            z = top_z + row * radius * 1.1 + hump - radius * 0.2
            y = BODY_Y - 0.01 - 0.012 * ((index + row) % 2)
            pieces.append(sphere('coal', radius * (0.8 + 0.2 * ((index * 7 + row) % 3) / 2), (x, y, z), flatten=0.8))
    return pieces


def rivet_frame(x0, x1, z0, z1, y, step=0.05):
    pieces = []
    for x in driller.stepped(x0, x1, step):
        pieces += [driller.rivet(x, y, z0, radius=RIVET_R), driller.rivet(x, y, z1, radius=RIVET_R)]
    for z in driller.stepped(z0 + step, z1 - step / 2, step):
        pieces += [driller.rivet(x0, y, z, radius=RIVET_R), driller.rivet(x1, y, z, radius=RIVET_R)]
    return pieces


def coal_cart_pieces():
    """The starting tank: a low timber bin, four planks on two iron straps, a small heap of coal."""
    height = 0.12
    pieces = [body_box('timber-dark', height, depth=BODY_DEPTH - 0.01)]
    plank = 0.028
    for index in range(4):
        z = BODY_FOOT + plank / 2 + index * (plank + 0.002)
        pieces.append(box('timber', (BODY_X1 - BODY_X0, 0.012, plank), ((BODY_X0 + BODY_X1) / 2, BODY_Y - BODY_DEPTH / 2, z)))
    for x in (-0.18, -0.33, -0.48):
        pieces.append(box('iron', (0.02, 0.014, height + 0.01), (x, BODY_Y - BODY_DEPTH / 2 - 0.004, BODY_FOOT + height / 2)))
        pieces += [driller.rivet(x, BODY_Y - BODY_DEPTH / 2 - 0.012, BODY_FOOT + dz, radius=RIVET_R) for dz in (0.02, height - 0.02)]
    pieces += coal_heap(BODY_FOOT + height - 0.01, BODY_X0 + 0.05, BODY_X1 - 0.05, rows=1, radius=0.026)
    return pieces


def bunker_tender_pieces():
    """The first purchase: a taller riveted iron bunker under a brass rail, full of coal."""
    height = 0.20
    y = BODY_Y - BODY_DEPTH / 2
    pieces = [body_box('iron-plate', height)]
    pieces += rivet_frame(BODY_X0 + 0.025, BODY_X1 - 0.025, BODY_FOOT + 0.02, BODY_FOOT + height - 0.03, y - 0.004)
    pieces.append(box('brass', (BODY_X1 - BODY_X0 + 0.02, BODY_DEPTH + 0.01, 0.014), ((BODY_X0 + BODY_X1) / 2, BODY_Y, BODY_FOOT + height - 0.007)))
    pieces.append(box('iron', (0.02, 0.012, height - 0.03), ((BODY_X0 + BODY_X1) / 2, y - 0.005, BODY_FOOT + height / 2 - 0.01)))
    pieces += coal_heap(BODY_FOOT + height - 0.01, BODY_X0 + 0.04, BODY_X1 - 0.04, rows=2, radius=0.03)
    return pieces


def riveted_tender_pieces():
    """Two purchases: a steel bunker in a brass rivet frame carrying a banded copper water tank."""
    height = 0.20
    y = BODY_Y - BODY_DEPTH / 2
    pieces = [body_box('steel', height)]
    for z in (BODY_FOOT + 0.012, BODY_FOOT + height - 0.012):
        pieces.append(box('brass', (BODY_X1 - BODY_X0, 0.012, 0.016), ((BODY_X0 + BODY_X1) / 2, y - 0.004, z)))
    for x in (BODY_X0 + 0.008, BODY_X1 - 0.008):
        pieces.append(box('brass', (0.016, 0.012, height), (x, y - 0.004, BODY_FOOT + height / 2)))
    pieces += rivet_frame(BODY_X0 + 0.03, BODY_X1 - 0.03, BODY_FOOT + 0.035, BODY_FOOT + height - 0.035, y - 0.006, step=0.045)
    tank_x, tank_len, tank_r = -0.42, 0.24, 0.055
    tank_z = BODY_FOOT + height + tank_r - 0.005
    pieces.append(cylinder('copper', tank_r, tank_len, (tank_x, BODY_Y, tank_z), 'X'))
    for dx in (-0.08, 0.0, 0.08):
        pieces.append(kit.torus('brass', tank_r + 0.002, 0.005, (tank_x + dx, BODY_Y, tank_z)))
    pieces.append(sphere('brass', 0.022, (tank_x, BODY_Y, tank_z + tank_r - 0.004), flatten=0.8))
    pieces.append(cylinder('iron', 0.012, 0.03, (tank_x, BODY_Y, tank_z + tank_r + 0.02), 'Z'))
    pieces += coal_heap(BODY_FOOT + height - 0.01, BODY_X1 - 0.17, BODY_X1 - 0.03, rows=2, radius=0.026)
    return pieces


def guild_tender_pieces():
    """Four purchases: a guild-green enamel tender in brass filigree, twin bunkers and a lantern."""
    height = 0.22
    y = BODY_Y - BODY_DEPTH / 2
    mid = (BODY_X0 + BODY_X1) / 2
    pieces = [body_box('guild-enamel', height)]
    for z in (BODY_FOOT + 0.012, BODY_FOOT + height - 0.012):
        pieces.append(box('brass', (BODY_X1 - BODY_X0 + 0.01, 0.014, 0.018), (mid, y - 0.004, z)))
    for x in (BODY_X0 + 0.009, mid, BODY_X1 - 0.009):
        pieces.append(box('brass', (0.018, 0.014, height), (x, y - 0.004, BODY_FOOT + height / 2)))
    for x in (mid - 0.115, mid + 0.115):
        pieces.append(kit.torus('brass', 0.05, 0.006, (x, y - 0.006, BODY_FOOT + height / 2)))
        pieces.append(kit.torus('brass', 0.028, 0.005, (x, y - 0.008, BODY_FOOT + height / 2)))
        pieces.append(sphere('bronze', 0.012, (x, y - 0.012, BODY_FOOT + height / 2), flatten=0.6))
    pieces.append(box('brass', (0.024, BODY_DEPTH + 0.02, 0.05), (mid, BODY_Y, BODY_FOOT + height + 0.02)))
    pieces += coal_heap(BODY_FOOT + height - 0.01, BODY_X0 + 0.03, mid - 0.025, rows=2, radius=0.028)
    pieces += coal_heap(BODY_FOOT + height - 0.01, mid + 0.025, BODY_X1 - 0.03, rows=2, radius=0.028)
    lantern = (BODY_X0 + 0.02, BODY_Y, BODY_FOOT + height + 0.075)
    pieces += [
        cylinder('iron', 0.006, 0.07, (lantern[0], BODY_Y, BODY_FOOT + height + 0.03), 'Z'),
        kit.torus('brass', 0.026, 0.006, lantern),
        sphere('lantern-glass', 0.02, lantern),
        cylinder('brass', 0.014, 0.012, (lantern[0], BODY_Y, lantern[2] + 0.03), 'Z'),
    ]
    return pieces


BODIES = {
    'coal-cart': coal_cart_pieces,
    'bunker-tender': bunker_tender_pieces,
    'riveted-tender': riveted_tender_pieces,
    'guild-tender': guild_tender_pieces,
}


if __name__ == '__main__':
    main()
