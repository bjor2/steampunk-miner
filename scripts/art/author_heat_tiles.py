"""
Authors the first version of the heat planets' tile sources (#114, for the #113 spec "Visibility"):
the lava pockets' tile `ground-heat-lava` and the refractory lining's `casing-refractory-grade-1` to
`casing-refractory-grade-5`.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_heat_tiles.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for every tile, or only the ids given after `--`. From then on
those files are the sources (#52): change the art in Blender and re-export, rather than editing this
script. The quad, the seamless torus noise and the node graph are author_tiles.py's (S7d); these
tiles add emission, which bake_tile.py bakes into the emissive map their entries ask for.

Refractory lining (#113: "brick red with glowing seams"): every grade is the same firebrick laid in
stretcher bond, 0.25 x 0.125 m bricks whose mortar joints glow ember where the heat gets through.
That is how the type reads. The grade reads without colour (#48 acceptance 5) by the ironwork over
the brick, which grows per grade like the standard lining's plates: bolts on a 0.5 m grid; then a
riveted band every 0.5 m; then a riveted 0.5 m frame; then the frame braced by an X with big bolts;
then a 0.25 m gunmetal cage with brass bolts. Iron covers the joints under it, so they never glow.

Lava (#113 "Lava pockets"): plates of cooled black crust drifting on molten rock. The cracks between
the plates glow orange, hottest and yellowest at their middle, and the crust is faintly red where it
is thin. The renderer can scroll and pulse the tile; nothing here moves.

Every lattice has a whole number of periods across the 4 m tile, and the noise reads a torus, so the
maps tile with no seam. Materials are dielectric (author_tiles.py: the diffuse colour pass is black
on metal).
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from author_tiles import Graph, reset_scene, rivet_at, rivet_row, save_as, seam_distance, tile_quad  # noqa: E402

# Linear colours.
FIREBRICK = (0.30, 0.058, 0.026)
CHAR = (0.028, 0.019, 0.016)
EMBER = (1.0, 0.30, 0.035)
IRON = (0.075, 0.07, 0.066)
GUNMETAL = (0.065, 0.066, 0.075)
BRASS = (0.55, 0.38, 0.13)
CRUST = (0.035, 0.03, 0.03)
CRUST_HOT = (0.16, 0.03, 0.012)
MOLTEN = (0.95, 0.22, 0.02)
MOLTEN_CORE = (1.0, 0.75, 0.18)

BRICK_LONG_M = 0.25
BRICK_HIGH_M = 0.125
JOINT_M = 0.012
EMISSION_STRENGTH = 1.0


def main():
    for asset_id in requested_asset_ids():
        author_glowing_tile(asset_id, RECIPES[asset_id])


def requested_asset_ids():
    """The ids after `--`, or all six; re-authoring one file leaves the others untouched."""
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    unknown = [asset_id for asset_id in requested if asset_id not in RECIPES]
    if unknown:
        print('author_heat_tiles: no recipe for %s' % ', '.join(unknown), file=sys.stderr)
        sys.exit(1)
    return requested or list(RECIPES)


def author_glowing_tile(asset_id, recipe):
    reset_scene()
    material = bpy.data.materials.new(asset_id)
    material.use_nodes = True
    graph = Graph(material)
    colour, height, roughness, bump_m, emission = recipe(graph)
    graph.finish(colour, height, roughness, bump_m)
    add_emission(graph, emission)
    tile_quad(asset_id, material)
    save_as(asset_id)


def add_emission(graph, emission):
    shader = next(node for node in graph.tree.nodes if node.type == 'BSDF_PRINCIPLED')
    graph.feed(shader.inputs['Emission Color'], emission)
    shader.inputs['Emission Strength'].default_value = EMISSION_STRENGTH


# --- refractory lining: firebrick with glowing joints, ironwork per grade --------------------------


def refractory_grade(fittings):
    """A recipe: the shared firebrick under `fittings(graph, x, z)`, which gives the straps' cover,
    the rivets, and the strap and rivet metals."""

    def recipe(graph):
        x, z = graph.metres
        brick, joint, brick_height = firebrick(graph, x, z)
        return ironwork_over(graph, brick, joint, brick_height, *fittings(graph, x, z))

    return recipe


def firebrick(graph, x, z):
    """Stretcher bond: each course shifted half a brick. Returns brick colour, joint mask, height."""
    course = graph.math('FLOOR', graph.math('DIVIDE', z, BRICK_HIGH_M))
    shift = graph.mul(graph.math('MODULO', course, 2.0), BRICK_LONG_M / 2.0)
    along = graph.plus(x, shift)
    seam = seam_distance(graph, graph.periodic(along, BRICK_LONG_M), graph.periodic(z, BRICK_HIGH_M))
    joint = graph.smooth(seam, JOINT_M, JOINT_M * 0.4)
    bevel = graph.smooth(seam, JOINT_M, JOINT_M * 3.0)
    tone = graph.mul_add(brick_tone(graph, along, course), 0.35, 0.8)
    pores = graph.noise(110, 110, seed=61, detail=6, roughness=0.7)
    scorch = graph.noise(6, 6, seed=62, detail=4)
    tone = graph.mul(tone, graph.mul(graph.mul_add(pores, 0.3, 0.85), graph.mul_add(scorch, 0.5, 0.75)))
    brick = graph.blend(graph.scaled(FIREBRICK, tone), CHAR, joint)
    height = graph.plus(graph.mul(bevel, 0.5), graph.mul(pores, 0.12))
    return brick, joint, height


def brick_tone(graph, along, course):
    """One tone per brick, 0..1; the indices wrap at the tile edge, so the tile stays seamless."""
    column = graph.math('MODULO', graph.math('FLOOR', graph.math('DIVIDE', along, BRICK_LONG_M)), 16.0)
    row = graph.math('MODULO', course, 32.0)
    cell = graph.add('ShaderNodeCombineXYZ', [(0, column), (1, row), (2, 0.37)]).outputs[0]
    noise = graph.add('ShaderNodeTexWhiteNoise', [('Vector', cell)], {'noise_dimensions': '3D'})
    return noise.outputs['Value']


def ironwork_over(graph, brick, joint, brick_height, cover, rivets, strap_metal, rivet_metal):
    """Iron straps and rivets on the brick; joints glow ember except under the iron."""
    rivet_top = graph.math('MINIMUM', graph.mul(rivets, 4.0), 1.0)
    metal = graph.math('MAXIMUM', cover, rivet_top)
    grime = graph.noise(9, 9, seed=63, detail=5)
    iron = graph.scaled(strap_metal, graph.mul_add(grime, 0.5, 0.75))
    colour = graph.blend(graph.blend(brick, iron, cover), graph.scaled(rivet_metal, graph.mul_add(rivets, 0.5, 0.9)), rivet_top)
    heat = graph.smooth(graph.noise(4, 4, seed=64, detail=3), 0.35, 0.65)
    glow = graph.mul(graph.mul(joint, graph.mul_add(heat, 0.8, 0.2)), graph.minus(1.0, metal))
    emission = graph.scaled(EMBER, glow)
    height = graph.plus(graph.mul(brick_height, graph.minus(1.0, cover)), graph.plus(graph.mul(cover, 0.8), graph.mul(rivets, 1.1)))
    return colour, height, 0.8, 0.012, emission


def strap(graph, offset, half_width):
    """1 on a strap `half_width` either side of its centre line, given the offset from that line."""
    return graph.smooth(graph.math('ABSOLUTE', offset), half_width, half_width * 0.7)


def bolted_grid(graph, x, z):
    """Grade 1: bare brick held by anchor bolts on a 0.5 m grid."""
    bolts = rivet_at(graph, graph.periodic(x, 0.5), graph.periodic(z, 0.5), 0.03)
    return 0.0, bolts, IRON, IRON


def banded(graph, x, z):
    """Grade 2: an iron band across every 0.5 m, riveted every 0.25 m."""
    band = strap(graph, graph.periodic(z, 0.5), 0.03)
    rivets = rivet_row(graph, x, z, 0.5, 0.25, 0.0, 0.022)
    return band, rivets, IRON, IRON


def framed(graph, x, z):
    """Grade 3: a 0.5 m iron frame both ways, riveted every 0.125 m along it."""
    frame = graph.math('MAXIMUM', strap(graph, graph.periodic(x, 0.5), 0.03), strap(graph, graph.periodic(z, 0.5), 0.03))
    rivets = graph.math('MAXIMUM', rivet_row(graph, x, z, 0.5, 0.125, 0.0, 0.018), rivet_row(graph, z, x, 0.5, 0.125, 0.0, 0.018))
    return frame, rivets, IRON, IRON


def braced(graph, x, z):
    """Grade 4: the 0.5 m frame braced by an X across each panel, big bolts at centres and corners."""
    local_x, local_z = graph.periodic(x, 0.5), graph.periodic(z, 0.5)
    centre_x, centre_z = graph.periodic(graph.plus(x, 0.25), 0.5), graph.periodic(graph.plus(z, 0.25), 0.5)
    diagonal = graph.math('MINIMUM', graph.math('ABSOLUTE', graph.minus(centre_x, centre_z)),
                          graph.math('ABSOLUTE', graph.plus(centre_x, centre_z)))
    frame = graph.math('MAXIMUM', strap(graph, local_x, 0.03), strap(graph, local_z, 0.03))
    cover = graph.math('MAXIMUM', frame, graph.smooth(diagonal, 0.035, 0.024))
    bolts = graph.math('MAXIMUM', rivet_at(graph, centre_x, centre_z, 0.045), rivet_at(graph, local_x, local_z, 0.045))
    return cover, bolts, IRON, IRON


def caged(graph, x, z):
    """Grade 5: a heavy 0.25 m gunmetal cage, brass bolts at every crossing and between them."""
    local_x, local_z = graph.periodic(x, 0.25), graph.periodic(z, 0.25)
    cage = graph.math('MAXIMUM', strap(graph, local_x, 0.04), strap(graph, local_z, 0.04))
    crossings = rivet_at(graph, local_x, local_z, 0.034)
    between = rivet_at(graph, graph.periodic(x, 0.125), local_z, 0.02)
    return cage, graph.math('MAXIMUM', crossings, between), GUNMETAL, BRASS


# --- lava: cooled crust plates on molten rock ----------------------------------------------------


def lava(graph):
    warp = graph.noise(3, 3, seed=71, detail=3)
    plates = graph.voronoi(10, 10, seed=72, feature='DISTANCE_TO_EDGE', randomness=0.9)['Distance']
    edge = graph.plus(plates, graph.mul(graph.minus(warp, 0.5), 0.12))
    molten = graph.smooth(edge, 0.05, 0.015)
    core = graph.smooth(edge, 0.025, 0.0)
    ripples = graph.noise(40, 40, seed=73, detail=6, roughness=0.65)
    thin = graph.smooth(edge, 0.11, 0.04)
    crust = graph.blend(graph.scaled(CRUST, graph.mul_add(ripples, 0.6, 0.7)), CRUST_HOT, graph.mul(thin, 0.8))
    melt = graph.blend(MOLTEN, MOLTEN_CORE, core)
    colour = graph.blend(crust, melt, molten)
    glow = graph.blend(graph.scaled(CRUST_HOT, graph.mul(thin, 0.6)), melt, molten)
    emission = graph.scaled(glow, graph.mul_add(ripples, 0.3, 0.8))
    height = graph.plus(graph.mul(graph.smooth(edge, 0.03, 0.25), 0.8), graph.mul(ripples, 0.2))
    return colour, height, 0.7, 0.03, emission


RECIPES = {
    'ground-heat-lava': lava,
    'casing-refractory-grade-1': refractory_grade(bolted_grid),
    'casing-refractory-grade-2': refractory_grade(banded),
    'casing-refractory-grade-3': refractory_grade(framed),
    'casing-refractory-grade-4': refractory_grade(braced),
    'casing-refractory-grade-5': refractory_grade(caged),
}

if __name__ == '__main__':
    main()
