"""
Authors the first version of the star map carousel's art (ticket 795, spec #647; Bjor's request of
24 Oct on the star map plan #650): one `ui` Blender asset per planet look, `ui-star-map-planet-<key>`
(the hero preview and its orbit dot), for the first system's five planets and the eight SS2 palette
looks (`carousel_looks.py`), and the system strip `ui-star-map-system` (the backdrop with the sun and
the five orbits, the orrery frame, the here ring and the selected marker). Sizes come from the brief
`src/data/design/starMapCarouselArt.json`; colours from each look's row.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/star-map-carousel/author_carousel.py [-- <key|system> ...]

It writes art/blender/<id>/<id>.blend for every asset, or only the keys given after `--` (`system`
for the strip). From then on those files are the sources (#52): change the art in Blender and
re-export (`npm run art:export -- <id>`), rather than editing this script.

Conventions are scripts/art/author_ui_chrome.py's: one Blender unit is one CSS px at 1x, the camera
looks along +Y so a piece at a smaller Y draws over one behind it, the part's origin is the sprite's
centre, nothing is lit. A preview is a real sphere, though: its crust material shades itself from
the surface normal (a light from the upper left, a dark terminator, the horizon colour as rim light),
since the albedo bake reads base colour alone, and the tangent-space normal bake gives the lit render
a sphere's normals for free. Round it sit a brass armillary ring, tilted so its lower half passes in
front and its upper half behind, with rivets, and a haze of the look's horizon colour fading out in
steps through the export's `mask_alpha` (a bounds outline with alpha 0 keeps every sprite its brief
size). Each look's crust is its ground motif in its hue pair, as its ground tile is (docs/art/ss2-looks),
so a planet reads the same on the map and on arrival.
"""

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, HERE)

import author_ui_chrome as chrome  # noqa: E402
from author_ui_chrome import LAYER, disc, face, flat_material, linear_of, rect, ring, rounded_frame, tick  # noqa: E402
from carousel_looks import PREVIEW_LOOKS, SYSTEM_ASSET_ID, asset_id_of, load_brief  # noqa: E402

TAU = 2.0 * math.pi
MASK_ALPHA_PROPERTY = 'mask_alpha'
# Variants of one asset sit side by side in the .blend, as write_placeholders.py lays them out.
VARIANT_PITCH = 16
# The light on every preview: from the upper left and a little in front (-Y faces the camera).
LIGHT = (-0.46, -0.55, 0.70)
SPHERE_SEGMENTS, SPHERE_RINGS = 128, 64
# The haze fades out over this many steps from the disc's edge to its outer radius.
HAZE_STEPS = 12
HAZE_ALPHA_START = 0.55
RING_THICKNESS = 5
RING_RIVETS = 9
# The strip's field darkens what lies behind it by this much; the orbits and the sun are opaque.
FIELD_ALPHA = 0.35
ORBIT_WIDTH = 2
SOCKET_RADIUS = 14
SUN_RAYS = 16


def main():
    brief = load_brief()
    for wanted in requested():
        chrome.reset_scene()
        if wanted == 'system':
            author_system(brief)
        else:
            author_preview(next(look for look in PREVIEW_LOOKS if look['key'] == wanted), brief)


def requested():
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    known = [look['key'] for look in PREVIEW_LOOKS] + ['system']
    unknown = [key for key in wanted if key not in known]
    if unknown:
        print('author_carousel: no look for %s' % ', '.join(unknown), file=sys.stderr)
        sys.exit(1)
    return wanted or known


# --- a planet preview -------------------------------------------------------------------------------


def author_preview(look, brief):
    asset_id = asset_id_of(look)
    m = chrome.Materials(chrome.load_json(chrome.TOKENS_PATH))
    hero, dot = brief['hero'], brief['dot']
    dot_x = hero['sizePx'] / 2 + VARIANT_PITCH + dot['sizePx'] / 2
    hero_pieces = [
        *planet_pieces(look, hero['discRadiusPx'], 0.0),
        *haze_pieces(look, hero['discRadiusPx'], hero['hazeOuterRadiusPx'], 0.0),
        *armillary_pieces(m, hero['ringSemiAxesPx'], hero['discRadiusPx'], 0.0),
        bounds_piece(hero['sizePx'], 0.0),
    ]
    dot_pieces = [
        *planet_pieces(look, dot['discRadiusPx'], dot_x),
        ring(m.graded('brass'), dot['discRadiusPx'] + 1.0, dot['discRadiusPx'] - 0.5, dot_x, 0, -(dot['discRadiusPx'] + 2)),
        bounds_piece(dot['sizePx'], dot_x),
    ]
    build_part(asset_id, hero_pieces, (0, 0))
    build_part(asset_id + '-dot', dot_pieces, (dot_x, 0))
    chrome.save_as(asset_id)


def planet_pieces(look, radius, cx):
    """The sphere in the look's crust, shaded in its material; its centre on the sprite's centre."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=SPHERE_SEGMENTS, ring_count=SPHERE_RINGS, radius=radius,
                                         location=(cx, 0.0, 0.0))
    sphere = bpy.context.view_layer.objects.active
    bpy.ops.object.shade_smooth()
    sphere.data.materials.append(crust_material(look, cx, radius))
    return [sphere]


def haze_pieces(look, inner, outer, cx):
    """Concentric rings behind the planet, the horizon colour fading out in alpha steps."""
    pieces = []
    step = (outer - inner) / HAZE_STEPS
    for at in range(HAZE_STEPS):
        share = at / HAZE_STEPS
        colour = mix_hex(look['horizon'], look['skyBand'], share * 0.6)
        alpha = HAZE_ALPHA_START * (1.0 - share) ** 1.4
        material = flat_material('haze-%s-%d' % (look['key'], at), colour)
        material[MASK_ALPHA_PROPERTY] = alpha
        pieces.append(ring(material, inner + step * (at + 1) + 0.5, inner + step * at, cx, 0, inner + 2 + at * LAYER))
    return pieces


def armillary_pieces(m, semi_axes, disc_radius, cx):
    """A tilted brass ring: its lower half in front of the planet, its upper half behind, riveted."""
    a, b = semi_axes
    front_y, back_y = -(disc_radius + 2), disc_radius + 2 + HAZE_STEPS * LAYER
    pieces = [
        ellipse_band(m.graded('brass'), a, b, RING_THICKNESS, cx, front_y, lower=True),
        ellipse_band(m.stop('brass', 'shadow'), a, b, RING_THICKNESS, cx, back_y, lower=False),
        ellipse_band(m.stop('iron', 'shadow'), a - 1, b - 1, 1, cx, front_y - LAYER, lower=True),
    ]
    for at in range(RING_RIVETS):
        angle = math.pi * (at + 0.5) / RING_RIVETS
        x, z = cx + (a - RING_THICKNESS / 2) * math.cos(angle), -(b - RING_THICKNESS / 2) * math.sin(angle)
        pieces += chrome.rivet(m, 1.5, x, z, front_y - 2 * LAYER)
    return pieces


def ellipse_band(material, a, b, thickness, cx, y, lower, segments=96):
    """Half an elliptical ring, `thickness` wide, the lower or the upper half."""
    start = math.pi if lower else 0.0
    outer = [(cx + a * math.cos(start + math.pi * i / segments), b * math.sin(start + math.pi * i / segments))
             for i in range(segments + 1)]
    inner = [(cx + (a - thickness) * math.cos(start + math.pi * i / segments),
              (b - thickness) * math.sin(start + math.pi * i / segments)) for i in range(segments + 1)]
    vertices = [(x, y, z) for x, z in outer] + [(x, y, z) for x, z in inner]
    count = len(outer)
    faces = [[i, i + 1, count + i + 1, count + i] for i in range(count - 1)]
    return chrome.mesh_piece(material, vertices, faces)


def bounds_piece(size, cx):
    """A hairline square at the sprite's full size with alpha 0: the bounds, and nothing drawn."""
    material = flat_material('bounds', '#000000')
    material[MASK_ALPHA_PROPERTY] = 0.0
    return rounded_frame(material, size, size, 1.0, 0.5, cx, 0, 200.0)


# --- the crust materials -----------------------------------------------------------------------------


class Nodes:
    """Builds a material's nodes from expressions: each call adds a node and returns its output."""

    def __init__(self, material, centre_x, radius):
        self.tree = material.node_tree
        self.tree.nodes.clear()
        coords = self.add('ShaderNodeTexCoord').outputs['Object']
        centred = self.vector('SUBTRACT', coords, (centre_x, 0.0, 0.0))
        self.p = self.vector('SCALE', centred, scale=1.0 / radius)
        self.normal = self.add('ShaderNodeNewGeometry').outputs['Normal']
        split = self.add('ShaderNodeSeparateXYZ', [(0, self.p)]).outputs
        self.x, self.y, self.z = split['X'], split['Y'], split['Z']

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

    def vector(self, operation, a, b=None, scale=None):
        inputs = [(0, a)]
        if b is not None:
            inputs.append((1, b))
        if scale is not None:
            inputs.append(('Scale', scale))
        node = self.add('ShaderNodeVectorMath', inputs, {'operation': operation})
        return node.outputs['Value'] if operation in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else node.outputs['Vector']

    def math(self, operation, a, b=0.0, c=0.0):
        return self.add('ShaderNodeMath', [(0, a), (1, b), (2, c)], {'operation': operation}).outputs[0]

    def mul(self, a, b):
        return self.math('MULTIPLY', a, b)

    def plus(self, a, b):
        return self.math('ADD', a, b)

    def minus(self, a, b):
        return self.math('SUBTRACT', a, b)

    def mul_add(self, a, scale, offset):
        return self.math('MULTIPLY_ADD', a, scale, offset)

    def clamp(self, a):
        return self.math('MINIMUM', self.math('MAXIMUM', a, 0.0), 1.0)

    def smooth(self, value, low, high):
        """0 below `low`, 1 above `high`, smooth between (either order, for a falling step)."""
        inputs = [(0, value), (1, low), (2, high), (3, 0.0), (4, 1.0)]
        return self.add('ShaderNodeMapRange', inputs, {'interpolation_type': 'SMOOTHSTEP'}).outputs[0]

    def noise(self, scale, seed, detail=3.0, roughness=0.5, vector=None):
        inputs = [('Vector', vector if vector is not None else self.p), ('W', seed * 1.37),
                  ('Scale', scale), ('Detail', detail), ('Roughness', roughness)]
        return self.add('ShaderNodeTexNoise', inputs, {'noise_dimensions': '4D'}).outputs['Fac']

    def voronoi(self, scale, seed, feature='F1', randomness=1.0, vector=None):
        inputs = [('Vector', vector if vector is not None else self.p), ('W', seed * 1.37),
                  ('Scale', scale), ('Randomness', randomness)]
        return self.add('ShaderNodeTexVoronoi', inputs, {'voronoi_dimensions': '4D', 'feature': feature}).outputs

    def stretched(self, sx, sy, sz):
        """The coordinates scaled per axis, so a noise read on them streaks along the short axes."""
        return self.vector('MULTIPLY', self.p, (sx, sy, sz))

    def colour(self, hex_colour):
        node = self.add('ShaderNodeRGB')
        node.outputs[0].default_value = (*linear_of(hex_colour), 1.0)
        return node.outputs[0]

    def mix(self, a, b, fac):
        """a + (b - a) * fac, on colours as vectors (the tile graph's blend)."""
        delta = self.vector('SUBTRACT', b, a)
        return self.vector('ADD', self.vector('SCALE', delta, scale=self.clamp(fac)), a)

    def scaled(self, colour, factor):
        return self.vector('SCALE', colour, scale=factor)

    def fract(self, a):
        return self.math('FRACT', a)

    def bands(self, along, count, warp=None, warp_amount=0.0):
        """A 0..1 sawtooth `count` times along `along`, bent by a noise."""
        if warp is not None:
            along = self.plus(along, self.mul(self.minus(warp, 0.5), warp_amount))
        return self.fract(self.mul(along, count))

    def lines(self, field, count, width):
        """Thin lines where `field` crosses evenly spaced levels: 1 on a line."""
        phase = self.math('ABSOLUTE', self.minus(self.fract(self.mul(field, count)), 0.5))
        return self.smooth(phase, width, width * 0.4)


def crust_material(look, centre_x, radius):
    material = bpy.data.materials.new('crust-%s-%d' % (look['key'], round(radius)))
    material.use_nodes = True
    n = Nodes(material, centre_x, radius)
    shader = n.add('ShaderNodeBsdfPrincipled', [('Metallic', 0.0), ('Roughness', 1.0)])
    output = n.add('ShaderNodeOutputMaterial')
    n.tree.links.new(shader.outputs[0], output.inputs['Surface'])
    crust = RECIPES[look['key']](n, look)
    n.tree.links.new(shade(n, crust, look), shader.inputs['Base Color'])
    return material


def shade(n, crust, look):
    """The crust lit from the upper left: a dark terminator, limb darkening, the horizon as rim light."""
    lit = n.smooth(n.vector('DOT_PRODUCT', n.normal, LIGHT), -0.25, 0.65)
    facing = n.math('MULTIPLY', n.add('ShaderNodeSeparateXYZ', [(0, n.normal)]).outputs['Y'], -1.0)
    limb = n.smooth(facing, 0.0, 0.35)
    light = n.mul(n.mul_add(lit, 0.78, 0.22), n.mul_add(limb, 0.45, 0.55))
    shaded = n.scaled(crust, light)
    rim = n.mul(n.math('POWER', n.minus(1.0, facing), 3.0), n.mul_add(lit, 0.6, 0.25))
    return n.mix(shaded, n.colour(look['horizon']), n.mul(rim, 0.7))


def tone(n, hex_colour, factor):
    return n.scaled(n.colour(hex_colour), factor)


# --- the thirteen crusts -------------------------------------------------------------------------------


def pitted_sandstone(n, look):
    """Hearthmoor: warm sandstone, broad tone drifts, craters with dark floors and pale rims."""
    drift = n.noise(2.5, 11, detail=2)
    grain = n.noise(28, 12, detail=6, roughness=0.6)
    craters = n.voronoi(7, 13, randomness=0.9)['Distance']
    floor = n.smooth(craters, 0.46, 0.2)
    rim = n.mul(n.smooth(craters, 0.34, 0.46), n.smooth(craters, 0.62, 0.5))
    base = tone(n, look['rockSurface'], n.mul(n.mul_add(drift, 0.5, 0.75), n.mul_add(grain, 0.2, 0.9)))
    base = n.mix(base, n.colour(look['rockDeep']), n.mul(floor, 0.95))
    return n.mix(base, n.colour('#d0a870'), n.mul(rim, 0.7))


def rockfall_scree(n, look):
    """Gravelholm: angular slate plates, each its own tone, dark joints between them."""
    plates = n.voronoi(12, 21, randomness=1.0)
    joint = n.smooth(n.voronoi(12, 21, feature='DISTANCE_TO_EDGE', randomness=1.0)['Distance'], 0.035, 0.0)
    plate_tone = n.add('ShaderNodeSeparateColor', [(0, plates['Color'])]).outputs[0]
    grain = n.noise(36, 22, detail=6, roughness=0.55)
    base = tone(n, '#587490', n.mul(n.mul_add(plate_tone, 0.6, 0.7), n.mul_add(grain, 0.16, 0.92)))
    base = n.mix(base, n.colour(look['horizon']), n.mul(n.smooth(plate_tone, 0.7, 0.9), 0.35))
    return n.mix(base, n.colour(look['rockDeep']), n.mul(joint, 0.95))


def coal_seams(n, look):
    """Coalfen: dark blocky rock with thin coal-black seams across it and a faint gas sheen."""
    warp = n.noise(3, 31, detail=2)
    seam = n.smooth(n.bands(n.z, 5, warp, 0.5), 0.86, 0.96)
    seam = n.math('MAXIMUM', seam, n.smooth(n.bands(n.z, 5, warp, 0.5), 0.14, 0.04))
    blocks = n.add('ShaderNodeSeparateColor', [(0, n.voronoi(5, 32, randomness=0.7)['Color'])]).outputs[0]
    grain = n.noise(30, 33, detail=5, roughness=0.6)
    sheen = n.smooth(n.noise(4, 34, detail=2), 0.55, 0.8)
    base = tone(n, look['rockSurface'], n.mul(n.mul_add(blocks, 0.4, 0.6), n.mul_add(grain, 0.2, 0.85)))
    base = n.mix(base, n.colour(look['rockDeep']), n.mul(seam, 0.95))
    return n.mix(base, n.colour(look['horizon']), n.mul(sheen, 0.22))


def spine_crystals(n, look):
    """Spinegarth: glassy teal ground with bright crystal needles rising to the upper right."""
    grain = n.noise(30, 41, detail=5)
    rising = n.noise(1.0, 42, detail=2, roughness=0.4, vector=n.stretched(14, 14, 2.5))
    falling = n.noise(1.0, 43, detail=2, roughness=0.4, vector=n.stretched(2.5, 14, 14))
    needles = n.math('MAXIMUM', n.smooth(rising, 0.58, 0.68), n.mul(n.smooth(falling, 0.62, 0.72), 0.6))
    base = tone(n, '#2c7a68', n.mul_add(grain, 0.25, 0.85))
    base = n.mix(base, n.colour(look['rockDeep']), n.mul(n.smooth(grain, 0.35, 0.1), 0.6))
    return n.mix(base, n.colour('#d8f4ff'), n.mul(needles, 0.95))


def steam_vents(n, look):
    """Kettlecrag: dark basalt blotches with white vent plumes breathing out of the cracks."""
    blotch = n.noise(4, 51, detail=3)
    grain = n.noise(34, 52, detail=6, roughness=0.6)
    vents = n.voronoi(6, 53, randomness=0.9)['Distance']
    plume = n.smooth(vents, 0.5, 0.1)
    crack = n.smooth(n.voronoi(6, 53, feature='DISTANCE_TO_EDGE', randomness=0.9)['Distance'], 0.03, 0.0)
    base = tone(n, '#64505a', n.mul(n.mul_add(blotch, 0.5, 0.7), n.mul_add(grain, 0.2, 0.9)))
    base = n.mix(base, n.colour(look['rockDeep']), n.mul(n.smooth(blotch, 0.55, 0.3), 0.6))
    base = n.mix(base, n.colour(look['rockDeep']), n.mul(crack, 0.7))
    return n.mix(base, n.colour('#f8f4ec'), n.mul(plume, 0.95))


def cinder_basalt(n, look):
    """Hex basalt columns, near-black faces, thin joints glowing orange."""
    wall = n.voronoi(8, 61, feature='DISTANCE_TO_EDGE', randomness=0.35)['Distance']
    face_tone = n.add('ShaderNodeSeparateColor', [(0, n.voronoi(8, 61, randomness=0.35)['Color'])]).outputs[0]
    grain = n.noise(40, 62, detail=6, roughness=0.6)
    joint = n.smooth(wall, 0.045, 0.0)
    core = n.smooth(wall, 0.02, 0.0)
    base = tone(n, look['rockSurface'], n.mul(n.mul_add(face_tone, 0.6, 0.6), n.mul_add(grain, 0.24, 0.88)))
    base = n.mix(base, n.colour('#e0481a'), n.mul(joint, 0.85))
    return n.mix(base, n.colour('#ff9a30'), n.mul(core, 0.9))


def ash_plain(n, look):
    """Layered ash strata, grey beds with ember-red seams between some of them."""
    warp = n.noise(3, 71, detail=3)
    beds = n.bands(n.z, 7, warp, 0.4)
    fine = n.bands(n.z, 28, warp, 0.4)
    seam = n.smooth(beds, 0.9, 0.98)
    patchy = n.smooth(n.noise(3, 72, detail=3), 0.45, 0.6)
    grain = n.noise(36, 73, detail=6, roughness=0.6)
    base = tone(n, '#8a7e74', n.mul(n.mul(n.mul_add(beds, 0.55, 0.65), n.mul_add(grain, 0.2, 0.9)),
                                     n.mul_add(fine, 0.12, 0.94)))
    ember = n.math('MAXIMUM', n.mul(seam, patchy), n.mul(n.smooth(beds, 0.08, 0.02), patchy))
    return n.mix(base, n.colour('#e05a30'), n.mul(ember, 0.95))


def rime_shelf(n, look):
    """Cracked ice plates, pale frosted centres, dark water in the cracks."""
    plates = n.voronoi(5, 81, randomness=0.85)
    crack = n.smooth(n.voronoi(5, 81, feature='DISTANCE_TO_EDGE', randomness=0.85)['Distance'], 0.045, 0.0)
    plate_tone = n.add('ShaderNodeSeparateColor', [(0, plates['Color'])]).outputs[0]
    frost = n.smooth(n.noise(6, 82, detail=4), 0.5, 0.75)
    grain = n.noise(26, 83, detail=5)
    base = tone(n, look['rockSurface'], n.mul(n.mul_add(plate_tone, 0.25, 0.88), n.mul_add(grain, 0.14, 0.93)))
    base = n.mix(base, n.colour('#d8f2f8'), n.mul(n.math('MAXIMUM', frost, 0.35), 0.75))
    return n.mix(base, n.colour('#0e2430'), n.mul(crack, 0.95))


def hoarfrost_vein(n, look):
    """Needle crystal veins, pale violet needles crossing a slate ground, mostly rising."""
    rising = n.noise(1.0, 91, detail=2, roughness=0.4, vector=n.stretched(2.5, 12, 12))
    falling = n.noise(1.0, 92, detail=2, roughness=0.4, vector=n.stretched(12, 12, 2.5))
    needles = n.math('MAXIMUM', n.smooth(rising, 0.55, 0.64), n.mul(n.smooth(falling, 0.62, 0.7), 0.5))
    grain = n.noise(34, 93, detail=6, roughness=0.55)
    base = tone(n, look['rockSurface'], n.mul_add(grain, 0.22, 0.88))
    return n.mix(base, n.colour('#d4c4f4'), n.mul(needles, 0.9))


def lode_banded(n, look):
    """Banded iron, rust and steel-blue stripes folded into steep waves."""
    fold = n.noise(1.5, 101, detail=2, roughness=0.4)
    step = n.smooth(n.bands(n.z, 6, fold, 1.2), 0.42, 0.58)
    hairline = n.smooth(n.bands(n.z, 24, fold, 1.2), 0.6, 0.8)
    grain = n.noise(36, 102, detail=6, roughness=0.6)
    banded = n.mix(n.colour('#c05a2c'), n.colour('#2c4a7e'), step)
    return n.scaled(banded, n.mul(n.mul_add(grain, 0.25, 0.95), n.mul_add(hairline, -0.35, 1.0)))


def gauss_field(n, look):
    """Curled iron filings: thin teal arcs along a warped field, drifted in patches over gunmetal."""
    field = n.noise(3, 111, detail=2, roughness=0.4)
    arcs = n.lines(field, 14, 0.07)
    fine = n.mul(n.lines(n.noise(6, 112, detail=2, roughness=0.4), 12, 0.06), 0.7)
    drifts = n.smooth(n.noise(2.5, 113, detail=3), 0.25, 0.55)
    filings = n.mul(n.math('MAXIMUM', arcs, fine), drifts)
    grain = n.noise(40, 114, detail=6, roughness=0.6)
    base = tone(n, look['rockSurface'], n.mul_add(grain, 0.2, 0.78))
    return n.mix(base, n.colour('#38b8a8'), n.mul(filings, 0.8))


def hollow_honeycomb(n, look):
    """Void honeycomb: small amber-rimmed cells opening into dark hollows."""
    cells = n.voronoi(14, 121, randomness=0.25)
    wall = n.smooth(n.voronoi(14, 121, feature='DISTANCE_TO_EDGE', randomness=0.25)['Distance'], 0.1, 0.0)
    void = n.smooth(cells['Distance'], 0.38, 0.14)
    grain = n.noise(36, 122, detail=5)
    base = tone(n, look['rockSurface'], n.mul_add(grain, 0.22, 0.88))
    base = n.mix(base, n.colour('#180e06'), n.mul(void, 0.92))
    return n.mix(base, n.colour('#f0b848'), n.mul(wall, 0.8))


def brass_verdigris(n, look):
    """Riveted brass plates gone green with patina, a bright rivet row along every seam."""
    gx, gz = n.mul(n.x, 4.0), n.mul(n.z, 4.0)
    seam_x = n.math('ABSOLUTE', n.minus(n.fract(gx), 0.5))
    seam_z = n.math('ABSOLUTE', n.minus(n.fract(gz), 0.5))
    groove = n.math('MAXIMUM', n.smooth(seam_x, 0.47, 0.5), n.smooth(seam_z, 0.47, 0.5))
    rivets = n.smooth(n.voronoi(4, 131, randomness=0.0, vector=n.vector('ADD', n.p, (0.125, 0.0, 0.125)))['Distance'],
                      0.07, 0.04)
    patina = n.smooth(n.noise(4, 132, detail=5), 0.36, 0.56)
    grain = n.noise(44, 133, detail=6, roughness=0.6)
    brass = tone(n, '#8c7c34', n.mul_add(grain, 0.2, 0.9))
    plate = n.mix(brass, n.colour('#3e9a68'), n.mul(patina, 0.95))
    plate = n.scaled(plate, n.mul_add(groove, -0.8, 1.0))
    return n.mix(plate, n.colour('#d8b850'), rivets)


RECIPES = {
    '1': pitted_sandstone,
    '2': rockfall_scree,
    '3': coal_seams,
    '4': spine_crystals,
    '5': steam_vents,
    'cinder-basalt': cinder_basalt,
    'ash-plain': ash_plain,
    'rime-shelf': rime_shelf,
    'hoarfrost-vein': hoarfrost_vein,
    'lode-banded': lode_banded,
    'gauss-field': gauss_field,
    'hollow-honeycomb': hollow_honeycomb,
    'brass-verdigris': brass_verdigris,
}


# --- the system strip ---------------------------------------------------------------------------------


def author_system(brief):
    m = chrome.Materials(chrome.load_json(chrome.TOKENS_PATH))
    system = brief['system']
    width, height = system['sizePx']
    frame = system['frame']
    row_z = -(height / 2 + VARIANT_PITCH + frame['sizePx'] / 2)
    build_part(SYSTEM_ASSET_ID, backdrop_pieces(m, system), (0, 0))
    x = -width / 2 + frame['sizePx'] / 2
    build_part(SYSTEM_ASSET_ID + '-frame', frame_pieces(m, frame['sizePx'], frame['insetPx'], x, row_z),
               (x, row_z), inset=frame['insetPx'])
    x += frame['sizePx'] + VARIANT_PITCH + system['herePx'] / 2
    build_part(SYSTEM_ASSET_ID + '-here', here_pieces(m, system['herePx'], x, row_z), (x, row_z))
    x += system['herePx'] / 2 + VARIANT_PITCH + system['selectedPx'] / 2
    build_part(SYSTEM_ASSET_ID + '-selected', selected_pieces(m, system['selectedPx'], x, row_z), (x, row_z))
    chrome.save_as(SYSTEM_ASSET_ID)


def backdrop_pieces(m, system):
    """The field, the five orbits with a socket at each planet's place, and the sun at the head."""
    width, height = system['sizePx']
    sun_x, sun_z = system['sunCentrePx'][0] - width / 2, height / 2 - system['sunCentrePx'][1]
    bounds = (-width / 2, width / 2, -height / 2, height / 2)
    field = flat_material('field', m.stops['iron']['shadow'])
    field[MASK_ALPHA_PROPERTY] = FIELD_ALPHA
    pieces = [rect(field, width, height, 0, 0, 0)]
    for radius in system['orbitRadiiPx']:
        pieces.append(clipped_ring(m.stop('brass', 'base'), radius + ORBIT_WIDTH / 2, radius - ORBIT_WIDTH / 2,
                                   sun_x, sun_z, -LAYER, bounds))
        pieces.append(ring(m.graded('brass'), SOCKET_RADIUS, SOCKET_RADIUS - 1, sun_x + radius, sun_z, -2 * LAYER))
        pieces.append(ring(m.stop('iron', 'shadow'), SOCKET_RADIUS - 1, SOCKET_RADIUS - 1.5, sun_x + radius, sun_z, -2 * LAYER))
    pieces += sun_pieces(m, system['sunRadiusPx'], sun_x, sun_z, -3 * LAYER)
    return pieces


def clipped_ring(material, outer, inner, cx, cz, y, bounds, segments=720):
    """A ring's quads inside the strip only, so the part's bounds stay the strip's."""
    left, right, bottom, top = bounds
    vertices, faces = [], []
    for i in range(segments):
        a0, a1 = TAU * i / segments, TAU * (i + 1) / segments
        quad = [(cx + outer * math.cos(a0), cz + outer * math.sin(a0)), (cx + outer * math.cos(a1), cz + outer * math.sin(a1)),
                (cx + inner * math.cos(a1), cz + inner * math.sin(a1)), (cx + inner * math.cos(a0), cz + inner * math.sin(a0))]
        if all(left <= x <= right and bottom <= z <= top for x, z in quad):
            start = len(vertices)
            vertices += [(x, y, z) for x, z in quad]
            faces.append([start, start + 1, start + 2, start + 3])
    return chrome.mesh_piece(material, vertices, faces)


def sun_pieces(m, radius, cx, cz, y):
    """The system's star: brass rays round a brass-rimmed amber disc with an ember heart."""
    pieces = [tick(m.graded('brass'), 6, radius * 0.45, radius * 1.2, 360.0 * ray / SUN_RAYS, cx, cz, y)
              for ray in range(SUN_RAYS)]
    pieces += [
        ring(m.graded('brass'), radius + 2.5, radius, cx, cz, y - LAYER),
        disc(flat_material('amber', m.colour('amber')), radius, cx, cz, y - 2 * LAYER),
        disc(flat_material('ember', m.colour('ember')), radius * 0.5, cx, cz, y - 3 * LAYER),
        disc(m.stop('parchment', 'highlight'), radius * 0.12, cx - radius * 0.35, cz + radius * 0.35, y - 4 * LAYER),
    ]
    return pieces


def frame_pieces(m, size, inset, cx, cz):
    """The orrery frame, a rail nine-slice: a 2 px brass edge, a 4 px iron band with a rivet per
    edge tile, a brass hairline inside; hollow, the strip shows through."""
    pitch = size - 2 * inset
    pieces = [
        rounded_frame(m.graded('brass'), size, size, 6, 2, cx, cz, 0),
        rounded_frame(m.stop('iron', 'base'), size - 4, size - 4, 4, 4, cx, cz, 0),
        rounded_frame(m.graded('brass'), size - 12, size - 12, 2, 1, cx, cz, 0),
    ]
    half = size / 2 - 4
    pieces += [chrome.rivet(m, 1.5, cx + sx, cz + sz, -LAYER) for sx in (-half, half) for sz in (-half, half)]
    pieces += [chrome.rivet(m, 1.5, cx, cz + sz, -LAYER) for sz in (-half, half)]
    pieces += [chrome.rivet(m, 1.5, cx + sx, cz, -LAYER) for sx in (-half, half)]
    assert pitch > 0
    return pieces


def here_pieces(m, size, cx, cz):
    """The ring round the planet the session is on: 2 px brass with a tick at each compass point."""
    outer = size / 2
    pieces = [ring(m.graded('brass'), outer, outer - 2, cx, cz, 0)]
    for angle in (0, 90, 180, 270):
        pieces.append(tick(m.graded('brass'), 2, 5, outer - 2 - 2.5 + 1, angle, cx, cz, -LAYER))
    return pieces


def selected_pieces(m, size, cx, cz):
    """The selected marker: an amber ring with a tick reaching out at each compass point."""
    amber = flat_material('amber', m.colour('amber'))
    outer = size / 2 - 5
    pieces = [ring(amber, outer, outer - 2, cx, cz, 0), ring(m.stop('iron', 'shadow'), outer - 2, outer - 3, cx, cz, 0)]
    for angle in (0, 90, 180, 270):
        pieces.append(tick(amber, 2, 6, outer + 2, angle, cx, cz, -LAYER))
    return pieces


# --- parts --------------------------------------------------------------------------------------------


def build_part(part_id, pieces, origin_xz, inset=None):
    """Joins the pieces into one mesh named for the sprite, its origin the sprite's centre."""
    pieces = chrome.flattened(pieces)
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    part = bpy.context.view_layer.objects.active
    bpy.context.scene.cursor.location = (origin_xz[0], 0.0, origin_xz[1])
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    part.name = part_id
    part.data.name = part_id
    part['z'] = 0
    if inset is not None:
        part['inset'] = [inset, inset]
    return part


def mix_hex(a, b, share):
    channels = [round(int(a[i:i + 2], 16) * (1 - share) + int(b[i:i + 2], 16) * share) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(channels)


if __name__ == '__main__':
    main()
