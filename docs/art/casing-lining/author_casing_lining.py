"""
The casing lining's reference scene (ticket 315, #309 GD decision 3), headless Blender:

    blender -b --python-exit-code 1 -P docs/art/casing-lining/author_casing_lining.py

It writes art/blender/casing-lining/casing-lining.blend and renders the review images beside this
script. The game never exports this file: the terrain shader draws the lining from the numbers in
`CASING_LINING_LOOK` (src/constants/scene.ts), so the scene is built from the same numbers and
shows what the shader is meant to draw. A bore 0.95 m in radius (the drill stamp) is cut through
band-1 rock of planet 1; the lining is a brass plate 0.42 m deep on the rock side, ribbed by dark
grooves every 0.25 m along the face, a rivet in the middle of each rib 0.2 m in, and a dark seam
where it meets the rock. A straight wall to the right shows the ribs on a level tunnel's floor.

Flat emission colours, the #13 look: what reads here is colour and luma, never lighting. 1 Blender
unit = 1 m = one world cell; game right is +X, up is +Z, the camera looks along +Y (Front view).
"""

import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BLEND = os.path.join(REPO, 'art', 'blender', 'casing-lining', 'casing-lining.blend')

# CASING_LINING_LOOK and the planet-1 palette (artDirection.json): keep in step with the code.
BRASS = '#dcb35a'
GROOVE = '#3e2c14'
RIVET = '#fff0c4'
ROCK = '#8a6a48'
AIR = '#120d0c'
PLATE_DEPTH = 0.42
SEAM = 0.07
RIBS_PER_M = 4
GROOVE_HALF = 0.13
RIVET_DEPTH = 0.2
RIVET_RADIUS = 0.06

BORE_RADIUS = 0.95
BORE_CENTRE = (-0.6, 0.0)
WALL_TOP_Z = -0.6
WALL_FROM_X = 0.9
WALL_TO_X = 2.4
SCENE_SIZE = (5.0, 3.6)
SEGMENTS = 512


def colour_of(hex_colour):
    """sRGB hex to the linear value Blender's colour sockets take."""
    def linear(channel):
        return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
    return tuple(linear(int(hex_colour[i:i + 2], 16) / 255) for i in (1, 3, 5)) + (1.0,)


def flat_material(name, hex_colour):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = colour_of(hex_colour)
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


def annulus(name, inner, outer, material, depth, start=0.0, end=2 * math.pi, segments=SEGMENTS):
    cx, cz = BORE_CENTRE
    vertices, faces = [], []
    for step in range(segments + 1):
        angle = start + (end - start) * step / segments
        for radius in (inner, outer):
            vertices.append((cx + radius * math.cos(angle), cz + radius * math.sin(angle)))
    for step in range(segments):
        a = 2 * step
        faces.append((a, a + 1, a + 3, a + 2))
    return mesh_object(name, vertices, faces, material, depth)


def disc(name, centre, radius, material, depth, segments=48):
    x0, z0 = centre
    vertices = [(x0, z0)] + [
        (x0 + radius * math.cos(2 * math.pi * s / segments),
         z0 + radius * math.sin(2 * math.pi * s / segments)) for s in range(segments)
    ]
    faces = [(0, 1 + s, 1 + (s + 1) % segments) for s in range(segments)]
    return mesh_object(name, vertices, faces, material, depth)


def rectangle(name, x0, z0, x1, z1, material, depth):
    return mesh_object(name, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], [(0, 1, 2, 3)], material, depth)


def build_bore(materials):
    """The bore's air, its ring of brass, the seam, a groove every 0.25 m of arc, the rivets."""
    disc('bore-air', BORE_CENTRE, BORE_RADIUS, materials['air'], -0.01, segments=SEGMENTS)
    annulus('bore-plate', BORE_RADIUS, BORE_RADIUS + PLATE_DEPTH, materials['brass'], -0.01)
    annulus('bore-seam', BORE_RADIUS + PLATE_DEPTH - SEAM, BORE_RADIUS + PLATE_DEPTH,
            materials['groove'], -0.02)
    circumference = 2 * math.pi * BORE_RADIUS
    ribs = round(circumference * RIBS_PER_M)
    groove_angle = 2 * GROOVE_HALF / RIBS_PER_M / BORE_RADIUS
    cx, cz = BORE_CENTRE
    for rib in range(ribs):
        angle = 2 * math.pi * rib / ribs
        annulus('bore-groove-%03d' % rib, BORE_RADIUS, BORE_RADIUS + PLATE_DEPTH - SEAM,
                materials['groove'], -0.02, angle - groove_angle / 2, angle + groove_angle / 2, 4)
        middle = angle + math.pi / ribs
        at = BORE_RADIUS + RIVET_DEPTH
        disc('bore-rivet-%03d' % rib, (cx + at * math.cos(middle), cz + at * math.sin(middle)),
             RIVET_RADIUS, materials['rivet'], -0.03)


def build_wall(materials):
    """A level tunnel's floor: the plate below the open face, ribs across, rivets along."""
    rectangle('wall-air', WALL_FROM_X, WALL_TOP_Z, WALL_TO_X, SCENE_SIZE[1] / 2, materials['air'], -0.01)
    top = WALL_TOP_Z
    rectangle('wall-plate', WALL_FROM_X, top - PLATE_DEPTH, WALL_TO_X, top, materials['brass'], -0.01)
    rectangle('wall-seam', WALL_FROM_X, top - PLATE_DEPTH, WALL_TO_X, top - PLATE_DEPTH + SEAM,
              materials['groove'], -0.02)
    rib = 1 / RIBS_PER_M
    first = math.ceil(WALL_FROM_X * RIBS_PER_M)
    last = math.floor(WALL_TO_X * RIBS_PER_M)
    for index in range(first, last + 1):
        x = index * rib
        rectangle('wall-groove-%02d' % index, max(WALL_FROM_X, x - GROOVE_HALF * rib), top - PLATE_DEPTH,
                  min(WALL_TO_X, x + GROOVE_HALF * rib), top, materials['groove'], -0.02)
        if x + rib / 2 + RIVET_RADIUS <= WALL_TO_X:
            disc('wall-rivet-%02d' % index, (x + rib / 2, top - RIVET_DEPTH), RIVET_RADIUS,
                 materials['rivet'], -0.03)


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = {name: flat_material(name, colour) for name, colour in
                 (('rock', ROCK), ('air', AIR), ('brass', BRASS), ('groove', GROOVE), ('rivet', RIVET))}
    width, height = SCENE_SIZE
    rectangle('rock', -width / 2, -height / 2, width / 2, height / 2, materials['rock'], 0.0)
    build_bore(materials)
    build_wall(materials)
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = width
    camera.location = (0.0, -5.0, 0.0)
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


def render(name, px_per_metre):
    scene = bpy.context.scene
    scene.render.resolution_x = round(SCENE_SIZE[0] * px_per_metre)
    scene.render.resolution_y = round(SCENE_SIZE[1] * px_per_metre)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(HERE, name)
    bpy.ops.render.render(write_still=True)


build_scene()
os.makedirs(os.path.dirname(BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
# Review size, and about what one cell is on a phone at the widest zoom (#309: about 24 px).
render('lining.review.png', 256)
render('lining.phone-raw.png', 24)
