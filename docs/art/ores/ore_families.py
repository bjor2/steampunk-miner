"""
The 12 family silhouettes of #151 (Game Director's family rows) as Blender mark builders (#144).
Each family's `mark` makes one mark of its shape at a placement; the grade decides how many, where
and how far they stand off the face (ore_grades.py). The silhouette carries identity: filled
solid black at tile scale, every family must still be told apart, so each shape is its own
construction (flecks, inlay traces, shells, pellets, pods, cogs, shards, stars, forks, fragments,
tendrils, lumps), and the grade escalates that shape rather than replacing it.
"""

import math

import ore_shapes as shapes
from mathutils import Euler, Vector

RELIEF_Y = {'flat': 0.005, 'dome': -0.01, 'stand': -0.04, 'hover': -0.12}
RELIEF_SCALE_Y = {'flat': 0.2, 'dome': 0.5, 'stand': 0.9, 'hover': 1.0}


def mark_depth(relief, size):
    return RELIEF_Y[relief] - (size * 0.3 if relief in ('stand', 'hover') else 0.0)


def lying(angle):
    """A prism's axis laid along the face in the direction `angle`."""
    return Vector((math.cos(angle), 0.0, math.sin(angle))).to_track_quat('Z', 'Y').to_euler()


def facing(angle):
    """A disc or prism axis pointed at the camera, spun by `angle` in the face."""
    return (-math.pi / 2, angle, 0.0)


def lean(angle, relief, rng):
    """Standing and hovering marks lean toward the camera along their angle; flat ones lie down."""
    if relief in ('flat', 'dome'):
        return (0.0, rng.uniform(0, math.tau), 0.0)
    tilt = rng.uniform(0.5, 1.1) if relief == 'stand' else rng.uniform(0.25, 0.6)
    direction = (math.cos(angle), -tilt, math.sin(angle))
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


# --- metal: angular flecks, blocky nuggets, ingot-like veins ---------------------------------------------


def metal_mark(name, x, z, size, angle, relief, grade, rng):
    if grade <= 1:
        points = shapes.regular_points((x, z), size, 5, rng.uniform(0, math.tau))
        points = [(px + rng.uniform(-size * 0.25, size * 0.25), pz + rng.uniform(-size * 0.25, size * 0.25)) for px, pz in points]
        return shapes.add_polygon(name, points, 0.0, size * 0.25)
    if grade <= 3:
        cube = shapes.add_cube(name, size * 1.3, (x, mark_depth(relief, size), z),
                               scale=(1.0, RELIEF_SCALE_Y[relief], rng.uniform(0.7, 1.0)), rotation=lean(angle, relief, rng))
        return shapes.bevel(cube, size * 0.2)
    # Ingot-like bars radiating from the core at G4, hovering at G5.
    bar = shapes.add_cube(name, size, (x, mark_depth(relief, size), z), scale=(2.2, 0.5, 0.8),
                          rotation=(0.0, -angle, 0.0) if relief != 'hover' else lean(angle, relief, rng))
    return shapes.bevel(bar, size * 0.12)


# --- ancient: right-angle inlay lines, like a circuit ---------------------------------------------------------


def ancient_mark(name, x, z, size, angle, relief, grade, rng):
    """An L-shaped trace with a square pad at its elbow; raised and chipped from G3."""
    thickness = size * 0.22
    step = rng.choice((0, 1, 2, 3)) * math.pi / 2
    arm_a, arm_b = size * rng.uniform(1.2, 2.0), size * rng.uniform(0.8, 1.6)
    ax, az = math.cos(step), math.sin(step)
    bx, bz = -az, ax
    y = mark_depth(relief, size * 0.6)
    depth = thickness * (0.6 if grade <= 1 else 1.4)
    trace_a = shapes.add_polygon(name, rect_points((x, z), (x + ax * arm_a, z + az * arm_a), thickness), y, depth)
    trace_b = shapes.add_polygon(name + '-b', rect_points((x, z), (x + bx * arm_b, z + bz * arm_b), thickness), y, depth)
    pad = shapes.add_cube(name + '-pad', thickness * 2.6, (x, y - depth * 0.3, z), scale=(1.0, 0.4, 1.0))
    if grade >= 3:
        chip = shapes.add_cube(name + '-chip', thickness * 2.0, (x + ax * arm_a, y - depth, z + az * arm_a),
                               scale=(1.0, 1.2, 1.0), rotation=(0, rng.uniform(0, 0.4), 0))
        return [trace_a, trace_b, pad, chip]
    return [trace_a, trace_b, pad]


def rect_points(start, end, thickness):
    (sx, sz), (ex, ez) = start, end
    dx, dz = ex - sx, ez - sz
    length = math.hypot(dx, dz) or 1.0
    nx, nz = -dz / length * thickness / 2, dx / length * thickness / 2
    return [(sx + nx, sz + nz), (ex + nx, ez + nz), (ex - nx, ez - nz), (sx - nx, sz - nz)]


# --- fossil: spiral shells, curled bone fragments ---------------------------------------------------------


def fossil_mark(name, x, z, size, angle, relief, grade, rng):
    """A spiral shell: a tube wound two turns, its radius growing; a curled fragment at G1."""
    turns = 1.25 if grade <= 1 else 2.0
    y = mark_depth(relief, size * 0.5)
    points = []
    steps = 22
    for i in range(steps + 1):
        t = i / steps
        theta = angle + t * turns * math.tau
        radius = size * (0.15 + 0.85 * t)
        lift = -size * 0.25 * t if relief in ('stand', 'hover') else 0.0
        points.append((x + math.cos(theta) * radius, y + lift, z + math.sin(theta) * radius))
    shell = shapes.add_tube(name, points, size * (0.09 if grade <= 1 else 0.14) * (1.0 + 0.1 * grade))
    if grade >= 3:
        rib = shapes.add_prism(name + '-rib', size * 0.08, size * 0.9, (x + math.cos(angle) * size * 0.6, y - size * 0.2, z + math.sin(angle) * size * 0.6),
                               rotation=lean(angle, 'stand', rng))
        return [shell, rib]
    return [shell]


# --- radioactive: smooth capsule pellets, each with a thin halo ring ----------------------------------------


def radioactive_mark(name, x, z, size, angle, relief, grade, rng):
    y = mark_depth(relief, size * 0.6)
    standing = relief in ('stand', 'hover')
    rotation = lean(angle, relief, rng) if standing else (0.0, angle, 0.0)
    pellet = shapes.add_icosphere(name, size * 0.42, (x, y, z), subdivisions=2,
                                  scale=(1.0, 1.0, 2.2) if standing else (2.2, RELIEF_SCALE_Y[relief] * 1.6, 1.0),
                                  rotation=rotation)
    halo = shapes.add_torus(name + '-halo', size * 0.75, size * 0.035, (x, y + 0.01, z), rotation=(math.pi / 2, 0, 0))
    return [pellet, halo]


# --- alien: bulbous pod and egg clusters ----------------------------------------------------------------


def alien_mark(name, x, z, size, angle, relief, grade, rng):
    y = mark_depth(relief, size)
    pod = shapes.add_icosphere(name, size * 0.5, (x, y, z), subdivisions=3,
                               scale=(1.0, RELIEF_SCALE_Y[relief] * 1.2, rng.uniform(1.1, 1.5)), rotation=(0, rng.uniform(0, math.tau), 0))
    eggs = [pod]
    for j in range(2 if grade <= 2 else 3):
        theta = angle + j * 2.2
        egg = shapes.add_icosphere('%s-egg-%d' % (name, j), size * rng.uniform(0.2, 0.3),
                                   (x + math.cos(theta) * size * 0.55, y + size * 0.1, z + math.sin(theta) * size * 0.55),
                                   subdivisions=2, scale=(1.0, RELIEF_SCALE_Y[relief] * 1.2, 1.2))
        eggs.append(egg)
    return eggs


# --- relic: broken cogs, rivet heads, gear teeth ---------------------------------------------------------


def relic_mark(name, x, z, size, angle, relief, grade, rng):
    """A cog (a toothed polygon with a bore), broken to a fragment below G3, rivet heads around it."""
    teeth = rng.choice((7, 8, 9))
    points = shapes.star_points((x, z), size, size * 0.78, arms=teeth, phase=angle)
    if grade <= 2:
        keep = int(len(points) * rng.uniform(0.45, 0.7))
        start = rng.randrange(len(points))
        points = [points[(start + i) % len(points)] for i in range(keep)] + [(x, z)]
    y = mark_depth(relief, size * 0.3)
    cog = shapes.add_polygon(name, points, y, size * (0.15 if grade <= 1 else 0.3))
    if relief in ('stand', 'hover'):
        cog.rotation_euler = lean(angle, relief, rng)
    rivets = [shapes.add_icosphere('%s-rivet-%d' % (name, j), size * 0.12,
                                   (x + math.cos(angle + j * 2.4) * size * 1.3, y, z + math.sin(angle + j * 2.4) * size * 1.3),
                                   subdivisions=1, scale=(1.0, 0.5, 1.0)) for j in range(2)]
    return [cog] + rivets


# --- crystal: pointed prism shards --------------------------------------------------------------------


def crystal_mark(name, x, z, size, angle, relief, grade, rng):
    if grade <= 1:
        return shapes.add_polygon(name, shapes.shard_points((x, z), size * 1.1, size * 0.3, angle), 0.0, size * 0.2)
    depth = size * (2.0 if grade <= 2 else 2.8)
    rotation = Euler(lean(angle, relief, rng)) if relief in ('stand', 'hover') else lying(angle)
    prism = shapes.add_prism(name, size * 0.32, depth, (x, mark_depth(relief, size), z), rotation=rotation)
    tip = shapes.add_cone(name + '-tip', size * 0.32, size * 0.5, (x, mark_depth(relief, size), z), rotation=rotation)
    tip.location = Vector(prism.location) + rotation.to_matrix() @ Vector((0, 0, depth / 2 + size * 0.25))
    return [prism, tip]


# --- cryo: six-point frost stars, hex plates ------------------------------------------------------------


def cryo_mark(name, x, z, size, angle, relief, grade, rng):
    y = mark_depth(relief, size * 0.3)
    star = shapes.add_polygon(name, shapes.star_points((x, z), size * 1.2, size * 0.42, arms=6, phase=angle), y, size * 0.12)
    plate = shapes.add_prism(name + '-plate', size * 0.6, size * (0.08 if grade <= 1 else 0.2), (x, y + 0.004, z),
                             rotation=facing(angle), sides=6)
    if relief in ('stand', 'hover'):
        star.rotation_euler = lean(angle, relief, rng)
        plate.rotation_euler = lean(angle + 0.4, relief, rng)
    return [star, plate]


# --- energy: zig-zag lightning-fork veins ---------------------------------------------------------------


def energy_mark(name, x, z, size, angle, relief, grade, rng):
    """A lightning fork: a sawtooth trunk with two shorter sawtooth branches, thin at G1 and raised from G3."""
    y = mark_depth(relief, size * 0.4)
    length = size * 2.6
    trunk = zigzag((x, y, z), angle, length, 5, size * 0.42, rng)
    radius = size * (0.045 if grade <= 1 else 0.07)
    forks = [shapes.add_tube(name, trunk, radius, resolution=1)]
    for j, branch_angle in enumerate((angle + 0.75, angle - 0.75)):
        root = trunk[1 + j]
        forks.append(shapes.add_tube('%s-branch-%d' % (name, j), zigzag(root, branch_angle, length * 0.45, 3, size * 0.3, rng), radius * 0.75, resolution=1))
    return forks


def zigzag(start, angle, length, kinks, amplitude, rng):
    """A line kinked alternately left and right at every step: the lightning silhouette."""
    sx, sy, sz = start
    ax, az = math.cos(angle), math.sin(angle)
    nx, nz = -az, ax
    points = [start]
    for step in range(1, kinks + 1):
        t = step / kinks
        side = amplitude * (1 if step % 2 else -1) * (1.0 - t * 0.5) * rng.uniform(0.7, 1.0)
        points.append((sx + ax * length * t + nx * side, sy, sz + az * length * t + nz * side))
    return points


# --- exotic: detached floating fragments with void gaps ------------------------------------------------------


def exotic_mark(name, x, z, size, angle, relief, grade, rng):
    """A broken plate: an irregular polygon split in two by a void gap, the halves drifting apart."""
    points = shapes.regular_points((x, z), size, 6, angle)
    points = [(px + rng.uniform(-size * 0.2, size * 0.2), pz + rng.uniform(-size * 0.2, size * 0.2)) for px, pz in points]
    gap = size * (0.08 if grade <= 2 else 0.2)
    y = mark_depth(relief, size * 0.3)
    left = [(px - math.cos(angle) * gap, pz - math.sin(angle) * gap) for px, pz in points[:3]] + [(x, z)]
    right = [(px + math.cos(angle) * gap, pz + math.sin(angle) * gap) for px, pz in points[3:]] + [(x, z)]
    halves = [shapes.add_polygon(name, left, y, size * 0.25), shapes.add_polygon(name + '-b', right, y + (0.0 if grade <= 3 else -size * 0.3), size * 0.25)]
    if relief in ('stand', 'hover'):
        for half in halves:
            half.rotation_euler = lean(angle + rng.uniform(-0.3, 0.3), relief, rng)
    return halves


# --- organic: branching coral and root tendrils -------------------------------------------------------------


def organic_mark(name, x, z, size, angle, relief, grade, rng):
    """A tendril that branches twice, thickening with the grade; lifted off the face from G3."""
    y = mark_depth(relief, size * 0.4)
    radius = size * (0.09 if grade <= 1 else 0.14)
    tendrils = []
    for j, turn in enumerate((0.0, 0.9, -0.9)):
        theta = angle + turn
        length = size * (2.0 if j == 0 else 1.2)
        points = []
        for i in range(6):
            t = i / 5
            wobble = math.sin(t * 7 + j) * size * 0.15
            lift = -size * 0.5 * t if relief in ('stand', 'hover') else 0.0
            points.append((x + math.cos(theta) * length * t - math.sin(theta) * wobble, y + lift,
                           z + math.sin(theta) * length * t + math.cos(theta) * wobble))
        tendrils.append(shapes.add_tube('%s-%d' % (name, j), points, radius * (1.0 if j == 0 else 0.7)))
    return tendrils


# --- volcanic: glassy obsidian lumps with curved, shell-like fracture lines ---------------------------------------


def volcanic_mark(name, x, z, size, angle, relief, grade, rng):
    y = mark_depth(relief, size * 0.8)
    lump = shapes.add_icosphere(name, size * 0.6, (x, y, z), subdivisions=1,
                                scale=(rng.uniform(0.9, 1.3), RELIEF_SCALE_Y[relief] * 1.3, rng.uniform(0.8, 1.1)),
                                rotation=(rng.uniform(0, 1), rng.uniform(0, math.tau), 0))
    shapes.bevel(lump, size * 0.08, segments=1)
    fractures = []
    for j in range(2 if grade <= 1 else 3):
        theta = angle + j * 1.9
        points = [(x + math.cos(theta + t * 1.4) * size * 0.55 * (0.4 + t), y - size * 0.35, z + math.sin(theta + t * 1.4) * size * 0.55 * (0.4 + t))
                  for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
        fractures.append(shapes.add_tube('%s-fracture-%d' % (name, j), points, size * 0.03, resolution=1))
    return [lump] + fractures


MARKS = {
    'metal': metal_mark,
    'ancient': ancient_mark,
    'fossil': fossil_mark,
    'radioactive': radioactive_mark,
    'alien': alien_mark,
    'relic': relic_mark,
    'crystal': crystal_mark,
    'cryo': cryo_mark,
    'energy': energy_mark,
    'exotic': exotic_mark,
    'organic': organic_mark,
    'volcanic': volcanic_mark,
}

# Marks per cell relative to the grade's base count: linear shapes cover more, so fewer of them.
DENSITY = {
    'metal': 1.0, 'ancient': 0.6, 'fossil': 0.7, 'radioactive': 0.8, 'alien': 0.7, 'relic': 0.7,
    'crystal': 1.0, 'cryo': 0.8, 'energy': 0.6, 'exotic': 0.8, 'organic': 0.55, 'volcanic': 0.8,
}

# Fracture lines on volcanic lumps are dark glass, not the body colour.
FRACTURE_HEX = '#1a0c10'


def as_list(marks):
    return marks if isinstance(marks, list) else [marks]
