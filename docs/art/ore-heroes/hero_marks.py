"""
The hero silhouettes of #452 as Blender builders, one per `silhouette` word of the hero rows in
materials.json (#447): `cubes` (zoned fluorite), `wires` (dendritic gold on a quartz vein),
`barrels` (silky corundum) and `columns` (clear beryl). Each builder fills one 1 m cell at a
centre with marks standing proud of the face at y = 0 (the #52 frame: game right +X, game up +Z,
the camera at -Y), in the species' hue slot. The ore stage's shapes and materials are reused;
the rarity frame and glow are the shader's (#450), so no builder adds a glow layer.
"""

import math
import random

import bpy
import hero_species as species
import ore_families as families
import ore_materials as materials
import ore_shapes as shapes
from mathutils import Euler, Vector

LAYOUT_SEED = 452
# How far a standing mark leans toward the camera, as the ore stage's G3 marks do.
STAND = 'stand'


def rng_of(hero):
    return random.Random('%d:%s' % (LAYOUT_SEED, hero['id']))


def build_hero(hero, centre):
    """The hero's marks in a collection named for the species; returns the objects."""
    builder = BUILDERS[hero['silhouette']]
    objects = builder(hero, centre, rng_of(hero))
    collection = bpy.data.collections.new(hero['id'])
    bpy.context.scene.collection.children.link(collection)
    for obj in objects:
        for other in list(obj.users_collection):
            other.objects.unlink(obj)
        collection.objects.link(obj)
    return objects


# --- cubes: interpenetrating zoned fluorite cubes, half-sunk --------------------------------------


def build_cubes(hero, centre, rng):
    body = zoned_glass(hero)
    cubes = []
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 6, 0.3, 0.2)):
        size = rng.uniform(0.17, 0.27)
        cube = shapes.add_cube('%s-mark-%d' % (hero['id'], i), size, (centre[0] + px, -size * 0.22, centre[1] + pz),
                               rotation=(rng.uniform(-0.5, 0.5), rng.uniform(0, math.tau), rng.uniform(-0.5, 0.5)))
        cubes.append(shapes.assign(shapes.bevel(cube, size * 0.06, segments=1), body))
    cubes += [grown_cube(hero, cube, i, rng, body) for i, cube in enumerate(cubes[:3])]
    return cubes


def grown_cube(hero, host, i, rng, body):
    """A smaller cube grown on a host's corner, the way fluorite twins."""
    size = host.dimensions.x * 0.55
    offset = Vector((rng.choice((-1, 1)) * size * 0.75, -size * 0.2, rng.choice((-1, 1)) * size * 0.75))
    cube = shapes.add_cube('%s-twin-%d' % (hero['id'], i), size, Vector(host.location) + offset,
                           rotation=(rng.uniform(-0.4, 0.4), rng.uniform(0, math.tau), rng.uniform(-0.4, 0.4)))
    return shapes.assign(shapes.bevel(cube, size * 0.06, segments=1), body)


def zoned_glass(hero):
    """Fluorite's zoning: colour bands parallel to the cube faces, deeper and paler on the hue slot."""
    body = species.slot_hex(hero['hue'])
    pale = species.slot_hex(hero['hue'], luma=min(0.9, hero['hue']['luma'] + 0.14))
    deep = species.slot_hex(hero['hue'], luma=max(0.1, hero['hue']['luma'] - 0.08))
    material = materials.surface_material('hero-' + hero['id'], body, roughness=0.08, transmission=0.12, ior=1.43, coat=0.4,
                                          emission_hex=pale, emission_strength=0.0)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    wave = tree.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Z'
    wave.inputs['Scale'].default_value = 5.0
    wave.inputs['Distortion'].default_value = 1.2
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = materials.rgba(materials.linear_of_hex(deep))
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = materials.rgba(materials.linear_of_hex(pale))
    tree.links.new(coords.outputs['Object'], wave.inputs['Vector'])
    tree.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    drive_rim(material, 0.25, floor=0.08)
    material['albedo_hex'] = body
    return material


# --- wires: dendritic native gold on a smoky quartz vein -------------------------------------------


def build_wires(hero, centre, rng):
    gold = metal_body(hero)
    objects = [quartz_vein(hero, centre, rng)]
    trunks = 3
    for i in range(trunks):
        angle = i / trunks * math.tau + rng.uniform(-0.3, 0.3)
        objects += gold_trunk(hero, centre, i, angle, rng, gold)
    return objects


def quartz_vein(hero, centre, rng):
    """The host vein the gold grew in: a long, slightly kinked quartz strip, barely proud."""
    angle = rng.uniform(0, math.pi)
    along = Vector((math.cos(angle), math.sin(angle)))
    across = Vector((-along.y, along.x))
    cx, cz = centre
    points = []
    for t in (-0.52, -0.2, 0.15, 0.52):
        kink = rng.uniform(-0.05, 0.05)
        points.append(Vector((cx, cz)) + along * t + across * (0.06 + kink))
    for t in (0.52, 0.15, -0.2, -0.52):
        kink = rng.uniform(-0.05, 0.05)
        points.append(Vector((cx, cz)) + along * t + across * (-0.06 + kink))
    vein = shapes.add_polygon(hero['id'] + '-vein', [tuple(p) for p in points], 0.0, 0.012)
    quartz = materials.surface_material('hero-%s-quartz' % hero['id'], '#7a7066', roughness=0.35, coat=0.3)
    quartz['albedo_hex'] = '#7a7066'
    return shapes.assign(vein, quartz)


def gold_trunk(hero, centre, i, angle, rng, gold):
    """One wire trunk from near the centre outward, with two side wires and a nugget at the tips."""
    cx, cz = centre
    start = (cx + math.cos(angle) * 0.05, -0.03, cz + math.sin(angle) * 0.05)
    end = (cx + math.cos(angle) * rng.uniform(0.3, 0.42), -0.06, cz + math.sin(angle) * rng.uniform(0.3, 0.42))
    path = wire_path(start, end, rng, segments=6)
    trunk = shapes.add_tube('%s-mark-%d' % (hero['id'], i), path, 0.03, resolution=3)
    made = [shapes.assign(trunk, gold)]
    for j, turn in enumerate((0.75, -0.9)):
        root = path[2 + j]
        branch_end = (root[0] + math.cos(angle + turn) * 0.16, -0.07, root[2] + math.sin(angle + turn) * 0.16)
        branch = shapes.add_tube('%s-wire-%d-%d' % (hero['id'], i, j), wire_path(root, branch_end, rng, segments=4), 0.019, resolution=3)
        made.append(shapes.assign(branch, gold))
        made.append(nugget(hero, '%d-%d' % (i, j), branch_end, 0.036, rng, gold))
    made.append(nugget(hero, str(i), end, 0.05, rng, gold))
    return made


def wire_path(start, end, rng, segments):
    """A kinked path between two points, wobbling in the face and rising toward the camera."""
    points = []
    for k in range(segments + 1):
        t = k / segments
        wobble = rng.uniform(-0.035, 0.035) if 0 < k < segments else 0.0
        x = start[0] + (end[0] - start[0]) * t + wobble
        z = start[2] + (end[2] - start[2]) * t - wobble
        y = start[1] + (end[1] - start[1]) * t
        points.append((x, y, z))
    return points


def nugget(hero, tag, at, radius, rng, gold):
    sphere = shapes.add_icosphere('%s-nugget-%s' % (hero['id'], tag), radius, (at[0], at[1] - radius * 0.3, at[2]),
                                  subdivisions=1, scale=(1.0, 0.7, rng.uniform(0.8, 1.2)),
                                  rotation=(0.0, rng.uniform(0, math.tau), 0.0))
    return shapes.assign(sphere, gold)


def metal_body(hero):
    body = species.slot_hex(hero['hue'])
    material = materials.surface_material('hero-' + hero['id'], body, metallic=1.0, roughness=0.38, coat=0.2,
                                          emission_hex=body, emission_strength=0.0)
    drive_rim(material, 0.3, floor=0.14)
    material['albedo_hex'] = body
    return material


# --- barrels: silky corundum barrels standing in a cluster ----------------------------------------


def build_barrels(hero, centre, rng):
    body = silky_glass(hero)
    marks = []
    count = 5
    root = (centre[0] + rng.uniform(-0.06, 0.06), centre[1] + rng.uniform(-0.06, 0.06))
    for i in range(count):
        angle = i / count * math.tau + rng.uniform(-0.25, 0.25)
        reach = rng.uniform(0.1, 0.3)
        at = (root[0] + math.cos(angle) * reach, root[1] + math.sin(angle) * reach)
        marks += barrel(hero, i, at, rng.uniform(0.07, 0.09), rng.uniform(0.3, 0.4), angle, rng, body)
    return marks


def barrel(hero, i, at, radius, length, angle, rng, body):
    """A hexagonal prism with tapered hexagonal ends: the barrel habit of corundum."""
    rotation = Euler(families.lean(angle, STAND, rng))
    y = -0.05 - radius * 0.4
    prism = shapes.add_prism('%s-mark-%d' % (hero['id'], i), radius, length, (at[0], y, at[1]), rotation=rotation)
    ends = []
    for k, sign in enumerate((1, -1)):
        cone = shapes.add_cone('%s-end-%d-%d' % (hero['id'], i, k), radius, radius * 0.8, (at[0], y, at[1]), rotation=rotation)
        cone.rotation_euler = (rotation.to_matrix() @ Euler((0.0, math.pi if sign < 0 else 0.0, 0.0)).to_matrix()).to_euler()
        cone.location = Vector(prism.location) + rotation.to_matrix() @ Vector((0, 0, sign * (length / 2 + radius * 0.4)))
        ends.append(cone)
    return [shapes.assign(obj, body) for obj in [prism] + ends]


def silky_glass(hero):
    """Deep blue with silk: fine bands along the crystal axis in the roughness and the bump."""
    body = species.slot_hex(hero['hue'])
    rim = species.slot_hex(hero['hue'], luma=0.72)
    material = materials.surface_material('hero-' + hero['id'], body, roughness=0.1, transmission=0.14, ior=1.76, coat=0.5,
                                          emission_hex=rim, emission_strength=0.0)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    wave = tree.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 90.0
    wave.inputs['Distortion'].default_value = 0.0
    roughness = tree.nodes.new('ShaderNodeMapRange')
    roughness.inputs['To Min'].default_value = 0.03
    roughness.inputs['To Max'].default_value = 0.35
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.3
    tree.links.new(coords.outputs['Object'], wave.inputs['Vector'])
    tree.links.new(wave.outputs['Fac'], roughness.inputs['Value'])
    tree.links.new(roughness.outputs['Result'], bsdf.inputs['Roughness'])
    tree.links.new(wave.outputs['Fac'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    drive_rim(material, 0.5, floor=0.22)
    material['albedo_hex'] = body
    return material


# --- columns: clear beryl columns radiating from a root -------------------------------------------


def build_columns(hero, centre, rng):
    body = clear_glass(hero)
    marks = []
    count = 6
    root = (centre[0] + rng.uniform(-0.1, 0.1), centre[1] + rng.uniform(-0.1, 0.1))
    for i in range(count):
        angle = i / count * math.tau + rng.uniform(-0.3, 0.3)
        length = rng.uniform(0.34, 0.5)
        radius = rng.uniform(0.042, 0.06)
        marks.append(column(hero, i, root, angle, length, radius, rng, body))
    return marks


def column(hero, i, root, angle, length, radius, rng, body):
    """A long hexagonal prism with flat ends, its foot at the root and its length lying along the face."""
    rotation = Euler(families.lean(angle, STAND, rng))
    direction = rotation.to_matrix() @ Vector((0, 0, 1))
    foot = Vector((root[0], -0.03 - radius * 0.5, root[1]))
    centre = foot + direction * (length / 2)
    prism = shapes.add_prism('%s-mark-%d' % (hero['id'], i), radius, length, tuple(centre), rotation=rotation)
    return shapes.assign(prism, body)


def clear_glass(hero):
    body = species.slot_hex(hero['hue'])
    rim = species.slot_hex(hero['hue'], luma=0.66)
    material = materials.surface_material('hero-' + hero['id'], body, roughness=0.05, transmission=0.3, ior=1.58, coat=0.5,
                                          emission_hex=rim, emission_strength=0.0)
    drive_rim(material, 0.4, floor=0.12)
    material['albedo_hex'] = body
    return material


# --- shared ----------------------------------------------------------------------------------------


def drive_rim(material, strength, floor):
    """The ore stage's facing-driven rim: brighter on the grazing edge, `floor` of it all over."""
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


BUILDERS = {
    'cubes': build_cubes,
    'wires': build_wires,
    'barrels': build_barrels,
    'columns': build_columns,
}
