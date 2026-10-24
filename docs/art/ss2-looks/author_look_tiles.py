"""
Authors the ground motif tiles of the eight SS2 biome looks (ticket 778, spec #774; Planet &
Narrative's palette lock of 23 Oct on #775, `src/features/solar-systems/palette.json`):
`ground-look-<look>` for cinder-basalt, ash-plain, rime-shelf, hoarfrost-vein, lode-banded,
gauss-field, hollow-honeycomb and brass-verdigris (#51, #52 "Ground and casing").

    blender -b --factory-startup --python-exit-code 1 -P docs/art/ss2-looks/author_look_tiles.py [-- <look> ...]

It writes art/blender/ground-look-<look>/ground-look-<look>.blend for every look, or only the
looks given after `--`. From then on those files are the sources (#52): change the art in Blender
and re-export (`npm run art:export -- ground-look-<look>`), rather than editing this script. Each
file is one 4 x 4 m quad facing -Y, named for its asset id, with a procedural material that repeats
at its edges, built on the node graph of scripts/art/author_tiles.py (S7d): every noise reads 4D
coordinates on a torus and every lattice has a whole number of periods across the tile, so the
maps tile with no seam. The diagonal veins turn the torus by (u + v) and (u - v), which wrap with
u and v, so they tile too.

Each look's motif is the lock's ground motif in its hue pair, and its mean colour is the look's
surface rock from `src/features/solar-systems/lookArt.json` (so a tint of one draws it as its row
says, the way the strata tiles sit at planet 1's band colours). Materials are dielectric, because
Cycles' diffuse colour pass, which the albedo bake reads, is black on a metallic surface.
"""

import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

import author_tiles as tiles  # noqa: E402

TAU = 2.0 * math.pi
TILE_M = tiles.TILE_M
LOOK_ART_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'solar-systems', 'lookArt.json')


def main():
    for look_id in requested_look_ids():
        author_look_tile(look_id)


def requested_look_ids():
    requested = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    unknown = [look_id for look_id in requested if look_id not in RECIPES]
    if unknown:
        print('author_look_tiles: no recipe for %s' % ', '.join(unknown), file=sys.stderr)
        sys.exit(1)
    return requested or list(RECIPES)


def asset_id_of(look_id):
    return 'ground-look-' + look_id


def author_look_tile(look_id):
    asset_id = asset_id_of(look_id)
    tiles.reset_scene()
    material = bpy.data.materials.new(asset_id)
    material.use_nodes = True
    graph = tiles.Graph(material)
    colour, height, roughness, bump_m = RECIPES[look_id](graph, rock_colour(look_id))
    graph.finish(colour, height, roughness, bump_m)
    tiles.tile_quad(asset_id, material)
    tiles.save_as(asset_id)


def rock_colour(look_id):
    """The look's surface rock from lookArt.json, in linear light."""
    with open(LOOK_ART_PATH, encoding='utf-8') as file:
        row = json.load(file)['looks'][look_id]
    return tiles.linear_of_hex(row['rockSurface'])


# --- graph helpers beyond author_tiles --------------------------------------------------------------


def diagonal_noise(graph, per_along, per_across, seed, detail=4.0, roughness=0.5):
    """
    Noise read on a torus turned by (u + v) and (u - v): `per_along` units along the rising
    diagonal and `per_across` across it, so streaks run diagonally and still wrap with u and v.
    """
    along = graph.plus(graph.u, graph.v)
    across = graph.minus(graph.u, graph.v)
    radius_a, radius_b = per_along / TAU, per_across / TAU
    shift = (seed * 7.31, seed * 3.17, seed * 5.13, seed * 1.91)
    x = graph.mul_add(graph.math('COSINE', graph.mul(along, TAU)), radius_a, shift[0])
    y = graph.mul_add(graph.math('SINE', graph.mul(along, TAU)), radius_a, shift[1])
    z = graph.mul_add(graph.math('COSINE', graph.mul(across, TAU)), radius_b, shift[2])
    w = graph.mul_add(graph.math('SINE', graph.mul(across, TAU)), radius_b, shift[3])
    point = graph.add('ShaderNodeCombineXYZ', [(0, x), (1, y), (2, z)]).outputs[0]
    inputs = [('Vector', point), ('W', w), ('Scale', 1.0), ('Detail', detail), ('Roughness', roughness)]
    return graph.add('ShaderNodeTexNoise', inputs, {'noise_dimensions': '4D'}).outputs['Fac']


def contour_lines(graph, field, lines, width):
    """Thin lines where `field` (0..1) crosses one of `lines` evenly spaced levels: 1 on a line."""
    phase = graph.math('ABSOLUTE', graph.minus(graph.math('FRACT', graph.mul(field, lines)), 0.5))
    return graph.smooth(phase, width, width * 0.4)


def hex_lattice(graph, columns, warp=None, warp_m=0.0):
    """
    A honeycomb of `columns` cells across the tile: two staggered rectangular lattices of centres
    whose spacing ratio is near sqrt(3) (the rows are `columns` over 1.75, rounded, so the tile holds
    whole numbers of cells both ways), so the nearest-centre cells are near-regular hexagons. A
    `warp` (0..1 noise) bends the lattice by up to `warp_m` metres and keeps it seamless. Returns
    the distance to the nearest centre and the distance to the nearest cell wall (half the gap
    between the nearest and the second-nearest centre), both as a share of the cell pitch.
    """
    x, z = graph.metres
    if warp is not None:
        x = graph.plus(x, graph.mul(graph.minus(warp, 0.5), warp_m))
        z = graph.plus(z, graph.mul(graph.minus(warp, 0.5), -warp_m))
    pitch_x = TILE_M / columns
    pitch_z = TILE_M / max(1, round(columns / 1.75))
    candidates = [*lattice_distances(graph, x, z, pitch_x, pitch_z),
                  *lattice_distances(graph, graph.plus(x, pitch_x / 2), graph.plus(z, pitch_z / 2), pitch_x, pitch_z)]
    nearest = min_of(graph, candidates)
    second = min_of(graph, [beyond(graph, distance, nearest) for distance in candidates])
    wall = graph.mul(graph.minus(second, nearest), 0.5)
    return graph.math('DIVIDE', nearest, pitch_x), graph.math('DIVIDE', wall, pitch_x)


def lattice_distances(graph, x, z, pitch_x, pitch_z):
    """The distances to the nearest centre of a rectangular lattice and to its two next neighbours."""
    offset_x, offset_z = graph.periodic(x, pitch_x), graph.periodic(z, pitch_z)
    across_x = graph.minus(pitch_x, graph.math('ABSOLUTE', offset_x))
    across_z = graph.minus(pitch_z, graph.math('ABSOLUTE', offset_z))
    return [centre_distance(graph, offset_x, offset_z),
            centre_distance(graph, across_x, offset_z),
            centre_distance(graph, offset_x, across_z)]


def min_of(graph, values):
    least = values[0]
    for value in values[1:]:
        least = graph.math('MINIMUM', least, value)
    return least


def beyond(graph, distance, nearest):
    """`distance`, pushed out of the running when it is the nearest itself."""
    is_nearest = graph.math('LESS_THAN', distance, graph.plus(nearest, 1e-5))
    return graph.plus(distance, graph.mul(is_nearest, 100.0))


def centre_distance(graph, offset_x, offset_z):
    return graph.math('SQRT', graph.plus(graph.mul(offset_x, offset_x), graph.mul(offset_z, offset_z)))


def scaled_hex(hex_colour):
    return tiles.linear_of_hex(hex_colour)


# --- the eight looks --------------------------------------------------------------------------------


def cinder_basalt(graph, rock):
    """L1, Fire: hex basalt columns, near-black flat faces, thin joints between them glowing orange."""
    grain = graph.noise(60, 60, seed=101, detail=8, roughness=0.6)
    warp = graph.noise(2, 2, seed=102, detail=2)
    nearest, wall_offset = hex_lattice(graph, 5, warp, 0.3)
    face_tone = graph.noise(5, 5, seed=103, detail=1)
    joint = graph.smooth(wall_offset, 0.055, 0.0)
    glow_core = graph.smooth(wall_offset, 0.022, 0.0)
    tone = graph.mul(graph.mul_add(face_tone, 0.7, 0.6), graph.mul_add(grain, 0.24, 0.88))
    faces = graph.scaled(rock, tone)
    colour = graph.blend(faces, graph.scaled(scaled_hex('#e0481a'), 0.55), graph.mul(joint, 0.85))
    colour = graph.blend(colour, scaled_hex('#ff9a30'), graph.mul(glow_core, 0.9))
    height = graph.plus(graph.mul(graph.smooth(wall_offset, 0.0, 0.3), 0.7), graph.mul_add(grain, 0.25, graph.mul(joint, -0.9)))
    return colour, height, 0.7, 0.03


def ash_plain(graph, rock):
    """L2, Fire: layered ash strata, grey beds with ember-red seams between some of them."""
    grain = graph.noise(56, 56, seed=111, detail=8, roughness=0.6)
    warp = graph.noise(3, 3, seed=112, detail=3)
    beds = tiles.strata(graph, 9, warp, 1.2)
    fine = tiles.strata(graph, 36, warp, 1.2)
    seam = graph.smooth(tiles.strata(graph, 9, warp, 1.2), 0.9, 0.98)
    patchy = graph.smooth(graph.noise(5, 5, seed=113, detail=3), 0.45, 0.6)
    ember = graph.mul(seam, patchy)
    tone = graph.mul(graph.mul_add(beds, 0.42, 0.78), graph.mul_add(grain, 0.2, 0.9))
    tone = graph.mul(tone, graph.mul_add(fine, 0.1, 0.95))
    colour = graph.blend(graph.scaled(rock, tone), scaled_hex('#c84a28'), graph.mul(ember, 0.9))
    height = graph.plus(graph.mul(beds, 0.5), graph.mul_add(grain, 0.3, graph.mul(fine, 0.2)))
    return colour, height, 0.9, 0.02


def rime_shelf(graph, rock):
    """L3, Frost: cracked ice plates, pale frosted centres, dark water in the cracks."""
    grain = graph.noise(40, 40, seed=121, detail=6, roughness=0.5)
    plates = graph.voronoi(5, 5, seed=122, randomness=0.85)
    crack_edge = graph.voronoi(5, 5, seed=122, feature='DISTANCE_TO_EDGE', randomness=0.85)['Distance']
    plate_tone = graph.add('ShaderNodeSeparateColor', [(0, plates['Color'])]).outputs[0]
    crack = graph.smooth(crack_edge, 0.05, 0.0)
    frost = graph.smooth(graph.noise(8, 8, seed=123, detail=4), 0.5, 0.75)
    tone = graph.mul(graph.mul_add(plate_tone, 0.25, 0.88), graph.mul_add(grain, 0.14, 0.93))
    ice = graph.scaled(rock, tone)
    colour = graph.blend(ice, scaled_hex('#c8ecf4'), graph.mul(frost, 0.35))
    colour = graph.blend(colour, scaled_hex('#0e2430'), graph.mul(crack, 0.9))
    height = graph.plus(graph.mul(graph.smooth(crack_edge, 0.0, 0.2), 0.5), graph.mul_add(grain, 0.15, graph.mul(crack, -0.8)))
    return colour, height, 0.25, 0.02


def hoarfrost_vein(graph, rock):
    """L4, Frost: needle crystal veins, pale violet needles crossing a slate ground, mostly rising."""
    grain = graph.noise(52, 52, seed=131, detail=7, roughness=0.55)
    rising = diagonal_noise(graph, 3, 40, seed=132, detail=2, roughness=0.4)
    falling = diagonal_noise(graph, 40, 3, seed=133, detail=2, roughness=0.4)
    needles_rising = graph.smooth(rising, 0.55, 0.64)
    needles_falling = graph.smooth(falling, 0.62, 0.7)
    needles = graph.math('MAXIMUM', needles_rising, graph.mul(needles_falling, 0.5))
    tone = graph.mul_add(grain, 0.22, 0.88)
    slate = graph.scaled(rock, tone)
    colour = graph.blend(slate, scaled_hex('#d4c4f4'), graph.mul(needles, 0.9))
    height = graph.plus(graph.mul(needles, 0.9), graph.mul(grain, 0.3))
    return colour, height, 0.5, 0.02


def lode_banded(graph, rock):
    """L5, Lodestone: banded iron, rust and steel-blue stripes folded into steep waves across the tile."""
    grain = graph.noise(56, 56, seed=141, detail=7, roughness=0.6)
    fold = graph.noise(2, 2, seed=142, detail=2, roughness=0.4)
    bands = tiles.strata(graph, 12, fold, 14.0)
    hairline = graph.smooth(tiles.strata(graph, 48, fold, 14.0), 0.6, 0.8)
    rust = scaled_hex('#9a4628')
    steel = scaled_hex('#32466e')
    step = graph.smooth(bands, 0.42, 0.58)
    banded = graph.blend(rust, steel, step)
    tone = graph.mul(graph.mul_add(grain, 0.22, 0.88), graph.mul_add(hairline, -0.25, 1.0))
    colour = graph.scaled(banded, tone)
    height = graph.plus(graph.mul(step, 0.6), graph.mul_add(grain, 0.3, graph.mul(hairline, -0.3)))
    return colour, height, 0.6, 0.018


def gauss_field(graph, rock):
    """L6, Lodestone: curled iron filings, thin teal arcs following a warped field, drifted in patches over gunmetal."""
    grain = graph.noise(60, 60, seed=151, detail=8, roughness=0.6)
    field = graph.noise(5, 5, seed=152, detail=2, roughness=0.4)
    arcs = contour_lines(graph, field, 24, 0.07)
    fine_field = graph.noise(9, 9, seed=153, detail=2, roughness=0.4)
    fine_arcs = graph.mul(contour_lines(graph, fine_field, 20, 0.06), 0.7)
    drifts = graph.smooth(graph.noise(4, 4, seed=154, detail=3), 0.2, 0.55)
    filings = graph.mul(graph.math('MAXIMUM', arcs, fine_arcs), drifts)
    tone = graph.mul_add(grain, 0.2, 0.78)
    gunmetal = graph.scaled(rock, tone)
    colour = graph.blend(gunmetal, scaled_hex('#38b8a8'), graph.mul(filings, 0.75))
    height = graph.plus(graph.mul(filings, 0.7), graph.mul(grain, 0.25))
    return colour, height, 0.45, 0.016


def hollow_honeycomb(graph, rock):
    """L7, Hollow: void honeycomb, small amber-rimmed cells opening into dark hollows."""
    grain = graph.noise(56, 56, seed=161, detail=7, roughness=0.55)
    nearest, wall_offset = hex_lattice(graph, 14)
    wall = graph.smooth(wall_offset, 0.12, 0.0)
    void = graph.smooth(nearest, 0.5, 0.22)
    tone = graph.mul_add(grain, 0.22, 0.88)
    umber = graph.scaled(rock, tone)
    colour = graph.blend(umber, scaled_hex('#180e06'), graph.mul(void, 0.92))
    colour = graph.blend(colour, scaled_hex('#f0b848'), graph.mul(wall, 0.8))
    height = graph.plus(graph.mul(wall, 0.9), graph.mul_add(grain, 0.2, graph.mul(void, -0.9)))
    return colour, height, 0.65, 0.03


def brass_verdigris(graph, rock):
    """L8, Foothold+: riveted plate shale, half-metre brass plates gone green with patina, a bright rivet row along every seam."""
    x, z = graph.metres
    grain = graph.noise(64, 64, seed=171, detail=8, roughness=0.6)
    warp = graph.noise(4, 4, seed=172, detail=3)
    laminae = tiles.strata(graph, 20, warp, 0.8)
    seam = tiles.seam_distance(graph, graph.periodic(x, 0.5), graph.periodic(z, 0.5))
    groove = graph.smooth(seam, 0.04, 0.0)
    rivets = graph.math('MAXIMUM', tiles.rivet_row(graph, x, z, 0.5, 0.125, 0.06, 0.032),
                        tiles.rivet_row(graph, z, x, 0.5, 0.125, 0.06, 0.032))
    rivet_top = graph.math('MINIMUM', graph.mul(rivets, 4.0), 1.0)
    patina = graph.smooth(graph.noise(6, 6, seed=173, detail=5), 0.42, 0.62)
    tone = graph.mul(graph.mul_add(grain, 0.2, 0.9), graph.mul_add(laminae, 0.12, 0.94))
    brass = graph.scaled(scaled_hex('#8c7c34'), tone)
    plate = graph.blend(brass, scaled_hex('#4a8a62'), graph.mul(patina, 0.85))
    plate = graph.scaled(plate, graph.mul_add(groove, -0.7, 1.0))
    colour = graph.blend(plate, graph.scaled(scaled_hex('#d8b850'), graph.mul_add(rivets, 0.5, 0.9)), rivet_top)
    height = graph.plus(graph.mul(rivets, 0.9), graph.mul_add(groove, -0.6, graph.mul_add(laminae, 0.1, graph.mul(grain, 0.1))))
    return colour, height, 0.5, 0.014


RECIPES = {
    'cinder-basalt': cinder_basalt,
    'ash-plain': ash_plain,
    'rime-shelf': rime_shelf,
    'hoarfrost-vein': hoarfrost_vein,
    'lode-banded': lode_banded,
    'gauss-field': gauss_field,
    'hollow-honeycomb': hollow_honeycomb,
    'brass-verdigris': brass_verdigris,
}

if __name__ == '__main__':
    main()
