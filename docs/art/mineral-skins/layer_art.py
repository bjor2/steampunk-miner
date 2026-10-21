"""
The Blender recipes of the mineral skin layers (#576, ticket 592 for P1's slots 1 to 5, ticket 593
for its slots 6 to 10, ticket 594 for 11 and 12, ticket 598 for P3's slots 1 to 5, ticket 599 for
its slots 6 to 10): one per layer id of `mineralSkins.json`. A layer id with no recipe fails, never falls back.

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
}
RECIPES = {'base': BASES, 'vein': VEINS, 'sheen': SHEENS}


def recipe_of(kind, layer_id):
    recipes = RECIPES[kind]
    if layer_id not in recipes:
        raise SystemExit('the %s layer %s has no recipe in layer_art.py' % (kind, layer_id))
    return recipes[layer_id]
