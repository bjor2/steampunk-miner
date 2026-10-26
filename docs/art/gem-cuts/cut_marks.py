"""
The 24 cuts of the gem-cut library (ticket 889) as Blender builders, one stone per cut on the ore
stage: a girdle outline in the face plane (y = 0, the game's XZ), a crown of flat facets standing
toward the camera (negative y) and a pavilion sunk behind the face, which the rock's holdout
hides. Every facet is flat-shaded so it catches the key lamp whole, and the stone wears the gems'
shared facet-glint treatment of ticket 744 (`hero_marks.facet_glint`) in neutral grey with white
highlights: the game colours the cut by the gem's hue slot and keeps its luma, so the highlight
stays white whatever the hue (`src/scene/terrainKindShader.ts` `gemCutSkin`).

A crown is a list of rings: each a scale of the girdle (one number, or one per axis), its height
toward the camera and whether it is twisted half a step, which turns the quads between two rings
into the kite and star triangles of a brilliant crown. The last ring is the table unless the crown
ends in a point.
"""

import math

import bmesh
import bpy
import gem_cuts as library
import hero_marks as marks
import ore_materials as materials
import ore_shapes as shapes

TAU = 2.0 * math.pi
# The girdle's reach from the cell's centre: the stone fills most of its 1 m cell, so it still reads
# at 24 px a tile (ticket 315's phone floor), with rock showing round it.
REACH = 0.42
# How deep the pavilion goes behind the face: hidden by the holdout, it gives the stone its volume.
PAVILION = 0.3
# Flat-shaded stones: twisted rings make brilliant crowns, plain rings make step cuts.
TWIST, STEP = True, False


# --- outlines in the face plane, counter-clockwise, centred on the cell ----------------------------


def circle(sides, radius=REACH, phase=0.0):
    return shapes.regular_points((0.0, 0.0), radius, sides, phase)


def ellipse(half_x, half_z, sides=20):
    return [(half_x * math.cos(TAU * i / sides), half_z * math.sin(TAU * i / sides)) for i in range(sides)]


def superellipse(half_x, half_z, power=3.0, sides=24):
    """A cushion: a square whose corners round off, the higher the power the squarer."""
    points = []
    for i in range(sides):
        angle = TAU * i / sides
        c, s = math.cos(angle), math.sin(angle)
        points.append((half_x * math.copysign(abs(c) ** (2.0 / power), c), half_z * math.copysign(abs(s) ** (2.0 / power), s)))
    return points


def clipped_rectangle(half_x, half_z, clip):
    """A rectangle with its corners cut off square: the emerald and asscher girdles."""
    return [(-half_x + clip, -half_z), (half_x - clip, -half_z), (half_x, -half_z + clip), (half_x, half_z - clip),
            (half_x - clip, half_z), (-half_x + clip, half_z), (-half_x, half_z - clip), (-half_x, -half_z + clip)]


def rectangle(half_x, half_z):
    return [(-half_x, -half_z), (half_x, -half_z), (half_x, half_z), (-half_x, half_z)]


def teardrop(half_x, half_z, sides=24, point_up=True):
    """Round at the foot, drawn to a point at the head."""
    points = []
    for i in range(sides):
        t = TAU * i / sides
        narrowing = math.sqrt((1.0 - math.cos(t)) / 2.0)
        x = half_x * math.sin(t) * narrowing
        z = half_z * math.cos(t)
        points.append((x, z if point_up else -z))
    return points if point_up else list(reversed(points))


def lens(half_x, half_z, sides=24):
    """A marquise: two arcs meeting in points at the left and the right."""
    return [(half_x * math.cos(TAU * i / sides), half_z * math.sin(TAU * i / sides) * abs(math.sin(TAU * i / sides)))
            for i in range(sides)]


def heart(reach, sides=28):
    points = []
    for i in range(sides):
        t = TAU * i / sides
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        points.append((x * reach / 17.0, z * reach / 17.0 + 0.02))
    return points


def bulged_polygon(corners, bulge, segments=6):
    """A polygon whose sides bow out: the trillion's curved triangle."""
    points = []
    count = len(corners)
    for i in range(count):
        (ax, az), (bx, bz) = corners[i], corners[(i + 1) % count]
        mx, mz = (ax + bx) / 2.0, (az + bz) / 2.0
        length = math.hypot(bx - ax, bz - az)
        nx, nz = (bz - az) / length, -(bx - ax) / length
        for step in range(segments):
            t = step / segments
            bow = bulge * math.sin(math.pi * t)
            points.append((ax + (bx - ax) * t - nx * bow, az + (bz - az) * t - nz * bow))
    return points


def half_moon(half_x, drop, flat_z, sides=14):
    points = [(-half_x, flat_z), (half_x, flat_z)]
    for i in range(1, sides):
        t = math.pi * i / sides
        points.append((half_x * math.cos(t), flat_z - drop * math.sin(t)))
    return points


# --- the stone -------------------------------------------------------------------------------------


def scaled(points, scale):
    sx, sz = (scale, scale) if isinstance(scale, (int, float)) else scale
    return [(x * sx, z * sz) for x, z in points]


def midpoints(points):
    count = len(points)
    return [((points[i][0] + points[(i + 1) % count][0]) / 2.0, (points[i][1] + points[(i + 1) % count][1]) / 2.0)
            for i in range(count)]


def stone(name, outline, rings, apex=None, pavilion=PAVILION):
    """
    The cut's mesh: the girdle at the face, each crown ring toward the camera (a twisted ring takes
    the midpoints of the ring below, scaled), the table over the last ring or an apex at `apex`
    (its height), and the pavilion to a point `pavilion` behind the face.
    """
    vertices = [(x, 0.0, z) for x, z in outline]
    faces = []
    below = outline
    below_at = 0
    count = len(outline)
    for scale, height, twist in rings:
        ring = scaled(midpoints(below) if twist else below, scale) if twist else scaled(outline, scale)
        ring_at = len(vertices)
        vertices += [(x, -height, z) for x, z in ring]
        faces += ring_faces(below_at, ring_at, count, twist)
        below, below_at = ring, ring_at
    if apex is None:
        faces.append(tuple(range(below_at, below_at + count)))
    else:
        tip = len(vertices)
        vertices.append((0.0, -apex, 0.0))
        faces += [(below_at + i, below_at + (i + 1) % count, tip) for i in range(count)]
    back = len(vertices)
    vertices.append((0.0, pavilion, 0.0))
    faces += [((i + 1) % count, i, back) for i in range(count)]
    return mesh_object(name, vertices, faces)


def ring_faces(below_at, ring_at, count, twist):
    if not twist:
        return [(below_at + i, below_at + (i + 1) % count, ring_at + (i + 1) % count, ring_at + i) for i in range(count)]
    faces = []
    for i in range(count):
        nxt = (i + 1) % count
        faces.append((below_at + i, below_at + nxt, ring_at + i))
        faces.append((below_at + nxt, ring_at + nxt, ring_at + i))
    return faces


def mesh_object(name, vertices, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return marks.faceted(obj)


def pyramid(name, centre, half, base_height, apex_height):
    """One square facet-pyramid of the checkerboard crown, its base in the crown plane."""
    cx, cz = centre
    vertices = [(cx - half, -base_height, cz - half), (cx + half, -base_height, cz - half),
                (cx + half, -base_height, cz + half), (cx - half, -base_height, cz + half), (cx, -apex_height, cz)]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)]
    return mesh_object(name, vertices, faces)


def neutral_glass(cut_id):
    """The one material of the library: a grey, hard-coated stone whose rim and glint are white."""
    material = materials.surface_material('cut-' + cut_id, library.BODY_HEX, roughness=0.04, transmission=0.0, ior=1.6,
                                          coat=0.5, emission_hex=library.GLINT_HEX, emission_strength=0.0)
    marks.drive_rim(material, 0.35, floor=0.06)
    material['albedo_hex'] = library.BODY_HEX
    # A softer falloff than the hero gems' (ticket 744): one stone has no cluster of neighbours, so
    # its own facets must step apart in luma, and a facet a way off the lamp still lifts a little.
    return marks.facet_glint(material, strength=1.4, sharpness=6.0)


# --- the cuts, keyed by id --------------------------------------------------------------------------

BRILLIANT_CROWN = [(0.86, 0.1, STEP), (0.6, 0.18, TWIST), (0.44, 0.2, TWIST)]
SOFT_CROWN = [(0.7, 0.11, TWIST), (0.44, 0.19, STEP)]
STEP_CROWN = [(0.8, 0.08, STEP), (0.62, 0.15, STEP), (0.45, 0.2, STEP)]

CUTS = {
    'gem-cut.brilliant': lambda: stone('brilliant', circle(12, phase=TAU / 24), BRILLIANT_CROWN),
    'gem-cut.oval': lambda: stone('oval', ellipse(0.45, 0.3), SOFT_CROWN),
    'gem-cut.cushion': lambda: stone('cushion', superellipse(0.4, 0.4, power=4.0, sides=16), [(0.86, 0.1, STEP), (0.6, 0.18, TWIST), (0.44, 0.2, TWIST)]),
    'gem-cut.emerald': lambda: stone('emerald', clipped_rectangle(0.3, 0.4, 0.08), STEP_CROWN),
    'gem-cut.asscher': lambda: stone('asscher', clipped_rectangle(0.37, 0.37, 0.13), [(0.78, 0.08, STEP), (0.56, 0.15, STEP), (0.34, 0.21, STEP)]),
    'gem-cut.princess': lambda: stone('princess', circle(4, radius=0.44, phase=TAU / 8), [(0.5, 0.2, TWIST)]),
    'gem-cut.radiant': lambda: stone('radiant', clipped_rectangle(0.42, 0.3, 0.08), [(0.78, 0.1, TWIST), (0.5, 0.19, TWIST)]),
    'gem-cut.pear': lambda: stone('pear', teardrop(0.36, 0.44), SOFT_CROWN),
    'gem-cut.marquise': lambda: stone('marquise', lens(0.46, 0.22), SOFT_CROWN),
    'gem-cut.heart': lambda: stone('heart', heart(0.42), SOFT_CROWN),
    'gem-cut.trillion': lambda: stone('trillion', bulged_polygon(circle(3, radius=0.44, phase=TAU / 4), 0.06), [(0.7, 0.11, TWIST), (0.4, 0.19, STEP)]),
    'gem-cut.baguette': lambda: stone('baguette', rectangle(0.2, 0.44), [(0.74, 0.09, STEP), (0.46, 0.17, STEP)]),
    'gem-cut.kite': lambda: stone('kite', [(0.0, -0.42), (0.27, 0.08), (0.0, 0.44), (-0.27, 0.08)], [((0.12, 0.6), 0.18, STEP)]),
    'gem-cut.shield': lambda: stone('shield', [(0.0, -0.42), (0.37, 0.0), (0.35, 0.36), (-0.35, 0.36), (-0.37, 0.0)], STEP_CROWN),
    'gem-cut.hexagon': lambda: stone('hexagon', scaled(circle(6, phase=0.0), (1.05, 0.85)), [(0.55, 0.18, STEP)]),
    'gem-cut.octagon': lambda: stone('octagon', scaled(circle(8, phase=TAU / 16), (0.8, 1.05)), [(0.56, 0.18, STEP)]),
    'gem-cut.lozenge': lambda: stone('lozenge', [(0.0, -0.46), (0.28, 0.0), (0.0, 0.46), (-0.28, 0.0)], [((0.5, 0.14), 0.18, STEP)]),
    'gem-cut.half-moon': lambda: stone('half-moon', half_moon(0.44, 0.46, 0.14), [(0.8, 0.08, STEP), (0.6, 0.15, STEP), (0.4, 0.2, STEP)]),
    'gem-cut.bullet': lambda: stone('bullet', [(-0.17, -0.4), (0.17, -0.4), (0.17, 0.2), (0.0, 0.44), (-0.17, 0.2)], [(0.72, 0.09, STEP), (0.42, 0.17, STEP)]),
    'gem-cut.trapeze': lambda: stone('trapeze', [(-0.44, -0.28), (0.44, -0.28), (0.28, 0.28), (-0.28, 0.28)], STEP_CROWN),
    'gem-cut.rose': lambda: stone('rose', circle(12, radius=0.34), [(0.8, 0.08, TWIST), (0.52, 0.2, TWIST)], apex=0.32),
    'gem-cut.briolette': lambda: stone('briolette', teardrop(0.3, 0.44, sides=16, point_up=False), [(0.82, 0.08, TWIST), (0.58, 0.16, TWIST)], apex=0.24),
    'gem-cut.checkerboard': lambda: checkerboard(),
    'gem-cut.sugarloaf': lambda: stone('sugarloaf', rectangle(0.27, 0.27), [(0.8, 0.07, STEP)], apex=0.32),
}


def checkerboard():
    """A cushion whose crown is a chequer of square facet-pyramids."""
    outline = superellipse(0.43, 0.33)
    base = stone('checkerboard', outline, [(0.9, 0.04, STEP)])
    pieces = [base]
    pitch = 0.17
    for column in range(-2, 2):
        for row in range(-2, 2):
            cx, cz = (column + 0.5) * pitch, (row + 0.5) * pitch
            if inside_superellipse(cx, cz, 0.43 * 0.9, 0.33 * 0.9):
                pieces.append(pyramid('checkerboard-%d-%d' % (column + 2, row + 2), (cx, cz), pitch / 2.0, 0.04, 0.12))
    return pieces


def inside_superellipse(x, z, half_x, half_z, power=3.0):
    return abs(x / half_x) ** power + abs(z / half_z) ** power <= 0.92


def build_cut(cut, centre):
    """The cut's stone (or stones) in a collection named for it, moved to `centre`, one material."""
    built = CUTS[cut['id']]()
    objects = built if isinstance(built, list) else [built]
    material = neutral_glass(library.short_name_of(cut))
    collection = bpy.data.collections.new(cut['id'])
    bpy.context.scene.collection.children.link(collection)
    for obj in objects:
        obj.location = (obj.location.x + centre[0], obj.location.y, obj.location.z + centre[1])
        shapes.assign(obj, material)
        for other in list(obj.users_collection):
            other.objects.unlink(obj)
        collection.objects.link(obj)
    return objects
