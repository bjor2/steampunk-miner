"""
Authors the first version of the hull track's rig-look parts (ticket 584, wave 576-1B of the rig
look ladder, #576): five armour steps at Systems' thresholds (20, 80, 140, 260, 440 in the model's
hull counter, comment 6300543785 on #157), named by Progression (6300549964), and the base look
beside them.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/author_hull_looks.py

It writes art/blender/vehicle-look-hull/vehicle-look-hull.blend from hullLooks.json (the table this
script, the renders and the outline check share). From then on that file is the source (#52):
change the art in Blender rather than editing this script. Nothing is rigged (#51 acceptance 2)
and nothing is registered: the registry row is #577's and the piece that swaps the part on the
slot is the wiring's (#585).

Conventions are author_platform.py's and the casing driller's (author_casing_driller.py): 1 unit =
1 m, game right is +X (the drill end), up is +Z, details stand out towards -Y. The asset is authored
in its own frame with the track's attach slot, `hull.plates`, at the origin, as the tech gear is
(#166), so the game draws a part at `attachPointOf(vehicleSidecar, 'hull.plates')` with no offset.
The slot sits on the deck line 0.21 m above the pod's axis (vehicle.parts.json: the slot at
(0, 0.14), the chassis at (0, -0.07)); every look is plating on the pod's camera-side skin, three
rows of facets tangent to its cross-section between the stern and the bow socket, with a hatch
opening round the driver's porthole, and two brass lifting eyes on the deck line at the slot.

| Part                   | Step (purchases) | Look                                                                 |
| ---------------------- | ---------------- | -------------------------------------------------------------------- |
| `bronze-pod`           | 0, the default   | the pod's own bands and porthole, piece for piece (the rig as it is) |
| `riveted-plate`        | 20               | warm grey iron plates, brass rivets round every plate                |
| `banded-iron`          | 80               | dark iron plates under polished iron straps, steel studs             |
| `brass-trimmed-armour` | 140              | pale steel plates edged in brass, a brass boss on each, brass frame  |
| `layered-armour`       | 260              | lapped rows of blued steel scales on a dark backing                  |
| `filigree-armour`      | 440              | guild-green enamel under a brass bead-and-bar filigree, teal gems    |

Every look stays inside the pod's silhouette (check_outline.py proves it against the whole rig),
so the swap never grows the rig outline; the filigree's gems are the one glow, under half the
drill nose's, so the nose stays the brightest part (#576 rules).
"""

import json
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'casing-driller'))

import author_casing_driller as driller  # noqa: E402
import author_platform as kit  # noqa: E402
from author_platform import build_part, finish_piece, reset_scene, save_as, sphere, stepped  # noqa: E402

LOOKS_TABLE = os.path.join(HERE, 'hullLooks.json')

# Base colour, roughness, emission strength (author_platform's PALETTE shape). The gems glow at
# well under the nose seams' 1.6 (author_casing_driller's `nose-glow`).
kit.PALETTE.update({
    'blued-steel': ((0.20, 0.24, 0.32), 0.45, 0.0),
    'guild-enamel': ((0.10, 0.22, 0.20), 0.35, 0.0),
    'gem-glow': ((0.55, 0.95, 0.90), 0.15, 0.6),
})

# The pod's axis against the `hull.plates` slot (vehicle.parts.json: the chassis at (0, -0.07),
# the slot at (0, 0.14)). Every piece is laid out in the pod's own frame and shifted here.
POD_OFFSET = (0.0, 0.0, -0.21)
HULL_RADIUS = driller.HULL_RADIUS
# Plating rows (heights off the pod's axis) and columns (along it); the top row ends under the
# dome's base plate and the bottom row above the keel's rivets. The hatch column's two lower rows
# are left open round the porthole (porthole_pieces(0.08, 0.02): ring radius 0.056).
ROWS = ((-0.06, 0.02), (0.02, 0.10), (0.10, 0.15))
COLUMNS = ((-0.24, -0.11), (-0.11, 0.015), (0.015, 0.145), (0.145, 0.24))
HATCH_COLUMN = 2
HATCH_ROWS = (0, 1)
PLATE_T = 0.012
GAP = 0.004
STRIP_T = 0.006
STUD_M = driller.RIVET_M
# The two lifting eyes on the deck line, between the dome base plate's rivets, that put the slot
# inside each part's bounds (the export refuses a pivot outside them). The armour's stand proud of
# the dome plate's front (y -0.16, rivets to -0.18); the base look's sit inside the plate, hidden.
EYE_XS = (-0.2025, 0.0175)
EYE_POST = (0.016, 0.012, 0.045)
EYE_RING_DZ = 0.204
EYE_RING = (0.012, 0.004)
# The armour's posts rise from the plating's top row; the base look's start above the pod,
# behind the dome's base plate.
EYE_POST_DZ_ARMOUR = 0.1725
EYE_POST_DZ_HIDDEN = 0.19
EYE_Y_PROUD = -0.19
EYE_Y_HIDDEN = -0.15
# The base look's copies of the pod's bands keep their camera-side face between the keel's
# rivets and the dome's base plate, where the pod's own bands show.
BAND_XS = (-0.22, 0.0, 0.2)
BAND_DZ = (-0.10, 0.17)
# The platform's 15 mm bevel would round a 1 cm trim away; vehicle-scale parts take 4 mm.
BEVEL_M = driller.BEVEL_M


def main():
    table = read_table()
    reset_scene()
    built = [author_look(look, int(look.get('z', table['z']))) for look in table['looks']]
    check_parts_match_table(table, built)
    save_as(table['assetId'])


def read_table():
    with open(LOOKS_TABLE, encoding='utf8') as file:
        return json.load(file)


def author_look(look, z_order):
    pieces = PIECES[look['part']]()
    shift_pieces(pieces, POD_OFFSET)
    part = build_part(look['part'], pieces, (0.0, 0.0, 0.0), z_order)
    part.modifiers['bevel'].width = BEVEL_M
    return part


def shift_pieces(pieces, offset):
    for piece in pieces:
        piece.location.x += offset[0]
        piece.location.y += offset[1]
        piece.location.z += offset[2]


def check_parts_match_table(table, built):
    names = sorted(part.name for part in built)
    wanted = sorted(look['part'] for look in table['looks'])
    if names != wanted:
        raise SystemExit('%s parts %s do not match the table %s' % (table['assetId'], names, wanted))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (table['assetId'], part.name))


def is_origin_inside(obj):
    """The export refuses a part whose origin (here the slot) is outside its own bounds."""
    (min_x, min_z), (max_x, max_z) = driller.view_bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


# --- facets on the pod's skin (pod frame: the hull's axis at the origin) -------------------------


def tilt_at(dz):
    """The turn about X that lays a box along the pod's camera-side skin at height `dz`."""
    return -math.atan2(driller.HULL_DEPTH_SHARE * dz, math.sqrt(max(HULL_RADIUS ** 2 - dz * dz, 1e-9)))


def on_skin(x, dz, lift):
    """The point `lift` metres out from the skin at (x, dz), along its normal."""
    tilt = tilt_at(dz)
    return (x, driller.hull_front_y(dz) - lift * math.cos(tilt), dz - lift * math.sin(tilt))


def tilted_box(material, size, centre, tilt):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre, rotation=(tilt, 0.0, 0.0))
    return finish_piece(material, scale=size, smooth=False)


def tilted_ring(material, major, minor, centre, tilt):
    """A ring whose axis is the skin's normal at its row."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32,
                                     minor_segments=10, location=centre, rotation=(math.pi / 2 - tilt, 0.0, 0.0))
    return finish_piece(material, smooth=True)


def tilted_disc(material, radius, thickness, centre, tilt):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=thickness, location=centre,
                                        rotation=(math.pi / 2 - tilt, 0.0, 0.0))
    return finish_piece(material, smooth=True)


def facet(material, x0, x1, dz0, dz1, lift, thickness=PLATE_T):
    """A flat plate tangent to the skin at the middle of its span, its back face `lift` off it."""
    dz = (dz0 + dz1) / 2
    centre = on_skin((x0 + x1) / 2, dz, lift + thickness / 2)
    return tilted_box(material, (x1 - x0, thickness, dz1 - dz0), centre, tilt_at(dz))


def stud(material, x, dz, lift):
    return sphere(material, STUD_M, on_skin(x, dz, lift + 0.002), flatten=0.6)


def plated_bays():
    """(x0, x1, dz0, dz1) of every bay that carries a plate: the hatch's lower rows are open."""
    return [(x0, x1, dz0, dz1)
            for column, (x0, x1) in enumerate(COLUMNS)
            for row, (dz0, dz1) in enumerate(ROWS)
            if not (column == HATCH_COLUMN and row in HATCH_ROWS)]


def hatch_bounds():
    x0, x1 = COLUMNS[HATCH_COLUMN]
    return x0, x1, ROWS[HATCH_ROWS[0]][0], ROWS[HATCH_ROWS[-1]][1]


def edge_studs(material, bay, lift, inset=0.014, step=0.04):
    """Studs round a plate's edge."""
    x0, x1, dz0, dz1 = bay
    across = [(x, dz) for x in stepped(x0 + inset, x1 - inset, step) for dz in (dz0 + inset, dz1 - inset)]
    down = [(x, dz) for dz in stepped(dz0 + inset + step, dz1 - inset - step, step) for x in (x0 + inset, x1 - inset)]
    return [stud(material, x, dz, lift) for x, dz in across + down]


def rim_strips(material, bay, width, lift):
    """Thin strips along a plate's four edges, over it."""
    x0, x1, dz0, dz1 = bay
    return [
        facet(material, x0, x1, dz0, dz0 + width, lift, STRIP_T),
        facet(material, x0, x1, dz1 - width, dz1, lift, STRIP_T),
        facet(material, x0, x0 + width, dz0, dz1, lift, STRIP_T),
        facet(material, x1 - width, x1, dz0, dz1, lift, STRIP_T),
    ]


def lifting_eyes(y, post_dz):
    """Two brass eyes on the deck line at the slot, the armour's hoisting points."""
    pieces = []
    for x in EYE_XS:
        pieces.append(kit.box('brass', EYE_POST, (x, y, post_dz)))
        pieces.append(kit.torus('brass', EYE_RING[0], EYE_RING[1], (x, y, EYE_RING_DZ)))
    return pieces


def cut(piece, plane_co, plane_no):
    """Keeps the side of the plane its normal points to (author_casing_driller.dome's cut)."""
    mesh = bmesh.new()
    mesh.from_mesh(piece.data)
    geometry = mesh.verts[:] + mesh.edges[:] + mesh.faces[:]
    bmesh.ops.bisect_plane(mesh, geom=geometry, plane_co=plane_co, plane_no=plane_no, clear_inner=True)
    mesh.to_mesh(piece.data)
    mesh.free()
    return piece


# --- the bronze pod (the default look) -----------------------------------------------------------


def bronze_pod_pieces():
    """The pod's own brass bands and porthole (author_casing_driller.chassis_pieces), half a
    millimetre proud so the copy does not fight the pod's skin: below the first step the rig is
    as it is. The bands keep the face that shows, between the keel and the dome plate."""
    pieces = [band_face(x) for x in BAND_XS]
    pieces += [driller.rivet(x, driller.hull_front_y(dz, 0.008) - 0.004, dz)
               for x in BAND_XS for dz in stepped(-0.06, 0.12, 0.06)]
    pieces += driller.porthole_pieces(0.08, 0.02)
    for piece in pieces:
        piece.location.y -= 0.0005
    return pieces + lifting_eyes(EYE_Y_HIDDEN, EYE_POST_DZ_HIDDEN)


def band_face(x):
    band = driller.flat_cylinder_x('brass', HULL_RADIUS + 0.008, 0.03, (x, 0.0, 0.0), driller.HULL_DEPTH_SHARE)
    cut(band, (0.0, 0.0, 0.0), (0.0, -1.0, 0.0))
    cut(band, (0.0, 0.0, BAND_DZ[0]), (0.0, 0.0, 1.0))
    return cut(band, (0.0, 0.0, BAND_DZ[1]), (0.0, 0.0, -1.0))


# --- riveted plate (20) --------------------------------------------------------------------------


def riveted_plate_pieces():
    pieces = []
    for bay in plated_bays():
        pieces.append(facet('iron-plate', *bay, GAP))
        pieces += edge_studs('brass', bay, GAP + PLATE_T)
    return pieces + lifting_eyes(EYE_Y_PROUD, EYE_POST_DZ_ARMOUR)


# --- banded iron (80) ----------------------------------------------------------------------------


STRAP_W = 0.03


def banded_iron_pieces():
    pieces = [facet('hull-steel', *bay, GAP) for bay in plated_bays()]
    pieces += strap_pieces('steel', GAP + PLATE_T)
    return pieces + lifting_eyes(EYE_Y_PROUD, EYE_POST_DZ_ARMOUR)


def strap_pieces(material, lift):
    """Polished straps down every column seam and along every row seam, studded where they cross."""
    pieces = []
    seams_x = [x for x, _ in COLUMNS[1:]] + [COLUMNS[0][0] + STRAP_W / 2, COLUMNS[-1][1] - STRAP_W / 2]
    hatch_x0, hatch_x1, hatch_dz0, hatch_dz1 = hatch_bounds()
    for x in seams_x:
        for dz0, dz1 in ROWS:
            if hatch_x0 < x < hatch_x1 and dz0 < hatch_dz1 and dz1 > hatch_dz0:
                continue
            pieces.append(facet(material, x - STRAP_W / 2, x + STRAP_W / 2, dz0, dz1, lift, STRIP_T))
    for dz in [ROWS[1][0], ROWS[2][0]]:
        for x0, x1 in COLUMNS:
            if hatch_x0 <= x0 < hatch_x1 and hatch_dz0 < dz < hatch_dz1:
                continue
            pieces.append(facet(material, x0, x1, dz - STRAP_W / 2, dz + STRAP_W / 2, lift, STRIP_T))
    pieces += [stud('steel', x, dz, lift + STRIP_T) for x in seams_x for dz in (ROWS[1][0], ROWS[2][0])
               if not (hatch_x0 < x < hatch_x1 and hatch_dz0 < dz < hatch_dz1)]
    return pieces


# --- brass-trimmed armour (140) ------------------------------------------------------------------


TRIM_W = 0.012


def brass_trimmed_pieces():
    pieces = []
    for bay in plated_bays():
        pieces.append(facet('steel', *bay, GAP))
        pieces += rim_strips('brass', bay, TRIM_W, GAP + PLATE_T)
        pieces += corner_studs('brass', bay, GAP + PLATE_T + STRIP_T)
        pieces.append(boss('brass', bay, GAP + PLATE_T))
    pieces += hatch_frame('brass', GAP + PLATE_T)
    return pieces + lifting_eyes(EYE_Y_PROUD, EYE_POST_DZ_ARMOUR)


def corner_studs(material, bay, lift, inset=0.012):
    x0, x1, dz0, dz1 = bay
    return [stud(material, x, dz, lift) for x in (x0 + inset, x1 - inset) for dz in (dz0 + inset, dz1 - inset)]


def boss(material, bay, lift, radius=0.016):
    x0, x1, dz0, dz1 = bay
    dz = (dz0 + dz1) / 2
    return tilted_disc(material, radius, 0.008, on_skin((x0 + x1) / 2, dz, lift + 0.004), tilt_at(dz))


def hatch_frame(material, lift, width=0.014):
    """A frame round the hatch opening, its sides one segment per row; its sill lies along the
    plating's bottom edge, inside the opening, and its lintel over the top row's plate."""
    x0, x1, dz0, dz1 = hatch_bounds()
    pieces = [
        facet(material, x0 - width, x1 + width, dz0, dz0 + width, lift, STRIP_T),
        facet(material, x0 - width, x1 + width, dz1, dz1 + width, lift, STRIP_T),
    ]
    for row in HATCH_ROWS:
        row_dz0, row_dz1 = ROWS[row]
        pieces.append(facet(material, x0 - width, x0, row_dz0, row_dz1, lift, STRIP_T))
        pieces.append(facet(material, x1, x1 + width, row_dz0, row_dz1, lift, STRIP_T))
    return pieces


# --- layered armour (260) ------------------------------------------------------------------------


SCALE_W = 0.062
SCALE_LAP = 0.012
SCALE_STEP = 0.006


def layered_armour_pieces():
    pieces = []
    for bay in plated_bays():
        pieces.append(facet('dark-iron', *bay, GAP))
        pieces += scale_pieces('blued-steel', bay, GAP + PLATE_T)
    return pieces + lifting_eyes(EYE_Y_PROUD, EYE_POST_DZ_ARMOUR)


def scale_pieces(material, bay, lift):
    """Two lapped courses of scales per bay, the upper course over the lower, each scale lapping
    its left neighbour; the backing shows in the gaps as dark seams."""
    x0, x1, dz0, dz1 = bay
    middle = (dz0 + dz1) / 2
    pieces = []
    for course, (low, high) in enumerate(((dz0, middle + SCALE_LAP), (middle, dz1))):
        course_lift = lift + course * SCALE_STEP
        for index, x in enumerate(stepped(x0, x1 - SCALE_W + SCALE_LAP, SCALE_W - SCALE_LAP)):
            right = min(x + SCALE_W, x1)
            pieces.append(facet(material, x, right, low, high, course_lift + (index % 2) * SCALE_STEP / 2, 0.008))
            pieces.append(stud('dark-iron', (x + right) / 2, high - 0.012, course_lift + 0.008))
    return pieces


# --- filigree armour (440) -----------------------------------------------------------------------


BEAD_MAJOR = 0.011
BEAD_MINOR = 0.003
BAR_W = 0.007
GEM_RADIUS = 0.012


def filigree_armour_pieces():
    pieces = []
    for bay in plated_bays():
        pieces.append(facet('guild-enamel', *bay, GAP))
        pieces += rim_strips('brass', bay, BAR_W, GAP + PLATE_T)
        pieces += filigree_pieces(bay, GAP + PLATE_T)
    pieces += hatch_frame('brass', GAP + PLATE_T, width=BAR_W)
    return pieces + lifting_eyes(EYE_Y_PROUD, EYE_POST_DZ_ARMOUR)


def filigree_pieces(bay, lift):
    """A brass bar down the bay's middle with a chain of beads either side and a glowing gem at
    the centre: the guild's tracery."""
    x0, x1, dz0, dz1 = bay
    dz = (dz0 + dz1) / 2
    height = dz1 - dz0
    pieces = [facet('brass', x0 + 0.02, x1 - 0.02, dz - BAR_W / 2, dz + BAR_W / 2, lift, STRIP_T)]
    for bead_dz in (dz - height * 0.28, dz + height * 0.28):
        for x in stepped(x0 + 0.024, x1 - 0.024, 2 * BEAD_MAJOR + 0.004):
            if abs(x - (x0 + x1) / 2) < GEM_RADIUS + BEAD_MAJOR:
                continue
            pieces.append(tilted_ring('brass', BEAD_MAJOR, BEAD_MINOR, on_skin(x, bead_dz, lift + BEAD_MINOR), tilt_at(bead_dz)))
    pieces.append(tilted_ring('brass', GEM_RADIUS + 0.003, 0.003, on_skin((x0 + x1) / 2, dz, lift + 0.003), tilt_at(dz)))
    pieces.append(tilted_disc('gem-glow', GEM_RADIUS, 0.006, on_skin((x0 + x1) / 2, dz, lift + 0.003), tilt_at(dz)))
    return pieces


PIECES = {
    'bronze-pod': bronze_pod_pieces,
    'riveted-plate': riveted_plate_pieces,
    'banded-iron': banded_iron_pieces,
    'brass-trimmed-armour': brass_trimmed_pieces,
    'layered-armour': layered_armour_pieces,
    'filigree-armour': filigree_armour_pieces,
}


if __name__ == '__main__':
    main()
