"""
The Blender recipes of the mineral skin layers (#576, ticket 592 for P1's slots 1 to 5): one per
layer id of `mineralSkins.json`. A layer id with no recipe fails, never falls back.

- `base` and `sheen` are seamless textures on the 1 m cell: an emission material on a 1 m quad
  whose value is the ramp coordinate (base, mean about 0.5) or the highlight strength (sheen,
  mostly 0). Every noise and Voronoi reads 4D coordinates on a torus (scripts/art/author_tiles.py's
  `Graph`), so the cell repeats with no seam and two ore tiles side by side join.
- `vein` is geometry on the ore stage (docs/art/ores): a neutral grey body lit by the game's lamp
  rig, standing off the rock face; the post step reads its luminance as the ramp coordinate and
  its alpha (the rock held out) as the mask, and rims it in the shadow end (skin_post.py).

The base follows the species' `pattern`, the vein its `silhouette` and the sheen its lustre, so
the skin agrees with the kind look the ground already draws (feature-slices 3.72).
"""

import math
import os
import random
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
for folder in (os.path.join(REPO_ROOT, 'scripts', 'art'), os.path.join(HERE, '..', 'ores'), os.path.join(HERE, '..', 'ore-ladder')):
    folder = os.path.normpath(folder)
    if folder not in sys.path:
        sys.path.insert(0, folder)

import author_tiles as tiles  # noqa: E402
import ore_materials as materials  # noqa: E402
import ore_shapes as shapes  # noqa: E402

CELL_M = 1.0
# Veins keep inside the cell, so a mark never crosses into the next tile.
VEIN_EXTENT_M = 0.36
VEIN_HEX = '#c4c4c4'


def rng_of(kind, layer_id):
    return random.Random('%s-%s' % (kind, layer_id))


# --- the texture quad ------------------------------------------------------------------------------


def add_texture_quad(name, recipe):
    """A 1 m quad facing the camera (-Y), UVs 0..1, its emission the recipe's value in 0..1."""
    bpy.ops.mesh.primitive_plane_add(size=CELL_M, location=(0.0, 0.0, 0.0), rotation=(math.pi / 2, 0.0, 0.0))
    quad = bpy.context.view_layer.objects.active
    quad.name = name
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    graph = tiles.Graph(material)
    emit(graph, recipe(graph))
    quad.data.materials.append(material)
    return quad


def emit(graph, value):
    clamped = graph.math('MINIMUM', graph.math('MAXIMUM', value, 0.0), 1.0)
    colour = graph.add('ShaderNodeCombineColor', [(0, clamped), (1, clamped), (2, clamped)]).outputs[0]
    emission = graph.add('ShaderNodeEmission', [('Color', colour), ('Strength', 1.0)])
    output = graph.add('ShaderNodeOutputMaterial')
    graph.tree.links.new(emission.outputs[0], output.inputs['Surface'])


def stretched(graph, fac, low=0.3, high=0.7):
    """Blender's noise sits close to 0.5; spread its usual span over 0..1."""
    return graph.add('ShaderNodeMapRange', [(0, fac), (1, low), (2, high), (3, 0.0), (4, 1.0)]).outputs[0]


def around_half(graph, value, amplitude):
    """0.5 + (value - 0.5) * amplitude."""
    return graph.mul_add(graph.minus(value, 0.5), amplitude, 0.5)


# --- base: the body texture, by the row's pattern ----------------------------------------------------


def base_mottled_grain(graph):
    """Ironstone: dull blotches of darker and paler iron, a fine grain over them."""
    blotch = stretched(graph, graph.noise(5, 5, seed=101, detail=3, roughness=0.55))
    grain = stretched(graph, graph.noise(72, 72, seed=102, detail=6, roughness=0.6))
    return graph.plus(around_half(graph, blotch, 0.75), graph.mul(graph.minus(grain, 0.5), 0.22))


def base_crusted_scale(graph):
    """Shallow copper: a crust broken into scales, each its own tone, dark cracks between."""
    scales = graph.voronoi(8, 8, seed=111)
    edge = graph.voronoi(8, 8, seed=111, feature='DISTANCE_TO_EDGE')['Distance']
    tone = graph.add('ShaderNodeSeparateColor', [(0, scales['Color'])]).outputs[0]
    crack = graph.smooth(edge, 0.05, 0.0)
    rim = graph.mul(graph.smooth(edge, 0.05, 0.1), graph.smooth(edge, 0.16, 0.1))
    grain = stretched(graph, graph.noise(60, 60, seed=112, detail=6))
    body = graph.mul_add(tone, 0.35, 0.36)
    body = graph.plus(body, graph.mul(rim, 0.14))
    body = graph.plus(body, graph.mul(graph.minus(grain, 0.5), 0.14))
    return graph.minus(body, graph.mul(crack, 0.32))


def base_banded_seam(graph):
    """Deep-seam tin: beds of grey across the cell, bent by a slow warp, fine laminae inside."""
    warp = graph.noise(2, 2, seed=121, detail=2)
    beds = tiles.strata(graph, 5, warp, 1.2)
    fine = tiles.strata(graph, 23, warp, 1.2)
    grain = stretched(graph, graph.noise(64, 64, seed=122, detail=6))
    tone = around_half(graph, beds, 0.62)
    tone = graph.plus(tone, graph.mul(graph.minus(fine, 0.5), 0.12))
    return graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.1))


def base_clouded_mass(graph):
    """Clouded quartzine: milky smoke drifting through the stone, soft-edged, no grain to speak of."""
    smoke = stretched(graph, graph.noise(3, 3, seed=131, detail=6, roughness=0.62), 0.32, 0.68)
    wisps = stretched(graph, graph.noise(9, 9, seed=132, detail=4, roughness=0.5))
    tone = around_half(graph, smoke, 0.7)
    return graph.plus(tone, graph.mul(graph.minus(wisps, 0.5), 0.16))


def base_conchoidal_glass(graph):
    """Flint glass: a smooth face broken into shell-shaped scars, fine ripples fading across each."""
    shells = graph.voronoi(4, 4, seed=141)['Distance']
    ripple = graph.math('SINE', graph.mul(shells, 34.0))
    fade = graph.smooth(shells, 0.75, 0.15)
    tone = graph.plus(graph.mul(graph.mul(ripple, fade), 0.07), 0.52)
    drift = stretched(graph, graph.noise(3, 3, seed=142, detail=2))
    return graph.plus(tone, graph.mul(graph.minus(drift, 0.5), 0.34))


# --- sheen: the lustre's highlights -----------------------------------------------------------------


def sheen_earthy(graph):
    """Earthy: next to none, a few dull motes where a grain catches the lamp."""
    motes = graph.smooth(graph.voronoi(40, 40, seed=201)['Distance'], 0.1, 0.03)
    return graph.mul(motes, 0.18)


def sheen_submetallic(graph):
    """Submetallic: soft patches where the crust wears through to metal."""
    patches = graph.smooth(stretched(graph, graph.noise(6, 6, seed=211, detail=3)), 0.62, 0.8)
    flecks = graph.smooth(graph.voronoi(30, 30, seed=212)['Distance'], 0.08, 0.02)
    return graph.plus(graph.mul(patches, 0.4), graph.mul(flecks, 0.3))


def sheen_metallic(graph):
    """Metallic: bright streaks drawn along the beds, as a polished seam throws the light."""
    streak = graph.smooth(stretched(graph, graph.noise(2, 20, seed=221, detail=3)), 0.6, 0.84)
    glint = graph.smooth(graph.voronoi(18, 18, seed=222)['Distance'], 0.07, 0.015)
    return graph.plus(graph.mul(streak, 0.62), graph.mul(glint, 0.5))


def sheen_waxy(graph):
    """Waxy: a broad soft bloom with no edge, the light sunk into the stone."""
    bloom = graph.smooth(stretched(graph, graph.noise(2, 2, seed=231, detail=2)), 0.4, 0.85)
    return graph.mul(bloom, 0.32)


def sheen_vitreous(graph):
    """Vitreous: sharp small glints, and bright slivers where a curved fracture face meets the lamp."""
    glint = graph.smooth(graph.voronoi(12, 12, seed=241)['Distance'], 0.06, 0.012)
    arcs = graph.math('SINE', graph.mul(graph.voronoi(3, 3, seed=242)['Distance'], 22.0))
    lit = graph.smooth(stretched(graph, graph.noise(3, 3, seed=243, detail=2)), 0.55, 0.75)
    slivers = graph.mul(graph.smooth(arcs, 0.9, 0.99), lit)
    return graph.plus(graph.mul(glint, 0.9), graph.mul(slivers, 0.7))


# --- vein: the crystal or vein shape, by the row's silhouette ----------------------------------------


def vein_material():
    return materials.surface_material('vein-grey', VEIN_HEX, roughness=0.55)


def vein_nugget_cluster(rng, body):
    """Ironstone: blocky, rounded lumps in two clusters, half-sunk in the face."""
    marks = []
    for cluster, (cx, cz) in enumerate(((-0.14, 0.1), (0.16, -0.14))):
        for i, (dx, dz) in enumerate(shapes.scatter_positions(rng, 5, 0.15, 0.1)):
            size = rng.uniform(0.09, 0.15)
            lump = shapes.add_cube('nugget-%d-%d' % (cluster, i), size, (cx + dx, 0.0, cz + dz),
                                   scale=(rng.uniform(0.8, 1.2), 1.0, rng.uniform(0.7, 1.1)),
                                   rotation=(rng.uniform(0, 0.6), rng.uniform(0, math.tau), rng.uniform(0, 0.6)))
            shapes.bevel(lump, size * 0.28, segments=3)
            marks.append(lump)
    return assign_all(marks, body)


def vein_flake_scatter(rng, body):
    """Shallow copper: thin ragged flakes scattered over the face, each tipped toward the lamp."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 14, VEIN_EXTENT_M, 0.13)):
        size = rng.uniform(0.04, 0.075)
        points = shapes.regular_points((x, z), size, rng.choice((5, 6, 7)), rng.uniform(0, math.tau))
        points = [(px + rng.uniform(-size, size) * 0.35, pz + rng.uniform(-size, size) * 0.35) for px, pz in points]
        flake = shapes.add_polygon('flake-%d' % i, points, -0.03, 0.008)
        flake.rotation_euler = (rng.uniform(-0.45, 0.45), 0.0, rng.uniform(-0.45, 0.45))
        marks.append(flake)
    return assign_all(marks, body)


def vein_plate_stack(rng, body):
    """Deep-seam tin: flat rectangular plates lapped over each other along a diagonal seam."""
    marks = []
    for i in range(6):
        t = i / 5
        x, z = -0.28 + 0.56 * t + rng.uniform(-0.03, 0.03), 0.22 - 0.44 * t + rng.uniform(-0.03, 0.03)
        width, height = rng.uniform(0.16, 0.22), rng.uniform(0.09, 0.13)
        plate = shapes.add_cube('plate-%d' % i, 1.0, (x, -0.03 - 0.006 * i, z), scale=(width, 0.014, height),
                                rotation=(rng.uniform(-0.3, 0.3), rng.uniform(-0.5, -0.25), rng.uniform(-0.3, 0.3)))
        shapes.bevel(plate, 0.006)
        marks.append(plate)
    return assign_all(marks, body)


def vein_nodule_bed(rng, body):
    """Clouded quartzine: smooth round nodules of many sizes, sunk to their middles."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 9, VEIN_EXTENT_M - 0.04, 0.17)):
        radius = rng.uniform(0.05, 0.1)
        nodule = shapes.add_icosphere('nodule-%d' % i, radius, (x, 0.0, z), subdivisions=3,
                                      scale=(1.0, rng.uniform(0.5, 0.8), rng.uniform(0.85, 1.0)))
        marks.append(nodule)
    return assign_all(marks, body)


def vein_shard_spray(rng, body):
    """Flint glass: long sharp shards fanned out from a fracture root low on the face."""
    marks = []
    root = (-0.2, -0.22)
    for i in range(8):
        angle = math.radians(8 + 74 * i / 7) + rng.uniform(-0.06, 0.06)
        length = rng.uniform(0.17, 0.27)
        centre = (root[0] + math.cos(angle) * length, root[1] + math.sin(angle) * length)
        points = shapes.shard_points(centre, length, rng.uniform(0.022, 0.034), angle)
        shard = shapes.add_polygon('shard-%d' % i, points, -0.03, 0.012)
        shard.rotation_euler = (rng.uniform(-0.12, 0.12), 0.0, 0.0)
        marks.append(shard)
    return assign_all(marks, body)


def assign_all(marks, material):
    for mark in marks:
        shapes.assign(mark, material)
    return marks


BASES = {
    'mottled-grain': base_mottled_grain,
    'crusted-scale': base_crusted_scale,
    'banded-seam': base_banded_seam,
    'clouded-mass': base_clouded_mass,
    'conchoidal-glass': base_conchoidal_glass,
}
SHEENS = {
    'earthy': sheen_earthy,
    'submetallic': sheen_submetallic,
    'metallic': sheen_metallic,
    'waxy': sheen_waxy,
    'vitreous': sheen_vitreous,
}
VEINS = {
    'nugget-cluster': vein_nugget_cluster,
    'flake-scatter': vein_flake_scatter,
    'plate-stack': vein_plate_stack,
    'nodule-bed': vein_nodule_bed,
    'shard-spray': vein_shard_spray,
}
RECIPES = {'base': BASES, 'vein': VEINS, 'sheen': SHEENS}


def recipe_of(kind, layer_id):
    recipes = RECIPES[kind]
    if layer_id not in recipes:
        raise SystemExit('the %s layer %s has no recipe in layer_art.py' % (kind, layer_id))
    return recipes[layer_id]
