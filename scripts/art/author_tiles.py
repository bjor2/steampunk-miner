"""
Authors the first version of the ground and casing tile sources (S7d, #69): `ground-band-1` to
`ground-band-5` and `casing-grade-1` to `casing-grade-5` (#51, #52 "Ground and casing").

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_tiles.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for every tile, or only the ids given after `--`. From then on
those files are the sources (#52): change the art in Blender and re-export, rather than editing this
script. Each file is one 4 x 4 m quad facing -Y, named for its id, with a procedural material that
repeats at its edges (scripts/art/bake_tile.py bakes it).

Seamless by construction: every noise and Voronoi texture reads 4D coordinates on a torus, (cos u,
sin u) by (cos v, sin v), so u = 0 and u = 1 are the same point; every lattice (rivets, seams,
strata, tread) has a whole number of periods across the 4 m tile.

Ground (#48 "dark, layered strata per depth band"): each band has its own strata character, so the
bands read apart by texture as well as by tone, and its mean colour is that band's planet 1 colour
from src/systems/render/artDirection.json (bandPalette.ts mixes surface to deep in display values).
Planet 2 tints the same maps (#51). Casing (#48: grade reads without colour): each grade is its own
plate layout and rivet pattern, from a plain riveted sheet up to staggered armour with double rivet
rows. Materials are dielectric, because Cycles' diffuse colour pass, which the albedo bake reads, is
black on a metallic surface.
"""

import json
import math
import os
import sys

import bpy

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TILE_M = 4.0
BAND_COUNT = 5
TAU = 2.0 * math.pi


def main():
    for asset_id in requested_asset_ids():
        author_tile(asset_id, RECIPES[asset_id])


def requested_asset_ids():
    """The ids after `--`, or all ten; re-authoring one file leaves the others untouched."""
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    unknown = [asset_id for asset_id in requested if asset_id not in RECIPES]
    if unknown:
        print('author_tiles: no recipe for %s' % ', '.join(unknown), file=sys.stderr)
        sys.exit(1)
    return requested or list(RECIPES)


def author_tile(asset_id, recipe):
    reset_scene()
    material = bpy.data.materials.new(asset_id)
    material.use_nodes = True
    graph = Graph(material)
    colour, height, roughness, bump_m = recipe(graph)
    graph.finish(colour, height, roughness, bump_m)
    tile_quad(asset_id, material)
    save_as(asset_id)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def tile_quad(asset_id, material):
    """4 x 4 m in XZ facing -Y (the Front view): u runs with +X, v with +Z."""
    half = TILE_M / 2.0
    mesh = bpy.data.meshes.new(asset_id)
    mesh.from_pydata([(-half, 0, -half), (half, 0, -half), (half, 0, half), (-half, 0, half)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name='UVMap')
    for loop, point in zip(mesh.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop.index].uv = point
    mesh.materials.append(material)
    tile = bpy.data.objects.new(asset_id, mesh)
    bpy.context.scene.collection.objects.link(tile)


def save_as(asset_id):
    folder = os.path.join(REPO_ROOT, 'art', 'blender', asset_id)
    os.makedirs(folder, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, asset_id + '.blend'), compress=True)
    print('authored ' + asset_id)


# --- colours ---------------------------------------------------------------------------------------


def linear_of_hex(hex_colour):
    return tuple(linear_of_display(int(hex_colour[at:at + 2], 16) / 255.0) for at in (1, 3, 5))


def linear_of_display(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def band_colour(band):
    """bandPalette.bandColourOf for planet 1: surface to deep, mixed in display values."""
    path = os.path.join(REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')
    with open(path, encoding='utf-8') as file:
        palette = json.load(file)['palettes']['palette.planet_1']
    surface, deep = (display_of_hex(palette[name]) for name in ('surface', 'deep'))
    mix = (band - 1) / (BAND_COUNT - 1)
    return tuple(linear_of_display(a + (b - a) * mix) for a, b in zip(surface, deep))


def display_of_hex(hex_colour):
    return tuple(int(hex_colour[at:at + 2], 16) / 255.0 for at in (1, 3, 5))


# --- the node graph --------------------------------------------------------------------------------


class Graph:
    """Builds a material's nodes from expressions: each call adds a node and returns its output."""

    def __init__(self, material):
        self.tree = material.node_tree
        self.tree.nodes.clear()
        coords = self.add('ShaderNodeTexCoord').outputs['UV']
        split = self.add('ShaderNodeSeparateXYZ', [(0, coords)]).outputs
        self.u, self.v = split['X'], split['Y']
        self.metres = (self.mul(self.u, TILE_M), self.mul(self.v, TILE_M))
        self.turn_u = (self.math('COSINE', self.mul(self.u, TAU)), self.math('SINE', self.mul(self.u, TAU)))
        self.turn_v = (self.math('COSINE', self.mul(self.v, TAU)), self.math('SINE', self.mul(self.v, TAU)))

    def add(self, kind, inputs=(), props=None):
        node = self.tree.nodes.new(kind)
        for name, value in (props or {}).items():
            setattr(node, name, value)
        for key, value in inputs:
            self.feed(node.inputs[key], value)
        return node

    def feed(self, socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.tree.links.new(value, socket)
        else:
            socket.default_value = value

    # scalars
    def math(self, operation, a, b=0.0, c=0.0):
        return self.add('ShaderNodeMath', [(0, a), (1, b), (2, c)], {'operation': operation}).outputs[0]

    def plus(self, a, b):
        return self.math('ADD', a, b)

    def minus(self, a, b):
        return self.math('SUBTRACT', a, b)

    def mul(self, a, b):
        return self.math('MULTIPLY', a, b)

    def mul_add(self, a, b, c):
        return self.math('MULTIPLY_ADD', a, b, c)

    def smooth(self, value, low, high):
        """0 below `low`, 1 above `high`, smoothstep between (a falling edge when low > high)."""
        inputs = [(0, value), (1, low), (2, high), (3, 0.0), (4, 1.0)]
        return self.add('ShaderNodeMapRange', inputs, {'interpolation_type': 'SMOOTHSTEP'}).outputs[0]

    def periodic(self, value, period):
        """`value` folded into [-period/2, period/2): the offset from the nearest lattice line."""
        return self.mul(self.minus(self.math('FRACT', self.plus(self.math('DIVIDE', value, period), 0.5)), 0.5), period)

    # colours, as vectors
    def scaled(self, colour, factor):
        return self.add('ShaderNodeVectorMath', [(0, colour), (3, factor)], {'operation': 'SCALE'}).outputs[0]

    def blend(self, a, b, factor):
        """a + (b - a) * factor."""
        delta = self.add('ShaderNodeVectorMath', [(0, b), (1, a)], {'operation': 'SUBTRACT'}).outputs[0]
        return self.add('ShaderNodeVectorMath', [(0, self.scaled(delta, factor)), (1, a)], {'operation': 'ADD'}).outputs[0]

    # seamless textures
    def torus(self, per_u, per_v, seed):
        """4D point on a torus with `per_u` by `per_v` texture units around it, shifted by `seed`."""
        radius_u, radius_v = per_u / TAU, per_v / TAU
        shift = (seed * 7.31, seed * 3.17, seed * 5.13, seed * 1.91)
        x = self.mul_add(self.turn_u[0], radius_u, shift[0])
        y = self.mul_add(self.turn_u[1], radius_u, shift[1])
        z = self.mul_add(self.turn_v[0], radius_v, shift[2])
        w = self.mul_add(self.turn_v[1], radius_v, shift[3])
        return self.add('ShaderNodeCombineXYZ', [(0, x), (1, y), (2, z)]).outputs[0], w

    def noise(self, per_u, per_v, seed, detail=4.0, roughness=0.5):
        point, w = self.torus(per_u, per_v, seed)
        inputs = [('Vector', point), ('W', w), ('Scale', 1.0), ('Detail', detail), ('Roughness', roughness)]
        return self.add('ShaderNodeTexNoise', inputs, {'noise_dimensions': '4D'}).outputs['Fac']

    def voronoi(self, per_u, per_v, seed, feature='F1', randomness=1.0):
        point, w = self.torus(per_u, per_v, seed)
        inputs = [('Vector', point), ('W', w), ('Scale', 1.0), ('Randomness', randomness)]
        return self.add('ShaderNodeTexVoronoi', inputs, {'voronoi_dimensions': '4D', 'feature': feature}).outputs

    # the shader
    def finish(self, colour, height, roughness, bump_m):
        nodes = self.tree.nodes
        output = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Metallic'].default_value = 0.0
        shader.inputs['Roughness'].default_value = roughness
        bump = self.add('ShaderNodeBump', [('Strength', 1.0), ('Distance', bump_m), ('Height', height)])
        self.feed(shader.inputs['Base Color'], colour)
        self.feed(shader.inputs['Normal'], bump.outputs['Normal'])
        self.tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])


# --- ground: five strata (#48, #51) ----------------------------------------------------------------


def ground_topsoil(graph):
    """Band 1: loose soil, clumped, with scattered pebbles."""
    base = band_colour(1)
    grain = graph.noise(64, 64, seed=1, detail=8, roughness=0.6)
    clumps = graph.noise(10, 10, seed=2, detail=4)
    pebble = graph.smooth(graph.voronoi(28, 28, seed=3)['Distance'], 0.32, 0.18)
    tone = graph.mul(graph.mul_add(clumps, 0.35, 0.82), graph.mul_add(grain, 0.24, 0.88))
    colour = graph.blend(graph.scaled(base, tone), graph.scaled(base, 1.45), graph.mul(pebble, 0.7))
    height = graph.plus(graph.mul_add(clumps, 0.5, graph.mul(grain, 0.3)), graph.mul(pebble, 0.6))
    return colour, height, 0.9, 0.02


def ground_sediment(graph):
    """Band 2: wavy sandstone beds, alternating light and dark, six per tile."""
    base = band_colour(2)
    grain = graph.noise(56, 56, seed=11, detail=8, roughness=0.6)
    warp = graph.noise(3, 3, seed=12, detail=3)
    beds = strata(graph, 6, warp, 1.4)
    fine = strata(graph, 30, warp, 1.4)
    tone = graph.mul(graph.mul_add(beds, 0.4, 0.78), graph.mul_add(grain, 0.2, 0.9))
    tone = graph.mul(tone, graph.mul_add(fine, 0.12, 0.94))
    height = graph.plus(graph.mul(beds, 0.45), graph.mul_add(grain, 0.35, graph.mul(fine, 0.2)))
    return graph.scaled(base, tone), height, 0.85, 0.02


def ground_shale(graph):
    """Band 3: thin shale laminae broken by a network of dark cracks."""
    base = band_colour(3)
    grain = graph.noise(48, 48, seed=21, detail=6, roughness=0.55)
    warp = graph.noise(4, 4, seed=22, detail=3)
    laminae = strata(graph, 18, warp, 0.9)
    crack = graph.smooth(graph.voronoi(7, 7, seed=23, feature='DISTANCE_TO_EDGE')['Distance'], 0.05, 0.0)
    tone = graph.mul(graph.mul_add(laminae, 0.24, 0.9), graph.mul_add(grain, 0.2, 0.92))
    tone = graph.mul(tone, graph.mul_add(crack, -0.55, 1.04))
    height = graph.minus(graph.mul_add(laminae, 0.3, graph.mul(grain, 0.3)), graph.mul(crack, 0.9))
    return graph.scaled(base, tone), height, 0.8, 0.022


def ground_bedrock(graph):
    """Band 4: hard rock broken into blocks, each its own tone, with fractures between."""
    base = band_colour(4)
    grain = graph.noise(52, 52, seed=31, detail=8, roughness=0.6)
    blocks = graph.voronoi(6, 6, seed=32)
    edge = graph.voronoi(6, 6, seed=32, feature='DISTANCE_TO_EDGE')['Distance']
    block_tone = graph.add('ShaderNodeSeparateColor', [(0, blocks['Color'])]).outputs[0]
    fracture = graph.smooth(edge, 0.06, 0.0)
    faces = graph.smooth(edge, 0.0, 0.3)
    tone = graph.mul(graph.mul_add(block_tone, 0.4, 0.8), graph.mul_add(grain, 0.24, 0.88))
    tone = graph.mul(tone, graph.mul_add(fracture, -0.5, 1.04))
    height = graph.plus(graph.mul(faces, 0.6), graph.mul_add(grain, 0.4, graph.mul(fracture, -0.4)))
    return graph.scaled(base, tone), height, 0.75, 0.026


def ground_basalt(graph):
    """Band 5: dark columnar basalt, jointed into polygons, flecked with pale mineral."""
    base = band_colour(5)
    grain = graph.noise(60, 60, seed=41, detail=8, roughness=0.6)
    columns = graph.voronoi(9, 9, seed=42, randomness=0.55)
    joint_edge = graph.voronoi(9, 9, seed=42, feature='DISTANCE_TO_EDGE', randomness=0.55)['Distance']
    column_tone = graph.add('ShaderNodeSeparateColor', [(0, columns['Color'])]).outputs[0]
    joint = graph.smooth(joint_edge, 0.045, 0.0)
    fleck = graph.smooth(graph.voronoi(70, 70, seed=43)['Distance'], 0.16, 0.08)
    tone = graph.mul(graph.mul_add(column_tone, 0.3, 0.84), graph.mul_add(grain, 0.2, 0.9))
    tone = graph.mul(tone, graph.mul_add(joint, -0.55, 1.04))
    colour = graph.blend(graph.scaled(base, tone), graph.scaled(base, 2.3), graph.mul(fleck, 0.6))
    height = graph.plus(graph.mul(graph.smooth(joint_edge, 0.0, 0.25), 0.6), graph.mul_add(grain, 0.3, graph.mul(joint, -0.3)))
    return colour, height, 0.6, 0.024


def strata(graph, beds_per_tile, warp, warp_beds):
    """0..1 bands across v, `beds_per_tile` of them, bent by `warp` (0..1) by up to `warp_beds`."""
    phase = graph.mul_add(graph.v, beds_per_tile, graph.mul(graph.minus(warp, 0.5), warp_beds))
    return graph.mul_add(graph.math('SINE', graph.mul(phase, TAU)), 0.5, 0.5)


# --- casing: five grades (#48 acceptance 5: grade reads without colour) -----------------------------
# The lining is a ring about 0.25 m thick around a shaft (#41), so every grade repeats within half a
# metre: a strip of lining shows its grade's plate size, rivet spacing and relief, not just a seam.

RUSTED_IRON = (0.13, 0.105, 0.085)
RUST = (0.24, 0.095, 0.035)
STEEL = (0.21, 0.22, 0.23)
TREAD_STEEL = (0.28, 0.29, 0.30)
BLUED_STEEL = (0.09, 0.12, 0.17)
GUNMETAL = (0.065, 0.066, 0.075)
BRASS = (0.55, 0.38, 0.13)


def casing_sheet(graph):
    """Grade 1: plain 1 m sheets of rusting iron, a sparse rivet row every 0.5 m along each seam."""
    x, z = graph.metres
    seam = seam_distance(graph, graph.periodic(x, 1.0), graph.periodic(z, 1.0))
    rivets = graph.math('MAXIMUM', rivet_row(graph, x, z, 1.0, 0.5, 0.06, 0.03), rivet_row(graph, z, x, 1.0, 0.5, 0.06, 0.03))
    colour, height, roughness, bump_m = riveted_plate(graph, RUSTED_IRON, seam, 0.02, rivets, RUSTED_IRON, wear_seed=51)
    rust = graph.smooth(graph.noise(12, 12, seed=56, detail=6), 0.5, 0.75)
    return graph.blend(colour, RUST, graph.mul(rust, 0.7)), height, roughness, bump_m


def casing_lapped(graph):
    """Grade 2: 0.25 m steel strips, each lapped over the one below, riveted every 0.25 m."""
    x, z = graph.metres
    lap = graph.math('FRACT', graph.math('DIVIDE', z, 0.25))
    seam = seam_distance(graph, graph.periodic(x, 2.0), graph.periodic(z, 0.25))
    rivets = rivet_row(graph, x, z, 0.25, 0.25, 0.05, 0.026)
    colour, height, roughness, bump_m = riveted_plate(graph, STEEL, seam, 0.012, rivets, STEEL, wear_seed=52)
    return graph.scaled(colour, graph.mul_add(lap, 0.3, 0.85)), graph.mul_add(lap, 0.6, height), roughness, bump_m


def casing_tread(graph):
    """Grade 3: 0.5 m tread plates, raised diagonal lozenges, a rivet in from each corner."""
    x, z = graph.metres
    seam = seam_distance(graph, graph.periodic(x, 0.5), graph.periodic(z, 0.5))
    along = graph.periodic(graph.plus(x, z), 0.125)
    across = graph.periodic(graph.minus(x, z), 0.125)
    lozenge = graph.smooth(graph.plus(graph.math('DIVIDE', graph.math('ABSOLUTE', along), 0.045),
                                      graph.math('DIVIDE', graph.math('ABSOLUTE', across), 0.013)), 1.0, 0.7)
    rivets = corner_rivets(graph, x, z, 0.5, 0.05, 0.026)
    colour, height, roughness, bump_m = riveted_plate(graph, TREAD_STEEL, seam, 0.015, rivets, TREAD_STEEL, wear_seed=53)
    colour = graph.blend(colour, graph.scaled(colour, 1.4), graph.mul(lozenge, 0.8))
    return colour, graph.mul_add(lozenge, 0.45, height), roughness, bump_m


def casing_braced(graph):
    """Grade 4: 0.5 m blued panels braced by a raised X strap, big bolts at centres and corners."""
    x, z = graph.metres
    local_x, local_z = graph.periodic(x, 0.5), graph.periodic(z, 0.5)
    seam = seam_distance(graph, local_x, local_z)
    centre_x, centre_z = graph.periodic(graph.plus(x, 0.25), 0.5), graph.periodic(graph.plus(z, 0.25), 0.5)
    diagonal = graph.math('MINIMUM', graph.math('ABSOLUTE', graph.minus(centre_x, centre_z)),
                          graph.math('ABSOLUTE', graph.plus(centre_x, centre_z)))
    strap = graph.math('MAXIMUM', graph.smooth(diagonal, 0.05, 0.035), graph.smooth(seam, 0.045, 0.03))
    bolts = graph.math('MAXIMUM', rivet_at(graph, centre_x, centre_z, 0.045), rivet_at(graph, local_x, local_z, 0.045))
    colour, height, roughness, bump_m = riveted_plate(graph, BLUED_STEEL, seam, 0.01, bolts, STEEL, wear_seed=54)
    colour = graph.blend(colour, graph.scaled(colour, 1.6), graph.mul(strap, 0.85))
    return colour, graph.mul_add(strap, 0.55, height), roughness, bump_m


def casing_armour(graph):
    """Grade 5: thick 0.5 x 0.25 m gunmetal plates laid like bricks, bevelled, two brass rivet rows."""
    x, z = graph.metres
    row = graph.math('FLOOR', graph.math('DIVIDE', z, 0.25))
    stagger = graph.mul(graph.math('MODULO', row, 2.0), 0.25)
    seam = seam_distance(graph, graph.periodic(graph.plus(x, stagger), 0.5), graph.periodic(z, 0.25))
    bevel = graph.smooth(seam, 0.0, 0.04)
    rows = graph.math('MAXIMUM', rivet_row(graph, x, z, 0.25, 0.0625, 0.04, 0.016), rivet_row(graph, x, z, 0.25, 0.0625, 0.085, 0.016))
    colour, height, roughness, bump_m = riveted_plate(graph, GUNMETAL, seam, 0.008, rows, BRASS, wear_seed=55)
    return colour, graph.mul_add(bevel, 0.7, height), roughness, bump_m


def seam_distance(graph, local_x, local_z):
    """Distance to the nearest seam, given a point's offsets from the seam lattice (`periodic`)."""
    return graph.math('MINIMUM', graph.math('ABSOLUTE', local_x), graph.math('ABSOLUTE', local_z))


def rivet_row(graph, along, across, period, spacing, inset, radius):
    """Rivets every `spacing` along each seam line across `period`, `inset` above the seam."""
    offset_along = graph.periodic(along, spacing)
    offset_across = graph.periodic(graph.minus(across, inset), period)
    return rivet_at(graph, offset_along, offset_across, radius)


def corner_rivets(graph, x, z, period, inset, radius):
    """One rivet `inset` in from each corner of every panel."""
    corner_x = graph.minus(graph.math('ABSOLUTE', graph.periodic(x, period)), inset)
    corner_z = graph.minus(graph.math('ABSOLUTE', graph.periodic(z, period)), inset)
    return rivet_at(graph, graph.math('ABSOLUTE', corner_x), graph.math('ABSOLUTE', corner_z), radius)


def rivet_at(graph, offset_x, offset_z, radius):
    """A round dome, 1 at its centre and 0 at `radius` from it."""
    distance = graph.math('SQRT', graph.plus(graph.mul(offset_x, offset_x), graph.mul(offset_z, offset_z)))
    ratio = graph.math('MINIMUM', graph.math('DIVIDE', distance, radius), 1.0)
    return graph.math('SQRT', graph.minus(1.0, graph.mul(ratio, ratio)))


def riveted_plate(graph, metal, seam, seam_width, rivets, rivet_metal, wear_seed):
    """Worn plate darkened into its seams, rivets lit on top; the shared finish of every grade."""
    grime = graph.noise(8, 8, seed=wear_seed, detail=5)
    scuff = graph.noise(90, 90, seed=wear_seed + 100, detail=6, roughness=0.65)
    groove = graph.smooth(seam, seam_width, 0.0)
    tone = graph.mul(graph.mul_add(grime, 0.4, 0.78), graph.mul_add(scuff, 0.16, 0.92))
    plate = graph.scaled(metal, graph.mul(tone, graph.mul_add(groove, -0.6, 1.0)))
    rivet_top = graph.math('MINIMUM', graph.mul(rivets, 4.0), 1.0)
    colour = graph.blend(plate, graph.scaled(rivet_metal, graph.mul_add(rivets, 0.5, 0.9)), rivet_top)
    height = graph.plus(graph.mul(rivets, 0.9), graph.mul_add(groove, -0.6, graph.mul(scuff, 0.05)))
    return colour, height, 0.45, 0.012


RECIPES = {
    'ground-band-1': ground_topsoil,
    'ground-band-2': ground_sediment,
    'ground-band-3': ground_shale,
    'ground-band-4': ground_bedrock,
    'ground-band-5': ground_basalt,
    'casing-grade-1': casing_sheet,
    'casing-grade-2': casing_lapped,
    'casing-grade-3': casing_tread,
    'casing-grade-4': casing_braced,
    'casing-grade-5': casing_armour,
}

if __name__ == '__main__':
    main()
