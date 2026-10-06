"""
Direction A, "Assay" (#150): mineralogical realism. Each grade is a real mineral habit rendered
with physically based materials, and the ladder reads like an assayer's tray: earthy seams, then a
metallic botryoidal crust, then a translucent crystal cluster, then a split geode lit from inside,
then an aether formation hovering off the rock with arcs between its shards. The demo family is
azurite (#140: botryoidal bubbles, blue 215-235 deg); emission stays in the family's hue, white at
the top, as #151 asks (cool hues, white or gold; orange is lava's).
"""

import math

import ladder_scene as stage
import ore_materials as materials
import ore_shapes as shapes

ID = 'assay'
TITLE = 'Assay (mineralogical)'
LIT = True

BODY = {1: '#2e3246', 2: '#8fa9cc', 3: '#8cc0ee', 4: '#b8dcff', 5: '#9fd0ff'}
SHELL = '#4a3a2c'
GLOW = '#7fc0ff'
CORE = '#cfe6ff'
ARC = '#dff2ff'
PULSE = ((1, 0.7), (2, 1.0), (3, 0.85))


def build_tile(grade, x, rock_hex, rng):
    stage.add_rock_slab(grade, materials.rock_material('rock-g%d' % grade, rock_hex))
    {1: build_seams, 2: build_crust, 3: build_cluster, 4: build_geode, 5: build_aether_ring}[grade](x, rng)


# --- G1 form: dark seams in the rock --------------------------------------------------------------


def build_seams(x, rng):
    """Flat slivers half-sunk in the rock, like weathered seams, and a few grains between them."""
    seam = materials.surface_material('assay-seam', BODY[1], roughness=0.95)
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 9, 0.38, 0.14)):
        radius = rng.uniform(0.09, 0.15)
        sliver = shapes.add_icosphere('seam-%d' % i, radius, (x + px, 0.012, pz),
                                      scale=(1.0, 0.22, rng.uniform(0.25, 0.4)), rotation=(0, rng.uniform(-0.7, 0.7), 0))
        shapes.assign(sliver, seam)
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 5, 0.4, 0.1)):
        grain = shapes.add_icosphere('grain-%d' % i, rng.uniform(0.02, 0.035), (x + px, 0.0, pz), subdivisions=1, scale=(1.0, 0.5, 1.0))
        shapes.assign(grain, seam)


# --- G2 sheen: botryoidal metallic crust ----------------------------------------------------------


def build_crust(x, rng):
    metal = crust_material()
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 7, 0.33, 0.2)):
        add_botryoid('crust-%d' % i, (x + px, pz), rng.uniform(0.085, 0.12), metal, rng)


def crust_material():
    return materials.surface_material('assay-crust', BODY[2], metallic=0.9, roughness=0.38, coat=0.3)


def add_botryoid(name, centre, radius, material, rng):
    """A dome with three smaller bubbles grown into its flank: the azurite habit."""
    cx, cz = centre
    dome = shapes.add_icosphere(name, radius, (cx, -0.005, cz), scale=(1.0, 0.55, 1.0))
    shapes.assign(shapes.subdivide(dome), material)
    phase = rng.uniform(0, math.tau)
    for j in range(3):
        angle = phase + j * 2.1 + rng.uniform(-0.3, 0.3)
        size = radius * rng.uniform(0.35, 0.6)
        bubble = shapes.add_icosphere('%s-bubble-%d' % (name, j), size,
                                      (cx + math.cos(angle) * radius * 0.75, 0.0, cz + math.sin(angle) * radius * 0.75),
                                      scale=(1.0, 0.6, 1.0))
        shapes.assign(shapes.subdivide(bubble), material)


# --- G3 structure: a translucent crystal cluster breaking the cell edge ---------------------------


def build_cluster(x, rng):
    crystal = materials.rim_lit_glass('assay-crystal', BODY[3], GLOW, 0.4, roughness=0.05)
    metal = crust_material()
    centre = (x - 0.05, 0.0)
    for i in range(3):
        add_botryoid('bed-%d' % i, (centre[0] + rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12)), 0.07, metal, rng)
    for i in range(9):
        add_radiating_prism('crystal-%d' % i, centre, rng.uniform(0.04, 0.07), rng.uniform(0.24, 0.44), i / 9, crystal, rng)
    add_sparkles(x, rng, 6)


def add_radiating_prism(name, centre, radius, depth, turn, material, rng):
    """A hex prism growing out of the centre and leaning towards the camera."""
    angle = turn * math.tau + rng.uniform(-0.2, 0.2)
    lean = rng.uniform(0.6, 1.3)
    direction = (math.cos(angle), -lean, math.sin(angle))
    length = math.sqrt(1 + lean * lean)
    reach = 0.1 + depth * 0.4
    location = (centre[0] + direction[0] / length * reach, direction[1] / length * reach, centre[1] + direction[2] / length * reach)
    rotation = shapes.Vector(direction).to_track_quat('Z', 'Y').to_euler()
    prism = shapes.add_prism(name, radius, depth, location, rotation=rotation)
    shapes.assign(prism, material)


def add_sparkles(x, rng, count):
    """Tiny white points, half on the odd frames and half on the even one: the slow sparkle."""
    glint = materials.glow_material('assay-glint', CORE, 6.0)
    points = [shapes.assign(shapes.add_icosphere('glint-%d' % i, 0.011, (x + px, -0.06, pz), subdivisions=1), glint)
              for i, (px, pz) in enumerate(shapes.scatter_positions(rng, count, 0.3, 0.08))]
    stage.blink(points[::2], (1, 3))
    stage.blink(points[1::2], (2,))


# --- G4 inner light: a split geode, veins running out of it ---------------------------------------


def build_geode(x, rng):
    shell = materials.surface_material('assay-shell', SHELL, roughness=0.9)
    rim = shapes.add_torus('geode-rim', 0.3, 0.065, (x, 0.0, 0.0), rotation=(math.pi / 2, 0, 0), scale=(1.0, 1.0, 0.45))
    shapes.assign(rim, shell)
    lining = materials.rim_lit_glass('assay-lining', BODY[4], GLOW, 1.0)
    for i, (px, pz) in enumerate(shapes.ring_positions(14, 0.2)):
        add_lining_prism('lining-%d' % i, (x + px, pz), i / 14, lining, rng)
    add_outer_prisms(x, lining, rng)
    floor = shapes.add_prism('geode-floor', 0.26, 0.01, (x, 0.06, 0.0), rotation=shapes.facing_camera(), sides=24)
    shapes.assign(floor, pulsing(materials.glow_material('assay-floor', GLOW, 1.6)))
    core = shapes.add_icosphere('geode-core', 0.13, (x, 0.02, 0.0), subdivisions=3)
    shapes.assign(core, pulsing(materials.glow_material('assay-core', GLOW, 8.0)))
    add_veins(x, rng)
    add_sparkles(x, rng, 4)


def add_lining_prism(name, centre, turn, material, rng):
    angle = turn * math.tau
    tilt = math.radians(35)
    direction = (math.cos(angle) * math.sin(tilt), -math.cos(tilt), math.sin(angle) * math.sin(tilt))
    rotation = shapes.Vector(direction).to_track_quat('Z', 'Y').to_euler()
    prism = shapes.add_prism(name, rng.uniform(0.04, 0.05), 0.2, (centre[0], 0.03, centre[1]), rotation=rotation)
    shapes.assign(prism, material)


def add_outer_prisms(x, material, rng):
    """Three crystals standing out of the shell's rim: the structure channel kept under the new one."""
    for i, turn in enumerate((0.1, 0.45, 0.8)):
        angle = turn * math.tau
        root = (x + math.cos(angle) * 0.3, math.sin(angle) * 0.3)
        add_radiating_prism('outer-%d' % i, root, 0.045, 0.3, turn, material, rng)


def add_veins(x, rng):
    """Four veins from under the shell to the cell's corners: the inner light leaking into the rock."""
    vein = pulsing(materials.glow_material('assay-vein', GLOW, 4.0))
    for i in range(4):
        angle = math.pi / 4 + i * math.pi / 2
        start = (x + math.cos(angle) * 0.3, -0.005, math.sin(angle) * 0.3)
        end = (x + math.cos(angle) * 0.7, -0.005, math.sin(angle) * 0.7)
        shapes.assign(shapes.add_tube('vein-%d' % i, shapes.jagged_path(start, end, rng, 6, 0.02), 0.011), vein)


def pulsing(material):
    materials.pulse_emission(material, PULSE)
    return material


# --- G5 its own effect: a ring of shards hovering off the rock, arcs between them -----------------


def build_aether_ring(x, rng):
    shard = materials.rim_lit_glass('assay-shard', BODY[5], GLOW, 1.2, transmission=0.6)
    tips = [add_orbiting_shard('shard-%d' % i, x, i / 7, shard) for i in range(7)]
    core = shapes.add_icosphere('aether-core', 0.1, (x, -0.08, 0.0), subdivisions=3)
    shapes.assign(core, pulsing(materials.glow_material('assay-aether', CORE, 10.0)))
    add_arcs(x, tips, rng)
    stage.add_point_light('aether-light', (x, -0.2, 0.0), GLOW, 50.0)


def add_orbiting_shard(name, x, turn, material):
    """A shard on the ring, floating 0.12 m off the face and pointing along its orbit."""
    angle = turn * math.tau
    px, pz = math.cos(angle) * 0.3, math.sin(angle) * 0.3
    outward = (math.cos(angle), -0.45, math.sin(angle))
    rotation = shapes.Vector(outward).to_track_quat('Z', 'Y').to_euler()
    shard = shapes.add_cone(name, 0.05, 0.26, (x + px, -0.12, pz), rotation=rotation)
    shapes.assign(shard, material)
    return (x + px, -0.12, pz)


def add_arcs(x, tips, rng):
    arc = materials.glow_material('assay-arc', ARC, 6.0)
    core = (x, -0.08, 0.0)
    odd = [arc_tube('arc-a-%d' % i, core, tip, arc, rng) for i, tip in enumerate(tips[0::2])]
    even = [arc_tube('arc-b-%d' % i, core, tip, arc, rng) for i, tip in enumerate(tips[1::2])]
    even.append(arc_tube('arc-b-corner', core, (x + 0.5, -0.02, 0.5), arc, rng))
    stage.blink(odd, (1, 3))
    stage.blink(even, (2,))


def arc_tube(name, start, end, material, rng):
    return shapes.assign(shapes.add_tube(name, shapes.jagged_path(start, end, rng, 7, 0.05), 0.006, resolution=1), material)
