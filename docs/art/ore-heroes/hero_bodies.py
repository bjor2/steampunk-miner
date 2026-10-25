"""
The shared treatment of the non-gem heroes of P3 to P5 (ticket 853 under #647; VS ruling (b) of
24 Oct: "an epic looks rarer than a rare, and neither looks like a gem"): bodies in the species'
hue slot that stay matte, with a low rim and no facet glint, so a non-gem never outscores its
planet's cheapest gem on Systems' showiness term (the price-order rule of ticket 785, read from
hero-reads.json: the share of a tile that is brighter than 0.72 or more saturated than 0.5). A
rare is one such body; an epic adds a second tone in zones or bands and one sheen mark, never a
glint. The node helpers here build those zones from the ore stage's textures, looked up by type.
"""

import bpy
import hero_marks as marks
import hero_species as species
import ore_materials as materials

# Emission tints stay under the bright threshold of hero_reads.py (0.72), so a sheen reads as a
# soft lift against the body and never as a gem's highlight.
SHEEN_LUMA = 0.68
# How a rim lights a non-gem: a hair of the facing term, a hair all over.
RIM = {'rare': (0.15, 0.03), 'epic': (0.2, 0.05)}


def body_hex(hero, luma=None):
    return species.slot_hex(hero['hue'], luma=luma)


def shifted_hue(slot, degrees, saturation=None):
    return dict(slot, hue=(slot['hue'] + degrees) % 360, saturation=slot['saturation'] if saturation is None else saturation)


def matte_body(hero, metallic=0.0, roughness=0.55, coat=0.0, transmission=0.0, ior=1.5, name=None):
    """The hero's body: its hue slot colour, lit by the lamp alone but for a faint rim."""
    body = body_hex(hero)
    material = materials.surface_material(name or 'hero-' + hero['id'], body, metallic=metallic, roughness=roughness,
                                          transmission=transmission, ior=ior, coat=coat,
                                          emission_hex=body_hex(hero, luma=SHEEN_LUMA), emission_strength=0.0)
    strength, floor = RIM[hero['rarity']]
    marks.drive_rim(material, strength, floor=floor)
    material['albedo_hex'] = body
    return material


def accent_body(hero, name, saturation, luma, roughness=0.6, coat=0.0):
    """A second material of the hero in a quieter tone on its own hue: a cortex, a matrix, a crust."""
    tint = species.slot_hex(shifted_hue(hero['hue'], 0, saturation), luma=luma)
    material = materials.surface_material('hero-%s-%s' % (hero['id'], name), tint, roughness=roughness, coat=coat,
                                          emission_hex=tint, emission_strength=0.0)
    strength, floor = RIM[hero['rarity']]
    marks.drive_rim(material, strength, floor=floor)
    material['albedo_hex'] = tint
    return material


def sheen_mark_material(hero, hue_shift=0, saturation=None, luma=SHEEN_LUMA, strength=1.0):
    """A flat mark of the skin's sheen: emission alone, under the bright threshold, in the slot's tint."""
    tint = species.slot_hex(shifted_hue(hero['hue'], hue_shift, saturation), luma=luma)
    material = materials.flat_material('hero-%s-sheen' % hero['id'], tint, strength=strength)
    material['albedo_hex'] = tint
    return material


# --- node helpers: textures in the object's own frame -----------------------------------------------


def object_coords(material):
    tree = material.node_tree
    coords = tree.nodes.new('ShaderNodeTexCoord')
    return coords.outputs['Object']


def wave_bands(material, vector, scale, distortion=0.0, direction='X', detail=1.0, wave_type='BANDS'):
    """Parallel bands (or rings) across the object: etch lamellae, growth rings, file lines."""
    tree = material.node_tree
    wave = tree.nodes.new('ShaderNodeTexWave')
    wave.wave_type = wave_type
    if wave_type == 'BANDS':
        wave.bands_direction = direction
    else:
        wave.rings_direction = direction
    wave.inputs['Scale'].default_value = scale
    wave.inputs['Distortion'].default_value = distortion
    wave.inputs['Detail'].default_value = detail
    tree.links.new(vector, wave.inputs['Vector'])
    return wave.outputs['Fac']


def voronoi_patches(material, vector, scale, randomness=0.8, feature='F1'):
    """Cells over the object: potch patches, bone pores, hammer dents. Returns (colour, distance);
    the distance-to-edge feature has no colour."""
    tree = material.node_tree
    cells = tree.nodes.new('ShaderNodeTexVoronoi')
    cells.feature = feature
    cells.inputs['Scale'].default_value = scale
    cells.inputs['Randomness'].default_value = randomness
    tree.links.new(vector, cells.inputs['Vector'])
    return cells.outputs.get('Color'), cells.outputs['Distance']


def noise_field(material, vector, scale, detail=2.0):
    tree = material.node_tree
    noise = tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    tree.links.new(vector, noise.inputs['Vector'])
    return noise.outputs['Fac']


def facing_term(material, blend=0.65):
    tree = material.node_tree
    facing = tree.nodes.new('ShaderNodeLayerWeight')
    facing.inputs['Blend'].default_value = blend
    return facing.outputs['Facing']


def channel_of(material, colour, channel='Red'):
    tree = material.node_tree
    pick = tree.nodes.new('ShaderNodeSeparateColor')
    tree.links.new(colour, pick.inputs['Color'])
    return pick.outputs[channel]


def colour_ramp(material, fac, stops, interpolation='LINEAR'):
    """A ramp of `(position, hex)` stops driven by `fac`; returns its colour output."""
    tree = material.node_tree
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = interpolation
    elements = ramp.color_ramp.elements
    for at, (position, hex_colour) in enumerate(stops):
        element = elements[at] if at < len(elements) else elements.new(position)
        element.position = position
        element.color = materials.rgba(materials.linear_of_hex(hex_colour))
    tree.links.new(fac, ramp.inputs['Fac'])
    return ramp.outputs['Color']


def value_range(material, fac, low, high, from_max=1.0):
    tree = material.node_tree
    mapped = tree.nodes.new('ShaderNodeMapRange')
    mapped.inputs['From Max'].default_value = from_max
    mapped.inputs['To Min'].default_value = low
    mapped.inputs['To Max'].default_value = high
    tree.links.new(fac, mapped.inputs['Value'])
    return mapped.outputs['Result']


def math_of(material, operation, first, second):
    """A Math node over two sockets or constants; returns its value output."""
    tree = material.node_tree
    node = tree.nodes.new('ShaderNodeMath')
    node.operation = operation
    for at, value in enumerate((first, second)):
        if isinstance(value, (int, float)):
            node.inputs[at].default_value = value
        else:
            tree.links.new(value, node.inputs[at])
    return node.outputs['Value']


def drive_base_colour(material, colour):
    tree = material.node_tree
    tree.links.new(colour, materials.principled_of(material).inputs['Base Color'])
    return material


def drive_roughness(material, fac, low, high):
    tree = material.node_tree
    tree.links.new(value_range(material, fac, low, high), materials.principled_of(material).inputs['Roughness'])
    return material


def drive_bump(material, height, strength):
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    tree.links.new(height, bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return material


def add_sheen(material, fac, strength):
    """An epic's sheen: `fac` times `strength` added to the rim the body already drives."""
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    rim = next(link for link in tree.links if link.to_socket == bsdf.inputs['Emission Strength'])
    lifted = math_of(material, 'ADD', rim.from_socket, math_of(material, 'MULTIPLY', fac, strength))
    tree.links.new(lifted, bsdf.inputs['Emission Strength'])
    return material


def tapered_tube(name, points, radii, resolution=3):
    """A poly curve with a round bevel whose thickness follows `radii` point by point."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 1.0
    curve.bevel_resolution = resolution
    curve.fill_mode = 'FULL'
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, (x, y, z), radius in zip(spline.points, points, radii):
        point.co = (x, y, z, 1.0)
        point.radius = radius
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    return obj
