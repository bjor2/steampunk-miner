"""
Materials for the ore ladder prototype (#150). Colours are display sRGB hex strings, converted to
linear for the shader inputs. Nodes are found by type, never by name (names are localised in a
user's Blender). Nothing here is game code; the ladder is a design probe for the visual spec #151.
"""

import bpy

# --- colours ---------------------------------------------------------------------------------------


def linear_of_hex(hex_colour):
    return tuple(linear_of_display(channel) for channel in display_of_hex(hex_colour))


def display_of_hex(hex_colour):
    return tuple(int(hex_colour[at:at + 2], 16) / 255.0 for at in (1, 3, 5))


def linear_of_display(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def rgba(rgb, alpha=1.0):
    return (rgb[0], rgb[1], rgb[2], alpha)


def mix_hex(hex_a, hex_b, amount):
    """A display-space mix, like the game's bandPalette: amount 0 is a, 1 is b."""
    a, b = display_of_hex(hex_a), display_of_hex(hex_b)
    mixed = tuple(x + (y - x) * amount for x, y in zip(a, b))
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(channel * 255))) for channel in mixed)


# --- node lookups ----------------------------------------------------------------------------------


def new_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    return material


def principled_of(material):
    return next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')


def output_of(material):
    return next(node for node in material.node_tree.nodes if node.type == 'OUTPUT_MATERIAL')


def emission_socket_of(material):
    """The socket a pulse animates: the Emission shader's strength, or the Principled one's."""
    nodes = material.node_tree.nodes
    emission = next((node for node in nodes if node.type == 'EMISSION'), None)
    if emission is not None:
        return emission.inputs['Strength']
    return principled_of(material).inputs['Emission Strength']


# --- lit materials (directions that use the lamp) --------------------------------------------------


def surface_material(name, hex_colour, metallic=0.0, roughness=0.8, transmission=0.0, ior=1.45,
                     emission_hex=None, emission_strength=0.0, coat=0.0):
    material = new_material(name)
    bsdf = principled_of(material)
    bsdf.inputs['Base Color'].default_value = rgba(linear_of_hex(hex_colour))
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['IOR'].default_value = ior
    bsdf.inputs['Coat Weight'].default_value = coat
    if emission_hex is not None:
        bsdf.inputs['Emission Color'].default_value = rgba(linear_of_hex(emission_hex))
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return material


def rim_lit_glass(name, hex_colour, rim_hex, rim_strength, roughness=0.1, transmission=0.8):
    """A translucent crystal whose edges glow faintly: the facing term drives the emission."""
    material = surface_material(name, hex_colour, roughness=roughness, transmission=transmission,
                                ior=1.55, emission_hex=rim_hex, emission_strength=0.0)
    tree = material.node_tree
    bsdf = principled_of(material)
    facing = tree.nodes.new('ShaderNodeLayerWeight')
    facing.inputs['Blend'].default_value = 0.65
    scale = tree.nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY'
    scale.inputs[1].default_value = rim_strength
    tree.links.new(facing.outputs['Facing'], scale.inputs[0])
    tree.links.new(scale.outputs['Value'], bsdf.inputs['Emission Strength'])
    return material


def rock_material(name, hex_colour, bump_strength=0.35):
    """Host rock: the band's colour under a strata noise, with a bump so the lamp catches relief."""
    material = surface_material(name, hex_colour, roughness=0.95)
    tree = material.node_tree
    bsdf = principled_of(material)
    noise = tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 9.0
    noise.inputs['Detail'].default_value = 5.0
    noise.inputs['Roughness'].default_value = 0.6
    shade = tree.nodes.new('ShaderNodeMixRGB')
    shade.inputs['Color1'].default_value = rgba(linear_of_hex(mix_hex(hex_colour, '#000000', 0.22)))
    shade.inputs['Color2'].default_value = rgba(linear_of_hex(mix_hex(hex_colour, '#ffffff', 0.10)))
    tree.links.new(noise.outputs['Fac'], shade.inputs['Fac'])
    tree.links.new(shade.outputs['Color'], bsdf.inputs['Base Color'])
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = bump_strength
    bump.inputs['Distance'].default_value = 0.02
    tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return material


# --- unlit materials (the stamped, flat-vector direction) ------------------------------------------


def flat_material(name, hex_colour, strength=1.0):
    """Emission only, so the colour on screen is the authored colour, whatever the lamp does."""
    material = new_material(name)
    tree = material.node_tree
    tree.nodes.remove(principled_of(material))
    emission = tree.nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = rgba(linear_of_hex(hex_colour))
    emission.inputs['Strength'].default_value = strength
    tree.links.new(emission.outputs['Emission'], output_of(material).inputs['Surface'])
    return material


def glow_material(name, hex_colour, strength):
    """A lit direction's glow: emission alone, bright enough to bloom in the compositor."""
    return flat_material(name, hex_colour, strength)


# --- animation -------------------------------------------------------------------------------------


def pulse_emission(material, frames_and_scales):
    """Keyframes the emission strength: (frame, scale of the authored strength) pairs."""
    socket = emission_socket_of(material)
    rest = socket.default_value
    for frame, scale in frames_and_scales:
        socket.default_value = rest * scale
        socket.keyframe_insert('default_value', frame=frame)
    socket.default_value = rest
