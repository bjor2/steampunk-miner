"""
Direction B, "Voltaic Foundry" (#150): the ore as engineered material. Every grade borrows a
shape from the workshop rather than the mineral cabinet: slag clinker, stepped galena cubes like
stacked ingots, glass insulator rods with brass collars, an iron filament cage round a gold lamp,
and a brass coil throwing white-blue arcs. It leans on #151's steampunk-fit test ("voltaic or
aether materials: arcing, humming, lamp-lit"). The body hue is the same azurite blue as the other
directions so the comparison is about style; the emission is gold (lamp) and white-blue (arc).
"""

import math

import ladder_scene as stage
import ore_materials as materials
import ore_shapes as shapes

ID = 'voltaic'
TITLE = 'Voltaic Foundry (engineered)'
LIT = True

SLAG = '#2b2d33'
SPECK = '#8a7a46'
STEEL = '#a3b4c8'
GLASS = '#a4cdf0'
BRASS = '#9a7a32'
IRON = '#3a3d44'
LAMP = '#ffd45a'
LAMP_RIM = '#ffe9b0'
PLASMA = '#e6f4ff'
ARC = '#dcefff'
PULSE = ((1, 0.7), (2, 1.0), (3, 0.85))


def build_tile(grade, x, rock_hex, rng):
    stage.add_rock_slab(grade, materials.rock_material('rock-g%d' % grade, rock_hex))
    {1: build_clinker, 2: build_stepped_cubes, 3: build_insulators, 4: build_filament_cage, 5: build_tesla_coil}[grade](x, rng)


# --- G1 form: clinker with a few brass specks ----------------------------------------------------


def build_clinker(x, rng):
    slag = materials.surface_material('voltaic-slag', SLAG, roughness=0.9)
    speck = materials.surface_material('voltaic-speck', SPECK, metallic=0.8, roughness=0.4)
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 11, 0.38, 0.12)):
        chunk = shapes.add_cube('clinker-%d' % i, rng.uniform(0.06, 0.11), (x + px, 0.01, pz),
                                scale=(rng.uniform(0.7, 1.4), rng.uniform(0.5, 0.9), rng.uniform(0.7, 1.4)),
                                rotation=(rng.uniform(0, 1), rng.uniform(0, 1), rng.uniform(0, 1)))
        shapes.assign(shapes.bevel(chunk, 0.012), slag)
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 5, 0.34, 0.15)):
        shapes.assign(shapes.add_cube('speck-%d' % i, 0.028, (x + px, -0.03, pz), rotation=(0.3, 0.2, rng.uniform(0, 1))), speck)


# --- G2 sheen: stepped cubes, stacked like ingots ------------------------------------------------


def build_stepped_cubes(x, rng):
    steel = steel_material()
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 6, 0.32, 0.22)):
        add_step_stack('stack-%d' % i, (x + px, pz), 0.14, steel, rng)


def steel_material():
    return materials.surface_material('voltaic-steel', STEEL, metallic=0.9, roughness=0.3, coat=0.4)


def add_step_stack(name, centre, size, material, rng, steps=3):
    """Three cubes, each smaller and set forward and aside of the one below: the galena habit."""
    cx, cz = centre
    spin = rng.uniform(-0.3, 0.3)
    for step in range(steps):
        scale = size * (1.0 - 0.3 * step)
        offset = step * size * 0.3
        cube = shapes.add_cube('%s-%d' % (name, step), scale, (cx + offset, -0.01 - step * scale * 0.5, cz + offset * 0.8), rotation=(0, spin, 0))
        shapes.assign(shapes.bevel(cube, 0.006, 1), material)


# --- G3 structure: insulator rods on brass collars -----------------------------------------------


def build_insulators(x, rng):
    glass = materials.rim_lit_glass('voltaic-glass', GLASS, LAMP_RIM, 0.7)
    brass = brass_material()
    add_insulator('rod-centre', (x, 0.0), 0.34, math.radians(12), glass, brass, rng, outward=(0.3, 1.0))
    for i, (px, pz) in enumerate(shapes.ring_positions(6, 0.27, math.pi / 6)):
        lean = math.radians(50) if i in (0, 3) else math.radians(rng.uniform(28, 40))
        add_insulator('rod-%d' % i, (x + px, pz), rng.uniform(0.22, 0.3), lean, glass, brass, rng, outward=(px, pz))
    add_glints(x, rng, 4)


def brass_material():
    return materials.surface_material('voltaic-brass', BRASS, metallic=1.0, roughness=0.35)


def add_insulator(name, centre, depth, lean, glass, brass, rng, outward=(1.0, 0.0)):
    """A hex rod standing off the rock in a brass collar, leaning outward by `lean`."""
    cx, cz = centre
    length = math.hypot(*outward) or 1.0
    direction = (outward[0] / length * math.sin(lean), -math.cos(lean), outward[1] / length * math.sin(lean))
    rotation = shapes.Vector(direction).to_track_quat('Z', 'X').to_euler()
    rod = shapes.add_prism(name, 0.055, depth, (cx + direction[0] * depth / 2, direction[1] * depth / 2, cz + direction[2] * depth / 2), rotation=rotation)
    shapes.assign(rod, glass)
    collar = shapes.add_prism(name + '-collar', 0.075, 0.035, (cx, -0.012, cz), rotation=shapes.facing_camera(), sides=12)
    shapes.assign(collar, brass)


def add_glints(x, rng, count):
    glint = materials.glow_material('voltaic-glint', LAMP_RIM, 6.0)
    points = [shapes.assign(shapes.add_icosphere('glint-%d' % i, 0.011, (x + px, -0.08, pz), subdivisions=1), glint)
              for i, (px, pz) in enumerate(shapes.scatter_positions(rng, count, 0.3, 0.1))]
    stage.blink(points[::2], (1, 3))
    stage.blink(points[1::2], (2,))


# --- G4 inner light: a filament lamp in an iron cage, gold veins to the corners -------------------


def build_filament_cage(x, rng):
    iron = materials.surface_material('voltaic-iron', IRON, metallic=0.85, roughness=0.4)
    for i, spin in enumerate((0.0, math.pi / 2, math.pi / 4, -math.pi / 4)):
        rotation = (math.pi / 2, 0.0, 0.0) if i == 0 else (0.0, spin, 0.0)
        shapes.assign(shapes.add_torus('cage-%d' % i, 0.3, 0.012, (x, -0.02, 0.0), rotation=rotation), iron)
    bulb = materials.surface_material('voltaic-bulb', '#ffffff', roughness=0.03, transmission=0.95, ior=1.5)
    shapes.assign(shapes.add_icosphere('bulb', 0.2, (x, -0.02, 0.0), subdivisions=3), bulb)
    filament = shapes.add_icosphere('filament', 0.1, (x, -0.02, 0.0), subdivisions=3)
    shapes.assign(filament, pulsing(materials.glow_material('voltaic-lamp', LAMP, 8.0)))
    add_gold_veins(x, rng)
    add_glints(x, rng, 3)


def add_gold_veins(x, rng):
    vein = pulsing(materials.glow_material('voltaic-vein', LAMP, 2.5))
    glass = materials.rim_lit_glass('voltaic-vein-glass', GLASS, LAMP_RIM, 0.7)
    brass = brass_material()
    for i, angle in enumerate((0.75, 2.4, 3.9, 5.5)):
        start = (x + math.cos(angle) * 0.3, -0.01, math.sin(angle) * 0.3)
        end = (x + math.cos(angle) * 0.72, -0.01, math.sin(angle) * 0.72)
        shapes.assign(shapes.add_tube('gold-vein-%d' % i, shapes.jagged_path(start, end, rng, 4, 0.02), 0.012), vein)
        add_insulator('vein-rod-%d' % i, (x + math.cos(angle) * 0.44, math.sin(angle) * 0.44), 0.12, 0.0, glass, brass, rng)


def pulsing(material):
    materials.pulse_emission(material, PULSE)
    return material


# --- G5 its own effect: a brass coil, a plasma core, arcs to the coil and the corners -------------


def build_tesla_coil(x, rng):
    brass = brass_material()
    coil = materials.surface_material('voltaic-coil', BRASS, metallic=1.0, roughness=0.55)
    shapes.assign(shapes.add_torus('coil', 0.34, 0.045, (x, -0.03, 0.0), rotation=(math.pi / 2, 0, 0)), coil)
    shapes.assign(shapes.add_torus('coil-winding', 0.34, 0.02, (x, -0.085, 0.0), rotation=(math.pi / 2, 0, 0)), coil)
    tips = [add_electrode('electrode-%d' % i, x, px, pz, brass) for i, (px, pz) in enumerate(shapes.ring_positions(4, 0.2, math.pi / 4))]
    core = shapes.add_icosphere('plasma-core', 0.09, (x, -0.1, 0.0), subdivisions=3)
    shapes.assign(core, pulsing(materials.glow_material('voltaic-plasma', PLASMA, 10.0)))
    add_coil_arcs(x, tips, rng)
    stage.add_point_light('coil-light', (x, -0.25, 0.0), ARC, 25.0)


def add_electrode(name, x, px, pz, material):
    """A brass cone floating inside the coil, its point at the plasma."""
    inward = (-px, 0.1, -pz)
    rotation = shapes.Vector(inward).to_track_quat('Z', 'Y').to_euler()
    shapes.assign(shapes.add_cone(name, 0.04, 0.14, (x + px, -0.14, pz), rotation=rotation, sides=12), material)
    return (x + px * 0.6, -0.12, pz * 0.6)


def add_coil_arcs(x, tips, rng):
    arc = materials.glow_material('voltaic-arc', ARC, 10.0)
    core = (x, -0.1, 0.0)
    coil_points = [(x + math.cos(a) * 0.34, -0.05, math.sin(a) * 0.34) for a in (0.35, 1.9, 3.5, 5.1, 1.1, 2.7, 4.3)]
    odd = [arc_tube('arc-a-%d' % i, core, point, arc, rng) for i, point in enumerate(coil_points[:4])]
    odd.append(arc_tube('arc-a-corner', core, (x - 0.5, -0.02, 0.5), arc, rng))
    even = [arc_tube('arc-b-%d' % i, core, point, arc, rng) for i, point in enumerate(coil_points[4:])]
    even += [arc_tube('arc-b-tip-%d' % i, core, tip, arc, rng) for i, tip in enumerate(tips[:2])]
    stage.blink(odd, (1, 3))
    stage.blink(even, (2,))


def arc_tube(name, start, end, material, rng):
    return shapes.assign(shapes.add_tube(name, shapes.jagged_path(start, end, rng, 7, 0.05), 0.006, resolution=1), material)
