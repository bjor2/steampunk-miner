"""
The casing grade looks' reference scene (CG2, ticket 830; Progression's row in the GD lock on
casing grades by depth), headless Blender:

    blender -b --python-exit-code 1 -P docs/art/casing-grades/author_casing_grades.py

It writes art/blender/casing-grades/casing-grades.blend and renders the review strip beside this
script. The game never exports this file: the terrain shader draws the plates from the rows of
`src/systems/render/casingGradeLooks.json` and the geometry of `CASING_LINING_LOOK` and
`CASING_GRADE_MARKS` (`src/constants/scene.ts`), so the scene is built from the same numbers and
shows what the shader is meant to draw. A level tunnel floor one metre wide per cell, in planet-1
band-1 rock: the five plates in the plain finish, the five burnished, the five chased, grade 61 with
its four pips, then grade 3 in each lining type's trim.

Flat emission colours, the #13 look: what reads here is colour and luma, never lighting. 1 Blender
unit = 1 m = one world cell; game right is +X, up is +Z, the camera looks along +Y (Front view).
"""

import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BLEND = os.path.join(REPO, 'art', 'blender', 'casing-grades', 'casing-grades.blend')

# casingGradeLooks.json, CASING_LINING_LOOK and CASING_GRADE_MARKS: keep in step with the code.
PLATES = [
    ('brass', '#dcb35a', '#3e2c14', '#fff0c4', 'rivet-line'),
    ('copper', '#e8925c', '#3a1a10', '#ffdcc4', 'rivet-pairs'),
    ('iron', '#c5c9cf', '#15161a', '#ffffff', 'bolt-strap'),
    ('steel', '#b4c6dc', '#1a2432', '#f2f8ff', 'lattice'),
    ('verdigris', '#8fc9a6', '#12301f', '#eefff2', 'stagger'),
]
FINISHES = [('plain', 1.0, False, False), ('burnished', 1.1, True, False), ('chased', 1.0, False, True)]
TRIMS = [
    ('standard', 'seam', 0.07, None, None),
    ('refractory', 'firebrick', 0.12, '#b8452a', '#ffb347'),
    ('insulated', 'stitched', 0.12, '#e8f4ff', '#4a6a8a'),
    ('grounded', 'zigzag', 0.12, '#c97a3c', '#2a2a2a'),
]
ROCK = '#8a6a48'
AIR = '#120d0c'
PLATE_DEPTH = 0.42
RIBS_PER_M = 4
GROOVE_HALF = 0.13
RIVET_DEPTH = 0.2
RIVET_RADIUS = 0.06
PAIR_ROWS = (0.09, 0.27)
PAIR_RIVET_RADIUS = 0.055
PAIR_GROOVE_RIBS = 2
STAGGER_RIVET_RADIUS = 0.07
STRAP = (0.16, 0.26)
BOLT_HALF = 0.055
LATTICE_HALF = 0.08
LIP = 0.04
CHASED = (0.3, 0.34)
JOINT_HALF = 0.015
BRICK_M = 0.5
PIPS_MOST = 4
PIPS_DEPTH = 0.385
PIPS_RADIUS = 0.03

CELL_M = 1.0
FLOOR_TOP_Z = 0.3
SCENE_HEIGHT = 1.4


def colour_of(hex_colour, scale=1.0):
    """sRGB hex to the linear value Blender's colour sockets take, the plate scale applied in sRGB."""
    def linear(channel):
        channel = min(1.0, channel * scale)
        return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
    return tuple(linear(int(hex_colour[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1.0,)


def flat_material(name, hex_colour, scale=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = colour_of(hex_colour, scale)
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])
    return material


def mesh_object(name, vertices, faces, material, depth):
    """A flat mesh in the XZ plane at Y = depth (smaller draws in front)."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x, depth, z) for x, z in vertices], [], faces)
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def rectangle(name, x0, z0, x1, z1, material, depth):
    if x1 <= x0 or z1 <= z0:
        return None
    return mesh_object(name, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], [(0, 1, 2, 3)], material, depth)


def disc(name, centre, radius, material, depth, segments=24):
    x0, z0 = centre
    vertices = [(x0, z0)] + [
        (x0 + radius * math.cos(2 * math.pi * s / segments),
         z0 + radius * math.sin(2 * math.pi * s / segments)) for s in range(segments)
    ]
    faces = [(0, 1 + s, 1 + (s + 1) % segments) for s in range(segments)]
    return mesh_object(name, vertices, faces, material, depth)


def square(name, centre, half, material, depth):
    x0, z0 = centre
    return rectangle(name, x0 - half, z0 - half, x0 + half, z0 + half, material, depth)


class Cell:
    """One cell of tunnel floor at x0: the plate below the open face, the trim, the marks."""

    def __init__(self, x0, name):
        self.x0 = x0
        self.x1 = x0 + CELL_M
        self.name = name
        self.count = 0

    def tag(self):
        self.count += 1
        return '%s-%03d' % (self.name, self.count)

    def band(self, from_depth, to_depth, material, layer, x0=None, x1=None):
        top = FLOOR_TOP_Z
        rectangle(self.tag(), max(self.x0, x0 if x0 is not None else self.x0), top - to_depth,
                  min(self.x1, x1 if x1 is not None else self.x1), top - from_depth, material, layer)

    def grooves(self, every_ribs, half_share, material, to_depth):
        rib = 1 / RIBS_PER_M
        step = rib * every_ribs
        first = math.ceil(self.x0 / step)
        last = math.floor(self.x1 / step)
        for index in range(first, last + 1):
            x = index * step
            self.band(0, to_depth, material, -0.02, x - half_share * step, x + half_share * step)

    def rivets(self, row, radius, material, ribs=None):
        rib = 1 / RIBS_PER_M
        first = math.floor(self.x0 * RIBS_PER_M)
        for index in range(first, first + RIBS_PER_M):
            if ribs is not None and index % 2 != ribs:
                continue
            disc(self.tag(), ((index + 0.5) * rib, FLOOR_TOP_Z - row), radius, material, -0.03)

    def lattice(self, material, to_depth):
        """Grooves on both diagonals, a rib apart: a thin quad along each diagonal, cut at the cell."""
        rib = 1 / RIBS_PER_M
        half = LATTICE_HALF * rib
        top = FLOOR_TOP_Z
        first = math.floor((self.x0 - to_depth) * RIBS_PER_M)
        last = math.ceil((self.x1 + to_depth) * RIBS_PER_M)
        for sign in (1, -1):
            for index in range(first, last + 1):
                # The line along + sign * depth = index * rib, from the face to the trim.
                along_at = lambda depth: index * rib - sign * depth
                ends = clip_to_cell(self, along_at(0.0), along_at(to_depth), to_depth)
                if ends is None:
                    continue
                (a0, d0), (a1, d1) = ends
                mesh_object(self.tag(), [(a0 - half, top - d0), (a0 + half, top - d0),
                                         (a1 + half, top - d1), (a1 - half, top - d1)],
                            [(0, 1, 2, 3)], material, -0.02)


def clip_to_cell(cell, along0, along1, to_depth):
    """The part of the line from (along0, 0) to (along1, to_depth) inside the cell's x, or None."""
    t_from, t_to = 0.0, 1.0
    run = along1 - along0
    for bound, keep_above in ((cell.x0, True), (cell.x1, False)):
        if run == 0:
            if (along0 < bound) == keep_above:
                return None
            continue
        t = (bound - along0) / run
        if (run > 0) == keep_above:
            t_from = max(t_from, t)
        else:
            t_to = min(t_to, t)
    if t_from >= t_to:
        return None
    return ((along0 + run * t_from, to_depth * t_from), (along0 + run * t_to, to_depth * t_to))


def build_cell(cell, plate, finish, trim, pips, materials):
    """The plate of `plate` in `finish`, the `trim` over its seam, `pips` pips."""
    _, colour, groove, rivet, pattern = plate
    _, scale, lip, chased = finish
    _, style, width, trim_colour, joint = trim
    body = flat_material(cell.tag(), colour, scale)
    groove_m = flat_material(cell.tag(), groove)
    rivet_m = flat_material(cell.tag(), rivet)
    cell.band(0, PLATE_DEPTH, body, -0.01)
    body_depth = PLATE_DEPTH - width
    if pattern == 'rivet-line':
        cell.grooves(1, GROOVE_HALF, groove_m, body_depth)
        cell.rivets(RIVET_DEPTH, RIVET_RADIUS, rivet_m)
    elif pattern == 'rivet-pairs':
        cell.grooves(PAIR_GROOVE_RIBS, GROOVE_HALF, groove_m, body_depth)
        for row in PAIR_ROWS:
            cell.rivets(row, PAIR_RIVET_RADIUS, rivet_m)
    elif pattern == 'bolt-strap':
        cell.band(STRAP[0], STRAP[1], groove_m, -0.02)
        middle = (STRAP[0] + STRAP[1]) / 2
        rib = 1 / RIBS_PER_M
        for index in range(RIBS_PER_M):
            square(cell.tag(), (cell.x0 + (index + 0.5) * rib, FLOOR_TOP_Z - middle), BOLT_HALF, rivet_m, -0.03)
    elif pattern == 'lattice':
        cell.lattice(groove_m, body_depth)
    else:
        cell.grooves(1, GROOVE_HALF, groove_m, body_depth)
        cell.rivets(PAIR_ROWS[0], STAGGER_RIVET_RADIUS, rivet_m, ribs=0)
        cell.rivets(PAIR_ROWS[1], STAGGER_RIVET_RADIUS, rivet_m, ribs=1)
    if lip:
        lip_m = flat_material(cell.tag(), colour, scale)
        lip_m.node_tree.nodes['Emission'].inputs['Color'].default_value = tuple(
            c + (1.0 - c) * 0.6 for c in colour_of(colour, scale)[:3]) + (1.0,)
        cell.band(0, LIP, lip_m, -0.04)
    if chased:
        cell.band(CHASED[0], CHASED[1], groove_m, -0.04)
    trim_m = groove_m if trim_colour is None else flat_material(cell.tag(), trim_colour)
    joint_m = rivet_m if joint is None else flat_material(cell.tag(), joint)
    cell.band(body_depth, PLATE_DEPTH, trim_m, -0.05)
    build_joints(cell, style, width, body_depth, joint_m)
    for pip in range(pips):
        disc(cell.tag(), (cell.x0 + (pip + 1) / (PIPS_MOST + 1), FLOOR_TOP_Z - PIPS_DEPTH), PIPS_RADIUS,
             rivet_m, -0.07)


def build_joints(cell, style, width, body_depth, joint_m):
    if style == 'firebrick':
        first = math.ceil(cell.x0 / BRICK_M)
        for index in range(first, math.floor(cell.x1 / BRICK_M) + 1):
            cell.band(body_depth, PLATE_DEPTH, joint_m, -0.06, index * BRICK_M - JOINT_HALF, index * BRICK_M + JOINT_HALF)
    elif style == 'stitched':
        rib = 1 / RIBS_PER_M
        for index in range(RIBS_PER_M + 1):
            x = cell.x0 + index * rib
            cell.band(body_depth, PLATE_DEPTH, joint_m, -0.06, x - JOINT_HALF, x + JOINT_HALF)
    elif style == 'zigzag':
        rib = 1 / RIBS_PER_M
        top = FLOOR_TOP_Z
        for index in range(RIBS_PER_M * 2):
            x_from = cell.x0 + index * rib / 2
            x_to = x_from + rib / 2
            z_from = top - (PLATE_DEPTH if index % 2 == 0 else body_depth)
            z_to = top - (body_depth if index % 2 == 0 else PLATE_DEPTH)
            mesh_object(cell.tag(), [(x_from, z_from - JOINT_HALF), (x_to, z_to - JOINT_HALF),
                                     (x_to, z_to + JOINT_HALF), (x_from, z_from + JOINT_HALF)],
                        [(0, 1, 2, 3)], joint_m, -0.06)


def cells_of_strip():
    """The strip's cells in order: (name, plate, finish, trim, pips)."""
    cells = []
    for finish in FINISHES:
        for plate in PLATES:
            cells.append(('%s-%s' % (plate[0], finish[0]), plate, finish, TRIMS[0], 0))
    cells.append(('grade-61', PLATES[0], FINISHES[0], TRIMS[0], PIPS_MOST))
    for trim in TRIMS:
        cells.append(('iron-%s' % trim[0], PLATES[2], FINISHES[0], trim, 0))
    return cells


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cells = cells_of_strip()
    width = len(cells) * CELL_M
    rock = flat_material('rock', ROCK)
    air = flat_material('air', AIR)
    rectangle('rock', 0.0, FLOOR_TOP_Z - SCENE_HEIGHT / 2 - 0.3, width, FLOOR_TOP_Z, rock, 0.0)
    rectangle('air', 0.0, FLOOR_TOP_Z, width, FLOOR_TOP_Z + SCENE_HEIGHT / 2, air, 0.0)
    for at, (name, plate, finish, trim, pips) in enumerate(cells):
        build_cell(Cell(at * CELL_M, name), plate, finish, trim, pips, None)
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = width
    camera.location = (width / 2, -5.0, FLOOR_TOP_Z - 0.2)
    camera.rotation_euler = (math.pi / 2, 0.0, 0.0)
    bpy.context.scene.collection.objects.link(camera)
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.cycles.seed = 0
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('world')
    world.color = (0, 0, 0)
    scene.world = world
    return width


def render(name, width, px_per_metre):
    scene = bpy.context.scene
    scene.render.resolution_x = round(width * px_per_metre)
    scene.render.resolution_y = round(SCENE_HEIGHT * px_per_metre)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(HERE, name)
    bpy.ops.render.render(write_still=True)


width = build_scene()
os.makedirs(os.path.dirname(BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
# Review size, and about what one cell is on a phone at the widest zoom (#309: about 24 px).
render('strip.review.png', width, 96)
render('strip.phone-raw.png', width, 24)
