"""
The Blender recipes of the mineral skin layers (#576, ticket 592 for P1's slots 1 to 5, ticket 593
for its slots 6 to 10, ticket 594 for 11 and 12, ticket 598 for P3's slots 1 to 5, ticket 599 for
its slots 6 to 10, ticket 600 for its slots 11 to 15 and its relic signature, ticket 601 for P4's
slots 1 to 5, ticket 603 for its slots 11 to 15 and its signature material, ticket 604 for P5's
slots 1 to 5, ticket 605 for its slots 6 to 10, ticket 595 for P2's slots 1 to 5, ticket 596 for its
slots 6 to 9): one per layer id of `mineralSkins.json`. A layer id with no recipe fails, never falls
back.

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
from mathutils import Matrix, Vector

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
# P3 batch 3 (ticket 600): the shapes a base and its sheen, or a vein and its sheen, both draw, so
# the light falls on the very bands, facets and domes. A line set is whole numbers of lines along u
# and v, so it repeats at the cell edge; vein positions are metres from the cell's middle (u = x + 0.5,
# v = z + 0.5 on the texture quad).
WIDMANSTATTEN_SETS = ((0, 5, 601), (4, 3, 602), (-4, 3, 603))
TRIANGLE_FACETS = ((0, 4), (4, 2), (-4, 2))
STAR_DOMES = (((-0.15, 0.13), 0.11), ((0.16, -0.02), 0.12), ((-0.07, -0.2), 0.08))
# Centre, radius, teeth, phase: each wheel meshes with the one before it.
GEAR_TRAIN = (((-0.1, 0.08), 0.19, 16, 0.0), ((0.118, -0.103), 0.12, 10, 0.2), ((0.236, 0.037), 0.08, 7, 0.1))
TRELLIS_RODS = 2
TRELLIS_STEP_M = 0.12
TRELLIS_REACH_M = 0.33


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


def lattice_of(graph, per_u, per_v, stagger=0.0):
    """
    The cell cut into `per_u` by `per_v` blocks, odd rows shifted by `stagger` of a block: each
    pixel's block (column, row) and its place in the block (0..1 across, 0..1 up). Whole blocks
    across the cell, the column folded back into 0..per_u, so the lattice repeats at the cell edge.
    """
    row = graph.math('FLOOR', graph.mul(graph.v, per_v))
    shift = graph.mul(graph.math('FLOORED_MODULO', row, 2.0), stagger)
    across = graph.mul_add(graph.u, per_u, shift)
    column = graph.math('FLOORED_MODULO', graph.math('FLOOR', across), per_u)
    return {'column': column, 'row': row, 'x': graph.math('FRACT', across), 'y': graph.math('FRACT', graph.mul(graph.v, per_v))}


def sprinkled(graph, per_cell, seed, radius, share):
    """
    Round dots on `share` of the cells of a Voronoi field with `per_cell` cells across: 1 at a dot's
    middle, falling off to 0 at `radius` (of a Voronoi cell), 0 between dots.
    """
    cells = graph.voronoi(per_cell, per_cell, seed=seed)
    dot = graph.smooth(cells['Distance'], radius, radius * 0.4)
    picked = graph.add('ShaderNodeTexWhiteNoise', [('Vector', cells['Position'])], {'noise_dimensions': '3D'}).outputs['Value']
    return graph.mul(dot, graph.smooth(picked, 1.0 - share, 1.0 - share + 0.02))


def block_random(graph, lattice, seed):
    """One random value in 0..1 per block of the lattice, the same everywhere inside it."""
    point = graph.add('ShaderNodeCombineXYZ', [(0, lattice['column']), (1, lattice['row']), (2, float(seed))]).outputs[0]
    return graph.add('ShaderNodeTexWhiteNoise', [('Vector', point)], {'noise_dimensions': '3D'}).outputs['Value']


def block_edge(graph, lattice):
    """How far a pixel sits from its block's nearest edge, 0 on the edge, 0.5 at the middle."""
    x, y = lattice['x'], lattice['y']
    return graph.math('MINIMUM', graph.math('MINIMUM', x, graph.minus(1.0, x)), graph.math('MINIMUM', y, graph.minus(1.0, y)))


def block_ring(graph, lattice):
    """The square distance from the block's middle, 0 there and 0.5 on its edge: nested squares."""
    x = graph.math('ABSOLUTE', graph.minus(lattice['x'], 0.5))
    y = graph.math('ABSOLUTE', graph.minus(lattice['y'], 0.5))
    return graph.math('MAXIMUM', x, y)


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


def base_tarnish_steps(graph):
    """Bright lead: cleavage steps, each fresh face its own tone, fogged over by a drifting tarnish."""
    steps = lattice_of(graph, 5, 5, stagger=0.5)
    face = graph.mul_add(block_random(graph, steps, 151), 0.42, 0.42)
    seam = graph.smooth(block_edge(graph, steps), 0.035, 0.0)
    lip = graph.mul(graph.smooth(steps['y'], 0.9, 0.97), graph.minus(1.0, seam))
    fog = graph.smooth(stretched(graph, graph.noise(3, 3, seed=152, detail=4, roughness=0.6)), 0.35, 0.8)
    grain = stretched(graph, graph.noise(70, 70, seed=153, detail=5))
    tone = graph.plus(face, graph.mul(lip, 0.16))
    tone = graph.minus(tone, graph.mul(fog, 0.18))
    tone = graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.08))
    return graph.minus(tone, graph.mul(seam, 0.3))


def base_speckled_grit(graph):
    """Deep-grade nickel: a pale matrix peppered with dark grit specks, fewer bright ones, a light mottle."""
    mottle = stretched(graph, graph.noise(4, 4, seed=161, detail=3))
    # Coarse enough that the pepper still shows at a phone's 22 px tile, where the hue slot's pale
    # grey alone sits close to tin and flint glass.
    dark = sprinkled(graph, 12, 162, 0.48, 0.85)
    fine = sprinkled(graph, 26, 165, 0.36, 0.7)
    bright = sprinkled(graph, 9, 163, 0.3, 0.35)
    grain = stretched(graph, graph.noise(90, 90, seed=164, detail=4))
    tone = around_half(graph, mottle, 0.4)
    tone = graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.12))
    tone = graph.minus(tone, graph.plus(graph.mul(dark, 0.5), graph.mul(fine, 0.3)))
    return graph.plus(graph.plus(tone, graph.mul(bright, 0.32)), 0.12)


def base_resin_flow(graph):
    """Honey amber: slow flow lines through clear resin, dark specks of trapped grit, a few bubbles."""
    warp = graph.noise(2, 2, seed=171, detail=3, roughness=0.55)
    flow = tiles.strata(graph, 3, warp, 2.2)
    swirl = stretched(graph, graph.noise(5, 5, seed=172, detail=4))
    grit = graph.smooth(graph.voronoi(7, 7, seed=173)['Distance'], 0.07, 0.035)
    bubble = graph.voronoi(9, 9, seed=174)['Distance']
    ring = graph.mul(graph.smooth(bubble, 0.035, 0.05), graph.smooth(bubble, 0.07, 0.055))
    tone = around_half(graph, flow, 0.36)
    tone = graph.plus(tone, graph.mul(graph.minus(swirl, 0.5), 0.3))
    tone = graph.minus(tone, graph.mul(grit, 0.42))
    return graph.plus(tone, graph.mul(ring, 0.3))


def base_zoned_growth(graph):
    """Violet fluorite: growth zones as nested squares parallel to the cube faces, deep and pale in turn."""
    cubes = lattice_of(graph, 2, 2)
    ring = graph.plus(block_ring(graph, cubes), graph.mul(graph.minus(graph.noise(3, 3, seed=181, detail=2), 0.5), 0.08))
    zones = graph.math('SINE', graph.mul(ring, 38.0))
    fine = graph.math('SINE', graph.mul(ring, 140.0))
    rim = graph.smooth(block_edge(graph, cubes), 0.025, 0.0)
    tone = graph.plus(graph.mul(zones, 0.22), 0.5)
    tone = graph.plus(tone, graph.mul(fine, 0.04))
    return graph.minus(tone, graph.mul(rim, 0.3))


def base_quartz_veined(graph):
    """Vein gold: a smoky quartz host crossed by pale veinlets, thin and branching, where the gold ran."""
    host = stretched(graph, graph.noise(4, 4, seed=191, detail=4, roughness=0.55))
    major = graph.voronoi(3, 3, seed=192, feature='DISTANCE_TO_EDGE')['Distance']
    minor = graph.voronoi(8, 8, seed=193, feature='DISTANCE_TO_EDGE')['Distance']
    veinlet = graph.math('MAXIMUM', graph.smooth(major, 0.03, 0.008), graph.mul(graph.smooth(minor, 0.018, 0.004), 0.6))
    grain = stretched(graph, graph.noise(64, 64, seed=194, detail=5))
    tone = graph.mul_add(host, 0.26, 0.3)
    tone = graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.1))
    return graph.plus(tone, graph.mul(veinlet, 0.5))


def base_rutile_silk(graph):
    """Blue corundum: a deep, softly clouded body crossed by fine rutile silk, needles in three sets at 60 degrees."""
    body = stretched(graph, graph.noise(3, 3, seed=301, detail=3, roughness=0.55))
    silk = graph.math('MAXIMUM', graph.math('MAXIMUM', silk_needles(graph, 0, 16, 302), silk_needles(graph, 14, 8, 303)),
                      silk_needles(graph, -14, 8, 304))
    tone = around_half(graph, body, 0.5)
    return graph.minus(graph.plus(tone, graph.mul(silk, 0.3)), 0.05)


def silk_needles(graph, per_u, per_v, seed):
    """
    One set of silk: thin straight lines across the cell, whole numbers of them along u and v so
    the set repeats at the cell edge, broken into short needles by a fine noise.
    """
    across = graph.mul_add(graph.u, per_u, graph.mul(graph.v, per_v))
    jitter = graph.mul(graph.minus(graph.noise(4, 4, seed=seed, detail=2), 0.5), 0.3)
    line = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.plus(across, jitter), 1.0)), 0.09, 0.0)
    needles = graph.smooth(stretched(graph, graph.noise(20, 20, seed=seed + 50, detail=2)), 0.5, 0.66)
    return graph.mul(line, needles)


def base_clear_depths(graph):
    """Red beryl: clear stone, a slow swell of depth, fine growth tubes along the column, faint healed veils."""
    depth = stretched(graph, graph.noise(2, 2, seed=321, detail=2))
    tube = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.mul(graph.u, 11.0), 1.0)), 0.1, 0.0)
    tube_runs = graph.smooth(stretched(graph, graph.noise(12, 3, seed=322, detail=2)), 0.5, 0.62)
    edge = graph.voronoi(3, 3, seed=323, feature='DISTANCE_TO_EDGE')['Distance']
    veil = graph.mul(graph.smooth(edge, 0.02, 0.0), graph.smooth(stretched(graph, graph.noise(6, 6, seed=324, detail=2)), 0.45, 0.6))
    tone = around_half(graph, depth, 0.45)
    tone = graph.plus(tone, graph.mul(graph.mul(tube, tube_runs), 0.24))
    return graph.minus(tone, graph.mul(veil, 0.2))


def base_etched_glass(graph):
    """Green apatite: clear glassy stone, fine striae up the prism, and small etch pits with a pale lip."""
    depth = stretched(graph, graph.noise(3, 3, seed=401, detail=3))
    jitter = graph.mul(graph.minus(graph.noise(3, 3, seed=402, detail=2), 0.5), 0.6)
    striae = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.mul_add(graph.u, 26.0, jitter), 1.0)), 0.12, 0.0)
    striae_runs = graph.smooth(stretched(graph, graph.noise(6, 2, seed=403, detail=2)), 0.45, 0.7)
    pit = sprinkled(graph, 11, 404, 0.34, 0.55)
    lip = graph.mul(sprinkled(graph, 11, 404, 0.5, 0.55), graph.minus(1.0, pit))
    tone = around_half(graph, depth, 0.5)
    tone = graph.plus(tone, graph.mul(graph.mul(striae, striae_runs), 0.14))
    return graph.plus(graph.minus(tone, graph.mul(pit, 0.36)), graph.mul(lip, 0.16))


def base_growth_lines(graph):
    """Ribbed shell: chalky matrix packed with shells, each a set of fine growth rings round its beak."""
    shells = graph.voronoi(3, 3, seed=411)
    rings = graph.math('SINE', graph.mul(shells['Distance'], 70.0))
    bands = graph.math('SINE', graph.mul(shells['Distance'], 18.0))
    tone_of_shell = graph.add('ShaderNodeSeparateColor', [(0, shells['Color'])]).outputs[0]
    chalk = stretched(graph, graph.noise(48, 48, seed=412, detail=5))
    tone = graph.mul_add(tone_of_shell, 0.18, 0.41)
    tone = graph.plus(tone, graph.plus(graph.mul(rings, 0.07), graph.mul(bands, 0.11)))
    return graph.plus(tone, graph.mul(graph.minus(chalk, 0.5), 0.18))


def base_burnished_scratches(graph):
    """Native platinum: a burnished face, a soft mottle of wear, long fine scratches in two crossing sets, a few pits."""
    wear = stretched(graph, graph.noise(4, 4, seed=421, detail=3, roughness=0.5))
    scratches = graph.math('MAXIMUM', long_scratches(graph, 7, 19, 422), graph.mul(long_scratches(graph, 13, -5, 423), 0.6))
    pits = sprinkled(graph, 14, 424, 0.3, 0.3)
    tone = around_half(graph, wear, 0.34)
    tone = graph.minus(tone, graph.mul(scratches, 0.2))
    return graph.minus(tone, graph.mul(pits, 0.34))


def long_scratches(graph, per_u, per_v, seed):
    """
    One set of scratches: hairlines across the cell, whole numbers of them along u and v so the set
    repeats at the cell edge, each kept only in long runs, as a pebble rolled across grit scores it.
    """
    across = graph.mul_add(graph.u, per_u, graph.mul(graph.v, per_v))
    line = graph.smooth(graph.math('ABSOLUTE', graph.periodic(across, 1.0)), 0.07, 0.0)
    runs = graph.smooth(stretched(graph, graph.noise(4, 4, seed=seed, detail=2)), 0.56, 0.64)
    return graph.mul(line, runs)


def base_cleaved_clear(graph):
    """Blue topaz: clear stone, a slow depth, flat basal cleavage cracks across it, and small liquid inclusions."""
    depth = stretched(graph, graph.noise(2, 3, seed=431, detail=2))
    warp = graph.mul(graph.minus(graph.noise(2, 2, seed=432, detail=1), 0.5), 0.2)
    crack = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.mul_add(graph.v, 4.0, warp), 1.0)), 0.035, 0.0)
    crack_runs = graph.smooth(stretched(graph, graph.noise(3, 4, seed=433, detail=2)), 0.4, 0.55)
    gleam = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.mul_add(graph.v, 4.0, graph.plus(warp, 0.06)), 1.0)), 0.05, 0.0)
    drops = sprinkled(graph, 9, 434, 0.22, 0.45)
    tone = around_half(graph, depth, 0.42)
    cracks = graph.mul(crack, crack_runs)
    tone = graph.plus(graph.minus(tone, graph.mul(cracks, 0.3)), graph.mul(graph.mul(gleam, crack_runs), 0.14))
    return graph.minus(tone, graph.mul(drops, 0.22))


def base_nacre_sheets(graph):
    """Coiled ammonite: thin wavy sheets of nacre laid one on another, crossed by the frilled suture lines of the shell."""
    warp = graph.noise(2, 2, seed=441, detail=3, roughness=0.55)
    sheets = tiles.strata(graph, 13, warp, 2.6)
    swell = stretched(graph, graph.noise(3, 3, seed=442, detail=2))
    frill = graph.math('ABSOLUTE', graph.minus(graph.noise(3, 3, seed=443, detail=4, roughness=0.55), 0.5))
    suture = graph.smooth(frill, 0.011, 0.003)
    tone = around_half(graph, swell, 0.38)
    tone = graph.plus(tone, graph.mul(graph.minus(sheets, 0.5), 0.2))
    return graph.minus(tone, graph.mul(suture, 0.34))


def base_pitted_cast(graph):
    """Pig iron: a cast face of fine mottle, pocked with round blowholes, each dark with a pale lip."""
    mottle = stretched(graph, graph.noise(6, 6, seed=501, detail=4, roughness=0.55))
    grain = stretched(graph, graph.noise(80, 80, seed=504, detail=5))
    # Big, dark and many: smoke calcite shares the pig iron's colour on P3 (hue slots 210 and 232 at
    # lumas 0.55 and 0.58), so the pocked face has to tell them apart at a phone's 22 px tile.
    pit = blowholes_of(graph, PIT_RADIUS)
    lip = graph.math('MAXIMUM', graph.minus(blowholes_of(graph, LIP_RADIUS), pit), 0.0)
    pinhole = sprinkled(graph, 22, 503, 0.34, 0.6)
    tone = graph.plus(around_half(graph, mottle, 0.5), graph.mul(graph.minus(grain, 0.5), 0.1))
    tone = graph.plus(tone, graph.mul(lip, 0.2))
    tone = graph.minus(tone, graph.plus(graph.mul(pit, 0.56), graph.mul(pinhole, 0.32)))
    # Lifted only so far that the skin averages its hue slot's luma, a shade under the calcite's.
    return graph.plus(tone, 0.06)


PIT_RADIUS, LIP_RADIUS = 0.4, 0.56


def blowholes_of(graph, radius):
    """The cast face's blowholes, one field shared by the base and the dull sheen's lit lips."""
    return sprinkled(graph, 9, 502, radius, 0.8)


def base_soot_dusted(graph):
    """Soot zinc: pale zinc under drifts of soot, darker runs where it settled, a dust of fine specks."""
    drift = stretched(graph, graph.noise(3, 3, seed=511, detail=5, roughness=0.6))
    soot = graph.smooth(drift, 0.42, 0.7)
    runs = stretched(graph, graph.noise(12, 2, seed=512, detail=3))
    dust = sprinkled(graph, 34, 513, 0.4, 0.5)
    tone = graph.minus(0.7, graph.mul(soot, 0.4))
    tone = graph.minus(tone, graph.mul(graph.minus(runs, 0.5), 0.18))
    return graph.minus(tone, graph.mul(dust, 0.2))


def base_frosted_face(graph):
    """Rail quartz: a frosted face, a fine bright frost over a slow cloud, coarse striations across the prism."""
    cloud = stretched(graph, graph.noise(3, 3, seed=521, detail=3))
    frost = stretched(graph, graph.noise(110, 110, seed=522, detail=2))
    # Coarse and level, so a phone's 22 px tile still shows bands: native platinum, P3's other pale
    # metal-white, is scratched on the diagonal.
    bands = graph.math('SINE', graph.mul(graph.v, 6.0 * math.tau))
    striae = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.mul(graph.v, 6.0), 1.0)), 0.08, 0.0)
    tone = around_half(graph, cloud, 0.3)
    tone = graph.plus(tone, graph.mul(graph.minus(frost, 0.5), 0.3))
    tone = graph.plus(tone, graph.mul(bands, 0.17))
    return graph.plus(tone, graph.mul(striae, 0.14))


def base_smoke_rhombs(graph):
    """Smoke calcite: smoky wisps through the stone, crossed by the rhombic cleavage calcite splits along."""
    smoke = stretched(graph, graph.noise(3, 3, seed=531, detail=6, roughness=0.62))
    wisp = stretched(graph, graph.noise(8, 4, seed=532, detail=4))
    first, second = rhomb_axes(graph)
    cleave = graph.math('MAXIMUM', cleavage_line(graph, first), cleavage_line(graph, second))
    lip = graph.smooth(graph.math('FRACT', first), 0.88, 0.97)
    tone = around_half(graph, smoke, 0.75)
    tone = graph.plus(tone, graph.mul(graph.minus(wisp, 0.5), 0.18))
    tone = graph.plus(tone, graph.mul(lip, 0.12))
    return graph.plus(graph.minus(tone, graph.mul(cleave, 0.36)), 0.04)


def rhomb_axes(graph):
    """
    The two cleavage coordinates of a rhomb lattice: whole numbers of lines along u and v (3 and 2),
    so the lattice repeats at the cell edge; a line wherever either coordinate is whole.
    """
    return graph.mul_add(graph.u, 3.0, graph.mul(graph.v, 2.0)), graph.mul_add(graph.u, 3.0, graph.mul(graph.v, -2.0))


def cleavage_line(graph, axis):
    return graph.smooth(graph.math('ABSOLUTE', graph.periodic(axis, 1.0)), 0.07, 0.0)


def base_oxide_film(graph):
    """Step bismuth: the tarnish of a thin oxide film, fringes following the film's thickness like oil on water."""
    film = oxide_film_of(graph)
    fringe = graph.math('SINE', graph.mul(film, 44.0))
    fine = graph.math('SINE', graph.mul(film, 130.0))
    tone = graph.plus(graph.mul(fringe, 0.26), 0.5)
    tone = graph.plus(tone, graph.mul(fine, 0.05))
    return graph.plus(tone, graph.mul(graph.minus(film, 0.5), 0.2))


def oxide_film_of(graph):
    """The film's thickness, 0..1: the base draws its fringes and the iridescent sheen lights them."""
    return stretched(graph, graph.noise(2, 2, seed=541, detail=3, roughness=0.5))


def base_widmanstatten_etch(graph):
    """Meteoric iron: an etched face of broad kamacite bands in three sets at about 60 degrees, bright taenite rims, dark plessite between."""
    sets = [kamacite_set(graph, per_u, per_v, seed) for per_u, per_v, seed in WIDMANSTATTEN_SETS]
    plessite = stretched(graph, graph.noise(40, 40, seed=604, detail=5))
    tone = graph.mul_add(plessite, 0.14, 0.33)
    for (band, rim), lift in zip(sets, (0.2, 0.12, 0.27)):
        tone = graph.plus(tone, graph.mul(band, lift))
        tone = graph.plus(tone, graph.mul(rim, 0.16))
    return tone


def kamacite_set(graph, per_u, per_v, seed):
    """
    One set of kamacite bands: wide straight bands across the cell (whole numbers along u and v, so
    the set repeats at the cell edge), interrupted where the other sets cross, each with a thin bright
    taenite rim. Returns the band and its rim.
    """
    across = graph.math('ABSOLUTE', graph.periodic(graph.mul_add(graph.u, per_u, graph.mul(graph.v, per_v)), 1.0))
    runs = graph.smooth(stretched(graph, graph.noise(3, 3, seed=seed, detail=2)), 0.42, 0.52)
    band = graph.mul(graph.smooth(across, 0.2, 0.15), runs)
    rim = graph.mul(graph.mul(graph.smooth(across, 0.15, 0.2), graph.smooth(across, 0.25, 0.2)), runs)
    return band, rim


def base_hex_zoning(graph):
    """Star sapphire: a deep blue body grown in hexagonal colour zones round one core a cell, pale and deep in turn."""
    zones_of = lattice_of(graph, 1, 1)
    ring = graph.plus(hex_ring(graph, zones_of), graph.mul(graph.minus(graph.noise(3, 3, seed=611, detail=2), 0.5), 0.05))
    zones = graph.math('SINE', graph.mul(ring, 30.0))
    depth = stretched(graph, graph.noise(2, 2, seed=612, detail=3))
    tone = around_half(graph, depth, 0.36)
    return graph.minus(graph.plus(tone, graph.mul(zones, 0.16)), graph.mul(graph.smooth(ring, 0.06, 0.0), 0.12))


def hex_ring(graph, lattice):
    """The hexagonal distance from the block's middle: nested hexagons, flat sides up and down."""
    x = graph.math('ABSOLUTE', graph.minus(lattice['x'], 0.5))
    y = graph.math('ABSOLUTE', graph.minus(lattice['y'], 0.5))
    slant = graph.mul_add(x, 0.866, graph.mul(y, 0.5))
    return graph.math('MAXIMUM', y, slant)


def base_opal_potch(graph):
    """Opal jaw: milky common opal where the bone was, a mosaic of soft patches each its own depth, faint bone fibres."""
    patches = graph.voronoi(6, 6, seed=621)
    tone_of_patch = graph.add('ShaderNodeSeparateColor', [(0, patches['Color'])]).outputs[0]
    edge = graph.voronoi(6, 6, seed=621, feature='DISTANCE_TO_EDGE')['Distance']
    soft = graph.smooth(edge, 0.0, 0.12)
    milk = stretched(graph, graph.noise(3, 3, seed=622, detail=4, roughness=0.55))
    fibre_line = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.mul_add(graph.v, 19.0, graph.mul(graph.noise(2, 2, seed=623, detail=2), 2.0)), 1.0)), 0.12, 0.0)
    fibre_runs = graph.smooth(stretched(graph, graph.noise(10, 3, seed=624, detail=2)), 0.5, 0.62)
    tone = around_half(graph, milk, 0.36)
    # Bold patches: the hue slot sits by platinum's at one luma, so the mosaic must read at 22 px.
    tone = graph.plus(tone, graph.mul(graph.mul(graph.minus(tone_of_patch, 0.5), soft), 0.55))
    return graph.minus(tone, graph.mul(graph.mul(fibre_line, fibre_runs), 0.06))


def base_hammer_facets(graph):
    """Orichalcum: worked metal beaten into shallow facets, each lit a little differently, a bright ridge where two meet."""
    facets = graph.voronoi(7, 7, seed=631)
    edge = graph.voronoi(7, 7, seed=631, feature='DISTANCE_TO_EDGE')['Distance']
    tilt = graph.add('ShaderNodeSeparateColor', [(0, facets['Color'])]).outputs[0]
    dish = graph.smooth(facets['Distance'], 0.0, 0.6)
    ridge = graph.smooth(edge, 0.04, 0.0)
    grain = stretched(graph, graph.noise(80, 80, seed=632, detail=4))
    tone = graph.mul_add(tilt, 0.3, 0.33)
    tone = graph.plus(tone, graph.mul(dish, 0.1))
    tone = graph.plus(tone, graph.mul(ridge, 0.22))
    return graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.06))


def base_triangle_facets(graph):
    """Heart diamond: a bright clear body cut into triangular facets, each a tone of its own, crisp dark facet lines."""
    lines = [graph.mul_add(graph.u, per_u, graph.mul(graph.v, per_v)) for per_u, per_v in TRIANGLE_FACETS]
    point = graph.add('ShaderNodeCombineXYZ', [(index, graph.math('FLOOR', line)) for index, line in enumerate(lines)]).outputs[0]
    facet = graph.add('ShaderNodeTexWhiteNoise', [('Vector', point)], {'noise_dimensions': '3D'}).outputs['Value']
    edge = graph.math('MINIMUM', graph.math('MINIMUM', *[graph.math('ABSOLUTE', graph.periodic(line, 1.0)) for line in lines[:2]]),
                      graph.math('ABSOLUTE', graph.periodic(lines[2], 1.0)))
    tone = graph.mul_add(facet, 0.36, 0.34)
    return graph.minus(tone, graph.mul(graph.smooth(edge, 0.04, 0.0), 0.3))


def base_clock_plate(graph):
    """P3's relic signature: a clock plate, its brass engine-turned in overlapping perlage circles, pierced by pivot holes."""
    tone = graph.mul_add(perlage_swirl(graph), 0.16, 0.44)
    wear = stretched(graph, graph.noise(3, 3, seed=641, detail=3))
    hole = sprinkled(graph, 3, 642, 0.16, 0.7)
    lip = graph.mul(sprinkled(graph, 3, 642, 0.24, 0.7), graph.minus(1.0, hole))
    tone = graph.plus(tone, graph.mul(graph.minus(wear, 0.5), 0.2))
    return graph.plus(graph.minus(tone, graph.mul(hole, 0.42)), graph.mul(lip, 0.18))


def perlage_swirl(graph):
    """Overlapping engine-turned circles in staggered rows, each brushed in fine rings: 0..1, brightest at a circle's rim."""
    circles = lattice_of(graph, 6, 6, stagger=0.5)
    x, y = graph.minus(circles['x'], 0.5), graph.minus(circles['y'], 0.5)
    radius = graph.math('SQRT', graph.plus(graph.mul(x, x), graph.mul(y, y)))
    rings = graph.mul_add(graph.math('SINE', graph.mul(radius, 60.0)), 0.5, 0.5)
    return graph.mul(rings, graph.smooth(radius, 0.15, 0.5))


def base_blued_temper(graph):
    """Clockspring steel: slow bands of temper colour drifting across drawn steel, fine draw-file lines under them."""
    warp = graph.noise(2, 2, seed=401, detail=3, roughness=0.5)
    temper = tiles.strata(graph, 2, warp, 2.6)
    filed = graph.math('SINE', graph.mul_add(graph.u, 2.0 * math.pi * 61.0, graph.mul(graph.noise(3, 30, seed=402, detail=2), 2.0)))
    tone = around_half(graph, temper, 0.62)
    tone = graph.plus(tone, graph.mul(filed, 0.05))
    return graph.plus(tone, graph.mul(graph.minus(stretched(graph, graph.noise(50, 50, seed=403, detail=4)), 0.5), 0.06))


def base_dichroic_zones(graph):
    """Alexandrite: the stone split into soft zones of its two colours, deep and light, turning one into the other."""
    zones = graph.smooth(stretched(graph, graph.noise(3, 3, seed=411, detail=3, roughness=0.5)), 0.42, 0.58)
    swirl = stretched(graph, graph.noise(8, 8, seed=412, detail=3))
    tone = graph.mul_add(zones, 0.56, 0.2)
    return graph.plus(tone, graph.mul(graph.minus(swirl, 0.5), 0.2))


def base_sutured_plates(graph):
    """Ichthyosaur eye: bone plates meeting at wavy sutures, each plate its own tone, pitted with fine pores."""
    plates = graph.voronoi(5, 5, seed=421)
    wiggle = graph.mul(graph.minus(graph.noise(30, 30, seed=422, detail=2), 0.5), 0.05)
    edge = graph.plus(graph.voronoi(5, 5, seed=421, feature='DISTANCE_TO_EDGE')['Distance'], wiggle)
    tone = graph.mul_add(graph.add('ShaderNodeSeparateColor', [(0, plates['Color'])]).outputs[0], 0.24, 0.42)
    pores = sprinkled(graph, 34, 423, 0.3, 0.55)
    tone = graph.minus(tone, graph.mul(graph.smooth(edge, 0.03, 0.0), 0.3))
    return graph.minus(graph.plus(tone, graph.mul(graph.smooth(edge, 0.05, 0.12), 0.08)), graph.mul(pores, 0.2))


def base_watered_damask(graph):
    """Starsteel: watered steel, many thin layers folded into tight ripples, pale and dark in turn."""
    warp = graph.noise(2, 2, seed=431, detail=2, roughness=0.4)
    layers = tiles.strata(graph, 11, warp, 5.0)
    fine = tiles.strata(graph, 33, warp, 15.0)
    tone = around_half(graph, layers, 0.7)
    return graph.plus(tone, graph.mul(graph.minus(fine, 0.5), 0.12))


def base_inner_feathers(graph):
    """Painite: a deep, dark body with curved healed-fracture feathers caught bright inside it."""
    body = stretched(graph, graph.noise(3, 3, seed=441, detail=3, roughness=0.5))
    rings = graph.math('SINE', graph.mul(graph.voronoi(3, 3, seed=442)['Distance'], 30.0))
    lit = graph.smooth(stretched(graph, graph.noise(4, 4, seed=443, detail=2)), 0.55, 0.72)
    feather = graph.mul(graph.smooth(rings, 0.75, 0.98), lit)
    tone = graph.mul_add(body, 0.34, 0.36)
    return graph.plus(tone, graph.mul(feather, 0.4))


def base_riveted_plate(graph):
    """P4's signature, cogwork: corroded plate in seamed panels, rivet heads along the seams, patina pits."""
    x, z = graph.u, graph.v
    seam = tiles.seam_distance(graph, graph.periodic(x, 0.5), graph.periodic(z, 0.5))
    rivets = riveted_seams(graph, x, z)
    pits = sprinkled(graph, 22, 452, 0.35, 0.5)
    grime = stretched(graph, graph.noise(6, 6, seed=451, detail=4, roughness=0.55))
    tone = around_half(graph, grime, 0.5)
    tone = graph.minus(tone, graph.mul(graph.smooth(seam, 0.012, 0.0), 0.34))
    tone = graph.minus(tone, graph.mul(pits, 0.18))
    return graph.plus(tone, graph.mul(rivets, 0.36))


def riveted_seams(graph, x, z):
    """Rivet heads every eighth of the cell along both seams of the half-cell panels, set in from the seam."""
    across = tiles.rivet_row(graph, x, z, 0.5, 0.125, 0.045, 0.018)
    up = tiles.rivet_row(graph, z, x, 0.5, 0.125, 0.045, 0.018)
    return graph.math('MAXIMUM', across, up)


def base_scorched_scale(graph):
    """Furnace iron: fired iron under flaking heat scale, dark flakes with cracked rims, scorch clouds and a fine grain."""
    body = stretched(graph, graph.noise(4, 4, seed=601, detail=4, roughness=0.55))
    scorch = graph.smooth(stretched(graph, graph.noise(2, 2, seed=602, detail=3)), 0.5, 0.8)
    grain = stretched(graph, graph.noise(70, 70, seed=604, detail=5))
    flake, rim = heat_scale_of(graph)
    tone = graph.plus(around_half(graph, body, 0.45), graph.mul(graph.minus(grain, 0.5), 0.14))
    tone = graph.minus(tone, graph.plus(graph.mul(scorch, 0.16), graph.mul(flake, 0.3)))
    # Ember agate shares the furnace iron's red (hue slots 0 and 356 at lumas 0.48 and 0.55), so the
    # cracked crust, with its rims lifted pale, has to tell them apart at a phone's 22 px tile, and
    # the iron sits a shade under its slot's luma ("comes up warm and black") where the agate's
    # chalcedony sits a shade over.
    return graph.plus(graph.plus(tone, graph.mul(rim, 0.3)), 0.05)


def heat_scale_of(graph):
    """
    The heat scale: two in five cells of a Voronoi field flaked dark, each flake (1 inside, 0 off it)
    and its cracked rim (1 at the crack); the burnt-matte sheen lights the same rims.
    """
    cells = graph.voronoi(8, 8, seed=603)
    edge = graph.voronoi(8, 8, seed=603, feature='DISTANCE_TO_EDGE')['Distance']
    picked = picked_of(graph, cells, 0.4)
    flake = graph.mul(picked, graph.smooth(edge, 0.02, 0.05))
    rim = graph.mul(picked, graph.mul(graph.smooth(edge, 0.006, 0.014), graph.smooth(edge, 0.045, 0.02)))
    return flake, rim


def picked_of(graph, cells, share):
    """1 on `share` of a Voronoi field's cells, 0 on the rest, the same everywhere inside a cell."""
    picked = graph.add('ShaderNodeTexWhiteNoise', [('Vector', cells['Position'])], {'noise_dimensions': '3D'}).outputs['Value']
    return graph.smooth(picked, 1.0 - share, 1.0 - share + 0.02)


def base_black_grain(graph):
    """Magnetite: a black granular mass of small octahedral grains, each its own tone, dark seams between."""
    grains, edge = magnetite_grains_of(graph)
    tone = graph.mul_add(graph.add('ShaderNodeSeparateColor', [(0, grains['Color'])]).outputs[0], 0.4, 0.32)
    tone = graph.minus(tone, graph.mul(graph.smooth(edge, 0.08, 0.0), 0.3))
    return graph.plus(tone, graph.mul(graph.minus(stretched(graph, graph.noise(3, 3, seed=612, detail=3)), 0.5), 0.3))


# Coarse enough to show at a phone's 22 px tile (about two pixels a grain): chromite, P5's other
# blue-grey metal (hue slots 244 and 250 at lumas 0.50 and 0.58), is round seeds in a pale matrix.
MAGNETITE_GRAINS = 12


def magnetite_grains_of(graph):
    """The grains, one Voronoi field shared by the base and the steel-glints sheen's flashing facets."""
    grains = graph.voronoi(MAGNETITE_GRAINS, MAGNETITE_GRAINS, seed=611)
    edge = graph.voronoi(MAGNETITE_GRAINS, MAGNETITE_GRAINS, seed=611, feature='DISTANCE_TO_EDGE')['Distance']
    return grains, edge


def base_split_lamellae(graph):
    """Selenite blade: soft sheets split along one cleavage, each its own tone, its peeled edge pale, fine fibres along it."""
    sheet = lamella_of(graph)
    tone = graph.mul_add(graph.math('FLOORED_MODULO', graph.math('FLOOR', sheet), 4.0), 0.06, 0.38)
    tone = graph.plus(tone, graph.mul(graph.smooth(graph.math('FRACT', sheet), 0.7, 0.96), 0.18))
    tone = graph.minus(tone, graph.mul(graph.smooth(graph.math('FRACT', sheet), 0.05, 0.0), 0.2))
    fibre = graph.math('SINE', graph.mul(sheet, 9.0 * math.tau))
    cloud = stretched(graph, graph.noise(3, 3, seed=621, detail=3))
    return graph.plus(graph.plus(tone, graph.mul(fibre, 0.04)), graph.mul(graph.minus(cloud, 0.5), 0.2))


def lamella_of(graph):
    """
    The sheet coordinate across selenite's cleavage: u + 3v, four sheets a unit, so 16 sheets cross the
    cell and the lattice repeats at its edge (whole sheets along u and v, four tones in turn).
    """
    return graph.mul(graph.mul_add(graph.v, 3.0, graph.u), 4.0)


def base_fortification_bands(graph):
    """Ember agate: the fortification bands of agate, nested round a few centres, and a pale quartz core in each."""
    distance = agate_distance_of(graph)
    bands = graph.math('SINE', graph.mul(distance, AGATE_BANDS))
    fine = graph.math('SINE', graph.mul(distance, AGATE_BANDS * 3.1))
    core = graph.smooth(distance, 0.1, 0.05)
    # Pale chalcedony a shade over the slot's luma, apart from the darker furnace iron (base_scorched_scale).
    tone = graph.plus(graph.mul(bands, 0.22), 0.57)
    tone = graph.plus(tone, graph.mul(fine, 0.06))
    return graph.plus(tone, graph.mul(core, 0.34))


AGATE_BANDS = 40.0


def agate_distance_of(graph):
    """The distance to the nearest band centre, wobbled so the bands bend: shared by the base and the banded gloss."""
    wobble = graph.mul(graph.minus(graph.noise(5, 5, seed=632, detail=2), 0.5), 0.12)
    return graph.plus(graph.voronoi(3, 3, seed=631)['Distance'], wobble)


def base_leopard_nodules(graph):
    """Chromite: round black seeds of chromite packed in a paler serpentine matrix, streaked with fine green-grey veinlets."""
    matrix = stretched(graph, graph.noise(5, 5, seed=642, detail=5, roughness=0.55))
    streak = graph.smooth(graph.math('ABSOLUTE', graph.minus(graph.noise(3, 3, seed=643, detail=3), 0.5)), 0.025, 0.0)
    nodule = chromite_seeds_of(graph, CHROMITE_SEED_RADIUS)
    tone = graph.plus(around_half(graph, matrix, 0.3), 0.14)
    tone = graph.minus(tone, graph.mul(streak, 0.12))
    return graph.minus(tone, graph.mul(nodule, 0.46))


CHROMITE_SEED_RADIUS, CHROMITE_BEAD_RADIUS = 0.62, 0.3


def chromite_seeds_of(graph, radius):
    """The seeds, one dot field shared by the base and the wet gloss's bead of light on each seed."""
    return sprinkled(graph, 7, 641, radius, 0.85)


def base_slaty_cleavage(graph):
    """Slate shale: fine slaty cleavage on a slight slant, broad silt beds across it, sheets stepped off along it."""
    warp = graph.noise(2, 2, seed=701, detail=2)
    beds = graph.mul_add(graph.math('SINE', graph.mul(slanted(graph, 1, 2, warp, 0.6), 2.0 * math.pi)), 0.5, 0.5)
    laminae = graph.math('SINE', graph.mul(slanted(graph, 3, 26, warp, 0.6), 2.0 * math.pi))
    tone = around_half(graph, beds, 0.5)
    tone = graph.plus(tone, graph.mul(laminae, 0.06))
    tone = graph.minus(tone, graph.mul(slate_sheet_edges(graph, warp), 0.26))
    return graph.plus(tone, graph.mul(graph.minus(stretched(graph, graph.noise(60, 60, seed=702, detail=4)), 0.5), 0.08))


def slanted(graph, per_u, per_v, warp, warp_lines):
    """per_u * u + per_v * v, bent by `warp`: whole lines along u and v, so a set of them repeats at the cell edge."""
    return graph.plus(graph.mul_add(graph.u, per_u, graph.mul(graph.v, per_v)), graph.mul(graph.minus(warp, 0.5), warp_lines))


def slate_sheet_edges(graph, warp):
    """The edges where a sheet of slate split off: dark lines along the cleavage every few laminae, broken by a noise."""
    across = graph.plus(slanted(graph, 1, 6, warp, 0.6), graph.mul(graph.minus(graph.noise(3, 3, seed=703, detail=2), 0.5), 0.2))
    line = graph.smooth(graph.math('ABSOLUTE', graph.periodic(across, 1.0)), 0.035, 0.0)
    broken = graph.smooth(stretched(graph, graph.noise(5, 3, seed=704, detail=2)), 0.35, 0.55)
    return graph.mul(line, broken)


def base_ochre_powder(graph):
    """Rust ochre: soft powdery earth stained in rusty drifts, the stain run down the face in streaks, a dust of pale grains."""
    stain = stretched(graph, graph.noise(4, 4, seed=711, detail=4, roughness=0.6))
    runs = stretched(graph, graph.noise(22, 2, seed=712, detail=3))
    dust = sprinkled(graph, 44, 713, 0.32, 0.5)
    tone = around_half(graph, stain, 0.7)
    tone = graph.plus(tone, graph.mul(graph.minus(runs, 0.5), 0.28))
    return graph.plus(graph.minus(tone, 0.04), graph.mul(dust, 0.2))


def base_gravel_bed(graph):
    """Tin gravel: a packed bed of rounded grains, each its own grey, domed to its middle, dark grit in the gaps between."""
    grains = graph.voronoi(9, 9, seed=721)
    edge = graph.voronoi(9, 9, seed=721, feature='DISTANCE_TO_EDGE')['Distance']
    tone = graph.mul_add(graph.add('ShaderNodeSeparateColor', [(0, grains['Color'])]).outputs[0], 0.3, 0.32)
    tone = graph.plus(tone, graph.mul(graph.smooth(edge, 0.0, 0.3), 0.24))
    tone = graph.minus(tone, graph.mul(graph.smooth(edge, 0.06, 0.0), 0.34))
    return graph.plus(tone, graph.mul(graph.minus(stretched(graph, graph.noise(70, 70, seed=722, detail=4)), 0.5), 0.1))


def base_sulphur_crumb(graph):
    """Sulphur crust: a crumbly crust broken into clods along soft cracks, porous with small pits, pale bloom on the clods."""
    clods = graph.voronoi(6, 6, seed=731, feature='DISTANCE_TO_EDGE')['Distance']
    pits = sprinkled(graph, 28, 732, 0.4, 0.6)
    bloom = graph.smooth(stretched(graph, graph.noise(5, 5, seed=733, detail=3)), 0.5, 0.75)
    grain = stretched(graph, graph.noise(80, 80, seed=734, detail=4))
    tone = graph.mul_add(graph.smooth(clods, 0.0, 0.18), 0.3, 0.36)
    tone = graph.plus(tone, graph.mul(bloom, 0.16))
    tone = graph.minus(tone, graph.mul(pits, 0.3))
    return graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.14))


def base_graphite_smear(graph):
    """Graphite seam: soft black smears drawn level along the seam, deep and pale in turn, a few polished lenses."""
    smear = stretched(graph, graph.noise(2, 9, seed=741, detail=4, roughness=0.55))
    # No regular lines: slate shale's sheet edges are the planet's ruled grey, so graphite stays a smear.
    fine = stretched(graph, graph.noise(4, 40, seed=742, detail=3))
    lens = graph.smooth(stretched(graph, graph.noise(3, 12, seed=743, detail=2)), 0.68, 0.8)
    tone = around_half(graph, smear, 0.95)
    tone = graph.plus(tone, graph.mul(graph.minus(fine, 0.5), 0.14))
    return graph.plus(graph.minus(tone, 0.05), graph.mul(lens, 0.18))

def base_bloom_rosettes(graph):
    """Cobalt bloom: soft round blooms of colour on a dull dark matrix, brightest at the heart under a powdery fringe, fine flecks between."""
    bloom = cobalt_blooms_of(graph)
    rings = graph.mul(graph.math('SINE', graph.mul(graph.voronoi(5, 5, seed=801)['Distance'], 44.0)), bloom)
    flecks = sprinkled(graph, 36, 803, 0.3, 0.35)
    tone = graph.mul_add(bloom, 0.46, 0.3)
    tone = graph.plus(tone, graph.mul(rings, 0.05))
    tone = graph.plus(tone, graph.mul(flecks, 0.24))
    return graph.plus(tone, graph.mul(graph.minus(stretched(graph, graph.noise(70, 70, seed=804, detail=4)), 0.5), 0.1))


def cobalt_blooms_of(graph):
    """1 at a bloom's heart, falling off through a powdery fringe to 0 on the matrix between blooms."""
    fringe = graph.mul(graph.minus(stretched(graph, graph.noise(30, 30, seed=802, detail=4, roughness=0.6)), 0.5), 0.24)
    return graph.smooth(graph.plus(graph.voronoi(5, 5, seed=801)['Distance'], fringe), 0.6, 0.18)


def base_oxide_stairs(graph):
    """Bismuth stair: square stairs climbing to one corner of every block, each tread its own temper tone, a lip and a riser shadow on each."""
    stairs = bismuth_stairs_of(graph)
    lip = graph.smooth(stairs['rise'], 0.15, 0.0)
    riser = graph.smooth(stairs['rise'], 0.85, 1.0)
    tone = graph.mul_add(stairs['temper'], 0.6, 0.2)
    tone = graph.plus(tone, graph.mul(lip, 0.12))
    tone = graph.minus(tone, graph.mul(riser, 0.2))
    return graph.plus(tone, graph.mul(graph.minus(stretched(graph, graph.noise(3, 3, seed=812, detail=3)), 0.5), 0.12))


BISMUTH_STAIR_BLOCKS = 3
BISMUTH_STAIR_TREADS = 5.0


def bismuth_stairs_of(graph):
    """
    Per pixel of the stair blocks: `rise`, how far up its tread it sits (0 at the lip, 1 at the next
    riser), and `temper`, its tread's tone, stepped through the oxide colours from a per-block start.
    """
    blocks = lattice_of(graph, BISMUTH_STAIR_BLOCKS, BISMUTH_STAIR_BLOCKS)
    climb = graph.mul(graph.math('MAXIMUM', blocks['x'], blocks['y']), BISMUTH_STAIR_TREADS)
    tread = graph.math('FLOOR', climb)
    temper = graph.math('FRACT', graph.mul_add(tread, 0.29, block_random(graph, blocks, 811)))
    return {'rise': graph.math('FRACT', climb), 'temper': temper}


def base_adularia_milk(graph):
    """Moonstone lens: milky feldspar in a soft cloud, a broad band of glow drifting across it, faint cleavage square to itself."""
    cloud = stretched(graph, graph.noise(3, 3, seed=822, detail=3, roughness=0.45))
    glow = graph.smooth(adularia_band_of(graph), 0.6, 0.95)
    warp = graph.noise(2, 2, seed=821, detail=2)
    level = graph.smooth(graph.math('ABSOLUTE', graph.periodic(slanted(graph, 0, 6, warp, 0.15), 1.0)), 0.02, 0.0)
    upright = graph.smooth(graph.math('ABSOLUTE', graph.periodic(slanted(graph, 6, 0, warp, 0.15), 1.0)), 0.015, 0.0)
    tone = graph.minus(around_half(graph, cloud, 0.45), 0.07)
    tone = graph.plus(tone, graph.mul(glow, 0.2))
    return graph.minus(tone, graph.mul(graph.math('MAXIMUM', level, upright), 0.1))


def adularia_band_of(graph):
    """The adularescence: one slow bent band per cell across the diagonal, 1 on its crest, 0 in its trough."""
    warp = graph.noise(2, 2, seed=821, detail=2)
    return graph.mul_add(graph.math('SINE', graph.mul(slanted(graph, 1, 1, warp, 0.8), 2.0 * math.pi)), 0.5, 0.5)


def base_cubic_cleavage(graph):
    """Galena cube: fine steel grain with a satin weave, laid level in one block and upright in the next, cut by square cleavage cracks."""
    weave = galena_weave_of(graph)
    cracks = graph.mul(graph.smooth(block_edge(graph, weave['blocks']), 0.022, 0.0),
                       graph.smooth(stretched(graph, graph.noise(5, 5, seed=833, detail=2)), 0.3, 0.5))
    tone = around_half(graph, weave['fibre'], 0.35)
    # Level blocks darker than upright ones: the checker still reads at 22 px a tile, where tin gravel's grains blur.
    tone = graph.plus(tone, graph.mul(graph.minus(weave['upright'], 0.5), 0.2))
    tone = graph.plus(tone, graph.mul(graph.minus(block_random(graph, weave['blocks'], 834), 0.5), 0.1))
    return graph.minus(graph.plus(tone, 0.03), graph.mul(cracks, 0.36))


GALENA_BLOCKS = 4


def galena_weave_of(graph):
    """The cleavage blocks and the satin fibre in them: level fibres in one block, upright in the next, as a checker."""
    blocks = lattice_of(graph, GALENA_BLOCKS, GALENA_BLOCKS)
    upright = graph.math('FLOORED_MODULO', graph.plus(blocks['column'], blocks['row']), 2.0)
    level_fibre = stretched(graph, graph.noise(4, 64, seed=831, detail=3))
    upright_fibre = stretched(graph, graph.noise(64, 4, seed=832, detail=3))
    fibre = graph.mul_add(graph.minus(upright_fibre, level_fibre), upright, level_fibre)
    return {'blocks': blocks, 'upright': upright, 'fibre': fibre}



def base_peat_crumb(graph):
    """Bog iron: crumbly ore dug wet from peat, each crumb its own tone, dark rootlet fibres through it and rusty mottles."""
    crumbs = graph.voronoi(16, 16, seed=701)
    edge = graph.voronoi(16, 16, seed=701, feature='DISTANCE_TO_EDGE')['Distance']
    rust = graph.smooth(stretched(graph, graph.noise(4, 4, seed=702, detail=4, roughness=0.55)), 0.55, 0.75)
    tone = graph.mul_add(graph.add('ShaderNodeSeparateColor', [(0, crumbs['Color'])]).outputs[0], 0.3, 0.33)
    tone = graph.minus(tone, graph.mul(graph.smooth(edge, 0.07, 0.0), 0.24))
    tone = graph.plus(tone, graph.mul(rust, 0.24))
    return graph.minus(tone, graph.mul(rootlet_fibres_of(graph), 0.26))


def rootlet_fibres_of(graph):
    """Rotted rootlets: thin dark threads wandering up the face, where a long noise crosses its middle."""
    wander = graph.noise(3, 12, seed=703, detail=3)
    return graph.smooth(graph.math('ABSOLUTE', graph.minus(wander, 0.5)), 0.018, 0.0)


def base_bloom_crust(graph):
    """Cobalt bloom: dark host rock crusted in patches of powdery pink bloom, each patch with a fringe where the crust thins."""
    patch = bloom_patches_of(graph)
    host = stretched(graph, graph.noise(18, 18, seed=712, detail=3))
    powder = stretched(graph, graph.noise(90, 90, seed=713, detail=4))
    fringe = graph.mul(graph.mul(patch, graph.minus(1.0, patch)), 4.0)
    tone = graph.plus(0.3, graph.mul(graph.minus(host, 0.5), 0.14))
    tone = graph.plus(tone, graph.mul(patch, 0.38))
    tone = graph.plus(tone, graph.mul(graph.mul(graph.minus(powder, 0.5), 0.24), patch))
    return graph.minus(tone, graph.mul(fringe, 0.1))


def bloom_patches_of(graph):
    """The bloom: 1 on the crust, 0 on bare rock, soft at the edge; the bloom sparkle lights only the crust."""
    return graph.smooth(stretched(graph, graph.noise(5, 5, seed=711, detail=5, roughness=0.6)), 0.44, 0.56)


def base_dew_beads(graph):
    """Rain quartz: a pale clear face beaded all over with dew, each bead a dark rim round a bright crown, faint needles in the stone."""
    cloud = stretched(graph, graph.noise(3, 3, seed=722, detail=3))
    needles = stretched(graph, graph.noise(36, 3, seed=723, detail=2))
    rim = graph.math('MAXIMUM', graph.minus(dew_beads_of(graph, DEW_RIM_RADIUS), dew_beads_of(graph, DEW_BODY_RADIUS)), 0.0)
    crown = dew_beads_of(graph, DEW_CROWN_RADIUS)
    tone = graph.plus(around_half(graph, cloud, 0.3), graph.mul(graph.minus(needles, 0.5), 0.16))
    tone = graph.minus(tone, graph.mul(rim, 0.36))
    return graph.plus(tone, graph.mul(crown, 0.3))


DEW_RIM_RADIUS, DEW_BODY_RADIUS, DEW_CROWN_RADIUS = 0.5, 0.36, 0.16


def dew_beads_of(graph, radius):
    """The dew, one dot field shared by the base and the dew glints' bright crowns."""
    return sprinkled(graph, 9, 721, radius, 0.75)


def base_ribbon_stripes(graph):
    """Canal jasper: level ribbons of jasper, dark and pale in turn, each its own width, bent by a slow warp, a fine chert grain."""
    ribbons = jasper_ribbons_of(graph)
    fine = tiles.strata(graph, 29, graph.noise(2, 2, seed=732, detail=2), 1.0)
    grain = stretched(graph, graph.noise(70, 70, seed=733, detail=5))
    tone = around_half(graph, graph.smooth(ribbons, 0.3, 0.7), 0.56)
    tone = graph.plus(tone, graph.mul(graph.minus(fine, 0.5), 0.1))
    tone = graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.1))
    # Alexandrite (#603) wears nearly the jasper's green (hue slots 160 and 140 at lumas 0.55 and
    # 0.50), so level ribbons against its soft zones and sixlings tell them apart at a phone's 22 px
    # tile, and the jasper sits on its own slot's luma, a shade under the alexandrite's.
    return graph.minus(tone, 0.03)


def jasper_ribbons_of(graph):
    """
    The ribbons, 0..1 across v: two strata sets, 5 and 8 beds a cell, summed so the ribbons come in
    unequal widths; shared by the base and the tumbled polish on the pale ribbons.
    """
    warp = graph.noise(2, 2, seed=731, detail=2)
    wide = tiles.strata(graph, 5, warp, 1.2)
    narrow = tiles.strata(graph, 8, warp, 1.2)
    return graph.mul(graph.plus(wide, narrow), 0.5)


def base_bladed_stibnite(graph):
    """Antimony: long blades packed side by side on a steep slant, each its own tone, striated along its length, dark seams between."""
    across = stibnite_blades_of(graph)
    blade = graph.math('FRACT', across)
    shade = graph.math('SINE', graph.mul(blade_index_of(graph, across), 2.3))
    length = stretched(graph, graph.noise(3, 3, seed=741, detail=3))
    # A shade under the usual mean: starsteel and the ichthyosaur eye (#603, lumas 0.68 and 0.72) sit
    # just over the antimony's slot (0.70), so the blades, with their flash, average a shade under it.
    tone = graph.plus(0.41, graph.mul(shade, 0.15))
    tone = graph.plus(tone, graph.mul(graph.minus(length, 0.5), 0.3))
    tone = graph.plus(tone, graph.mul(graph.math('SINE', graph.mul(across, 4.0 * math.tau)), 0.04))
    tone = graph.plus(tone, graph.mul(graph.smooth(blade, 0.78, 0.92), 0.12))
    return graph.minus(tone, graph.mul(graph.smooth(blade_edge_of(graph, blade), 0.06, 0.0), 0.3))


def stibnite_blades_of(graph):
    """
    The blade coordinate: 3u - v, six blades a unit, so lines of it run steeply up to the right
    and 18 blades cross the cell along u, 6 along v (whole blades both ways, so it repeats).
    """
    return graph.mul(graph.minus(graph.mul(graph.u, 3.0), graph.v), 6.0)


def blade_index_of(graph, across):
    """Which blade, folded to six in turn: the lattice shifts by whole multiples of six at the cell edge."""
    return graph.math('FLOORED_MODULO', graph.math('FLOOR', across), STIBNITE_TONES)


STIBNITE_TONES = 6.0


def blade_edge_of(graph, blade):
    return graph.math('MINIMUM', blade, graph.minus(1.0, blade))


def base_oily_swirls(graph):
    """Peridot: olivine's oily body, slow bands swirled round by a warp, cloudy, with dark basalt flecks caught in it."""
    swirl = olivine_swirl_of(graph)
    cloud = stretched(graph, graph.noise(3, 3, seed=703, detail=3))
    fleck = sprinkled(graph, 10, 704, 0.42, 0.45)
    tone = graph.plus(graph.mul(swirl, 0.16), 0.53)
    tone = graph.plus(tone, graph.mul(graph.minus(cloud, 0.5), 0.24))
    return graph.minus(tone, graph.mul(fleck, 0.42))


OLIVINE_SWIRLS = 5.0


def olivine_swirl_of(graph):
    """The swirl bands (-1..1): contour lines of a warped noise, shared by the base and the oil film's light."""
    field = stretched(graph, graph.noise(2, 2, seed=701, detail=3, roughness=0.55))
    warp = graph.mul(graph.minus(graph.noise(4, 4, seed=702, detail=2), 0.5), 0.5)
    return graph.math('SINE', graph.mul(graph.plus(field, warp), OLIVINE_SWIRLS * math.tau))


def base_phosphate_beds(graph):
    """
    Shark tooth: a bone bed, level beds of grey phosphatic sand, each its own tone, fine grit in them and
    dark phosphate pellets along the bed partings.
    """
    warp = graph.noise(2, 2, seed=711, detail=2)
    beds = tiles.strata(graph, PHOSPHATE_BEDS, warp, 0.6)
    parting = graph.smooth(beds, 0.12, 0.0)
    grit = stretched(graph, graph.noise(64, 64, seed=712, detail=5))
    pellet = sprinkled(graph, 18, 713, 0.42, 0.4)
    # Chromite has the shark tooth's colour (hue slots 250 and 222, both at luma 0.58), and is round
    # dark seeds in a pale matrix; the bone bed is laid level and bold, so at a phone's 22 px tile it
    # reads as stripes, as P3's rail quartz parts from native platinum.
    tone = around_half(graph, beds, 0.62)
    tone = graph.plus(tone, graph.mul(graph.minus(grit, 0.5), 0.16))
    tone = graph.minus(tone, graph.mul(parting, 0.22))
    return graph.minus(tone, graph.mul(graph.mul(pellet, graph.smooth(beds, 0.45, 0.2)), 0.3))


PHOSPHATE_BEDS = 6


def base_bladed_columns(graph):
    """Wolfram: wolframite grown in upright blades, each its own tone, striated along its length, dark seams between."""
    blades = wolfram_blades_of(graph)
    face = graph.mul_add(block_random(graph, blades, 721), 0.38, 0.32)
    seam = graph.smooth(graph.math('MINIMUM', blades['x'], graph.minus(1.0, blades['x'])), 0.06, 0.0)
    striae = graph.math('SINE', graph.mul(graph.u, 96.0 * math.tau))
    drift = stretched(graph, graph.noise(2, 6, seed=722, detail=3))
    tone = graph.plus(face, graph.mul(striae, 0.04))
    tone = graph.plus(tone, graph.mul(graph.minus(drift, 0.5), 0.2))
    return graph.minus(tone, graph.mul(seam, 0.3))


WOLFRAM_BLADES = 8


def wolfram_blades_of(graph):
    """
    The blades: the cell cut into upright columns, two rows staggered by a third so no seam runs right
    across. Shared by the base and the fibre satin's streaks. Wolfram stands upright where P5's shark
    tooth bone bed lies level (hue slots 212 and 222 at lumas 0.64 and 0.58).
    """
    return lattice_of(graph, WOLFRAM_BLADES, 2, stagger=0.35)


def base_ember_depths(graph):
    """Fire garnet: a deep red body lit from inside, soft glowing cores where the stone is thickest, a faint grain."""
    glow = garnet_glow_of(graph)
    cloud = stretched(graph, graph.noise(3, 3, seed=732, detail=3))
    grain = stretched(graph, graph.noise(60, 60, seed=733, detail=4))
    tone = graph.plus(graph.mul(glow, 0.46), 0.41)
    tone = graph.plus(tone, graph.mul(graph.minus(cloud, 0.5), 0.2))
    return graph.plus(tone, graph.mul(graph.minus(grain, 0.5), 0.08))


def garnet_glow_of(graph):
    """1 at a glowing core, falling off to 0 between them: shared by the base and the ember glow's halos."""
    return graph.smooth(graph.voronoi(4, 4, seed=731)['Distance'], 0.62, 0.0)


def base_spongy_bone(graph):
    """Saurian vertebra: spongy bone, a pale lattice of struts round dark pores, a denser smooth patch of cortex here and there."""
    pores = vertebra_pores_of(graph)
    cortex = graph.smooth(stretched(graph, graph.noise(2, 2, seed=742, detail=3)), 0.72, 0.88)
    grain = stretched(graph, graph.noise(48, 48, seed=743, detail=4))
    open_pore = graph.mul(pores, graph.minus(1.0, cortex))
    tone = graph.plus(graph.mul(graph.minus(grain, 0.5), 0.12), 0.68)
    return graph.minus(tone, graph.mul(open_pore, 0.5))


VERTEBRA_PORES = 11


def vertebra_pores_of(graph):
    """1 inside a pore, 0 on the struts between: shared by the base and the bone dust on the struts."""
    return graph.smooth(graph.voronoi(VERTEBRA_PORES, VERTEBRA_PORES, seed=741)['Distance'], 0.62, 0.4)


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


def sheen_splendent(graph):
    """Splendent: whole cleavage faces flash like mirrors where they meet the lamp, the rest fogged dark."""
    steps = lattice_of(graph, 5, 5, stagger=0.5)
    flash = graph.smooth(block_random(graph, steps, 251), 0.72, 0.8)
    inset = graph.smooth(block_edge(graph, steps), 0.03, 0.07)
    fog = graph.smooth(stretched(graph, graph.noise(3, 3, seed=152, detail=4, roughness=0.6)), 0.35, 0.8)
    return graph.mul(graph.mul(graph.mul(flash, inset), graph.mul_add(fog, -0.6, 1.0)), 0.85)


def sheen_glittering(graph):
    """Glittering: a dense dust of pinpoint sparks, as each metal grain throws back the lamp."""
    return graph.mul(sprinkled(graph, 40, 261, 0.3, 0.4), 0.8)


def sheen_resinous(graph):
    """Resinous: a warm gloss in soft round pools with a broad sheen between, never a hard edge."""
    pools = graph.smooth(graph.voronoi(5, 5, seed=271)['Distance'], 0.22, 0.04)
    gloss = graph.smooth(stretched(graph, graph.noise(2, 2, seed=272, detail=2)), 0.5, 0.75)
    return graph.plus(graph.mul(pools, 0.42), graph.mul(gloss, 0.16))


def sheen_fluorescent(graph):
    """Fluorescent: a faint glow in alternate growth zones, as fluorite answers the lamp, with a few glints."""
    cubes = lattice_of(graph, 2, 2)
    ring = graph.plus(block_ring(graph, cubes), graph.mul(graph.minus(graph.noise(3, 3, seed=181, detail=2), 0.5), 0.08))
    glow = graph.smooth(graph.math('SINE', graph.mul(ring, 19.0)), 0.2, 0.9)
    glint = graph.smooth(graph.voronoi(10, 10, seed=281)['Distance'], 0.05, 0.01)
    return graph.plus(graph.mul(glow, 0.3), graph.mul(glint, 0.7))


def sheen_brilliant(graph):
    """Brilliant: thin hard threads of light wandering the face, and strong glints where they cross."""
    ridge = graph.math('ABSOLUTE', graph.minus(graph.noise(5, 5, seed=291, detail=3, roughness=0.5), 0.5))
    threads = graph.smooth(ridge, 0.018, 0.004)
    glint = graph.smooth(graph.voronoi(14, 14, seed=292)['Distance'], 0.06, 0.012)
    return graph.plus(graph.mul(threads, 0.7), graph.mul(glint, 0.85))


def sheen_adamantine(graph):
    """Adamantine: a hard bright lustre, strong glints, and the six-rayed star the silk throws under the lamp."""
    x, y = graph.minus(graph.u, 0.5), graph.minus(graph.v, 0.5)
    radius = graph.math('SQRT', graph.plus(graph.mul(x, x), graph.mul(y, y)))
    rays = [star_ray(graph, x, y, math.radians(angle)) for angle in (0.0, 60.0, 120.0)]
    star = graph.mul(graph.math('MAXIMUM', graph.math('MAXIMUM', rays[0], rays[1]), rays[2]), graph.smooth(radius, 0.44, 0.06))
    bloom = graph.smooth(radius, 0.3, 0.0)
    glint = graph.smooth(graph.voronoi(16, 16, seed=301)['Distance'], 0.09, 0.025)
    return graph.plus(graph.plus(graph.mul(star, 0.5), graph.mul(bloom, 0.22)), graph.mul(glint, 0.9))


def star_ray(graph, x, y, angle):
    """A soft bright line through the cell's middle at `angle`: 1 on it, 0 a few pixels off."""
    across = graph.math('ABSOLUTE', graph.minus(graph.mul(x, math.sin(angle)), graph.mul(y, math.cos(angle))))
    return graph.smooth(across, 0.03, 0.004)


def sheen_prismatic(graph):
    """Prismatic: long bars of light down the prism faces that meet the lamp, and sharp glints."""
    faces = lattice_of(graph, 7, 1)
    flash = graph.smooth(block_random(graph, faces, 311), 0.58, 0.66)
    inset = graph.smooth(graph.math('MINIMUM', faces['x'], graph.minus(1.0, faces['x'])), 0.06, 0.16)
    fade = graph.smooth(stretched(graph, graph.noise(3, 2, seed=312, detail=2)), 0.35, 0.7)
    glint = graph.smooth(graph.voronoi(11, 11, seed=313)['Distance'], 0.08, 0.02)
    return graph.plus(graph.mul(graph.mul(graph.mul(flash, inset), fade), 0.7), graph.mul(glint, 0.8))


def sheen_subresinous(graph):
    """Subresinous: a soft gloss drawn out in streaks up the prism, a few small glints, never a hard flash."""
    streak = graph.smooth(stretched(graph, graph.noise(12, 2, seed=451, detail=2)), 0.58, 0.82)
    glint = graph.smooth(graph.voronoi(9, 9, seed=452)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(streak, 0.34), graph.mul(glint, 0.55))


def sheen_dull(graph):
    """Dull: the chalky shell drinks the light, a faint even lift over the ribs and nothing sharp."""
    lift = graph.smooth(stretched(graph, graph.noise(4, 4, seed=461, detail=2)), 0.45, 0.8)
    return graph.mul(lift, 0.1)


def sheen_polished(graph):
    """Polished: broad bright sweeps across the burnished face, as a rolled pebble mirrors the lamp, and hard glints."""
    sweep_warp = graph.mul(graph.minus(graph.noise(2, 2, seed=471, detail=2), 0.5), 0.5)
    sweep = graph.math('SINE', graph.mul(graph.mul_add(graph.u, 2.0, graph.plus(graph.mul(graph.v, 1.0), sweep_warp)), math.tau))
    glint = graph.smooth(graph.voronoi(13, 13, seed=472)['Distance'], 0.07, 0.015)
    return graph.plus(graph.mul(graph.smooth(sweep, 0.6, 0.97), 0.42), graph.mul(glint, 0.75))


def sheen_limpid(graph):
    """Limpid: light caught along the cleavage cracks as clear water catches it, a wide faint gleam, and pinpoint glints."""
    warp = graph.mul(graph.minus(graph.noise(2, 2, seed=432, detail=1), 0.5), 0.2)
    crack_runs = graph.smooth(stretched(graph, graph.noise(3, 4, seed=433, detail=2)), 0.4, 0.55)
    flash = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.mul_add(graph.v, 4.0, graph.plus(warp, 0.06)), 1.0)), 0.04, 0.0)
    gleam = graph.smooth(stretched(graph, graph.noise(2, 2, seed=481, detail=2)), 0.5, 0.8)
    glint = graph.smooth(graph.voronoi(15, 15, seed=482)['Distance'], 0.05, 0.01)
    return graph.plus(graph.plus(graph.mul(graph.mul(flash, crack_runs), 0.75), graph.mul(gleam, 0.18)), graph.mul(glint, 0.85))


def sheen_pearly(graph):
    """Pearly: soft bands of sheen along the nacre sheets, broad and edgeless, brightest where the shell swells."""
    warp = graph.noise(2, 2, seed=441, detail=3, roughness=0.55)
    bands = graph.smooth(tiles.strata(graph, 13, warp, 2.6), 0.55, 0.95)
    swell = graph.smooth(stretched(graph, graph.noise(3, 3, seed=442, detail=2)), 0.4, 0.75)
    return graph.mul(graph.mul(bands, graph.mul_add(swell, 0.6, 0.4)), 0.46)


def sheen_matte(graph):
    """Matte: a matte cast face; only the lips of the blowholes and a few burrs catch the lamp."""
    lip = graph.math('MAXIMUM', graph.minus(blowholes_of(graph, LIP_RADIUS), blowholes_of(graph, PIT_RADIUS)), 0.0)
    burr = graph.smooth(graph.voronoi(24, 24, seed=551)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(lip, 0.42), graph.mul(burr, 0.3))


def sheen_smudged(graph):
    """Smudged: zinc's shine shows only where the soot was wiped, two broken diagonal swipes and the bare patches."""
    wobble = graph.mul(graph.minus(graph.noise(3, 3, seed=561, detail=2), 0.5), 0.6)
    across = graph.plus(graph.mul_add(graph.u, 2.0, graph.mul(graph.v, 2.0)), wobble)
    swipe = graph.smooth(graph.math('ABSOLUTE', graph.periodic(across, 1.0)), 0.2, 0.06)
    broken = graph.smooth(stretched(graph, graph.noise(5, 5, seed=562, detail=3)), 0.35, 0.6)
    bare = graph.minus(1.0, graph.smooth(stretched(graph, graph.noise(3, 3, seed=511, detail=5, roughness=0.6)), 0.42, 0.7))
    return graph.plus(graph.mul(graph.mul(swipe, broken), 0.55), graph.mul(bare, 0.18))


def sheen_silky(graph):
    """Silky: fine level threads of light along the rods' length, broken and soft, a broad sheen beneath."""
    across = graph.mul(graph.v, 20.0)
    jitter = graph.mul(graph.minus(graph.noise(4, 4, seed=571, detail=2), 0.5), 0.2)
    thread = graph.smooth(graph.math('ABSOLUTE', graph.periodic(graph.plus(across, jitter), 1.0)), 0.12, 0.0)
    runs = graph.smooth(stretched(graph, graph.noise(6, 14, seed=572, detail=2)), 0.4, 0.62)
    broad = graph.smooth(stretched(graph, graph.noise(2, 2, seed=573, detail=2)), 0.45, 0.8)
    return graph.plus(graph.mul(graph.mul(thread, runs), 0.55), graph.mul(broad, 0.14))


def sheen_satin(graph):
    """Satin: a soft layered glow on the cleavage faces, brightest toward one corner of each rhomb, never a glint."""
    first, second = rhomb_axes(graph)
    face = graph.mul(graph.smooth(graph.math('FRACT', first), 0.35, 0.95), graph.smooth(graph.math('FRACT', second), 0.15, 0.9))
    bloom = graph.smooth(stretched(graph, graph.noise(2, 2, seed=581, detail=2)), 0.4, 0.8)
    return graph.plus(graph.mul(face, 0.36), graph.mul(bloom, 0.12))


def sheen_iridescent(graph):
    """Iridescent: bright bands along the oxide fringes, where the film throws back the lamp, and sharp glints."""
    film = oxide_film_of(graph)
    bands = graph.smooth(graph.math('SINE', graph.plus(graph.mul(film, 44.0), 1.2)), 0.6, 0.95)
    glint = graph.smooth(graph.voronoi(13, 13, seed=591)['Distance'], 0.06, 0.012)
    return graph.plus(graph.mul(bands, 0.45), graph.mul(glint, 0.6))


def sheen_lamella_flash(graph):
    """Lamella flash: one set of kamacite bands throws the lamp back at a time; the other sets stay dark, a few hard glints."""
    per_u, per_v, seed = WIDMANSTATTEN_SETS[2]
    band, _ = kamacite_set(graph, per_u, per_v, seed)
    glint = graph.smooth(graph.voronoi(12, 12, seed=651)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(band, 0.5), graph.mul(glint, 0.7))


def sheen_asterism(graph):
    """Asterism: a six-rayed star floating on each cabochon dome, a soft bloom under it; the stone between stays dark."""
    light = None
    for (cx, cz), radius in STAR_DOMES:
        x, y = graph.minus(graph.u, cx + 0.5), graph.minus(graph.v, cz + 0.5)
        reach = graph.math('SQRT', graph.plus(graph.mul(x, x), graph.mul(y, y)))
        rays = [star_ray(graph, x, y, math.radians(angle)) for angle in (30.0, 90.0, 150.0)]
        star = graph.mul(graph.math('MAXIMUM', graph.math('MAXIMUM', rays[0], rays[1]), rays[2]), graph.smooth(reach, radius, radius * 0.2))
        dome = graph.plus(graph.mul(star, 0.62), graph.mul(graph.smooth(reach, radius * 0.6, 0.0), 0.26))
        light = dome if light is None else graph.math('MAXIMUM', light, dome)
    return light


def sheen_opal_flash(graph):
    """Opal flash: play of colour, whole patches of the mosaic flaring at once under the lamp, pinfire specks between."""
    patches = graph.voronoi(6, 6, seed=621)
    pick = graph.add('ShaderNodeTexWhiteNoise', [('Vector', patches['Position'])], {'noise_dimensions': '3D'}).outputs['Value']
    edge = graph.voronoi(6, 6, seed=621, feature='DISTANCE_TO_EDGE')['Distance']
    flare = graph.mul(graph.smooth(pick, 0.62, 0.7), graph.smooth(edge, 0.0, 0.1))
    pinfire = sprinkled(graph, 30, 661, 0.3, 0.25)
    return graph.plus(graph.mul(flare, 0.6), graph.mul(pinfire, 0.5))


def sheen_hammered_shine(graph):
    """Hammered shine: a bright spot in each facet that faces the lamp, the beaten ridges gleaming, a warm overall lift."""
    facets = graph.voronoi(7, 7, seed=631)
    edge = graph.voronoi(7, 7, seed=631, feature='DISTANCE_TO_EDGE')['Distance']
    pick = graph.add('ShaderNodeTexWhiteNoise', [('Vector', facets['Position'])], {'noise_dimensions': '3D'}).outputs['Value']
    spot = graph.mul(graph.smooth(facets['Distance'], 0.32, 0.05), graph.smooth(pick, 0.45, 0.55))
    ridge = graph.smooth(edge, 0.025, 0.0)
    return graph.plus(graph.plus(graph.mul(spot, 0.6), graph.mul(ridge, 0.3)), 0.06)


def sheen_facet_fire(graph):
    """Facet fire: a few whole facets blaze, and sharp sparks sit where the facet lines meet."""
    lines = [graph.mul_add(graph.u, per_u, graph.mul(graph.v, per_v)) for per_u, per_v in TRIANGLE_FACETS]
    point = graph.add('ShaderNodeCombineXYZ', [(index, graph.math('FLOOR', line)) for index, line in enumerate(lines)]).outputs[0]
    facet = graph.add('ShaderNodeTexWhiteNoise', [('Vector', point)], {'noise_dimensions': '3D'}).outputs['Value']
    blaze = graph.smooth(graph.math('FRACT', graph.mul(facet, 7.0)), 0.82, 0.88)
    near = [graph.smooth(graph.math('ABSOLUTE', graph.periodic(line, 1.0)), 0.06, 0.0) for line in lines]
    spark = graph.mul(graph.mul(near[0], near[1]), near[2])
    return graph.plus(graph.mul(blaze, 0.5), graph.mul(graph.smooth(spark, 0.0, 0.3), 0.95))


def sheen_perlage_gleam(graph):
    """Perlage gleam: the engine-turned circles catch the lamp on one side each, a bright crescent a circle, jewel glints in the holes."""
    circles = lattice_of(graph, 6, 6, stagger=0.5)
    x, y = graph.minus(circles['x'], 0.5), graph.minus(circles['y'], 0.5)
    lit_side = graph.smooth(graph.plus(x, y), -0.05, 0.35)
    crescent = graph.mul(graph.mul(perlage_swirl(graph), lit_side), 0.42)
    jewel = sprinkled(graph, 3, 642, 0.07, 0.7)
    return graph.plus(crescent, graph.mul(jewel, 0.9))


def sheen_filed_gleam(graph):
    """Filed gleam (clockspring steel): short bright strokes along the draw-file lines, and a few glints."""
    strokes = graph.smooth(stretched(graph, graph.noise(40, 3, seed=461, detail=2)), 0.66, 0.8)
    glint = graph.smooth(graph.voronoi(15, 15, seed=462)['Distance'], 0.06, 0.012)
    return graph.plus(graph.mul(strokes, 0.5), graph.mul(glint, 0.75))


def sheen_sector_flash(graph):
    """Sector flash (alexandrite): the six sectors of a twinned crystal flash in turn, sharp glints between."""
    x, y = graph.minus(graph.u, 0.5), graph.minus(graph.v, 0.5)
    angle = graph.math('ARCTAN2', y, x)
    turn = graph.mul_add(angle, 3.0 / math.pi, 3.0)
    sector = graph.math('FLOOR', turn)
    point = graph.add('ShaderNodeCombineXYZ', [(0, sector), (1, 7.0), (2, 471.0)]).outputs[0]
    pick = graph.add('ShaderNodeTexWhiteNoise', [('Vector', point)], {'noise_dimensions': '3D'}).outputs['Value']
    # Soft at the sector's sides, so a flash is a glow across a face, never a hard wedge.
    inside = graph.math('FRACT', turn)
    sides = graph.smooth(graph.math('MINIMUM', inside, graph.minus(1.0, inside)), 0.0, 0.35)
    radius = graph.math('SQRT', graph.plus(graph.mul(x, x), graph.mul(y, y)))
    flash = graph.mul(graph.mul(graph.smooth(pick, 0.55, 0.62), sides), graph.smooth(radius, 0.46, 0.2))
    glint = graph.smooth(graph.voronoi(12, 12, seed=472)['Distance'], 0.07, 0.015)
    return graph.plus(graph.mul(flash, 0.3), graph.mul(glint, 0.85))


def sheen_greasy(graph):
    """Greasy (ichthyosaur eye): a dull oily film in soft patches over the bone, no hard glint at all."""
    film = graph.smooth(stretched(graph, graph.noise(4, 4, seed=481, detail=3)), 0.5, 0.78)
    return graph.mul(film, 0.24)


def sheen_watered_shimmer(graph):
    """Watered shimmer (starsteel): the pale layers of the damask catch the light along their ripples."""
    warp = graph.noise(2, 2, seed=431, detail=2, roughness=0.4)
    layers = tiles.strata(graph, 11, warp, 5.0)
    band = graph.smooth(layers, 0.8, 0.96)
    fade = graph.smooth(stretched(graph, graph.noise(2, 2, seed=491, detail=2)), 0.3, 0.7)
    return graph.mul(graph.mul(band, fade), 0.7)


def sheen_fire_glint(graph):
    """Fire glint (painite): few, very strong glints with a soft halo each, as deep red stone throws them back."""
    cells = graph.voronoi(6, 6, seed=501)['Distance']
    core = graph.smooth(cells, 0.05, 0.01)
    halo = graph.smooth(cells, 0.16, 0.03)
    return graph.plus(graph.mul(core, 0.95), graph.mul(halo, 0.22))


def sheen_worn_brass(graph):
    """Worn brass (P4's signature): rivet heads and seam lips rubbed bright, scuffed patches between."""
    x, z = graph.u, graph.v
    rivets = riveted_seams(graph, x, z)
    seam = tiles.seam_distance(graph, graph.periodic(x, 0.5), graph.periodic(z, 0.5))
    lip = graph.mul(graph.smooth(seam, 0.012, 0.02), graph.smooth(seam, 0.03, 0.02))
    scuff = graph.smooth(stretched(graph, graph.noise(9, 9, seed=511, detail=3)), 0.66, 0.82)
    return graph.plus(graph.plus(graph.mul(graph.smooth(rivets, 0.3, 0.8), 0.85), graph.mul(lip, 0.4)), graph.mul(scuff, 0.3))


def sheen_burnt_matte(graph):
    """Burnt matte: scorched iron drinks the light; only the heat scale's lifted rims and a faint warm cloud catch it."""
    _, rim = heat_scale_of(graph)
    cloud = graph.smooth(stretched(graph, graph.noise(3, 3, seed=651, detail=2)), 0.55, 0.85)
    return graph.plus(graph.mul(rim, 0.4), graph.mul(cloud, 0.08))


def sheen_steel_glints(graph):
    """Steel glints: whole grain facets flash steel-bright where they meet the lamp, a few in each run, and pinpoint sparks."""
    grains, edge = magnetite_grains_of(graph)
    facet = graph.mul(picked_of(graph, grains, 0.14), graph.smooth(edge, 0.03, 0.08))
    spark = graph.smooth(graph.voronoi(20, 20, seed=661)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(facet, 0.7), graph.mul(spark, 0.6))


def sheen_moon_sheen(graph):
    """Moon sheen: a cool soft glow running along each sheet's peeled edge, waxing and waning across the face."""
    sheet = lamella_of(graph)
    edge = graph.smooth(graph.math('FRACT', sheet), 0.6, 0.95)
    wax = graph.smooth(stretched(graph, graph.noise(2, 2, seed=671, detail=2)), 0.3, 0.75)
    broad = graph.smooth(stretched(graph, graph.noise(2, 2, seed=672, detail=2)), 0.5, 0.85)
    return graph.plus(graph.mul(graph.mul(edge, wax), 0.6), graph.mul(broad, 0.14))


def sheen_banded_gloss(graph):
    """Banded gloss: polished agate takes the light on alternate bands, brightest in a slow sweep, with a few glints."""
    bands = graph.smooth(graph.math('SINE', graph.mul(agate_distance_of(graph), AGATE_BANDS)), 0.55, 0.95)
    sweep = graph.smooth(stretched(graph, graph.noise(2, 2, seed=681, detail=2)), 0.35, 0.8)
    glint = graph.smooth(graph.voronoi(11, 11, seed=682)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(graph.mul(bands, sweep), 0.4), graph.mul(glint, 0.6))


def sheen_wet_gloss(graph):
    """Wet gloss: every chromite seed holds a bright bead of light at its crown, as if just wetted, over a faint sheen."""
    bead = chromite_seeds_of(graph, CHROMITE_BEAD_RADIUS)
    sheen = graph.smooth(stretched(graph, graph.noise(3, 3, seed=691, detail=2)), 0.5, 0.85)
    return graph.plus(graph.mul(bead, 0.85), graph.mul(sheen, 0.1))


def sheen_cleavage_sheen(graph):
    """Cleavage sheen (slate shale): a faint sheen along the lip of each split sheet, a dim wash over the cleavage."""
    warp = graph.noise(2, 2, seed=701, detail=2)
    across = graph.plus(slanted(graph, 1, 6, warp, 0.6), graph.mul(graph.minus(graph.noise(3, 3, seed=703, detail=2), 0.5), 0.2))
    lip = graph.mul(graph.smooth(graph.periodic(across, 1.0), 0.02, 0.05), graph.smooth(graph.periodic(across, 1.0), 0.11, 0.06))
    wash = graph.smooth(stretched(graph, graph.noise(3, 3, seed=751, detail=2)), 0.45, 0.8)
    return graph.plus(graph.mul(lip, 0.4), graph.mul(wash, 0.1))


def sheen_powdery(graph):
    """Powdery (rust ochre): no gloss at all, only a soft dusty lift in patches where the powder lies thick."""
    patches = graph.smooth(stretched(graph, graph.noise(5, 5, seed=761, detail=3)), 0.55, 0.85)
    return graph.mul(patches, 0.12)


def sheen_grain_caps(graph):
    """Grain caps (tin gravel): a small bright cap on the middle of every rounded grain, and a few hard metal glints."""
    edge = graph.voronoi(9, 9, seed=721, feature='DISTANCE_TO_EDGE')['Distance']
    caps = graph.smooth(edge, 0.1, 0.2)
    glint = graph.smooth(graph.voronoi(17, 17, seed=771)['Distance'], 0.06, 0.012)
    return graph.plus(graph.mul(caps, 0.36), graph.mul(glint, 0.55))


def sheen_sugary(graph):
    """Sugary (sulphur crust): a dense frost of tiny glints, each a crystal face of the crumb, over a weak resin wash."""
    frost = sprinkled(graph, 54, 781, 0.28, 0.3)
    wash = graph.smooth(stretched(graph, graph.noise(3, 3, seed=782, detail=2)), 0.45, 0.8)
    return graph.plus(graph.mul(frost, 0.7), graph.mul(wash, 0.12))


def sheen_slick(graph):
    """Slick (graphite seam): long level smears of greasy shine where the seam was rubbed, a broad dull gloss beneath."""
    smears = graph.smooth(stretched(graph, graph.noise(2, 16, seed=791, detail=3)), 0.58, 0.8)
    broad = graph.smooth(stretched(graph, graph.noise(2, 2, seed=792, detail=2)), 0.4, 0.8)
    return graph.plus(graph.mul(smears, 0.7), graph.mul(broad, 0.16))

def sheen_fleck_glints(graph):
    """Fleck glints (cobalt bloom): the blooms stay earthy, but sharp glints spark where their flecks meet the lamp, gathered in the blooms."""
    # Sprinkled, not a Voronoi distance: a 4D distance seldom gets small, so its glints barely show (ticket 595).
    glints = sprinkled(graph, 30, 805, 0.32, 0.45)
    blooms = cobalt_blooms_of(graph)
    return graph.plus(graph.mul(graph.mul(glints, graph.mul_add(blooms, 0.6, 0.4)), 0.85), graph.mul(blooms, 0.1))


def sheen_step_edge_flash(graph):
    """Step-edge flash (bismuth stair): a bright line on the lip of every tread, and whole treads flashing where their film meets the lamp."""
    stairs = bismuth_stairs_of(graph)
    lip = graph.smooth(stairs['rise'], 0.12, 0.0)
    flash = graph.smooth(stairs['temper'], 0.8, 0.9)
    return graph.plus(graph.mul(lip, 0.5), graph.mul(flash, 0.3))


def sheen_schiller_glow(graph):
    """Schiller glow (moonstone lens): the billowing light adularia floats across the face on the base's band, soft, never a hard glint."""
    billow = graph.smooth(stretched(graph, graph.noise(4, 4, seed=823, detail=3)), 0.25, 0.75)
    glow = graph.smooth(adularia_band_of(graph), 0.55, 0.98)
    return graph.mul(graph.mul(glow, graph.mul_add(billow, 0.5, 0.5)), 0.5)


def sheen_satin_streaks(graph):
    """Satin streaks (galena cube): a soft fibrous shimmer along each block's grain, and a few cleavage faces flashing whole."""
    weave = galena_weave_of(graph)
    shimmer = graph.smooth(weave['fibre'], 0.55, 0.8)
    flash = graph.mul(graph.smooth(block_random(graph, weave['blocks'], 835), 0.86, 0.9),
                      graph.smooth(block_edge(graph, weave['blocks']), 0.03, 0.06))
    return graph.plus(graph.mul(shimmer, 0.32), graph.mul(flash, 0.5))



def sheen_damp_dull(graph):
    """Damp dull: bog ore drinks the light; a faint wet sheen in the low hollows and a few motes on the rust."""
    damp = graph.smooth(stretched(graph, graph.noise(3, 3, seed=751, detail=3)), 0.6, 0.85)
    motes = graph.smooth(graph.voronoi(34, 34, seed=752)['Distance'], 0.09, 0.03)
    return graph.plus(graph.mul(damp, 0.14), graph.mul(motes, 0.16))


def sheen_bloom_sparkle(graph):
    """Bloom sparkle: the powdery crust is dull, but its tiny crystals spark, only where the bloom lies."""
    patch = bloom_patches_of(graph)
    spark = graph.smooth(graph.voronoi(40, 40, seed=761)['Distance'], 0.13, 0.04)
    return graph.mul(patch, graph.plus(graph.mul(spark, 0.6), 0.08))


def sheen_dew_glints(graph):
    """Dew glints: a hard point of light on the crown of every dew bead, over a wide faint gleam on the wet face."""
    crown = dew_beads_of(graph, DEW_GLINT_RADIUS)
    gleam = graph.smooth(stretched(graph, graph.noise(2, 2, seed=771, detail=2)), 0.45, 0.85)
    return graph.plus(graph.mul(crown, 0.9), graph.mul(gleam, 0.12))


DEW_GLINT_RADIUS = 0.2


def sheen_tumbled_polish(graph):
    """Tumbled polish: the pale ribbons shine as a barge-worn cobble does, brightest in a slow sweep, a few glints."""
    pale = graph.smooth(jasper_ribbons_of(graph), 0.6, 0.9)
    sweep = graph.smooth(stretched(graph, graph.noise(2, 2, seed=781, detail=2)), 0.3, 0.8)
    glint = graph.smooth(graph.voronoi(12, 12, seed=782)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(graph.mul(pale, sweep), 0.4), graph.mul(glint, 0.5))


def sheen_blade_flash(graph):
    """Blade flash: two blades in six throw the lamp back along their whole length, broken where the blade ends, fine glints."""
    across = stibnite_blades_of(graph)
    picked = graph.smooth(graph.math('SINE', graph.mul(blade_index_of(graph, across), 2.3)), 0.5, 0.65)
    broken = graph.smooth(stretched(graph, graph.noise(3, 3, seed=791, detail=3)), 0.3, 0.5)
    inside = graph.smooth(blade_edge_of(graph, graph.math('FRACT', across)), 0.05, 0.15)
    glint = graph.smooth(graph.voronoi(16, 16, seed=792)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(graph.mul(picked, graph.mul(broken, inside)), 0.75), graph.mul(glint, 0.45))


def sheen_oil_film(graph):
    """Oil film: light lying along the swirl bands as on an oily face, waxing and waning, never a glint."""
    bands = graph.smooth(olivine_swirl_of(graph), 0.55, 0.95)
    wax = graph.smooth(stretched(graph, graph.noise(2, 2, seed=751, detail=2)), 0.3, 0.75)
    broad = graph.smooth(stretched(graph, graph.noise(3, 3, seed=752, detail=2)), 0.5, 0.85)
    return graph.plus(graph.mul(graph.mul(bands, wax), 0.42), graph.mul(broad, 0.12))


def sheen_enamel_glaze(graph):
    """Enamel glaze: long level streaks of light along the bed tops, as on polished tooth enamel, and a few sharp glints."""
    warp = graph.noise(2, 2, seed=711, detail=2)
    tops = graph.smooth(tiles.strata(graph, PHOSPHATE_BEDS, warp, 0.6), 0.82, 0.98)
    runs = graph.smooth(stretched(graph, graph.noise(3, 8, seed=761, detail=2)), 0.4, 0.7)
    glint = graph.smooth(graph.voronoi(9, 9, seed=762)['Distance'], 0.05, 0.012)
    return graph.plus(graph.mul(graph.mul(tops, runs), 0.5), graph.mul(glint, 0.6))


def sheen_fibre_satin(graph):
    """Fibre satin: a soft upright streak of light down every other blade, broken along its length, a broad sheen beneath."""
    blades = wolfram_blades_of(graph)
    lit = graph.smooth(block_random(graph, blades, 771), 0.45, 0.6)
    middle = graph.smooth(graph.math('ABSOLUTE', graph.minus(blades['x'], 0.5)), 0.45, 0.1)
    broken = graph.smooth(stretched(graph, graph.noise(4, 10, seed=772, detail=2)), 0.35, 0.65)
    broad = graph.smooth(stretched(graph, graph.noise(2, 2, seed=773, detail=2)), 0.5, 0.85)
    return graph.plus(graph.mul(graph.mul(graph.mul(lit, middle), broken), 0.46), graph.mul(broad, 0.12))


def sheen_ember_glow(graph):
    """Ember glow: a soft halo round each glowing core, as if the garnet held a coal, with a bright point in the brightest."""
    glow = garnet_glow_of(graph)
    halo = graph.smooth(glow, 0.3, 0.95)
    point = graph.smooth(graph.voronoi(4, 4, seed=731)['Distance'], 0.08, 0.02)
    return graph.plus(graph.mul(halo, 0.4), graph.mul(point, 0.5))


def sheen_bone_dust(graph):
    """Bone dust: a dry, faint lift on the struts between the pores and pale specks of dust; old bone takes no gloss."""
    struts = graph.minus(1.0, vertebra_pores_of(graph))
    speck = sprinkled(graph, 22, 791, 0.3, 0.3)
    return graph.plus(graph.mul(struts, 0.12), graph.mul(speck, 0.22))


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


def vein_cleavage_cubes(rng, body):
    """Bright lead: sharp cubes all square to the face, stepped up a stair the way galena cleaves."""
    marks = []
    x, z = -0.3, -0.24
    for i in range(6):
        size = rng.uniform(0.09, 0.13)
        cube = shapes.add_cube('cube-%d' % i, size, (x, -size * 0.3, z), rotation=(0.0, 0.0, 0.0))
        shapes.bevel(cube, size * 0.03, segments=1)
        marks.append(cube)
        x += size * rng.uniform(0.6, 0.7)
        z += size * rng.uniform(0.45, 0.8) * (1 if i % 3 != 2 else -0.6)
    return assign_all(marks, body)


def vein_grain_scatter(rng, body):
    """Deep-grade nickel: a sowing of small hard grains, some alone, some in twos and threes."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 22, VEIN_EXTENT_M, 0.07)):
        for j in range(rng.choice((1, 1, 2, 3))):
            radius = rng.uniform(0.016, 0.03)
            at = (x + rng.uniform(-0.03, 0.03) * j, -radius * 0.2, z + rng.uniform(-0.03, 0.03) * j)
            grain = shapes.add_icosphere('grain-%d-%d' % (i, j), radius, at, subdivisions=1,
                                         scale=(1.0, 0.8, rng.uniform(0.75, 1.1)), rotation=(0.0, rng.uniform(0, math.tau), 0.0))
            marks.append(grain)
    return assign_all(marks, body)


def vein_bead_drops(rng, body):
    """Honey amber: drops of resin run down the face in short trails, each a fat bead under a small one."""
    marks = []
    for trail, x in enumerate((-0.22, 0.02, 0.24)):
        z = rng.uniform(0.2, 0.28)
        for i in range(rng.choice((2, 3))):
            radius = rng.uniform(0.04, 0.06)
            bead = shapes.add_icosphere('bead-%d-%d' % (trail, i), radius, (x + rng.uniform(-0.03, 0.03), -radius * 0.25, z),
                                        subdivisions=3, scale=(0.9, 0.7, 1.25))
            neck = shapes.add_icosphere('neck-%d-%d' % (trail, i), radius * 0.5, (x, -radius * 0.15, z + radius * 1.1),
                                        subdivisions=2, scale=(0.8, 0.6, 1.3))
            marks += [bead, neck]
            z -= radius * 2.6 + rng.uniform(0.02, 0.05)
    return assign_all(marks, body)


def vein_twinned_cubes(rng, body):
    """Violet fluorite: cubes grown through each other at a turn, the penetration twins fluorite makes."""
    marks = []
    for i, (x, z) in enumerate(((-0.13, 0.12), (0.15, -0.1), (-0.12, -0.2))):
        size = rng.uniform(0.16, 0.22) if i < 2 else 0.11
        spin = rng.uniform(0.0, 0.5)
        for j, turn in enumerate((0.0, math.pi / 4)):
            cube = shapes.add_cube('twin-%d-%d' % (i, j), size * (1.0 if j == 0 else 0.86), (x, -size * 0.2, z),
                                   rotation=(rng.uniform(-0.25, 0.25) + turn * 0.6, spin + turn, rng.uniform(-0.2, 0.2)))
            shapes.bevel(cube, size * 0.04, segments=1)
            marks.append(cube)
    return assign_all(marks, body)


def vein_wire_dendrite(rng, body):
    """Vein gold: wires of native gold branching from one root, kinked, a small nugget on each tip."""
    marks = []
    root = (0.0, -0.03, -0.04)
    for i in range(4):
        angle = i / 4 * math.tau + rng.uniform(-0.35, 0.35)
        end = (math.cos(angle) * rng.uniform(0.25, 0.33), -0.05, -0.04 + math.sin(angle) * rng.uniform(0.25, 0.33))
        path = kinked_path(root, end, rng, 5)
        marks.append(shapes.add_tube('wire-%d' % i, path, 0.017, resolution=3))
        for j, turn in enumerate((0.8, -0.85)):
            fork = path[2 + j]
            tip = (fork[0] + math.cos(angle + turn) * 0.11, -0.055, fork[2] + math.sin(angle + turn) * 0.11)
            marks.append(shapes.add_tube('twig-%d-%d' % (i, j), kinked_path(fork, tip, rng, 3), 0.011, resolution=3))
            marks.append(gold_bead('bead-%d-%d' % (i, j), tip, 0.02))
        marks.append(gold_bead('tip-%d' % i, end, 0.03))
    return assign_all(marks, body)

def vein_hex_barrels(rng, body):
    """Blue corundum: barrel-shaped hexagonal crystals, a six-sided body tapering to a point at each end."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 4, 0.19, 0.2)):
        length, radius = rng.uniform(0.16, 0.22), rng.uniform(0.05, 0.065)
        angle = rng.uniform(0.0, math.pi)
        marks += hex_barrel('barrel-%d' % i, (x, -radius * 0.3, z), length, radius, angle)
    return assign_all(marks, body)


def hex_barrel(name, centre, length, radius, angle):
    """A hexagonal prism of `length` along `angle` in the face, a six-sided cone on each end."""
    axis = (math.sin(angle), 0.0, math.cos(angle))
    cap = radius * 0.9
    reach = (length + cap) / 2
    body = shapes.add_prism(name, radius, length, centre, rotation=(0.0, angle, 0.0))
    ends = [shapes.add_cone('%s-%s' % (name, end), radius, cap,
                            (centre[0] + axis[0] * reach * sign, centre[1], centre[2] + axis[2] * reach * sign),
                            rotation=(0.0 if sign > 0 else math.pi, angle, 0.0))
            for end, sign in (('top', 1), ('foot', -1))]
    return [body] + ends


def vein_hex_columns(rng, body):
    """Red beryl: flat-ended hexagonal columns rising side by side from one root, tipped so their ends show."""
    marks = []
    for i in range(5):
        lean = math.radians(-24 + 12 * i) + rng.uniform(-0.06, 0.06)
        length, radius = rng.uniform(0.2, 0.34), rng.uniform(0.035, 0.055)
        foot = (-0.08 + 0.04 * i + rng.uniform(-0.02, 0.02), -0.3)
        centre = (foot[0] + math.sin(lean) * length / 2, -radius * 0.3, foot[1] + math.cos(lean) * length / 2)
        column = shapes.add_prism('column-%d' % i, radius, length, centre, rotation=(0.35, lean, 0.0))
        shapes.bevel(column, radius * 0.06, segments=1)
        marks.append(column)
    return assign_all(marks, body)


def vein_hex_ends(rng, body):
    """Green apatite: stubby hexagonal prisms seen end on, tipped a little so a side face or two shows."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 6, 0.27, 0.15)):
        radius = rng.uniform(0.045, 0.08)
        prism = shapes.add_prism('end-%d' % i, radius, radius * 1.1, (x, -radius * 0.4, z),
                                 rotation=(math.pi / 2 + rng.uniform(-0.35, 0.35), rng.uniform(0.0, math.pi / 3), rng.uniform(-0.35, 0.35)))
        shapes.bevel(prism, radius * 0.05, segments=1)
        marks.append(prism)
    return assign_all(marks, body)


def vein_ribbed_valves(rng, body):
    """Ribbed shell: fan-shaped shells half-sunk in the face, ribs running out from the beak to the scalloped rim."""
    marks = []
    for i, (x, z) in enumerate(((-0.14, 0.11), (0.15, -0.04), (-0.08, -0.2))):
        reach = rng.uniform(0.13, 0.17) if i < 2 else 0.1
        facing = rng.uniform(0.0, math.tau)
        marks += ribbed_valve('valve-%d' % i, (x, z), reach, facing)
    return assign_all(marks, body)


def ribbed_valve(name, beak, reach, facing):
    """One valve: a flat fan of `reach` from its beak, opened over 130 degrees about `facing`, nine ribs over it."""
    spread = math.radians(130)
    rim = [(beak[0] + math.cos(facing - spread / 2 + spread * k / 12) * reach,
            beak[1] + math.sin(facing - spread / 2 + spread * k / 12) * reach) for k in range(13)]
    shell = shapes.add_polygon(name, [beak] + rim, -0.012, 0.012)
    ribs = []
    for k in range(9):
        angle = facing - spread / 2 + spread * (k + 0.5) / 9
        tip = (beak[0] + math.cos(angle) * reach * 0.97, beak[1] + math.sin(angle) * reach * 0.97)
        middle = ((beak[0] + tip[0]) / 2, -0.03, (beak[1] + tip[1]) / 2)
        ribs.append(shapes.add_tube('%s-rib-%d' % (name, k), [(beak[0], -0.015, beak[1]), middle, (tip[0], -0.022, tip[1])],
                                    reach * 0.07, resolution=2))
    return [shell] + ribs


def vein_rolled_pebbles(rng, body):
    """Native platinum: smooth flattened pebbles, water-rolled, lying in a gravel stringer across the face."""
    marks = []
    for i in range(9):
        t = i / 8
        x = -0.3 + 0.6 * t + rng.uniform(-0.025, 0.025)
        z = -0.06 + 0.12 * math.sin(t * math.pi * 1.4) + rng.uniform(-0.05, 0.05)
        size = rng.uniform(0.035, 0.07)
        pebble = shapes.add_icosphere('pebble-%d' % i, size, (x, -size * 0.2, z), subdivisions=3,
                                      scale=(rng.uniform(1.2, 1.5), 0.5, rng.uniform(0.75, 0.95)),
                                      rotation=(0.0, rng.uniform(-0.6, 0.6), 0.0))
        marks.append(pebble)
    return assign_all(marks, body)


def vein_wedge_blocks(rng, body):
    """Blue topaz: upright blocks each under a pitched wedge end, tipped back so the two roof faces catch the lamp."""
    marks = []
    for i, x in enumerate((-0.2, 0.0, 0.19)):
        width, height = rng.uniform(0.1, 0.13), rng.uniform(0.2, 0.3)
        foot = -0.26 + rng.uniform(0.0, 0.05)
        half = width / 2
        outline = [(x - half, foot), (x + half, foot), (x + half, foot + height), (x, foot + height + half * 0.9), (x - half, foot + height)]
        block = shapes.add_polygon('block-%d' % i, outline, -0.02, rng.uniform(0.06, 0.08))
        block.rotation_euler = (rng.uniform(0.35, 0.5), rng.uniform(-0.15, 0.15), rng.uniform(-0.3, 0.3))
        shapes.bevel(block, 0.004, segments=1)
        marks.append(block)
    return assign_all(marks, body)


def vein_ammonite_coils(rng, body):
    """Coiled ammonite: shells coiled flat in a widening spiral, each whorl a run of ribbed chambers."""
    marks = []
    for i, (cx, cz, outer) in enumerate(((-0.09, 0.07, 0.21), (0.21, -0.2, 0.11))):
        marks += ammonite_coil('coil-%d' % i, (cx, cz), outer, rng.uniform(0.0, math.tau))
    return assign_all(marks, body)


def ammonite_coil(name, centre, outer, phase):
    """A logarithmic spiral of chambers out to `outer`, each chamber a bead as thick as a third of its whorl."""
    turns, growth = 2.6, 0.17
    chambers = []
    count = 34
    for k in range(count):
        angle = turns * math.tau * k / (count - 1)
        reach = outer * math.exp(growth * (angle - turns * math.tau))
        radius = max(reach * 0.32, 0.006)
        at = (centre[0] + math.cos(angle + phase) * reach, -radius * 0.3, centre[1] + math.sin(angle + phase) * reach)
        chambers.append(shapes.add_icosphere('%s-%d' % (name, k), radius, at, subdivisions=2, scale=(1.0, 0.55, 1.0),
                                             rotation=(0.0, -(angle + phase), 0.0)))
    return chambers



def vein_slag_knots(rng, body):
    """Pig iron: knots of drawn iron, each a small trefoil tied in a cooling run, lying on the face."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 4, 0.2, 0.22)):
        size, turn = rng.uniform(0.024, 0.03), rng.uniform(0.0, math.tau)
        path = trefoil_path((x, z), size, turn, 48)
        marks.append(shapes.add_tube('knot-%d' % i, path, size * 0.5, resolution=3))
    return assign_all(marks, body)


def trefoil_path(centre, size, turn, segments):
    """A closed trefoil knot about `centre`, `size` a unit of its 3-unit reach, turned by `turn` in the face."""
    points = []
    for k in range(segments + 1):
        t = k / segments * math.tau
        x, z = math.sin(t) + 2 * math.sin(2 * t), math.cos(t) - 2 * math.cos(2 * t)
        x, z = x * math.cos(turn) - z * math.sin(turn), x * math.sin(turn) + z * math.cos(turn)
        points.append((centre[0] + x * size, -0.04 - math.sin(3 * t) * size, centre[1] + z * size))
    return points


def vein_spangle_scales(rng, body):
    """Soot zinc: round spangle scales lapped in staggered rows, each lower row over the one above, lifted at its foot."""
    marks = []
    for row in range(6):
        z = 0.25 - row * 0.095
        for column in range(6):
            x = -0.3 + column * 0.12 + (row % 2) * 0.06 + rng.uniform(-0.012, 0.012)
            # A rounded patch, so the lapped rows read as scales and not as a block of coins.
            if math.hypot(x, z) > 0.33:
                continue
            radius = rng.uniform(0.062, 0.072)
            scale = shapes.add_prism('scale-%d-%d' % (row, column), radius, 0.01, (x, -0.02 - row * 0.008, z + rng.uniform(-0.01, 0.01)),
                                     rotation=(math.pi / 2 - rng.uniform(0.25, 0.4), rng.uniform(-0.15, 0.15), 0.0), sides=20)
            shapes.bevel(scale, 0.003, segments=1)
            marks.append(scale)
    return assign_all(marks, body)


def vein_rod_bundle(rng, body):
    """Rail quartz: a bundle of thin round rods laid level side by side, like rails, each its own length."""
    marks = []
    slant = 0.0
    axis, side = (math.cos(slant), math.sin(slant)), (-math.sin(slant), math.cos(slant))
    for i in range(8):
        offset = -0.13 + i * 0.037 + rng.uniform(-0.005, 0.005)
        along = rng.uniform(-0.05, 0.05)
        length, radius = rng.uniform(0.3, 0.5), rng.uniform(0.014, 0.019)
        centre = (axis[0] * along + side[0] * offset, -radius * 0.4, axis[1] * along + side[1] * offset)
        rod = shapes.add_prism('rod-%d' % i, radius, length, centre, rotation=(0.0, math.radians(90) - slant, 0.0), sides=12)
        shapes.bevel(rod, radius * 0.3, segments=2)
        shapes.shade_smooth(rod)
        marks.append(rod)
    return assign_all(marks, body)


def vein_lens_stack(rng, body):
    """Smoke calcite: flat biconvex lenses, two stacks of three lapped edge over edge, and one alone."""
    marks = []
    for stack, (x, z, count) in enumerate(((-0.12, 0.12, 3), (0.14, -0.08, 3), (-0.16, -0.24, 1))):
        angle = rng.uniform(-0.5, 0.5)
        for i in range(count):
            radius = rng.uniform(0.09, 0.11)
            at = (x + math.cos(angle) * 0.05 * i, -0.01 - 0.012 * i, z - math.sin(angle) * 0.05 * i + 0.035 * i)
            lens = shapes.add_icosphere('lens-%d-%d' % (stack, i), radius, at, subdivisions=3,
                                        scale=(1.0, 0.22, rng.uniform(0.38, 0.46)), rotation=(0.0, angle, 0.0))
            marks.append(lens)
    return assign_all(marks, body)


def vein_hopper_terraces(rng, body):
    """Step bismuth: hopper crystals, square frames stepped up and in toward a hollow middle, three of them turned apart."""
    marks = []
    for i, (x, z, side) in enumerate(((-0.1, 0.08, 0.3), (0.17, -0.15, 0.22), (-0.22, -0.24, 0.14))):
        marks += hopper_frames('hopper-%d' % i, (x, z), side, rng.uniform(-0.6, 0.6))
    return assign_all(marks, body)


def hopper_frames(name, centre, side, turn):
    """
    Four square frames, each smaller and nearer the lamp than the last, turned by `turn` about the
    centre. The side bars stop at the top and foot bars, so no two faces lie on one another.
    """
    frames = []
    for step in range(4):
        size = side * (1 - 0.22 * step)
        width, depth = side * 0.11, -0.012 * (step + 1)
        inner = size - 2 * width
        for edge, (ox, oz, sx, sz) in enumerate(((0, (size - width) / 2, size, width), (0, -(size - width) / 2, size, width),
                                                  ((size - width) / 2, 0, width, inner), (-(size - width) / 2, 0, width, inner))):
            x = centre[0] + ox * math.cos(turn) + oz * math.sin(turn)
            z = centre[1] - ox * math.sin(turn) + oz * math.cos(turn)
            bar = shapes.add_cube('%s-%d-%d' % (name, step, edge), 1.0, (x, depth, z), scale=(sx, 0.012, sz), rotation=(0.0, turn, 0.0))
            shapes.bevel(bar, 0.002, segments=1)
            frames.append(bar)
    return frames


def vein_crusted_slabs(rng, body):
    """Meteoric iron: angular slabs broken square from the mass, thick and blunt-edged from the fall, lying apart."""
    marks = []
    for i, (x, z) in enumerate(((-0.14, 0.12), (0.15, 0.04), (-0.04, -0.19))):
        size = rng.uniform(0.12, 0.17) if i < 2 else 0.11
        outline = [(x + math.cos(angle) * size * rng.uniform(0.75, 1.1), z + math.sin(angle) * size * rng.uniform(0.75, 1.1))
                   for angle in sorted(rng.uniform(0.0, math.tau) for _ in range(6))]
        slab = shapes.add_polygon('slab-%d' % i, outline, -0.02, rng.uniform(0.05, 0.07))
        slab.rotation_euler = (rng.uniform(-0.3, 0.3), rng.uniform(-0.4, 0.4), rng.uniform(-0.3, 0.3))
        shapes.bevel(slab, 0.01, segments=2)
        marks.append(slab)
    return assign_all(marks, body)


def vein_cabochon_domes(rng, body):
    """Star sapphire: smooth rounded domes standing out of the face, as the stone grows and as it is cut."""
    marks = []
    for i, ((x, z), radius) in enumerate(STAR_DOMES):
        dome = shapes.add_icosphere('dome-%d' % i, radius, (x, 0.0, z), subdivisions=4, scale=(1.0, 0.5, 1.0))
        marks.append(dome)
    return assign_all(marks, body)


def vein_toothed_jaw(rng, body):
    """Opal jaw: a curved jawbone across the face, a row of conical teeth standing up from it, two of them broken."""
    marks = []
    arc = [(-0.3 + 0.6 * k / 10, -0.06, -0.2 + 0.14 * math.sin(k / 10 * math.pi)) for k in range(11)]
    marks.append(shapes.add_tube('jaw', arc, 0.06, resolution=3))
    for k in range(1, 10):
        x, _, z = arc[k]
        broken = k in (3, 7)
        height = rng.uniform(0.06, 0.08) if broken else rng.uniform(0.12, 0.16)
        lean = rng.uniform(-0.15, 0.15) - (k - 5) * 0.05
        tooth = shapes.add_cone('tooth-%d' % k, 0.03, height, (x, -0.08, z + 0.04 + height / 2), rotation=(0.0, lean, 0.0), sides=10)
        marks.append(tooth)
    return assign_all(marks, body)


def vein_lattice_trellis(rng, body):
    """Orichalcum: a crystal lattice of thin rods crossing at right angles on the diagonal, a bead at every crossing."""
    marks = []
    for k in range(-TRELLIS_RODS, TRELLIS_RODS + 1):
        offset = k * TRELLIS_STEP_M
        half = math.sqrt(TRELLIS_REACH_M ** 2 - offset ** 2)
        for name, (ax, az), (nx, nz) in (('up', (1, 1), (1, -1)), ('down', (1, -1), (1, 1))):
            ends = [((ax * t + nx * offset) / math.sqrt(2), -0.04, (az * t + nz * offset) / math.sqrt(2)) for t in (-half, half)]
            marks.append(shapes.add_tube('rod-%s-%d' % (name, k), ends, 0.012, resolution=2))
    for a in range(-TRELLIS_RODS, TRELLIS_RODS + 1):
        for b in range(-TRELLIS_RODS, TRELLIS_RODS + 1):
            x, z = (a + b) * TRELLIS_STEP_M / math.sqrt(2), (a - b) * TRELLIS_STEP_M / math.sqrt(2)
            if math.hypot(x, z) < TRELLIS_REACH_M:
                marks.append(shapes.add_icosphere('node-%d-%d' % (a, b), 0.022, (x, -0.045, z), subdivisions=2))
    return assign_all(marks, body)


def vein_octahedra(rng, body):
    """Heart diamond: sharp octahedra, two square pyramids base to base, tipped so three or four faces show."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 4, 0.22, 0.2)):
        radius = rng.uniform(0.07, 0.1) if i < 3 else 0.05
        turn = (rng.uniform(0.4, 0.8), rng.uniform(0.0, math.pi / 2), rng.uniform(-0.3, 0.3))
        for half, flip in (('top', 0.0), ('foot', math.pi)):
            pyramid = shapes.add_cone('octahedron-%d-%s' % (i, half), radius, radius, (x, -radius * 0.4, z), rotation=(turn[0] + flip, turn[1], turn[2]), sides=4)
            pyramid.data.transform(Matrix.Translation((0.0, 0.0, radius / 2)))
            marks.append(pyramid)
    return assign_all(marks, body)


def vein_gear_train(rng, body):
    """P3's relic signature: three whole gear wheels meshing in a train, each toothed and hubbed, the clockwork intact."""
    marks = []
    for i, (centre, radius, teeth, phase) in enumerate(GEAR_TRAIN):
        outline = gear_outline(centre, radius, teeth, phase)
        marks.append(shapes.add_polygon('gear-%d' % i, outline, -0.01, 0.026))
        marks.append(shapes.add_prism('hub-%d' % i, radius * 0.28, 0.03, (centre[0], -0.045, centre[1]), rotation=(math.pi / 2, 0.0, 0.0), sides=16))
        marks.append(shapes.add_torus('rim-%d' % i, radius * 0.66, 0.008, (centre[0], -0.036, centre[1]), rotation=(math.pi / 2, 0.0, 0.0)))
    return assign_all(marks, body)


def gear_outline(centre, radius, teeth, phase):
    """A gear wheel's edge in the face: `teeth` square-ish teeth standing a sixth of the radius out of the root circle."""
    points = []
    root, tip = radius * 0.86, radius
    for k in range(teeth):
        base = phase + math.tau * k / teeth
        pitch = math.tau / teeth
        for fraction, reach in ((0.0, root), (0.18, tip), (0.5, tip), (0.68, root)):
            angle = base + pitch * fraction
            points.append((centre[0] + math.cos(angle) * reach, centre[1] + math.sin(angle) * reach))
    return points


def vein_coil_springs(rng, body):
    """Clockspring steel: three coiled springs of steel wire lying in the face, half-sunk."""
    marks = []
    for i, (cx, cz, angle) in enumerate(((-0.12, 0.17, 0.3), (0.13, -0.02, -0.5), (-0.08, -0.2, 0.1))):
        turns, radius, length = rng.choice((5, 6)), rng.uniform(0.045, 0.06), rng.uniform(0.24, 0.3)
        marks.append(shapes.add_tube('spring-%d' % i, helix_path((cx, cz), angle, turns, radius, length), 0.012, resolution=3))
    return assign_all(marks, body)


def helix_path(centre, angle, turns, radius, length, steps_per_turn=16):
    """A helix along `angle` lying on the face, its coils standing clear of the rock (y), centred on `centre`."""
    along, across = (math.cos(angle), math.sin(angle)), (-math.sin(angle), math.cos(angle))
    points = []
    for k in range(turns * steps_per_turn + 1):
        t = k / (turns * steps_per_turn)
        turn = t * turns * math.tau
        reach = (t - 0.5) * length
        side = math.cos(turn) * radius
        points.append((centre[0] + along[0] * reach + across[0] * side, -radius * (1.05 + math.sin(turn) * 0.8),
                       centre[1] + along[1] * reach + across[1] * side))
    return points


def vein_cyclic_twins(rng, body):
    """Alexandrite: cyclic twins, three tabular crystals grown through each other at 60 degrees into a six-rayed sixling."""
    marks = []
    for i, (x, z, size) in enumerate(((-0.1, 0.1, 0.36), (0.18, -0.17, 0.24))):
        spin = rng.uniform(0.0, math.pi / 3)
        for j in range(3):
            plate = shapes.add_cube('twin-%d-%d' % (i, j), 1.0, (x, -0.02, z), scale=(size, 0.03, size * 0.17),
                                    rotation=(rng.uniform(-0.12, 0.12), spin + j * math.pi / 3, 0.0))
            shapes.bevel(plate, 0.008, segments=1)
            marks.append(plate)
    return assign_all(marks, body)


def vein_sclerotic_ring(rng, body):
    """Ichthyosaur eye: the sclerotic ring, small bone plates lapped like shingles round the eye, one whole, one broken."""
    marks = []
    for ring, (cx, cz, radius, count, kept) in enumerate(((-0.06, 0.06, 0.2, 14, 14), (0.24, -0.25, 0.1, 9, 6))):
        for i in range(kept):
            angle = math.tau * i / count
            at = (cx + math.cos(angle) * radius, -0.02 - 0.004 * (i % 2), cz + math.sin(angle) * radius)
            width = math.tau * radius / count * 1.25
            plate = shapes.add_cube('plate-%d-%d' % (ring, i), 1.0, at, scale=(width, 0.02, radius * 0.45),
                                    rotation=(0.0, -angle + math.pi / 2 + 0.25, 0.0))
            shapes.bevel(plate, 0.005, segments=1)
            marks.append(plate)
    return assign_all(marks, body)


def vein_star_bursts(rng, body):
    """Starsteel: six-rayed stars standing proud of the steel, a large one and its scattered small ones."""
    marks = []
    stars = [((-0.06, 0.06), 0.2)] + [(at, rng.uniform(0.05, 0.08)) for at in ((0.24, 0.22), (-0.24, -0.22), (0.22, -0.2))]
    for i, (centre, outer) in enumerate(stars):
        points = shapes.star_points(centre, outer, outer * 0.38, arms=6, phase=rng.uniform(0.0, math.pi / 3))
        star = shapes.add_polygon('star-%d' % i, points, -0.02, 0.016)
        shapes.bevel(star, 0.004, segments=1)
        marks.append(star)
    return assign_all(marks, body)


def vein_spindle_spray(rng, body):
    """Painite: long four-sided spindles, tapering to a point at both ends, sprayed from one root."""
    marks = []
    root = (0.04, -0.06)
    for i in range(5):
        angle = math.radians(20 + 36 * i) + rng.uniform(-0.1, 0.1)
        length, radius = rng.uniform(0.22, 0.3), rng.uniform(0.025, 0.035)
        centre = (root[0] + math.cos(angle) * length * 0.45, root[1] + math.sin(angle) * length * 0.45)
        points = shapes.shard_points(centre, length * 0.5, radius, angle)
        spindle = shapes.add_polygon('spindle-%d' % i, points, -0.03, radius * 1.4)
        shapes.bevel(spindle, radius * 0.35, segments=1)
        marks.append(spindle)
    return assign_all(marks, body)


def vein_broken_cogs(rng, body):
    """P4's signature, cogwork: two toothed cog wheels with their hubs, the larger one broken, a sheared tooth beside it."""
    marks = []
    for i, (cx, cz, radius, teeth, missing) in enumerate(((-0.08, 0.06, 0.2, 12, 3), (0.2, -0.2, 0.1, 8, 0))):
        kept = teeth - missing
        points = cog_points((cx, cz), radius, teeth, kept)
        marks.append(shapes.add_polygon('cog-%d' % i, points, -0.02, 0.02))
        marks.append(shapes.add_prism('hub-%d' % i, radius * 0.22, 0.03, (cx, -0.035, cz), rotation=shapes.facing_camera(), sides=12))
    marks.append(shapes.add_polygon('tooth', [(0.2, 0.17), (0.27, 0.15), (0.28, 0.2), (0.22, 0.23)], -0.02, 0.02))
    return assign_all(marks, body)


def cog_points(centre, radius, teeth, kept):
    """A cog's outline: square teeth round a rim, the last `teeth - kept` sheared off flush to the rim."""
    cx, cz = centre
    rim, tip = radius * 0.8, radius
    points = []
    if kept < teeth:
        points.append((cx, cz))
    for k in range(kept):
        start = math.tau * k / teeth
        for share, reach in ((0.0, rim), (0.15, tip), (0.5, tip), (0.65, rim)):
            angle = start + math.tau * share / teeth
            points.append((cx + math.cos(angle) * reach, cz + math.sin(angle) * reach))
    if kept < teeth:
        points.append((cx + math.cos(math.tau * kept / teeth) * rim, cz + math.sin(math.tau * kept / teeth) * rim))
    return points


def vein_fused_clinkers(rng, body):
    """Furnace iron: clinkers, rough lumps fused into three clumps as they came out of the furnace, lying on the face."""
    marks = []
    for clump, (cx, cz, count) in enumerate(((-0.13, 0.14, 5), (0.15, -0.04, 6), (-0.08, -0.22, 4))):
        for i, (dx, dz) in enumerate(shapes.scatter_positions(rng, count, 0.09, 0.05)):
            size = rng.uniform(0.04, 0.065)
            lump = shapes.add_icosphere('clinker-%d-%d' % (clump, i), size, (cx + dx, -size * 0.3, cz + dz), subdivisions=2,
                                        scale=(rng.uniform(0.8, 1.25), 0.7, rng.uniform(0.7, 1.1)), rotation=(0.0, rng.uniform(0, math.tau), 0.0))
            marks.append(roughened(lump, rng, size * 0.22))
    return assign_all(marks, body)


def roughened(obj, rng, amount):
    """Every vertex knocked by up to `amount` on each axis: a clinker's slaggy, uneven skin."""
    for vertex in obj.data.vertices:
        vertex.co += Vector((rng.uniform(-amount, amount) / obj.scale[0], rng.uniform(-amount, amount) / obj.scale[1],
                             rng.uniform(-amount, amount) / obj.scale[2]))
    return obj


def vein_field_filings(rng, body):
    """
    Magnetite: its grit drawn into the field lines of a lodestone, needle grains strung end to end
    along loops from one pole to the other and along the line between them. In the plane the lines of
    two opposite poles are circles through both, so each loop is one of those circles.
    """
    marks = []
    turn = 0.35
    lines = [circle_points(centre_z, FIELD_POLE_X, FILING_SPACING) for centre_z in FIELD_LINE_CENTRES]
    lines.append(axis_points(FIELD_POLE_X, FILING_SPACING))
    for line, points in enumerate(lines):
        for k, (x, z, tangent) in enumerate(points):
            x, z = x * math.cos(turn) - z * math.sin(turn), x * math.sin(turn) + z * math.cos(turn)
            if max(abs(x), abs(z)) > VEIN_EXTENT_M:
                continue
            size = rng.uniform(0.011, 0.015)
            grain = shapes.add_cube('filing-%d-%d' % (line, k), size, (x + rng.uniform(-0.003, 0.003), -size * 0.4, z + rng.uniform(-0.003, 0.003)),
                                    scale=(rng.uniform(1.8, 2.3), 1.0, 1.0), rotation=(0.0, -(tangent + turn) + rng.uniform(-0.2, 0.2), 0.0))
            marks.append(grain)
    return assign_all(marks, body)


FIELD_POLE_X = 0.16
FIELD_LINE_CENTRES = (0.06, -0.06, 0.15, -0.15, 0.32, -0.32)
FILING_SPACING = 0.03


def circle_points(centre_z, pole_x, spacing):
    """Points every `spacing` round the circle through both poles (±pole_x, 0) centred at (0, centre_z), each with its tangent's angle."""
    radius = math.hypot(pole_x, centre_z)
    steps = int(math.tau * radius / spacing)
    angles = [math.tau * k / steps for k in range(steps)]
    return [(math.cos(a) * radius, centre_z + math.sin(a) * radius, a + math.pi / 2) for a in angles]


def axis_points(pole_x, spacing):
    """Points every `spacing` along the straight line from one pole to the other, the field's middle line."""
    steps = int(2 * pole_x / spacing)
    return [(-pole_x + 2 * pole_x * k / steps, 0.0, 0.0) for k in range(steps + 1)]


def vein_swallowtail_blades(rng, body):
    """Selenite blade: two swallowtail twins, pairs of flat blades grown from one root in a V, and two loose blades along the cleavage."""
    marks = []
    for twin, (x, z, angle, length) in enumerate(((-0.22, -0.22, 0.95, 0.34), (0.26, 0.02, 2.2, 0.2))):
        for side, spread in enumerate((-0.28, 0.28)):
            marks.append(blade_of('twin-%d-%d' % (twin, side), (x, z), angle + spread, length, length * 0.12, -0.012 - side * 0.006))
    for i, (x, z) in enumerate(((-0.32, 0.3), (0.02, -0.2))):
        length = rng.uniform(0.16, 0.2)
        marks.append(blade_of('blade-%d' % i, (x, z), CLEAVAGE_ANGLE + rng.uniform(-0.08, 0.08), length, length * 0.14, -0.01))
    return assign_all(marks, body)


# Along the base's sheets: lines of u + 3v constant run along (3, -1).
CLEAVAGE_ANGLE = math.atan2(-1.0, 3.0)


def blade_of(name, root, angle, length, width, y):
    """A flat lath from `root` along `angle`, square at the root, its free end cut to a blunt point."""
    along, side = (math.cos(angle), math.sin(angle)), (-math.sin(angle), math.cos(angle))
    corners = ((0.0, -0.5), (0.82, -0.5), (1.0, 0.0), (0.82, 0.5), (0.0, 0.5))
    points = [(root[0] + along[0] * a * length + side[0] * s * width, root[1] + along[1] * a * length + side[1] * s * width)
              for a, s in corners]
    blade = shapes.add_polygon(name, points, y, 0.008)
    shapes.bevel(blade, 0.002, segments=1)
    return blade


def vein_split_geodes(rng, body):
    """Ember agate: two geodes split open, a thick rind round a banded wall, a druse of small crystals pointing into the hollow."""
    marks = []
    for i, (x, z, radius) in enumerate(((-0.11, 0.1, 0.17), (0.18, -0.18, 0.11))):
        marks += geode_of('geode-%d' % i, (x, z), radius, rng)
    return assign_all(marks, body)


def geode_of(name, centre, radius, rng):
    """The rind and wall as flattened rings facing the camera, then the druse round the wall's inner edge."""
    facing = (math.pi / 2, 0.0, 0.0)
    rind = shapes.add_torus(name + '-rind', radius * 0.88, radius * 0.12, (centre[0], -0.01, centre[1]), rotation=facing, scale=(1.0, 1.0, 0.5))
    wall = shapes.add_torus(name + '-wall', radius * 0.66, radius * 0.07, (centre[0], -0.006, centre[1]), rotation=facing, scale=(1.0, 1.0, 0.4))
    druse = []
    count = int(radius * 140)
    for k in range(count):
        angle = math.tau * k / count + rng.uniform(-0.05, 0.05)
        reach = radius * rng.uniform(0.12, 0.2)
        at = (centre[0] + math.cos(angle) * (radius * 0.56 - reach * 0.5), centre[1] + math.sin(angle) * (radius * 0.56 - reach * 0.5))
        druse.append(shapes.add_polygon('%s-tooth-%d' % (name, k), shapes.shard_points(at, reach * 0.5, reach * 0.22, angle), -0.012, 0.01))
    return [rind, wall] + druse


def vein_seed_pods(rng, body):
    """Chromite: almond seeds of chromite, a split pod's row of them in a curve, and a few spilled loose beside it."""
    marks = []
    for i in range(7):
        t = i / 6.0
        x, z = -0.24 + t * 0.42, 0.16 - 0.3 * (t - 0.5) ** 2 * 4 + 0.06
        angle = math.atan2(-0.6 * (t - 0.5) * 4, 1.0) + math.pi / 2 + rng.uniform(-0.15, 0.15)
        marks.append(almond_seed('pod-%d' % i, (x, z), rng.uniform(0.042, 0.05), angle))
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 6, 0.2, 0.09)):
        marks.append(almond_seed('spilled-%d' % i, (x * 1.2, z * 0.6 - 0.16), rng.uniform(0.032, 0.044), rng.uniform(0, math.tau)))
    return assign_all(marks, body)


def almond_seed(name, centre, length, angle):
    """A glossy almond: a sphere drawn long along `angle` in the face, flattened toward the camera."""
    return shapes.add_icosphere(name, length, (centre[0], -length * 0.2, centre[1]), subdivisions=3,
                                scale=(1.0, 0.36, 0.55), rotation=(0.0, -angle, 0.0))




def vein_split_slabs(rng, body):
    """Slate shale: long thin slabs split off the seam, stacked level with gaps between, each end broken on a slant."""
    marks = []
    for i in range(5):
        z = 0.24 - i * 0.12 + rng.uniform(-0.01, 0.01)
        left, right = -0.32 + rng.uniform(0.0, 0.1), 0.32 - rng.uniform(0.0, 0.1)
        height = rng.uniform(0.045, 0.06)
        lean = rng.uniform(0.02, 0.05) * (1 if i % 2 == 0 else -1)
        points = [(left, z - height / 2), (right - lean, z - height / 2), (right + lean, z + height / 2), (left + lean * 1.5, z + height / 2)]
        slab = shapes.add_polygon('slab-%d' % i, points, -0.02 - 0.004 * i, 0.016)
        slab.rotation_euler = (rng.uniform(-0.25, -0.1), 0.0, rng.uniform(-0.04, 0.04))
        shapes.bevel(slab, 0.004, segments=1)
        marks.append(slab)
    return assign_all(marks, body)


def vein_ochre_lumps(rng, body):
    """Rust ochre: soft earthy lumps, lop-sided and faceted where they crumbled, with loose crumbs round them."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 5, 0.24, 0.17)):
        radius = rng.uniform(0.07, 0.1)
        lump = shapes.add_icosphere('lump-%d' % i, radius, (x, 0.0, z), subdivisions=1,
                                    scale=(rng.uniform(0.9, 1.3), 0.6, rng.uniform(0.7, 1.0)), rotation=(rng.uniform(0, 1), rng.uniform(0, math.tau), rng.uniform(0, 1)))
        marks.append(lump)
        for j in range(3):
            angle = rng.uniform(0, math.tau)
            at = (x + math.cos(angle) * radius * 1.5, -0.005, z + math.sin(angle) * radius * 1.3)
            marks.append(shapes.add_icosphere('crumb-%d-%d' % (i, j), rng.uniform(0.012, 0.02), at, subdivisions=1, scale=(1.0, 0.7, 0.8)))
    return assign_all(marks, body)


def vein_rivet_grains(rng, body):
    """Tin gravel: loose grains shaped like spent rivets, a domed head on a short shank, lying every way on the face."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 11, VEIN_EXTENT_M - 0.03, 0.1)):
        angle, head = rng.uniform(0, math.tau), rng.uniform(0.026, 0.034)
        along = (math.cos(angle), math.sin(angle))
        shank = shapes.add_prism('shank-%d' % i, head * 0.45, head * 1.8, (x - along[0] * head * 0.9, -head * 0.3, z - along[1] * head * 0.9),
                                 rotation=(0.0, math.pi / 2 - angle, 0.0), sides=8)
        cap = shapes.add_icosphere('head-%d' % i, head, (x, -head * 0.25, z), subdivisions=2, scale=(0.6, 1.0, 1.0),
                                   rotation=(0.0, -angle, 0.0))
        marks += [shank, cap]
    return assign_all(marks, body)


def vein_crumbled_masses(rng, body):
    """Sulphur crust: two crumbly masses, each a heap of rounded clods grown together, broken chips fallen off their edge."""
    marks = []
    for mass, (cx, cz, reach) in enumerate(((-0.1, 0.1, 0.17), (0.16, -0.16, 0.12))):
        for i, (dx, dz) in enumerate(shapes.scatter_positions(rng, 7, reach, reach * 0.35)):
            radius = rng.uniform(0.05, 0.075) * reach / 0.17 + 0.02
            marks.append(shapes.add_icosphere('clod-%d-%d' % (mass, i), radius, (cx + dx, 0.0, cz + dz), subdivisions=2,
                                              scale=(1.0, 0.65, rng.uniform(0.8, 1.0))))
        for j in range(3):
            angle = rng.uniform(0, math.tau)
            size = rng.uniform(0.02, 0.03)
            chip = shapes.add_cube('chip-%d-%d' % (mass, j), size, (cx + math.cos(angle) * reach * 1.45, -0.005, cz + math.sin(angle) * reach * 1.45),
                                   rotation=(rng.uniform(0, 1), rng.uniform(0, math.tau), rng.uniform(0, 1)))
            marks.append(chip)
    return assign_all(marks, body)


def vein_flake_books(rng, body):
    """Graphite seam: books of thin hexagonal flakes stacked a little askew, and a few loose flakes slid off them."""
    marks = []
    books = [((-0.12, 0.12), 0.11, 4), ((0.15, -0.08), 0.09, 3), ((-0.16, -0.2), 0.07, 3)]
    for book, ((x, z), radius, count) in enumerate(books):
        for i in range(count):
            at = (x + 0.012 * i + rng.uniform(-0.006, 0.006), -0.012 - 0.01 * i, z + 0.008 * i)
            flake = shapes.add_prism('flake-%d-%d' % (book, i), radius * (1 - 0.07 * i), 0.008, at,
                                     rotation=(math.pi / 2 + rng.uniform(-0.12, 0.12), rng.uniform(0, math.pi / 3), 0.0), sides=6)
            shapes.bevel(flake, 0.002, segments=1)
            marks.append(flake)
    for i, (x, z) in enumerate(((0.26, 0.2), (0.24, -0.27), (0.04, 0.27))):
        loose = shapes.add_prism('loose-%d' % i, rng.uniform(0.035, 0.045), 0.007, (x, -0.01, z),
                                 rotation=(math.pi / 2 + rng.uniform(-0.3, 0.3), rng.uniform(0, math.pi / 3), 0.0), sides=6)
        marks.append(loose)

def vein_fleck_drifts(rng, body):
    """Cobalt bloom: blue flecks in three drifts, each a trail of small flat chips tipped every way, thickest at its head."""
    marks = []
    for drift, ((x, z), angle, count) in enumerate((((-0.16, 0.16), -0.4, 12), ((0.1, -0.02), 0.5, 10), ((-0.1, -0.22), 0.1, 8))):
        for i in range(count):
            share = i / count
            reach = 0.2 * share
            spread = 0.025 * (1.0 + share)
            at = (x + math.cos(angle) * reach + rng.uniform(-spread, spread), -0.006,
                  z + math.sin(angle) * reach + rng.uniform(-spread, spread))
            size = rng.uniform(0.03, 0.045) * (1.0 - 0.45 * share)
            fleck = shapes.add_cube('fleck-%d-%d' % (drift, i), size, at, scale=(1.0, 0.25, rng.uniform(0.5, 0.9)),
                                    rotation=(rng.uniform(-0.6, 0.6), rng.uniform(0, math.tau), rng.uniform(-0.6, 0.6)))
            marks.append(fleck)
    return assign_all(marks, body)


def vein_stair_crystals(rng, body):
    """Bismuth stair: three little stairs of flat treads, each stepped up and over from the one below, a raised rim on every tread."""
    marks = []
    for stair, ((x, z), across, steps) in enumerate((((-0.3, -0.06), 1, 4), ((-0.02, -0.32), 1, 4), ((0.28, 0.06), -1, 3))):
        turn = rng.uniform(-0.15, 0.15)
        for step in range(steps):
            width, height = 0.1 - 0.008 * step, 0.06
            at = (x + across * step * 0.068, -0.012 * (step + 1), z + step * height)
            tread = shapes.add_cube('tread-%d-%d' % (stair, step), 1.0, at, scale=(width, 0.024, height), rotation=(0.0, turn, 0.0))
            rim = shapes.add_cube('rim-%d-%d' % (stair, step), 1.0, (at[0], at[1] - 0.012, at[2] + height * 0.4),
                                  scale=(width, 0.01, height * 0.18), rotation=(0.0, turn, 0.0))
            for mark in (tread, rim):
                shapes.bevel(mark, 0.002, segments=1)
            marks += [tread, rim]
    return assign_all(marks, body)


def vein_lenticle_scatter(rng, body):
    """Moonstone lens: loose lens-shaped stones lying apart, each a flat biconvex almond, the big ones with a small lens on the shoulder."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 6, 0.25, 0.15)):
        radius, angle = rng.uniform(0.06, 0.1), rng.uniform(0, math.pi)
        lens = shapes.add_icosphere('lens-%d' % i, radius, (x, -0.005, z), subdivisions=3,
                                    scale=(1.0, 0.3, 0.55), rotation=(0.0, angle, 0.0))
        marks.append(lens)
        if radius > 0.08:
            at = (x + math.cos(angle) * radius * 0.6, -0.025, z - math.sin(angle) * radius * 0.6 + radius * 0.3)
            marks.append(shapes.add_icosphere('shoulder-%d' % i, radius * 0.45, at, subdivisions=3,
                                              scale=(1.0, 0.3, 0.55), rotation=(0.0, angle + 0.6, 0.0)))
    return assign_all(marks, body)


def vein_dice_cubes(rng, body):
    """Galena cube: heavy cubes square as dice, four sat square to the face in a cluster, one fallen on its edge, two small ones apart."""
    marks = []
    cluster = (((-0.15, 0.13), 0.15), ((0.02, 0.12), 0.13), ((-0.13, -0.04), 0.12), ((0.03, -0.03), 0.1))
    for i, ((x, z), size) in enumerate(cluster):
        cube = shapes.add_cube('die-%d' % i, size, (x, -size * 0.3, z), rotation=(0.0, rng.uniform(-0.08, 0.08), 0.0))
        shapes.bevel(cube, size * 0.03, segments=1)
        marks.append(cube)
    fallen = shapes.add_cube('fallen', 0.11, (0.2, -0.04, -0.2), rotation=(0.0, 0.2, math.pi / 4))
    shapes.bevel(fallen, 0.004, segments=1)
    marks.append(fallen)
    for i, ((x, z), size) in enumerate((((0.24, 0.2), 0.06), ((-0.24, -0.25), 0.07))):
        small = shapes.add_cube('small-%d' % i, size, (x, -size * 0.3, z), rotation=(0.0, rng.uniform(-0.3, 0.3), 0.0))
        shapes.bevel(small, size * 0.04, segments=1)
        marks.append(small)
    return assign_all(marks, body)



def vein_limonite_clods(rng, body):
    """Bog iron: soft rounded clods of limonite heaped low on the face, knobbly with small lumps stuck on, a few crumbs fallen off."""
    marks = []
    for i, (x, z) in enumerate(((-0.1, 0.02), (0.08, 0.06), (-0.01, -0.12), (0.17, -0.12))):
        size = rng.uniform(0.08, 0.105)
        clod = shapes.add_icosphere('clod-%d' % i, size, (x, -size * 0.25, z), subdivisions=3,
                                    scale=(rng.uniform(1.0, 1.25), 0.55, rng.uniform(0.75, 0.95)), rotation=(0.0, rng.uniform(0, math.tau), 0.0))
        marks.append(roughened(clod, rng, size * 0.08))
        for k in range(3):
            angle = rng.uniform(0, math.tau)
            knob = size * rng.uniform(0.3, 0.42)
            at = (x + math.cos(angle) * size * 0.85, -size * 0.3, z + math.sin(angle) * size * 0.65)
            marks.append(shapes.add_icosphere('knob-%d-%d' % (i, k), knob, at, subdivisions=2, scale=(1.0, 0.7, 0.9)))
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 6, 0.3, 0.1)):
        if abs(x) < 0.26 and abs(z + 0.04) < 0.2:
            continue
        crumb = rng.uniform(0.018, 0.03)
        marks.append(roughened(shapes.add_icosphere('crumb-%d' % i, crumb, (x, -crumb * 0.3, z), subdivisions=1), rng, crumb * 0.2))
    return assign_all(marks, body)


def vein_globular_tufts(rng, body):
    """Cobalt bloom: small globular tufts of bloom, each a dome bristling with short hair-fine needles all round, scattered on the crust."""
    marks = []
    tufts = ((-0.2, 0.18, 0.07), (0.12, 0.22, 0.05), (0.02, 0.0, 0.08), (-0.22, -0.16, 0.055), (0.24, -0.06, 0.06), (0.1, -0.24, 0.045))
    for i, (x, z, reach) in enumerate(tufts):
        marks.append(shapes.add_icosphere('tuft-%d' % i, reach * 0.42, (x, -reach * 0.1, z), subdivisions=2, scale=(1.0, 0.6, 1.0)))
        count = int(reach * 260)
        for k in range(count):
            angle = math.tau * k / count + rng.uniform(-0.08, 0.08)
            length = reach * rng.uniform(0.75, 1.0)
            tip = (x + math.cos(angle) * length, -reach * 0.05, z + math.sin(angle) * length)
            marks.append(shapes.add_tube('hair-%d-%d' % (i, k), [(x, -reach * 0.18, z), tip], 0.0035, resolution=1))
    return assign_all(marks, body)


def vein_needle_sheaves(rng, body):
    """Rain quartz: hair-thin needles in two sheaves crossed at a slant, each sheaf pinched at its waist and fanned at both ends."""
    marks = []
    for sheaf, (cx, cz, angle, length) in enumerate(((-0.04, 0.04, math.radians(62), 0.62), (0.06, -0.06, math.radians(-28), 0.5))):
        axis, side = (math.cos(angle), math.sin(angle)), (-math.sin(angle), math.cos(angle))
        for k in range(9):
            spread = (k - 4) / 4.0
            fan = spread * 0.05 + rng.uniform(-0.008, 0.008)
            half = length * rng.uniform(0.4, 0.5)
            ends = [(cx + axis[0] * half * end + side[0] * fan * end * 1.0 + side[0] * spread * 0.006,
                     cz + axis[1] * half * end + side[1] * fan * end * 1.0 + side[1] * spread * 0.006) for end in (-1.0, 1.0)]
            y = -0.012 - sheaf * 0.01
            marks.append(shapes.add_tube('needle-%d-%d' % (sheaf, k), [(ends[0][0], y, ends[0][1]), (ends[1][0], y, ends[1][1])],
                                         rng.uniform(0.0045, 0.006), resolution=1))
    return assign_all(marks, body)


def vein_canal_cobbles(rng, body):
    """Canal jasper: five big rounded cobbles packed together as the bargemen stow ballast, each lying flat on the face."""
    marks = []
    for i, (x, z, size) in enumerate(((-0.14, 0.1, 0.12), (0.1, 0.13, 0.1), (-0.02, -0.08, 0.11), (0.21, -0.1, 0.085), (-0.24, -0.15, 0.08))):
        cobble = shapes.add_icosphere('cobble-%d' % i, size, (x, -size * 0.18, z), subdivisions=3,
                                      scale=(rng.uniform(1.0, 1.2), 0.42, rng.uniform(0.72, 0.88)), rotation=(0.0, rng.uniform(-0.5, 0.5), 0.0))
        marks.append(roughened(cobble, rng, size * 0.03))
    return assign_all(marks, body)


def vein_stibnite_sprays(rng, body):
    """
    Antimony: two sprays of long slender square prisms, many and close, spreading only a little
    from their roots like a broom, each blade cut off square (painite's spindles fan wide and taper).
    """
    marks = []
    for spray, (root, heading) in enumerate((((-0.3, -0.3), math.radians(48)), ((0.32, -0.24), math.radians(118)))):
        for k in range(9):
            angle = heading + math.radians(-14 + 28 * k / 8) + rng.uniform(-0.03, 0.03)
            length, width = rng.uniform(0.3, 0.44) * (0.8 if spray else 1.0), rng.uniform(0.011, 0.016)
            centre = (root[0] + math.cos(angle) * length * 0.5, -width * 0.6, root[1] + math.sin(angle) * length * 0.5)
            blade = shapes.add_cube('stibnite-%d-%d' % (spray, k), 1.0, centre, scale=(length, width, width),
                                    rotation=(rng.uniform(0, 0.8), -angle, 0.0))
            shapes.bevel(blade, 0.002, segments=1)
            marks.append(blade)
    return assign_all(marks, body)


def vein_olive_drops(rng, body):
    """Peridot: rounded olive drops, each a plump body drawn to a point, lying in a loose cluster on the face."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 7, 0.26, 0.15)):
        size = rng.uniform(0.045, 0.065)
        marks += olive_drop('drop-%d' % i, (x, z), size, rng.uniform(0.0, math.tau))
    return assign_all(marks, body)


def olive_drop(name, centre, size, angle):
    """A drop: a flattened round body and a four-sided point running out of it along `angle` in the face."""
    drop = shapes.add_icosphere(name, size, (centre[0], -size * 0.3, centre[1]), subdivisions=3, scale=(1.0, 0.55, 0.9))
    reach = size * 1.15
    tip_at = (centre[0] + math.cos(angle) * reach, -size * 0.25, centre[1] + math.sin(angle) * reach)
    tip = shapes.add_cone(name + '-tip', size * 0.62, size * 1.1, tip_at, rotation=(0.0, math.pi / 2 - angle, 0.0), sides=8)
    tip.scale = (1.0, 0.55, 1.0)
    return [drop, tip]


def vein_serrated_teeth(rng, body):
    """Shark tooth: flat triangular teeth with serrated edges, each over the broad lobed root it grew from."""
    marks = []
    for i, (x, z, height, turn) in enumerate(((-0.15, 0.06, 0.3, 0.25), (0.17, 0.12, 0.22, -0.35), (0.06, -0.21, 0.18, 2.9))):
        marks += shark_tooth(('tooth-%d' % i), (x, z), height * rng.uniform(0.95, 1.05), turn)
    return assign_all(marks, body)


def shark_tooth(name, centre, height, turn):
    """The crown, a triangle of `height` with fine serrations up each edge, standing proud of its root, both turned by `turn`."""
    half, base_z = height * 0.4, -height * 0.4
    left = [crown_edge_point(-half, base_z, height, k) for k in range(SERRATIONS)]
    right = [crown_edge_point(half, base_z, height, k) for k in range(SERRATIONS, 0, -1)]
    crown = left + [(0.0, base_z + height)] + right
    root = [(-half * 1.1, base_z + height * 0.05), (-half * 0.8, base_z - height * 0.12), (-half * 0.15, base_z - height * 0.06),
            (0.0, base_z - height * 0.02), (half * 0.15, base_z - height * 0.06), (half * 0.8, base_z - height * 0.12),
            (half * 1.1, base_z + height * 0.05)]
    placed = [[turned_point(point, centre, turn) for point in outline] for outline in (crown, root)]
    tooth = shapes.add_polygon(name, placed[0], -0.018, 0.012)
    shapes.bevel(tooth, 0.003, segments=2)
    return [tooth, shapes.add_polygon(name + '-root', placed[1], -0.008, 0.01)]


SERRATIONS = 14


def crown_edge_point(half, base_z, height, k):
    """
    Step `k` up one edge of the crown from its foot (-half or +half) to its tip: the edge bowed in a
    little, as a shark's tooth is, and every other step set out by a fine serration.
    """
    t = k / SERRATIONS
    hollow = 0.12 * math.sin(t * math.pi)
    notch = height * 0.02 if k % 2 else 0.0
    side = 1.0 if half > 0 else -1.0
    return (half * (1.0 - t) - side * half * hollow + side * notch, base_z + height * t)


def turned_point(point, centre, turn):
    """`point`, given about the origin, turned by `turn` in the face and moved to `centre`."""
    x, z = point
    return (centre[0] + x * math.cos(turn) - z * math.sin(turn), centre[1] + x * math.sin(turn) + z * math.cos(turn))


def vein_crossed_bars(rng, body):
    """Wolfram: heavy square bars of wolframite in a heap, three laid one way and two crossed over them on the diagonals."""
    marks = []
    for i, (x, z, angle, length) in enumerate(((-0.04, 0.17, 0.14, 0.46), (0.0, 0.02, 0.06, 0.54), (0.05, -0.14, 0.2, 0.44),
                                                (-0.05, 0.0, 0.85, 0.44), (0.1, -0.02, 2.45, 0.4))):
        width = rng.uniform(0.05, 0.06)
        lift = -0.03 if i >= 3 else -0.012
        bar = shapes.add_cube('bar-%d' % i, 1.0, (x, lift, z), scale=(length, width * 0.8, width), rotation=(0.0, -angle, 0.0))
        shapes.bevel(bar, 0.006, segments=1)
        marks.append(bar)
    return assign_all(marks, body)


def vein_faceted_spheres(rng, body):
    """Fire garnet: round garnets, each a ball of flat facets that catch the lamp one by one, a few half-sunk in the face."""
    marks = []
    for i, (x, z) in enumerate(shapes.scatter_positions(rng, 6, 0.25, 0.17)):
        radius = rng.uniform(0.05, 0.08)
        ball = shapes.add_icosphere('garnet-%d' % i, radius, (x, -radius * rng.uniform(0.1, 0.5), z), subdivisions=1,
                                    rotation=(rng.uniform(0, math.tau), rng.uniform(0, math.tau), rng.uniform(0, math.tau)))
        for polygon in ball.data.polygons:
            polygon.use_smooth = False
        marks.append(ball)
    return assign_all(marks, body)


def vein_vertebra_column(rng, body):
    """Saurian vertebra: a short run of vertebrae along a gentle curve, each a waisted spool with its spine and two side processes."""
    marks = []
    for k in range(4):
        t = (k - 1.5) / 1.5
        centre = (t * 0.24, 0.02 - 0.06 * t * t)
        angle = math.atan2(-0.12 * t, 1.0)
        marks += vertebra_of('vertebra-%d' % k, centre, rng.uniform(0.064, 0.07), angle)
    return assign_all(marks, body)


def vertebra_of(name, centre, radius, angle):
    """The centrum, a short round spool along `angle`, its neural spine up the face and two transverse processes."""
    spool = shapes.add_prism(name, radius, radius * 1.8, (centre[0], -radius * 0.35, centre[1]), rotation=(0.0, math.pi / 2 - angle, 0.0), sides=18)
    spool.scale = (0.85, 0.55, 1.0)
    shapes.bevel(spool, radius * 0.2, segments=2)
    spine = [turned_point(point, centre, angle) for point in
             ((-radius * 0.4, radius * 0.6), (-radius * 0.22, radius * 1.9), (-radius * 0.5, radius * 2.6), (radius * 0.5, radius * 2.7),
              (radius * 0.22, radius * 1.9), (radius * 0.4, radius * 0.6))]
    processes = [turned_point(point, centre, angle) for point in
                 ((-radius * 0.25, -radius * 0.2), (-radius * 0.3, -radius * 1.9), (radius * 0.3, -radius * 1.9), (radius * 0.25, -radius * 0.2))]
    return [spool, shapes.add_polygon(name + '-spine', spine, -0.01, 0.012), shapes.add_polygon(name + '-process', processes, -0.008, 0.01)]


def kinked_path(start, end, rng, segments):
    """A wire from start to end, wobbling in the face at every inner point."""
    points = []
    for k in range(segments + 1):
        t = k / segments
        wobble = rng.uniform(-0.025, 0.025) if 0 < k < segments else 0.0
        points.append((start[0] + (end[0] - start[0]) * t + wobble, start[1] + (end[1] - start[1]) * t,
                       start[2] + (end[2] - start[2]) * t - wobble))
    return points


def gold_bead(name, at, radius):
    return shapes.add_icosphere(name, radius, (at[0], at[1] - radius * 0.3, at[2]), subdivisions=2, scale=(1.0, 0.7, 1.0))


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
    'tarnish-steps': base_tarnish_steps,
    'speckled-grit': base_speckled_grit,
    'resin-flow': base_resin_flow,
    'zoned-growth': base_zoned_growth,
    'quartz-veined': base_quartz_veined,
    'rutile-silk': base_rutile_silk,
    'clear-depths': base_clear_depths,
    'etched-glass': base_etched_glass,
    'growth-lines': base_growth_lines,
    'burnished-scratches': base_burnished_scratches,
    'cleaved-clear': base_cleaved_clear,
    'nacre-sheets': base_nacre_sheets,
    'pitted-cast': base_pitted_cast,
    'soot-dusted': base_soot_dusted,
    'frosted-face': base_frosted_face,
    'smoke-rhombs': base_smoke_rhombs,
    'oxide-film': base_oxide_film,
    'widmanstatten-etch': base_widmanstatten_etch,
    'hex-zoning': base_hex_zoning,
    'opal-potch': base_opal_potch,
    'hammer-facets': base_hammer_facets,
    'triangle-facets': base_triangle_facets,
    'clock-plate': base_clock_plate,
    'blued-temper': base_blued_temper,
    'dichroic-zones': base_dichroic_zones,
    'sutured-plates': base_sutured_plates,
    'watered-damask': base_watered_damask,
    'inner-feathers': base_inner_feathers,
    'riveted-plate': base_riveted_plate,
    'scorched-scale': base_scorched_scale,
    'black-grain': base_black_grain,
    'split-lamellae': base_split_lamellae,
    'fortification-bands': base_fortification_bands,
    'leopard-nodules': base_leopard_nodules,
    'slaty-cleavage': base_slaty_cleavage,
    'ochre-powder': base_ochre_powder,
    'gravel-bed': base_gravel_bed,
    'sulphur-crumb': base_sulphur_crumb,
    'graphite-smear': base_graphite_smear,
    'bloom-rosettes': base_bloom_rosettes,
    'oxide-stairs': base_oxide_stairs,
    'adularia-milk': base_adularia_milk,
    'cubic-cleavage': base_cubic_cleavage,
    'peat-crumb': base_peat_crumb,
    'bloom-crust': base_bloom_crust,
    'dew-beads': base_dew_beads,
    'ribbon-stripes': base_ribbon_stripes,
    'bladed-stibnite': base_bladed_stibnite,
    'oily-swirls': base_oily_swirls,
    'phosphate-beds': base_phosphate_beds,
    'bladed-columns': base_bladed_columns,
    'ember-depths': base_ember_depths,
    'spongy-bone': base_spongy_bone,
}
SHEENS = {
    'earthy': sheen_earthy,
    'submetallic': sheen_submetallic,
    'metallic': sheen_metallic,
    'waxy': sheen_waxy,
    'vitreous': sheen_vitreous,
    'splendent': sheen_splendent,
    'glittering': sheen_glittering,
    'resinous': sheen_resinous,
    'fluorescent': sheen_fluorescent,
    'brilliant': sheen_brilliant,
    'adamantine': sheen_adamantine,
    'prismatic': sheen_prismatic,
    'subresinous': sheen_subresinous,
    'dull': sheen_dull,
    'polished': sheen_polished,
    'limpid': sheen_limpid,
    'pearly': sheen_pearly,
    'matte': sheen_matte,
    'smudged': sheen_smudged,
    'silky': sheen_silky,
    'satin': sheen_satin,
    'iridescent': sheen_iridescent,
    'lamella-flash': sheen_lamella_flash,
    'asterism': sheen_asterism,
    'opal-flash': sheen_opal_flash,
    'hammered-shine': sheen_hammered_shine,
    'facet-fire': sheen_facet_fire,
    'perlage-gleam': sheen_perlage_gleam,
    'filed-gleam': sheen_filed_gleam,
    'sector-flash': sheen_sector_flash,
    'greasy': sheen_greasy,
    'watered-shimmer': sheen_watered_shimmer,
    'fire-glint': sheen_fire_glint,
    'worn-brass': sheen_worn_brass,
    'burnt-matte': sheen_burnt_matte,
    'steel-glints': sheen_steel_glints,
    'moon-sheen': sheen_moon_sheen,
    'banded-gloss': sheen_banded_gloss,
    'wet-gloss': sheen_wet_gloss,
    'cleavage-sheen': sheen_cleavage_sheen,
    'powdery': sheen_powdery,
    'grain-caps': sheen_grain_caps,
    'sugary': sheen_sugary,
    'slick': sheen_slick,
    'fleck-glints': sheen_fleck_glints,
    'step-edge-flash': sheen_step_edge_flash,
    'schiller-glow': sheen_schiller_glow,
    'satin-streaks': sheen_satin_streaks,
    'damp-dull': sheen_damp_dull,
    'bloom-sparkle': sheen_bloom_sparkle,
    'dew-glints': sheen_dew_glints,
    'tumbled-polish': sheen_tumbled_polish,
    'blade-flash': sheen_blade_flash,
    'oil-film': sheen_oil_film,
    'enamel-glaze': sheen_enamel_glaze,
    'fibre-satin': sheen_fibre_satin,
    'ember-glow': sheen_ember_glow,
    'bone-dust': sheen_bone_dust,
}
VEINS = {
    'nugget-cluster': vein_nugget_cluster,
    'flake-scatter': vein_flake_scatter,
    'plate-stack': vein_plate_stack,
    'nodule-bed': vein_nodule_bed,
    'shard-spray': vein_shard_spray,
    'cleavage-cubes': vein_cleavage_cubes,
    'grain-scatter': vein_grain_scatter,
    'bead-drops': vein_bead_drops,
    'twinned-cubes': vein_twinned_cubes,
    'wire-dendrite': vein_wire_dendrite,
    'hex-barrels': vein_hex_barrels,
    'hex-columns': vein_hex_columns,
    'hex-ends': vein_hex_ends,
    'ribbed-valves': vein_ribbed_valves,
    'rolled-pebbles': vein_rolled_pebbles,
    'wedge-blocks': vein_wedge_blocks,
    'ammonite-coils': vein_ammonite_coils,
    'slag-knots': vein_slag_knots,
    'spangle-scales': vein_spangle_scales,
    'rod-bundle': vein_rod_bundle,
    'lens-stack': vein_lens_stack,
    'hopper-terraces': vein_hopper_terraces,
    'crusted-slabs': vein_crusted_slabs,
    'cabochon-domes': vein_cabochon_domes,
    'toothed-jaw': vein_toothed_jaw,
    'lattice-trellis': vein_lattice_trellis,
    'octahedra': vein_octahedra,
    'gear-train': vein_gear_train,
    'coil-springs': vein_coil_springs,
    'cyclic-twins': vein_cyclic_twins,
    'sclerotic-ring': vein_sclerotic_ring,
    'star-bursts': vein_star_bursts,
    'spindle-spray': vein_spindle_spray,
    'broken-cogs': vein_broken_cogs,
    'fused-clinkers': vein_fused_clinkers,
    'field-filings': vein_field_filings,
    'swallowtail-blades': vein_swallowtail_blades,
    'split-geodes': vein_split_geodes,
    'seed-pods': vein_seed_pods,
    'split-slabs': vein_split_slabs,
    'ochre-lumps': vein_ochre_lumps,
    'rivet-grains': vein_rivet_grains,
    'crumbled-masses': vein_crumbled_masses,
    'flake-books': vein_flake_books,
    'fleck-drifts': vein_fleck_drifts,
    'stair-crystals': vein_stair_crystals,
    'lenticle-scatter': vein_lenticle_scatter,
    'dice-cubes': vein_dice_cubes,
    'limonite-clods': vein_limonite_clods,
    'globular-tufts': vein_globular_tufts,
    'needle-sheaves': vein_needle_sheaves,
    'canal-cobbles': vein_canal_cobbles,
    'stibnite-sprays': vein_stibnite_sprays,
    'olive-drops': vein_olive_drops,
    'serrated-teeth': vein_serrated_teeth,
    'crossed-bars': vein_crossed_bars,
    'faceted-spheres': vein_faceted_spheres,
    'vertebra-column': vein_vertebra_column,
}
RECIPES = {'base': BASES, 'vein': VEINS, 'sheen': SHEENS}


def recipe_of(kind, layer_id):
    recipes = RECIPES[kind]
    if layer_id not in recipes:
        raise SystemExit('the %s layer %s has no recipe in layer_art.py' % (kind, layer_id))
    return recipes[layer_id]
