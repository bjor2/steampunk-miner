"""
Authors the first version of the magnetic planet's Blender source (#293, for the GD lock on spec
#258 "On screen" and the GD ruling on #293 Q1): one `parts` asset, `prop-magnetic-field`, holding
the aurora's ribbon, which the kernel's planet sky band repeats round the planet, and the field
lines' dash, which the planet-mix field-line layer repeats along each arc.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_magnetic_field.py

It writes art/blender/prop-magnetic-field/prop-magnetic-field.blend. From then on that file is
the source (#52): change the art in Blender and re-export, rather than editing this script.

Both parts are flat emissive planes facing the Front view (-Y), so the export bakes their light
straight into the emissive map. Only the light's shape matters to the game: the shaders take a
texel's brightest channel and colour it with the look's colour (`magneticLooks.json`). Each
pattern is periodic across the part's width (whole sine periods of the generated X), so a ribbon
or a dash repeated end to end shows no seam.

- `aurora-ribbon` (3.75 x 1.25 m, 3:1, so a 5 m band repeats it every 15 m): curtains of light
  rising from a wavering lower edge and fading upward, folded rays brightest near the foot.
- `field-dash` (0.5 x 0.0625 m): one soft dash over a little more than half the length, brightest
  along its middle, then the gap.
"""

import math
import os

import bpy

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ASSET_ID = 'prop-magnetic-field'
TAU = 2 * math.pi

AURORA_SIZE_M = (3.75, 1.25)
DASH_SIZE_M = (0.5, 0.0625)
# Pale ice blue: the review renders show it; the game recolours it with the look's colour.
GLOW_COLOUR = (0.55, 0.80, 1.0, 1.0)
BASE_COLOUR = (0.04, 0.08, 0.16, 1.0)


def reset_scene():
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for block in list(collection):
            collection.remove(block)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def glowing_plane(name, size, at, build_glow):
    """A plane in the XZ plane facing -Y, its origin (the pivot) at its centre."""
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=at, rotation=(math.pi / 2, 0, 0))
    plane = bpy.context.view_layer.objects.active
    plane.name = name
    plane.data.name = name
    plane.scale = (size[0], size[1], 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    plane.data.materials.append(glow_material(name, build_glow))
    return plane


def glow_material(name, build_glow):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = BASE_COLOUR
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Emission Color'].default_value = GLOW_COLOUR
    u, v = generated_uv(tree)
    tree.links.new(build_glow(Nodes(tree), u, v), bsdf.inputs['Emission Strength'])
    return material


def generated_uv(tree):
    """The plane's generated X and Y, 0 to 1 across its width and up its height."""
    coords = tree.nodes.new('ShaderNodeTexCoord')
    split = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coords.outputs['Generated'], split.inputs[0])
    return split.outputs['X'], split.outputs['Y']


class Nodes:
    """Small builders for maths node chains: each takes sockets or numbers, answers a socket."""

    def __init__(self, tree):
        self.tree = tree

    def math(self, operation, a, b=0.0, clamp=False):
        node = self.tree.nodes.new('ShaderNodeMath')
        node.operation = operation
        node.use_clamp = clamp
        for index, value in enumerate((a, b)):
            if isinstance(value, (int, float)):
                node.inputs[index].default_value = value
            else:
                self.tree.links.new(value, node.inputs[index])
        return node.outputs[0]

    def wave(self, u, periods, amplitude, phase=0.0, wobble=None):
        """amplitude * sin(TAU * periods * u + phase [+ wobble])."""
        angle = self.math('ADD', self.math('MULTIPLY', u, TAU * periods), phase)
        if wobble is not None:
            angle = self.math('ADD', angle, wobble)
        return self.math('MULTIPLY', self.math('SINE', angle), amplitude)

    def ramp(self, value, start, end, smooth=True, falling=False):
        """0 below `start` to 1 past `end` (or the other way when falling), clamped."""
        node = self.tree.nodes.new('ShaderNodeMapRange')
        node.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
        node.clamp = True
        self.tree.links.new(value, node.inputs['Value'])
        node.inputs['From Min'].default_value = start
        node.inputs['From Max'].default_value = end
        node.inputs['To Min'].default_value = 1.0 if falling else 0.0
        node.inputs['To Max'].default_value = 0.0 if falling else 1.0
        return node.outputs['Result']


def aurora_glow(nodes, u, v):
    """Folded rays over a wavering foot, fading upward; whole periods across, so it tiles."""
    fold = nodes.math('ADD', nodes.wave(u, 2, 0.05), nodes.wave(u, 5, 0.03, 1.3))
    height = nodes.math('SUBTRACT', nodes.math('SUBTRACT', v, fold), 0.08)
    sway = nodes.wave(u, 3, 2.0)
    rays = nodes.math(
        'ADD',
        nodes.math('ADD', nodes.wave(u, 11, 0.25, 0.0, sway), nodes.wave(u, 23, 0.15, 2.1)),
        0.6,
    )
    foot = nodes.ramp(height, 0.0, 0.08)
    rise = nodes.math('POWER', nodes.ramp(height, 0.0, 0.85, smooth=False, falling=True), 2.4)
    return nodes.math('MULTIPLY', nodes.math('MULTIPLY', rays, foot), rise, clamp=True)


def dash_glow(nodes, u, v):
    """A soft dash from 5% to 60% of the length, brightest along its middle line."""
    dash = nodes.math(
        'MULTIPLY', nodes.ramp(u, 0.02, 0.12), nodes.ramp(u, 0.5, 0.6, falling=True)
    )
    off_middle = nodes.math('ABSOLUTE', nodes.math('SUBTRACT', v, 0.5))
    core = nodes.math('ADD', nodes.math('MULTIPLY', nodes.ramp(off_middle, 0.0, 0.5, falling=True), 0.6), 0.4)
    return nodes.math('MULTIPLY', dash, core, clamp=True)


def save_as(asset_id):
    folder = os.path.join(REPO_ROOT, 'art', 'blender', asset_id)
    os.makedirs(folder, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, asset_id + '.blend'), compress=True)
    print('authored ' + asset_id)


def author():
    reset_scene()
    glowing_plane('aurora-ribbon', AURORA_SIZE_M, (0.0, 0.0, 0.0), aurora_glow)
    glowing_plane('field-dash', DASH_SIZE_M, (0.0, 0.0, -1.0), dash_glow)
    save_as(ASSET_ID)


if __name__ == '__main__':
    author()
