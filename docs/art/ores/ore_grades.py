"""
The grade channels of #151 as Blender layers (#144): G1 form (sparse, matte), G2 sheen (denser,
specular, a glint baked into the albedo), G3 structure (three-dimensional, rim-lit, sparkle
points), G4 inner light (lit from inside, a core, pulsing veins to the cell corners) and G5 its
own effect (hovering forms, dichroic body, a white core, arcs to the shards and one cell corner).
Each grade keeps every channel below it. The family decides the shape of the marks
(ore_families.py); this module decides how the marks are placed, what they are made of and what
glows. Colours come from the family row of src/features/ore-visuals/oreLooks.json: the hue inside
the family's band at the variant's position, the luma inside the family's band at the grade's
mid tier (the kernel rank t / (t + 4)), the glow in the family's own hue, white at the top.
"""

import colorsys
import math

import bpy
import ore_materials as materials
import ore_shapes as shapes
import ore_stage as stage
from mathutils import Vector

HALF_RANK_TIER = 4
# A tier in the middle of each grade's range (#140 thresholds 4, 12, 30, 70; G5 ramps to 97).
MID_TIER_OF_GRADE = {1: 2, 2: 7, 3: 20, 4: 50, 5: 83}
GLOW_LUMA = 0.72
CORE_LUMA = 0.92
PULSE = ((1, 0.7), (2, 1.0), (3, 0.85))
# Emission strengths; the bake divides by `coreEmissionMax` so the map holds strength / 4.
RIM_STRENGTH = {3: 0.45, 4: 0.6, 5: 0.7}
CORE_STRENGTH = {4: 2.0, 5: 4.0}
VEIN_STRENGTH = 0.9
ARC_STRENGTH = 3.0
SPARKLE_STRENGTH = 2.5
SPARKLES = {3: 5, 4: 4, 5: 3}
HOVER_Y = -0.12
METALLIC_FAMILIES = ('metal', 'relic', 'ancient')
GLASSY_FAMILIES = ('crystal', 'cryo', 'energy', 'exotic')


# --- colours ---------------------------------------------------------------------------------------


def hex_of_rgb(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(channel * 255))) for channel in rgb)


def luma_of_rgb(rgb):
    """Rec. 601, the kernel's `lumaOf` in src/systems/render/colour.ts."""
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def with_luma(rgb, target):
    """The kernel's `withLuma`: scale toward black or mix toward white, both linear in luma."""
    luma = luma_of_rgb(rgb)
    if luma >= target:
        factor = 0.0 if luma == 0 else target / luma
        return tuple(min(1.0, channel * factor) for channel in rgb)
    share = (target - luma) / (1 - luma)
    return tuple(channel + (1 - channel) * share for channel in rgb)


def rank_of_tier(tier):
    return tier / (tier + HALF_RANK_TIER)


def variant_hue(family, variant):
    low, high = family['hueBand']
    return low + (high - low) * (variant + 0.5) / family['variants']


def body_hex(family, variant, grade):
    """The family's hue at the variant's position, at the grade's mid-tier luma in the family band."""
    low, high = family['lumaBand']
    base = colorsys.hls_to_rgb(variant_hue(family, variant) / 360.0, 0.5, family['saturation'])
    return hex_of_rgb(with_luma(base, low + (high - low) * rank_of_tier(MID_TIER_OF_GRADE[grade])))


def glow_hex(family, luma=GLOW_LUMA):
    emission = family['emission']
    base = colorsys.hls_to_rgb(emission['hue'] / 360.0, 0.5, emission['saturation'])
    return hex_of_rgb(with_luma(base, luma))


def dichroic_hex(family):
    hue = family.get('dichroicHue', family['emission']['hue'])
    return hex_of_rgb(with_luma(colorsys.hls_to_rgb(hue / 360.0, 0.5, 0.7), GLOW_LUMA))


def core_hex(family):
    return glow_hex(family, CORE_LUMA)


# --- body materials, one per grade ------------------------------------------------------------------


def body_material(family, variant, grade):
    """The material of the family's marks at this grade; `albedo_hex` is what the albedo bake writes."""
    name = 'ore-%s-v%d-g%d' % (family['id'], variant, grade)
    body = body_hex(family, variant, grade)
    builder = {1: matte_body, 2: sheen_body, 3: structure_body, 4: inner_light_body, 5: own_effect_body}[grade]
    material = builder(name, family, body)
    material['albedo_hex'] = body
    return material


def matte_body(name, family, body):
    return materials.surface_material(name, body, roughness=0.92)


def sheen_body(name, family, body):
    if family['id'] in METALLIC_FAMILIES:
        return materials.surface_material(name, body, metallic=0.85, roughness=0.32, coat=0.35)
    if family['id'] in GLASSY_FAMILIES:
        return materials.surface_material(name, body, roughness=0.12, transmission=0.25, ior=1.5, coat=0.5)
    return materials.surface_material(name, body, roughness=0.28, coat=0.65)


def structure_body(name, family, body):
    """Three-dimensional and rim-lit: metals polished with a facing glow, the rest translucent."""
    glow = glow_hex(family)
    if family['id'] in METALLIC_FAMILIES:
        material = materials.surface_material(name, body, metallic=0.9, roughness=0.25, coat=0.3,
                                              emission_hex=glow, emission_strength=0.0)
        return drive_emission_by_facing(material, RIM_STRENGTH[3])
    return materials.rim_lit_glass(name, body, glow, RIM_STRENGTH[3], roughness=0.08, transmission=0.6)


def inner_light_body(name, family, body):
    """Lit from inside: a translucent body with a faint glow of its own and a stronger rim."""
    glow = glow_hex(family)
    if family['id'] in METALLIC_FAMILIES:
        material = materials.surface_material(name, body, metallic=0.7, roughness=0.3,
                                              emission_hex=glow, emission_strength=0.0)
        return drive_emission_by_facing(material, RIM_STRENGTH[4], floor=0.2)
    material = materials.rim_lit_glass(name, body, glow, RIM_STRENGTH[4], roughness=0.06, transmission=0.7)
    return material


def own_effect_body(name, family, body):
    """Dichroic: the body hue on the facing side shifting to the dichroic hue on the grazing edge."""
    material = materials.rim_lit_glass(name, body, core_hex(family), RIM_STRENGTH[5], roughness=0.04, transmission=0.55)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    facing = tree.nodes.new('ShaderNodeLayerWeight')
    facing.inputs['Blend'].default_value = 0.5
    shift = tree.nodes.new('ShaderNodeMixRGB')
    shift.inputs['Color1'].default_value = materials.rgba(materials.linear_of_hex(body))
    shift.inputs['Color2'].default_value = materials.rgba(materials.linear_of_hex(dichroic_hex(family)))
    tree.links.new(facing.outputs['Facing'], shift.inputs['Fac'])
    tree.links.new(shift.outputs['Color'], bsdf.inputs['Base Color'])
    return material


def drive_emission_by_facing(material, strength, floor=0.0):
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    facing = tree.nodes.new('ShaderNodeLayerWeight')
    facing.inputs['Blend'].default_value = 0.65
    scale = tree.nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY_ADD'
    scale.inputs[1].default_value = strength
    scale.inputs[2].default_value = floor
    tree.links.new(facing.outputs['Facing'], scale.inputs[0])
    tree.links.new(scale.outputs['Value'], bsdf.inputs['Emission Strength'])
    return material


def glow_material(name, hex_colour, strength, pulse=False):
    material = materials.glow_material(name, hex_colour, strength)
    material['albedo_hex'] = hex_colour
    if pulse:
        materials.pulse_emission(material, PULSE)
    return material


# --- placement by grade ------------------------------------------------------------------------------


def relief_of_grade(grade):
    """How far a mark stands off the face and how it leans: flat, domed, standing or hovering."""
    return {1: 'flat', 2: 'dome', 3: 'stand', 4: 'stand', 5: 'hover'}[grade]


def mark_count(grade, family_density):
    """Sparse at G1, denser at G2, a cluster at G3, a ring at G4, a crown at G5."""
    base = {1: 8, 2: 10, 3: 8, 4: 8, 5: 7}[grade]
    return max(3, round(base * family_density))


def placements(grade, count, rng, cell):
    """(centre_x, centre_z, size, angle) per mark in the cell's frame."""
    cx, cz = cell
    if grade == 1:
        return [(cx + px, cz + pz, rng.uniform(0.09, 0.14), rng.uniform(0, math.tau))
                for px, pz in shapes.scatter_positions(rng, count, 0.36, 0.17)]
    if grade == 2:
        return [(cx + px, cz + pz, rng.uniform(0.08, 0.13), rng.uniform(0, math.tau))
                for px, pz in shapes.scatter_positions(rng, count, 0.36, 0.17)]
    if grade == 3:
        root = (cx + rng.uniform(-0.08, 0.08), cz + rng.uniform(-0.08, 0.08))
        placed = []
        for i in range(count):
            angle = i / count * math.tau + rng.uniform(-0.2, 0.2)
            reach = rng.uniform(0.12, 0.38)
            placed.append((root[0] + math.cos(angle) * reach, root[1] + math.sin(angle) * reach,
                           rng.uniform(0.1, 0.17), angle))
        return placed
    if grade == 4:
        placed = [(cx + px, cz + pz, rng.uniform(0.09, 0.13), math.atan2(pz, px))
                  for px, pz in shapes.ring_positions(count, 0.27, rng.uniform(0, math.tau))]
        for turn in (0.1, 0.45, 0.8):
            angle = turn * math.tau
            placed.append((cx + math.cos(angle) * 0.42, cz + math.sin(angle) * 0.42, 0.08, angle))
        return placed
    placed = [(cx + px, cz + pz, rng.uniform(0.1, 0.14), math.atan2(pz, px))
              for px, pz in shapes.ring_positions(count, 0.3, rng.uniform(0, math.tau))]
    return placed


# --- the glow layers -----------------------------------------------------------------------------------


def centre_of(obj):
    """The world centre of an object's bounds; a tube's origin sits at the world origin."""
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return sum(corners, Vector()) / len(corners)


def extent_of(obj):
    bpy.context.view_layer.update()
    return max(obj.dimensions) if max(obj.dimensions) > 0 else 0.05


def add_glints(marks, family, rng):
    """G2: a small pale highlight on each mark's upper-left, baked into the albedo (#151 fix 1)."""
    glint = materials.surface_material('glint-' + family['id'], '#e8e2d6', roughness=0.4)
    glint['albedo_hex'] = '#e8e2d6'
    points = []
    for i, mark in enumerate(marks):
        if rng.random() < 0.35:
            continue
        x, y, z = centre_of(mark)
        size = extent_of(mark) * 0.09
        points.append(shapes.assign(shapes.add_icosphere('glint-%d' % i, size, (x - size * 1.6, y - 0.012, z + size * 1.6),
                                                         subdivisions=1, scale=(1.0, 0.4, 1.0)), glint))
    return points


def add_sparkles(cell, family, grade, rng, y=-0.06):
    """G3+: tiny bright points, the structure's glints; the game animates sparkle in the shader."""
    cx, cz = cell
    sparkle = glow_material('sparkle-%s-g%d' % (family['id'], grade), core_hex(family), SPARKLE_STRENGTH)
    return [shapes.assign(shapes.add_icosphere('sparkle-%d' % i, 0.011, (cx + px, y, cz + pz), subdivisions=1), sparkle)
            for i, (px, pz) in enumerate(shapes.scatter_positions(rng, SPARKLES[grade], 0.3, 0.09))]


def add_core(cell, family, grade, radius):
    """G4 and G5: the inner light itself, pulsing, held under the bloom's clipping (#151 fix)."""
    cx, cz = cell
    colour = glow_hex(family) if grade == 4 else core_hex(family)
    y = 0.02 if grade == 4 else -0.08
    core = shapes.add_icosphere('core', radius, (cx, y, cz), subdivisions=3)
    return shapes.assign(core, glow_material('core-%s-g%d' % (family['id'], grade), colour, CORE_STRENGTH[grade], pulse=True))


def add_veins(cell, family, rng, start_radius=0.3, end_radius=0.68):
    """G4: four pulsing veins from under the marks to the cell's corners (#151 G4 "veins through the tile")."""
    cx, cz = cell
    vein = glow_material('vein-' + family['id'], vein_hex(family), VEIN_STRENGTH, pulse=True)
    veins = []
    for i in range(4):
        angle = math.pi / 4 + i * math.pi / 2
        start = (cx + math.cos(angle) * start_radius, -0.005, cz + math.sin(angle) * start_radius)
        end = (cx + math.cos(angle) * end_radius, -0.005, cz + math.sin(angle) * end_radius)
        veins.append(shapes.assign(shapes.add_tube('vein-%d' % i, shapes.jagged_path(start, end, rng, 6, 0.02), 0.008), vein))
    return veins


def vein_hex(family):
    """Volcanic's veins are white-gold, never orange (#151 heat rule); the rest glow in their hue."""
    return glow_hex(family, 0.8)


def add_arcs(cell, family, tips, rng):
    """G5: white-blue arcs from the core to the hovering marks, and one to a cell corner (#151 borrow 2)."""
    cx, cz = cell
    arc = glow_material('arc-' + family['id'], '#dff2ff', ARC_STRENGTH)
    core = (cx, -0.08, cz)
    odd = [arc_tube('arc-a-%d' % i, core, tip, arc, rng) for i, tip in enumerate(tips[0::2])]
    even = [arc_tube('arc-b-%d' % i, core, tip, arc, rng) for i, tip in enumerate(tips[1::2])]
    even.append(arc_tube('arc-b-corner', core, (cx + 0.49, -0.02, cz + 0.49), arc, rng))
    stage.blink(odd, (1, 3))
    stage.blink(even, (2,))
    return odd + even


def arc_tube(name, start, end, material, rng):
    return shapes.assign(shapes.add_tube(name, shapes.jagged_path(start, end, rng, 7, 0.05), 0.006, resolution=1), material)


def add_neighbour_light(cell, family):
    """G5 lights the cells next to it; a review-render light only, the game uses its light buffer."""
    cx, cz = cell
    return stage.add_point_light('aether-light', (cx, -0.2, cz), glow_hex(family), 25.0)
