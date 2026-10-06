"""
Geometry for the ore ladder prototype (#150): nuggets, shards, prisms, rings, tubes and flat
polygons in the #52 frame (metric, game right +X, game up +Z, Y is depth: the camera sits at -Y and
looks along +Y, so a feature at negative Y stands proud of the tile face at y = 0).
"""

import math

import bpy
from mathutils import Vector

TAU = 2.0 * math.pi


# --- primitives ------------------------------------------------------------------------------------


def add_icosphere(name, radius, location, subdivisions=2, scale=(1, 1, 1), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=location)
    return finish_primitive(name, scale, rotation, smooth=True)


def add_cube(name, size, location, scale=(1, 1, 1), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=size, location=location)
    return finish_primitive(name, scale, rotation, smooth=False)


def add_prism(name, radius, depth, location, rotation=(0, 0, 0), sides=6, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=depth, location=location)
    return finish_primitive(name, scale, rotation, smooth=False)


def add_cone(name, radius, depth, location, rotation=(0, 0, 0), sides=6):
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=0.0, depth=depth, location=location)
    return finish_primitive(name, (1, 1, 1), rotation, smooth=False)


def add_torus(name, major, minor, location, rotation=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=location,
                                     major_segments=32, minor_segments=12)
    return finish_primitive(name, scale, rotation, smooth=True)


def finish_primitive(name, scale, rotation, smooth):
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    if smooth:
        shade_smooth(obj)
    return obj


def shade_smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def add_tube(name, points, radius, resolution=2):
    """A poly curve with a round bevel: veins, arcs and lightning."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    curve.fill_mode = 'FULL'
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, (x, y, z) in zip(spline.points, points):
        point.co = (x, y, z, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    return obj


def add_polygon(name, points_xz, y, thickness):
    """
    A flat polygon in the tile plane, extruded towards the camera by `thickness`. Its origin is the
    polygon's centroid, so an outline copy scales about the shape itself.
    """
    cx = sum(x for x, _ in points_xz) / len(points_xz)
    cz = sum(z for _, z in points_xz) / len(points_xz)
    local = [(x - cx, z - cz) for x, z in points_xz]
    mesh = bpy.data.meshes.new(name)
    front = [(x, -thickness, z) for x, z in local]
    back = [(x, 0.0, z) for x, z in local]
    count = len(local)
    faces = [tuple(range(count)), tuple(range(count, 2 * count))]
    faces += [(i, (i + 1) % count, count + (i + 1) % count, count + i) for i in range(count)]
    mesh.from_pydata(front + back, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (cx, y, cz)
    bpy.context.collection.objects.link(obj)
    return obj


def add_quad(name, centre, width, height, y):
    half_w, half_h = width / 2.0, height / 2.0
    cx, cz = centre
    corners = [(cx - half_w, cz - half_h), (cx + half_w, cz - half_h), (cx + half_w, cz + half_h), (cx - half_w, cz + half_h)]
    return add_polygon(name, corners, y, 0.0)


# --- modifiers -------------------------------------------------------------------------------------


def bevel(obj, width, segments=2):
    modifier = obj.modifiers.new('bevel', 'BEVEL')
    modifier.width = width
    modifier.segments = segments
    return obj


def subdivide(obj, levels=1):
    modifier = obj.modifiers.new('subdivision', 'SUBSURF')
    modifier.levels = levels
    modifier.render_levels = levels
    return obj


def assign(obj, material):
    obj.data.materials.append(material)
    return obj


def outline_behind(obj, material, grow=1.12, back=0.015):
    """The stamped look's ink line: a dark copy, a little larger, a little behind."""
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = obj.name + '-outline'
    copy.scale = tuple(axis * grow for axis in obj.scale)
    copy.location = (obj.location.x, obj.location.y + back, obj.location.z)
    copy.data.materials.clear()
    copy.data.materials.append(material)
    bpy.context.collection.objects.link(copy)
    return copy


# --- layouts ---------------------------------------------------------------------------------------


def ring_positions(count, radius, phase=0.0):
    return [(radius * math.cos(phase + TAU * i / count), radius * math.sin(phase + TAU * i / count)) for i in range(count)]


def scatter_positions(rng, count, extent, min_gap):
    """Points inside a square of half-size `extent`, no two closer than `min_gap`."""
    placed = []
    attempts = 0
    while len(placed) < count and attempts < 400:
        attempts += 1
        candidate = (rng.uniform(-extent, extent), rng.uniform(-extent, extent))
        if all(math.dist(candidate, other) >= min_gap for other in placed):
            placed.append(candidate)
    return placed


def jagged_path(start, end, rng, segments=6, wobble=0.05):
    """A lightning arc: the straight line from start to end, kinked sideways at every step."""
    a, b = Vector(start), Vector(end)
    along = b - a
    side = Vector((-along.z, 0.0, along.x)).normalized() if along.length > 0 else Vector((1, 0, 0))
    points = [tuple(a)]
    for step in range(1, segments):
        t = step / segments
        kink = side * rng.uniform(-wobble, wobble) + Vector((0, rng.uniform(-wobble, 0), 0)) * 0.5
        points.append(tuple(a + along * t + kink))
    points.append(tuple(b))
    return points


def tilt_towards_camera(rng, max_tilt):
    """A rotation leaning a Z-up prism towards -Y, with a random spin about its own axis."""
    lean = rng.uniform(0.0, max_tilt)
    return (math.radians(-90 + lean) if rng.random() < 0.5 else math.radians(-90 - lean), 0.0, rng.uniform(0, TAU))


def facing_camera():
    """A prism's Z axis turned to point at the camera (-Y)."""
    return (math.radians(-90), 0.0, 0.0)


def star_points(centre, outer, inner, arms=4, phase=0.0):
    cx, cz = centre
    points = []
    for i in range(arms * 2):
        radius = outer if i % 2 == 0 else inner
        angle = phase + TAU * i / (arms * 2)
        points.append((cx + radius * math.cos(angle), cz + radius * math.sin(angle)))
    return points


def regular_points(centre, radius, sides, phase=0.0):
    cx, cz = centre
    return [(cx + radius * math.cos(phase + TAU * i / sides), cz + radius * math.sin(phase + TAU * i / sides)) for i in range(sides)]


def shard_points(centre, length, width, angle):
    """A long diamond, the shard silhouette of #13's crystals."""
    cx, cz = centre
    ax, az = math.cos(angle), math.sin(angle)
    return [(cx + ax * length, cz + az * length), (cx - az * width, cz + ax * width),
            (cx - ax * length, cz - az * length), (cx + az * width, cz - ax * width)]
