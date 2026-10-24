"""
The gem heroes of P1 and P3 (ticket 785, the GD lock on #746: "a faceted outline and at least one
highlight on frame 1"), as Blender builders registered under the row's silhouette and pattern in
hero_marks.PATTERN_BUILDERS: P1's Diamond (`octahedra`, `lustrous`), Emerald (`prisms`, `faceted`)
and Ruby (`drops`, `faceted`) of ticket 713, and P3's Blue Topaz (`blocks`, `clear`), Orichalcum
(`lattices`, `lustrous`) and Heart Diamond (`octahedra`, `fiery`) of #453. Every stone is
flat-shaded so each facet catches the key lamp whole, and wears the shared facet-glint treatment
of ticket 744 (`hero_marks.facet_glint`). The look follows the species' mineral-skin row
(docs/art/mineral-skins: lustrous octahedra with fire sparks, emerald prisms with step facets,
faceted pears, wedge blocks, a lattice trellis, octahedra with facet fire), in the hue slot's
colour; the rarity frame and glow stay the shader's (#450).
"""

import math

import bpy
import hero_marks as marks
import hero_species as species
import ore_materials as materials
import ore_shapes as shapes
from mathutils import Vector

# How deep a stone sits: its centre this share of its radius behind the face reads as "sunk to the waist".
WAIST = 0.0


def add_octahedron(name, radius, location, rotation=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    """A regular octahedron, the diamond habit: six vertices, eight triangular facets."""
    mesh = bpy.data.meshes.new(name)
    vertices = [(radius, 0, 0), (-radius, 0, 0), (0, radius, 0), (0, -radius, 0), (0, 0, radius), (0, 0, -radius)]
    faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_euler = rotation
    obj.scale = scale
    bpy.context.collection.objects.link(obj)
    return marks.faceted(obj)


# --- octahedra, lustrous: P1's diamond, five sharp octahedra with fire sparks on the crowns ------------


def build_lustrous_octahedra(hero, centre, rng):
    body = adamant_glass(hero)
    spark = marks.spark_material(hero)
    stones = []
    phase = rng.uniform(0, math.tau)
    layout = [(px, pz, rng.uniform(0.18, 0.22)) for px, pz in shapes.ring_positions(4, 0.27, phase)]
    layout.append((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), 0.13))
    for i, (px, pz, radius) in enumerate(layout):
        at = (centre[0] + px, centre[1] + pz)
        # A point toward the camera, turned a little, so the outline is a square with a lit crown.
        stone = add_octahedron('%s-mark-%d' % (hero['id'], i), radius, (at[0], radius * 0.05, at[1]),
                               rotation=(math.pi / 2 + rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, math.tau)))
        stones.append(shapes.assign(stone, body))
        if i < 3:
            stones.append(fire_spark(hero, i, at, radius, rng, spark))
    return stones


def fire_spark(hero, i, at, radius, rng, spark):
    """A small four-rayed spark on the crown: the skin's fire sparks, emission alone."""
    points = shapes.star_points(at, radius * 0.5, radius * 0.08, arms=4, phase=rng.uniform(0, math.pi / 2))
    return shapes.assign(shapes.add_polygon('%s-spark-%d' % (hero['id'], i), points, -radius - 0.02, 0.004), spark)


def adamant_glass(hero):
    """Near-white diamond: the highest IOR of the gems, a hard coat and the sharpest glint."""
    body = species.slot_hex(hero['hue'])
    material = marks.surface_gem(hero, body, roughness=0.02, transmission=0.04, ior=2.42)
    marks.drive_rim(material, 0.3, floor=0.22)
    return marks.facet_glint(material, strength=1.8, sharpness=20.0)


# --- prisms, faceted: P1's emerald, stubby hexagonal prisms standing on end ----------------------------


def build_faceted_prisms(hero, centre, rng):
    body = jardin_glass(hero)
    prisms = []
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 5, 0.28, 0.24)):
        radius = rng.uniform(0.09, 0.12)
        length = rng.uniform(0.22, 0.3)
        at = (centre[0] + px, centre[1] + pz)
        rotation = shapes.tilt_towards_camera(rng, 32.0)
        prisms.append(shapes.assign(step_prism(hero, i, radius, length, at, rotation), body))
    return prisms


def step_prism(hero, i, radius, length, at, rotation):
    """A hexagonal prism standing toward the camera with a chamfered end: the step facets."""
    prism = shapes.add_prism('%s-mark-%d' % (hero['id'], i), radius, length, (at[0], -length * 0.1, at[1]), rotation=rotation)
    return shapes.bevel(prism, radius * 0.22, segments=1)


def jardin_glass(hero):
    """Deep green with the jardin, the garden of pale inclusions, in soft noise over the body."""
    body = species.slot_hex(hero['hue'])
    pale = species.slot_hex(hero['hue'], luma=min(0.9, hero['hue']['luma'] + 0.22))
    material = marks.surface_gem(hero, body, roughness=0.06, transmission=0.2, ior=1.58)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    noise = tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 14.0
    noise.inputs['Detail'].default_value = 3.0
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = materials.rgba(materials.linear_of_hex(body))
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = materials.rgba(materials.linear_of_hex(pale))
    tree.links.new(coords.outputs['Object'], noise.inputs['Vector'])
    tree.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    marks.drive_rim(material, 0.35, floor=0.1)
    return marks.facet_glint(material, strength=1.4, sharpness=26.0)


# --- drops, faceted: P1's ruby, five faceted pears radiating from a heart ------------------------------


def build_faceted_drops(hero, centre, rng):
    body = pigeon_blood_glass(hero)
    drops = []
    count = 5
    phase = rng.uniform(0, math.tau)
    for i in range(count):
        angle = phase + i / count * math.tau + rng.uniform(-0.15, 0.15)
        reach = rng.uniform(0.2, 0.26)
        at = (centre[0] + math.cos(angle) * reach, centre[1] + math.sin(angle) * reach)
        drops += pear(hero, i, at, angle, rng.uniform(0.1, 0.125), body)
    return drops


def pear(hero, i, at, angle, radius, body):
    """A faceted pear: a twenty-faced stone drawn out toward the heart, ending in a six-sided point."""
    toward_heart = Vector((-math.cos(angle), 0.0, -math.sin(angle)))
    stone = shapes.add_icosphere('%s-mark-%d' % (hero['id'], i), radius, (at[0], radius * 0.1, at[1]), subdivisions=1,
                                 scale=(1.0, 0.8, 1.2), rotation=spin_in_face(toward_heart))
    tip_at = Vector((at[0], radius * 0.1, at[1])) + toward_heart * (radius * 1.2 + radius * 0.5)
    tip = shapes.add_cone('%s-tip-%d' % (hero['id'], i), radius * 0.78, radius * 1.1, tuple(tip_at),
                          rotation=toward_heart.to_track_quat('Z', 'Y').to_euler())
    return [shapes.assign(marks.faceted(stone), body), shapes.assign(tip, body)]


def spin_in_face(direction):
    """The rotation turning a shape's local Z along `direction` in the face plane (a spin about Y)."""
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


def pigeon_blood_glass(hero):
    body = species.slot_hex(hero['hue'])
    material = marks.surface_gem(hero, body, roughness=0.05, transmission=0.15, ior=1.77)
    marks.drive_rim(material, 0.3, floor=0.1)
    return marks.facet_glint(material, strength=1.5, sharpness=28.0)


# --- blocks, clear: P3's blue topaz, chamfered blocks with wedge ends -----------------------------------


def build_clear_blocks(hero, centre, rng):
    body = limpid_glass(hero)
    blocks = []
    phase = rng.uniform(0, math.tau)
    for i, (px, pz) in enumerate(shapes.ring_positions(4, 0.25, phase)):
        size = rng.uniform(0.16, 0.2)
        at = (centre[0] + px + rng.uniform(-0.03, 0.03), centre[1] + pz + rng.uniform(-0.03, 0.03))
        blocks += wedge_block(hero, i, at, size, rng, body)
    return blocks


def wedge_block(hero, i, at, size, rng, body):
    """A long rectangular block, chamfered, with a four-sided wedge on one end: topaz's cleavage."""
    along = Vector((math.cos(rng.uniform(0, math.pi)), 0.0, 0.0))
    along = Vector((along.x, -0.08, math.sqrt(max(0.0, 1.0 - along.x * along.x)))).normalized()
    centre = Vector((at[0], -size * 0.1, at[1]))
    block = shapes.add_cube('%s-mark-%d' % (hero['id'], i), size, tuple(centre), scale=(1.0, 0.8, 1.6), rotation=spin_in_face(along))
    block = shapes.bevel(block, size * 0.12, segments=1)
    wedge = shapes.add_cone('%s-wedge-%d' % (hero['id'], i), size * 0.68, size * 0.6, tuple(centre + along * (size * 0.8 + size * 0.3)),
                            rotation=spin_in_face(along), sides=4)
    return [shapes.assign(block, body), shapes.assign(wedge, body)]


def limpid_glass(hero):
    body = species.slot_hex(hero['hue'])
    material = marks.surface_gem(hero, body, roughness=0.04, transmission=0.35, ior=1.62)
    marks.drive_rim(material, 0.35, floor=0.1)
    return marks.facet_glint(material, strength=1.3, sharpness=24.0)


# --- lattices, lustrous: P3's orichalcum, a trellis of hammered gold bars ------------------------------


def build_lustrous_lattices(hero, centre, rng):
    body = hammered_metal(hero)
    angle = rng.uniform(0, math.pi)
    bars = []
    for k, turn in enumerate((0.0, math.pi / 3)):
        for j, offset in enumerate((-0.2, 0.0, 0.2)):
            bars.append(lattice_bar(hero, '%d-%d' % (k, j), centre, angle + turn, offset + rng.uniform(-0.02, 0.02),
                                    0.6 - abs(offset) * 0.8, rng, body))
    return bars


def lattice_bar(hero, tag, centre, angle, offset, length, rng, body):
    """A square bar lying along the face, proud of it, its length across the cell."""
    across = (-math.sin(angle), math.cos(angle))
    at = (centre[0] + across[0] * offset, -0.045, centre[1] + across[1] * offset)
    rotation = Vector((math.cos(angle), rng.uniform(-0.06, 0.06), math.sin(angle))).to_track_quat('Z', 'Y').to_euler()
    bar = shapes.add_prism('%s-mark-%s' % (hero['id'], tag), 0.038, length, at, rotation=rotation, sides=4)
    return shapes.assign(bar, body)


def hammered_metal(hero):
    """Bright gold-yellow metal with hammered facets: a cell noise bump, a low roughness between."""
    body = species.slot_hex(hero['hue'])
    material = materials.surface_material('hero-' + hero['id'], body, metallic=1.0, roughness=0.22, coat=0.3,
                                          emission_hex=species.slot_hex(hero['hue'], luma=0.9), emission_strength=0.0)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    dents = tree.nodes.new('ShaderNodeTexVoronoi')
    dents.inputs['Scale'].default_value = 14.0
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    tree.links.new(coords.outputs['Object'], dents.inputs['Vector'])
    tree.links.new(dents.outputs['Distance'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    material['albedo_hex'] = body
    marks.drive_rim(material, 0.3, floor=0.12)
    return marks.facet_glint(material, strength=1.2, sharpness=18.0)


# --- octahedra, fiery: P3's heart diamond, three octahedra tipped on their side with fire inside -------


def build_fiery_octahedra(hero, centre, rng):
    body = fiery_glass(hero)
    fire = inner_fire_material(hero)
    stones = []
    phase = rng.uniform(0, math.tau)
    for i in range(3):
        angle = phase + i / 3 * math.tau + rng.uniform(-0.2, 0.2)
        radius = rng.uniform(0.2, 0.24)
        at = (centre[0] + math.cos(angle) * 0.25, centre[1] + math.sin(angle) * 0.25)
        # Tipped on its side (the skin's reading): the crown point leans well off the camera, so
        # the camera sees a long edge with the facets falling away either side of it.
        rotation = (math.pi / 2 + rng.choice((-1, 1)) * rng.uniform(0.55, 0.75), rng.uniform(-0.2, 0.2), rng.uniform(0, math.tau))
        stone = add_octahedron('%s-mark-%d' % (hero['id'], i), radius, (at[0], radius * 0.1, at[1]), rotation=rotation)
        stones.append(shapes.assign(stone, body))
        stones.append(shapes.assign(shapes.add_polygon('%s-fire-%d' % (hero['id'], i), shapes.regular_points(at, radius * 0.22, 4, phase + i),
                                                       -radius * 0.7 - 0.015, 0.004), fire))
    return stones


def inner_fire_material(hero):
    """The fire a heart diamond flashes: a warm pink spark on the crown, emission alone, off the heat band."""
    fire = species.slot_hex(dict(hero['hue'], hue=8, saturation=0.85), luma=0.82)
    material = materials.flat_material('hero-%s-fire' % hero['id'], fire, strength=1.4)
    material['albedo_hex'] = fire
    return material


def fiery_glass(hero):
    """Blush white, with the fire: a warm flash just off the slot, driven by the facing term."""
    body = species.slot_hex(hero['hue'])
    fire = species.slot_hex(dict(hero['hue'], hue=8, saturation=0.75), luma=0.72)
    material = materials.surface_material('hero-' + hero['id'], body, roughness=0.02, transmission=0.25, ior=2.42, coat=0.5,
                                          emission_hex=fire, emission_strength=0.0)
    material['albedo_hex'] = body
    marks.drive_rim(material, 0.45, floor=0.2)
    return marks.facet_glint(material, strength=1.8, sharpness=20.0)


marks.PATTERN_BUILDERS.update({
    ('octahedra', 'lustrous'): build_lustrous_octahedra,
    ('prisms', 'faceted'): build_faceted_prisms,
    ('drops', 'faceted'): build_faceted_drops,
    ('blocks', 'clear'): build_clear_blocks,
    ('lattices', 'lustrous'): build_lustrous_lattices,
    ('octahedra', 'fiery'): build_fiery_octahedra,
})
