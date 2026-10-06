"""
Authors the first version of the tunnel wrecker's Blender source (#112, spec #111): the P6 enemy
that ignores the vehicle and gnaws lined casing rings back to breached. The schedule row
`tunnel_wrecker` is its kind id, so the asset is `enemy-tunnel-wrecker` (#52).

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_tunnel_wrecker.py

It writes art/blender/enemy-tunnel-wrecker/enemy-tunnel-wrecker.blend. From then on that file is the
source (#52): change the art in Blender and re-export, rather than editing this script. Nothing
here is rigged (#51 acceptance 2).

The look is #48's organic matter against brass, made distinct from the other two enemies by its
silhouette, not its colour: the crawler is a segmented body on six thin legs, the burrower a ribbed
worm; the wrecker is a squat, armoured gnawer under a dome of scales whose outline is spiked, with
two toothed rasp wheels for jaws, spade claws for forelegs and a rust-brown tail ending in a rasp.
Its scales are pale, so the tier tint ramp multiplies over them as it does over the crawler's
chitin. Eyes and the gap between the rasp wheels glow a corrosive yellow-green, so its glow never
reads as the crawler's amber.

Conventions (#52, docs/art-pipeline.md): 1 unit = 1 m, game right is +X (the wrecker faces right,
like the crawler), up is +Z, the camera looks along +Y. The one part's origin is its centre, and
its bounds are the placeholder's 0.9 x 0.9 m, so the art drops into the placeholder's place.
Materials are dielectric: the albedo bake reads the diffuse colour pass, which is black on metal.
"""

import math
import os

import bpy
from mathutils import Vector

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSET_ID = 'enemy-tunnel-wrecker'
SIZE_M = 0.9

# texture ('noise' | 'voronoi'), scale, ramp low, ramp high, roughness, bump, emission strength
MATERIALS = {
    'plate': ('voronoi', 40.0, (0.20, 0.17, 0.14), (0.84, 0.79, 0.70), 0.4, 0.3, 0.0),
    'rust': ('noise', 70.0, (0.10, 0.05, 0.03), (0.42, 0.22, 0.10), 0.5, 0.25, 0.0),
    'hide': ('noise', 60.0, (0.05, 0.04, 0.03), (0.22, 0.17, 0.13), 0.6, 0.2, 0.0),
    'claw': ('noise', 50.0, (0.03, 0.02, 0.02), (0.16, 0.12, 0.09), 0.3, 0.2, 0.0),
    'rasp': ('noise', 90.0, (0.10, 0.09, 0.09), (0.40, 0.37, 0.34), 0.35, 0.35, 0.0),
    'glow': ('noise', 20.0, (0.20, 0.30, 0.02), (0.85, 1.0, 0.25), 0.1, 0.0, 6.0),
}
GLOW_COLOUR = (0.62, 1.0, 0.12, 1.0)
# Parts draw unlit from the albedo until the lit render (S6), so each scale darkens towards its own
# edge in the base colour; otherwise the scales merge into one pale blob.
EDGE_DARKENED = ('plate',)
EDGE_COLOUR = (0.16, 0.11, 0.08)


def main():
    reset_scene()
    pieces = body_pieces() + head_pieces() + jaw_pieces() + leg_pieces()
    wrecker = join_as_part(pieces)
    fit_to_part_bounds(wrecker)
    save()


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def save():
    folder = os.path.join(REPO_ROOT, 'art', 'blender', ASSET_ID)
    os.makedirs(folder, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, ASSET_ID + '.blend'), compress=True)
    print('authored ' + ASSET_ID)


# --- the creature, authored about 1 m long and fitted to 0.9 x 0.9 m afterwards -------------------


# The dome: an ellipsoid whose front half carries the scale rows (centre, radii x, y, z).
DOME_CENTRE = Vector((-0.06, 0.0, 0.04))
DOME_RADII = Vector((0.36, 0.24, 0.3))
# Scale rows from the silhouette inwards: (fraction of the radius, first and last angle, step), in
# degrees from game right. The outer row spikes the top outline; the inner rows wrap down the front.
SCALE_ROWS = ((1.0, 4, 176, 16), (0.8, -30, 210, 18), (0.58, -50, 230, 24), (0.34, 0, 330, 40),
              (0.0, 90, 90, 1))


def body_pieces():
    """A dome under rows of overlapping pointed scales, so the outline itself reads serrated."""
    pieces = [sphere('hide', tuple(DOME_CENTRE), tuple(DOME_RADII * 0.97))]
    for fraction, first, last, step in SCALE_ROWS:
        for angle in range(first, last + 1, step):
            pieces += dome_scale(fraction, math.radians(angle))
    pieces += tail_pieces()
    return pieces


def dome_scale(fraction, angle):
    """One scale lying on the dome's front half, its point trailing down and back like a shingle."""
    unit = Vector((fraction * math.cos(angle), -math.sqrt(max(0.0, 1 - fraction * fraction)),
                   fraction * math.sin(angle)))
    point = DOME_CENTRE + Vector((unit.x * DOME_RADII.x, unit.y * DOME_RADII.y, unit.z * DOME_RADII.z))
    normal = Vector((unit.x / DOME_RADII.x, unit.y / DOME_RADII.y, unit.z / DOME_RADII.z)).normalized()
    trailing = Vector((math.sin(angle), 0.0, -math.cos(angle)))
    rotation = normal.to_track_quat('Z', 'Y').to_euler()
    shell = sphere('plate', tuple(point + trailing * 0.02), (0.07, 0.06, 0.045), rotation=tuple(rotation))
    if fraction < 1.0:
        return [shell]
    return [shell, edge_spike(point, angle)]


def edge_spike(point, angle):
    """A silhouette scale stands out as a point, which is what serrates the outline."""
    outward = Vector((math.cos(angle), 0.0, math.sin(angle)))
    return cone('plate', tuple(point + outward * 0.025), 0.05, 0.0, 0.09,
                rotation=tuple(outward.to_track_quat('Z', 'Y').to_euler()))


def tail_pieces():
    """A short armoured tail curled down behind, ending in a rasp spike."""
    return [
        sphere('plate', (-0.42, 0.0, -0.12), (0.08, 0.1, 0.07), rotation=(0, 0.6, 0)),
        sphere('rust', (-0.47, 0.0, -0.2), (0.06, 0.08, 0.05), rotation=(0, 1.0, 0)),
        cone('rasp', (-0.48, 0.0, -0.28), 0.04, 0.0, 0.1, rotation=(0, math.pi, 0)),
    ]


def head_pieces():
    """A broad, low head pushed out under the dome's brow, with two small glowing eyes."""
    return [
        sphere('hide', (0.3, -0.03, -0.12), (0.15, 0.19, 0.12)),
        sphere('plate', (0.3, -0.05, -0.04), (0.14, 0.19, 0.06), rotation=(0, 0.3, 0)),
        sphere('glow', (0.38, -0.18, -0.08), (0.026, 0.02, 0.026)),
        sphere('glow', (0.31, -0.2, -0.07), (0.02, 0.016, 0.02)),
    ]


def jaw_pieces():
    """Two toothed rasp wheels, one above the other, with the corrosive glow between them."""
    pieces = [sphere('glow', (0.45, -0.08, -0.2), (0.05, 0.04, 0.05))]
    for z in (-0.14, -0.28):
        pieces += rasp_wheel((0.47, -0.12, z))
    return pieces


def rasp_wheel(centre):
    wheel = cylinder('rasp', centre, 0.075, 0.05, rotation=(math.pi / 2, 0, 0))
    hub = cylinder('claw', (centre[0], centre[1] - 0.03, centre[2]), 0.025, 0.02,
                   rotation=(math.pi / 2, 0, 0))
    teeth = [rasp_tooth(centre, 2 * math.pi * at / 10) for at in range(10)]
    return [wheel, hub] + teeth


def rasp_tooth(centre, angle):
    position = (centre[0] + 0.085 * math.cos(angle), centre[1], centre[2] + 0.085 * math.sin(angle))
    return cone('rasp', position, 0.018, 0.0, 0.04, rotation=(0, math.pi / 2 - angle, 0))


def leg_pieces():
    """Spade claws in front, stubby hind legs; the far pair darker and behind."""
    pieces = []
    for y, material in ((-0.12, 'claw'), (0.14, 'hide')):
        pieces += foreleg((0.16, y, -0.2), material)
        pieces += hind_leg((-0.24, y, -0.18), material)
    return pieces


def foreleg(shoulder, material):
    elbow = Vector(shoulder) + Vector((0.12, 0.0, -0.12))
    pieces = [limb(material, Vector(shoulder), elbow, 0.035)]
    for spread in (-0.35, 0.0, 0.35):
        tip = elbow + Vector((0.09 * math.cos(spread - 0.5), 0.0, 0.09 * math.sin(spread - 0.5) - 0.03))
        pieces.append(limb('claw', elbow, tip, 0.016, taper=True))
    return pieces


def hind_leg(hip, material):
    knee = Vector(hip) + Vector((-0.06, 0.0, -0.1))
    foot = knee + Vector((0.05, 0.0, -0.08))
    return [limb(material, Vector(hip), knee, 0.04), limb('claw', knee, foot, 0.025, taper=True)]


def limb(material, start, end, radius, taper=False):
    """A cylinder (or a cone, tapered to a point) from `start` to `end`."""
    direction = end - start
    rotation = direction.to_track_quat('Z', 'Y').to_euler()
    middle = tuple((start + end) / 2)
    if taper:
        return cone(material, middle, radius, 0.0, direction.length, rotation=tuple(rotation))
    return cylinder(material, middle, radius, direction.length, rotation=tuple(rotation))


# --- primitives -------------------------------------------------------------------------------


def sphere(material, location, scale, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.scale = scale
    return finish(obj, material, smooth=True)


def cylinder(material, location, radius, depth, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=location,
                                        rotation=rotation)
    return finish(bpy.context.active_object, material, smooth=True)


def cone(material, location, radius1, radius2, depth, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=radius1, radius2=radius2, depth=depth,
                                    location=location, rotation=rotation)
    return finish(bpy.context.active_object, material, smooth=True)


def finish(obj, material, smooth):
    obj.data.materials.append(material_named(material))
    if smooth:
        bpy.ops.object.shade_smooth()
    return obj


def material_named(name):
    full_name = 'wrecker-' + name
    existing = bpy.data.materials.get(full_name)
    return existing if existing is not None else build_material(full_name, *MATERIALS[name])


def build_material(name, texture, scale, low, high, roughness, bump_strength, emission):
    """The crawler's recipe: a texture through a colour ramp into base colour and a bump (S7c)."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Metallic'].default_value = 0.0
    shader.inputs['Roughness'].default_value = roughness
    if emission > 0:
        shader.inputs['Emission Color'].default_value = GLOW_COLOUR
        shader.inputs['Emission Strength'].default_value = emission
    coords = nodes.new('ShaderNodeTexCoord')
    pattern = nodes.new('ShaderNodeTexVoronoi' if texture == 'voronoi' else 'ShaderNodeTexNoise')
    pattern.inputs['Scale'].default_value = scale
    pattern.inputs['Detail'].default_value = 0.0 if texture == 'voronoi' else 6.0
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*low, 1.0)
    ramp.color_ramp.elements[1].color = (*high, 1.0)
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = bump_strength
    bump.inputs['Distance'].default_value = 0.01
    value = pattern.outputs['Distance' if texture == 'voronoi' else 'Fac']
    links.new(coords.outputs['Object'], pattern.inputs['Vector'])
    links.new(value, ramp.inputs['Fac'])
    links.new(edge_darkened(nodes, links, ramp.outputs['Color'], name), shader.inputs['Base Color'])
    links.new(value, bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return material


def edge_darkened(nodes, links, colour, name):
    """
    Multiplies `colour` towards EDGE_COLOUR where the surface turns away from the camera (-Y). It
    reads the world normal, not the view: a bake has no view direction to darken by.
    """
    if name.removeprefix('wrecker-') not in EDGE_DARKENED:
        return colour
    geometry = nodes.new('ShaderNodeNewGeometry')
    axes = nodes.new('ShaderNodeSeparateXYZ')
    towards_camera = nodes.new('ShaderNodeMath')
    towards_camera.operation = 'MULTIPLY'
    towards_camera.inputs[1].default_value = -1.0
    edge = nodes.new('ShaderNodeValToRGB')
    edge.color_ramp.elements[0].position = 0.1
    edge.color_ramp.elements[0].color = (*EDGE_COLOUR, 1.0)
    edge.color_ramp.elements[1].position = 0.9
    edge.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    multiply = nodes.new('ShaderNodeMix')
    multiply.data_type = 'RGBA'
    multiply.blend_type = 'MULTIPLY'
    multiply.inputs['Factor'].default_value = 1.0
    links.new(geometry.outputs['Normal'], axes.inputs['Vector'])
    links.new(axes.outputs['Y'], towards_camera.inputs[0])
    links.new(towards_camera.outputs['Value'], edge.inputs['Fac'])
    links.new(colour, multiply.inputs[6])
    links.new(edge.outputs['Color'], multiply.inputs[7])
    return multiply.outputs[2]


# --- the one part ------------------------------------------------------------------------------


def join_as_part(pieces):
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    part = bpy.context.active_object
    part.name = ASSET_ID
    part.data.name = ASSET_ID
    return part


def fit_to_part_bounds(part):
    """Scale X and Z to exactly 0.9 m and centre the bounds on the origin, the placeholder's pivot."""
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    low, high = bounds_of(part)
    centre = (low + high) / 2
    for vertex in part.data.vertices:
        offset = vertex.co - centre
        vertex.co = Vector((offset.x * SIZE_M / (high.x - low.x), offset.y,
                            offset.z * SIZE_M / (high.z - low.z)))
    part.location = (0.0, 0.0, 0.0)


def bounds_of(part):
    xs, ys, zs = zip(*(tuple(vertex.co) for vertex in part.data.vertices))
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


main()
