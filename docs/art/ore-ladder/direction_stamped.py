"""
Direction C, "Stamped" (#150): the flat-vector look #13 chose for terrain, pushed up the ladder.
Every surface is unlit (emission-only), so the colours on screen are the authored colours; depth
comes from two-tone facets, ink outlines and hard-edged halos rather than from the lamp. The
escalation is graphic: more silhouette, then a glint star, then two-tone shards and a rim, then a
lit core with vein spokes, then an orbiting ring with a halo that crosses the cell edge and
lightning polylines. Azurite blue body like the other directions; white at the top.
"""

import math

import ladder_scene as stage
import ore_materials as materials
import ore_shapes as shapes

ID = 'stamped'
TITLE = 'Stamped (flat vector)'
LIT = False

INK = '#0b0b10'
BODY = {1: '#262a3d', 2: '#6f8db8', 3: '#a8d4f8', 4: '#dff2ff', 5: '#ffffff'}
SHADE = {2: '#4a6a94', 3: '#5f93c8', 5: '#9cc8f0'}
HALO_OUTER = '#2a5a94'
GLINT = '#d7e8f8'
RIM = '#3f78b8'
VEIN = '#9fd0ff'
HALO = '#3a7cc8'
PULSE = ((1, 0.7), (2, 1.0), (3, 0.85))


def build_tile(grade, x, rock_hex, rng):
    build_flat_rock(grade, x, rock_hex)
    {1: build_flecks, 2: build_nuggets, 3: build_shards, 4: build_lit_geode, 5: build_orbit}[grade](x, rng)


# --- the cell: flat band colour with the game's edge highlight -----------------------------------


def build_flat_rock(grade, x, rock_hex):
    stage.add_rock_slab(grade, materials.flat_material('rock-g%d' % grade, rock_hex))
    light = materials.flat_material('edge-light-g%d' % grade, materials.mix_hex(rock_hex, '#ffffff', 0.18))
    dark = materials.flat_material('edge-dark-g%d' % grade, materials.mix_hex(rock_hex, '#000000', 0.28))
    shapes.assign(shapes.add_quad('edge-top', (x, 0.4825), 1.0, 0.035, -0.001), light)
    shapes.assign(shapes.add_quad('edge-left', (x - 0.4825, 0.0), 0.035, 1.0, -0.001), light)
    shapes.assign(shapes.add_quad('edge-bottom', (x, -0.4825), 1.0, 0.035, -0.0015), dark)
    shapes.assign(shapes.add_quad('edge-right', (x + 0.4825, 0.0), 0.035, 1.0, -0.0015), dark)


def ink():
    return materials.flat_material('ink', INK)


# --- G1 form: angular flecks -----------------------------------------------------------------------


def build_flecks(x, rng):
    fleck = materials.flat_material('stamped-fleck', BODY[1])
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 9, 0.37, 0.14)):
        points = irregular_polygon((x + px, pz), rng.uniform(0.06, 0.1), 5, rng)
        shape = shapes.assign(shapes.add_polygon('fleck-%d' % i, points, -0.005, 0.01), fleck)
        shapes.outline_behind(shape, ink(), grow=1.18, back=0.012)


def irregular_polygon(centre, radius, sides, rng):
    cx, cz = centre
    phase = rng.uniform(0, math.tau)
    return [(cx + radius * rng.uniform(0.7, 1.0) * math.cos(phase + math.tau * i / sides),
             cz + radius * rng.uniform(0.7, 1.0) * math.sin(phase + math.tau * i / sides)) for i in range(sides)]


# --- G2 sheen: rounded nuggets with a glint star -------------------------------------------------


def build_nuggets(x, rng):
    body = materials.flat_material('stamped-nugget', BODY[2])
    shade = materials.flat_material('stamped-nugget-shade', SHADE[2])
    glint = materials.flat_material('stamped-glint', GLINT)
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 6, 0.32, 0.21)):
        add_nugget('nugget-%d' % i, (x + px, pz), rng.uniform(0.08, 0.11), body, shade, glint, rng)


def add_nugget(name, centre, radius, body, shade, glint, rng):
    cx, cz = centre
    outline = shapes.add_polygon(name, shapes.regular_points(centre, radius, 7, rng.uniform(0, 1)), -0.006, 0.012)
    shapes.assign(outline, body)
    shapes.outline_behind(outline, ink(), grow=1.16, back=0.012)
    shaded = shapes.regular_points((cx + radius * 0.2, cz - radius * 0.25), radius * 0.72, 7, 0.4)
    shapes.assign(shapes.add_polygon(name + '-shade', shaded, -0.02, 0.004), shade)
    star = shapes.star_points((cx - radius * 0.35, cz + radius * 0.35), radius * 0.4, radius * 0.12, phase=0.4)
    shapes.assign(shapes.add_polygon(name + '-glint', star, -0.03, 0.004), glint)


# --- G3 structure: two-tone shards with a rim --------------------------------------------------------


def build_shards(x, rng):
    """Seven shards radiating from one root, the longest crossing the cell edge."""
    root = (x - 0.04, -0.02)
    for i in range(7):
        angle = math.tau * i / 7 + rng.uniform(-0.15, 0.15)
        length = 0.3 if i == 1 else rng.uniform(0.13, 0.2)
        centre = (root[0] + math.cos(angle) * (length + 0.05), root[1] + math.sin(angle) * (length + 0.05))
        add_two_tone_shard('shard-%d' % i, centre, length, 0.045, angle, BODY[3], SHADE[3], rim=True)
    add_glints(x, rng, 3)


def add_two_tone_shard(name, centre, length, width, angle, lit_hex, shade_hex, rim, strength=1.0, y=-0.02):
    """A long diamond split along its axis: a lit half and a shaded half, an ink line round it."""
    tip, side_a, tail, side_b = shapes.shard_points(centre, length, width, angle)
    lit = shapes.add_polygon(name + '-lit', [tip, side_a, tail], y, 0.012)
    shapes.assign(lit, materials.flat_material(name + '-lit', lit_hex, strength))
    shaded = shapes.add_polygon(name + '-shade', [tip, tail, side_b], y, 0.012)
    shapes.assign(shaded, materials.flat_material(name + '-shade', shade_hex, strength))
    whole = shapes.add_polygon(name, [tip, side_a, tail, side_b], y + 0.005, 0.0)
    shapes.assign(whole, ink())
    whole.scale = (1.14, 1.0, 1.14)
    if rim:
        halo = shapes.add_polygon(name + '-rim', [tip, side_a, tail, side_b], y + 0.017, 0.0)
        halo.scale = (1.45, 1.0, 1.45)
        shapes.assign(halo, materials.flat_material(name + '-rim', RIM, 0.9))


def add_glints(x, rng, count):
    glint = materials.flat_material('stamped-sparkle', GLINT, 2.0)
    points = [shapes.assign(shapes.add_polygon('sparkle-%d' % i, shapes.star_points((x + px, pz), 0.03, 0.009), -0.05, 0.0), glint)
              for i, (px, pz) in enumerate(shapes.scatter_positions(rng, count, 0.3, 0.1))]
    stage.blink(points[::2], (1, 3))
    stage.blink(points[1::2], (2,))


# --- G4 inner light: a hexagon geode, a lit core, vein spokes ------------------------------------


def build_lit_geode(x, rng):
    shapes.assign(shapes.add_polygon('geode-shell', shapes.regular_points((x, 0.0), 0.32, 6), -0.005, 0.01), materials.flat_material('geode-shell', '#1a2234'))
    shapes.assign(shapes.add_polygon('geode-lining', shapes.regular_points((x, 0.0), 0.24, 6), -0.02, 0.01), materials.flat_material('geode-lining', VEIN, 1.2))
    core = shapes.add_polygon('geode-core', shapes.regular_points((x, 0.0), 0.12, 6), -0.035, 0.01)
    shapes.assign(core, pulsing(materials.flat_material('geode-core', BODY[4], 4.0)))
    for i in range(6):
        angle = math.tau * i / 6 + 0.3
        add_two_tone_shard('geode-shard-%d' % i, (x + math.cos(angle) * 0.17, math.sin(angle) * 0.17), 0.07, 0.025, angle, BODY[3], SHADE[3], rim=False, y=-0.04)
    add_vein_spokes(x)
    add_glints(x, rng, 3)


def add_vein_spokes(x):
    vein = pulsing(materials.flat_material('vein-spoke', VEIN, 2.5))
    for i in range(6):
        angle = math.tau * i / 6 + math.pi / 6
        inner, outer = 0.3, 0.5
        ax, az = math.cos(angle), math.sin(angle)
        sx, sz = -az, ax
        points = [(x + ax * inner + sx * 0.03, az * inner + sz * 0.03), (x + ax * outer + sx * 0.008, az * outer + sz * 0.008),
                  (x + ax * outer - sx * 0.008, az * outer - sz * 0.008), (x + ax * inner - sx * 0.03, az * inner - sz * 0.03)]
        shapes.assign(shapes.add_polygon('spoke-%d' % i, points, -0.02, 0.006), vein)


def pulsing(material):
    materials.pulse_emission(material, PULSE)
    return material


# --- G5 its own effect: an orbiting shard ring, a halo over the neighbours, lightning ------------


def build_orbit(x, rng):
    outer = shapes.add_polygon('orbit-halo-outer', shapes.regular_points((x, 0.0), 0.55, 12), -0.002, 0.0)
    shapes.assign(outer, materials.flat_material('orbit-halo-outer', HALO_OUTER, 0.8))
    halo = shapes.add_polygon('orbit-halo', shapes.regular_points((x, 0.0), 0.4, 12), -0.003, 0.0)
    shapes.assign(halo, materials.flat_material('orbit-halo', HALO, 1.05))
    tips = []
    for i in range(7):
        angle = math.tau * i / 7
        centre = (x + math.cos(angle) * 0.3, math.sin(angle) * 0.3)
        add_two_tone_shard('orbit-shard-%d' % i, centre, 0.14, 0.04, angle + math.pi / 2, BODY[5], SHADE[5], rim=False, strength=1.6, y=-0.05)
        tips.append((centre[0], -0.06, centre[1]))
    core = shapes.add_polygon('orbit-core', shapes.regular_points((x, 0.0), 0.1, 8), -0.06, 0.01)
    shapes.assign(core, pulsing(materials.flat_material('orbit-core', BODY[5], 10.0)))
    add_lightning(x, tips, rng)


def add_lightning(x, tips, rng):
    bolt = materials.flat_material('lightning', BODY[5], 7.0)
    core = (x, -0.06, 0.0)
    odd = [bolt_tube('bolt-a-%d' % i, core, tip, bolt, rng) for i, tip in enumerate(tips[0::3])]
    even = [bolt_tube('bolt-b-%d' % i, core, corner, bolt, rng) for i, corner in enumerate(((x + 0.5, -0.06, 0.5), (x - 0.5, -0.06, -0.5), (x - 0.5, -0.06, 0.5)))]
    stage.blink(odd, (1, 3))
    stage.blink(even, (2,))


def bolt_tube(name, start, end, material, rng):
    """A square-section polyline, so the bolt reads as a drawn zigzag, not a glowing wire."""
    return shapes.assign(shapes.add_tube(name, shapes.jagged_path(start, end, rng, 5, 0.06), 0.012, resolution=0), material)
