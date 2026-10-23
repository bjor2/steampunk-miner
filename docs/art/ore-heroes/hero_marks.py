"""
The hero silhouettes of #452 and ticket 744 as Blender builders, one per `silhouette` word of the
hero rows in materials.json (#447, ticket 632): `cubes` (zoned fluorite), `wires` (dendritic gold
on a quartz vein), `barrels` (silky corundum), `columns` (clear beryl), and P2's three gems,
`stars` (star garnet), `ovals` (verdigris opal) and `prisms` (aquamarine), which share the
facet-glint treatment the Horizontal Scaler asked of every gem (#741). Each builder fills one 1 m
cell at a centre with marks standing proud of the face at y = 0 (the #52 frame: game right +X,
game up +Z, the camera at -Y), in the species' hue slot. The ore stage's shapes and materials are
reused; the rarity frame and glow are the shader's (#450), so no builder adds a glow layer.
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


# --- stars: faceted star garnets, each with its six-rayed spark (ticket 744) ----------------------


def build_stars(hero, centre, rng):
    body = garnet_glass(hero)
    spark = spark_material(hero)
    stones = []
    for i, (px, pz, radius) in enumerate(star_layout(rng)):
        stones += garnet(hero, i, (centre[0] + px, centre[1] + pz), radius, rng, body, spark)
    return stones


def star_layout(rng):
    """One large stone off centre and three smaller ones round it, none touching."""
    phase = rng.uniform(0, math.tau)
    stones = [(rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0.2)]
    for k, radius in enumerate((0.12, 0.1, 0.13)):
        angle = phase + k / 3 * math.tau + rng.uniform(-0.2, 0.2)
        stones.append((math.cos(angle) * 0.34, math.sin(angle) * 0.34, radius))
    return stones


def garnet(hero, i, at, radius, rng, body, spark):
    """A twenty-faced stone sunk to its waist, flat-shaded so every facet catches the lamp whole."""
    stone = shapes.add_icosphere('%s-mark-%d' % (hero['id'], i), radius, (at[0], radius * 0.15, at[1]), subdivisions=1,
                                 rotation=(rng.uniform(0, math.tau), rng.uniform(0, math.tau), rng.uniform(0, math.tau)))
    made = [shapes.assign(faceted(stone), body)]
    return made + six_rayed_spark(hero, i, at, -radius * 0.85 - 0.01, radius, rng, spark)


def six_rayed_spark(hero, i, at, y, radius, rng, spark):
    """The asterism: three thin rays crossing at the stone's crown, 60 degrees apart."""
    phase = rng.uniform(0, math.pi / 3)
    rays = []
    for k in range(3):
        points = shapes.shard_points(at, radius * 0.8, radius * 0.07, phase + k * math.pi / 3)
        rays.append(shapes.assign(shapes.add_polygon('%s-ray-%d-%d' % (hero['id'], i, k), points, y, 0.004), spark))
    return rays


def garnet_glass(hero):
    body = species.slot_hex(hero['hue'])
    material = surface_gem(hero, body, roughness=0.06, transmission=0.1, ior=1.8)
    drive_rim(material, 0.25, floor=0.08)
    return facet_glint(material, strength=0.9, sharpness=30.0)


def spark_material(hero):
    """The rays' light: the hue slot near white, emission alone so the lamp never dims it."""
    pale = species.slot_hex(hero['hue'], luma=0.9)
    material = materials.flat_material('hero-%s-spark' % hero['id'], pale, strength=1.3)
    material['albedo_hex'] = pale
    return material


# --- ovals: verdigris opal domes in matrix frames, flashing play-of-colour (ticket 744) -----------


def build_ovals(hero, centre, rng):
    body = play_of_colour_glass(hero)
    frame = matrix_material(hero)
    marks = []
    for i, (px, pz) in enumerate(oval_layout(rng)):
        angle = rng.uniform(0, math.pi)
        marks += opal_dome(hero, i, (centre[0] + px, centre[1] + pz), rng.uniform(0.13, 0.165), angle, body, frame)
    return marks


def oval_layout(rng):
    """Four domes on a loose ring, each nudged off it."""
    phase = rng.uniform(0, math.tau)
    return [(math.cos(phase + k / 4 * math.tau) * 0.26 + rng.uniform(-0.03, 0.03),
             math.sin(phase + k / 4 * math.tau) * 0.26 + rng.uniform(-0.03, 0.03)) for k in range(4)]


def opal_dome(hero, i, at, radius, angle, body, frame):
    """
    A cabochon: a flattened sphere bulging toward the camera, sunk past its waist, in a thin raised
    frame of the matrix it grew in. The local ring plane turns onto the face, then spins on it.
    """
    rotation = Euler((math.pi / 2, angle, 0.0))
    dome = shapes.add_icosphere('%s-mark-%d' % (hero['id'], i), radius, (at[0], 0.03, at[1]), subdivisions=3,
                                scale=(1.0, 0.7, 0.55), rotation=rotation)
    rim = shapes.add_torus('%s-frame-%d' % (hero['id'], i), radius * 1.04, 0.016, (at[0], 0.0, at[1]), rotation=rotation,
                           scale=(1.0, 0.7, 1.0))
    return [shapes.assign(dome, body), shapes.assign(rim, frame)]


def play_of_colour_glass(hero):
    """
    Milky green opal broken into patches, each flashing its own colour a little either side of the
    hue slot, with a dark seam between: the harlequin play-of-colour of the skin, on a dome.
    """
    body = species.slot_hex(hero['hue'])
    material = surface_gem(hero, body, roughness=0.12, transmission=0.05, ior=1.45)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    patches = tree.nodes.new('ShaderNodeTexVoronoi')
    patches.inputs['Scale'].default_value = 9.0
    patches.inputs['Randomness'].default_value = 0.8
    pick = tree.nodes.new('ShaderNodeSeparateColor')
    flash = tree.nodes.new('ShaderNodeValToRGB')
    flash.color_ramp.interpolation = 'CONSTANT'
    stops = ((0.0, species.slot_hex(shifted_hue(hero['hue'], 22), luma=0.5)),
             (0.3, body),
             (0.6, species.slot_hex(hero['hue'], luma=0.78)),
             (0.82, species.slot_hex(shifted_hue(hero['hue'], -28), luma=0.7)))
    flash.color_ramp.elements[0].position, flash.color_ramp.elements[0].color = stops[0][0], materials.rgba(materials.linear_of_hex(stops[0][1]))
    flash.color_ramp.elements[1].position, flash.color_ramp.elements[1].color = stops[1][0], materials.rgba(materials.linear_of_hex(stops[1][1]))
    for position, hex_colour in stops[2:]:
        element = flash.color_ramp.elements.new(position)
        element.color = materials.rgba(materials.linear_of_hex(hex_colour))
    seams = tree.nodes.new('ShaderNodeTexVoronoi')
    seams.feature = 'DISTANCE_TO_EDGE'
    seams.inputs['Scale'].default_value = 9.0
    seams.inputs['Randomness'].default_value = 0.8
    seam_depth = tree.nodes.new('ShaderNodeMapRange')
    seam_depth.inputs['From Max'].default_value = 0.035
    seam_depth.inputs['To Min'].default_value = 0.45
    seam_depth.inputs['To Max'].default_value = 1.0
    darken = tree.nodes.new('ShaderNodeMix')
    darken.data_type = 'RGBA'
    darken.blend_type = 'MULTIPLY'
    darken.inputs['Factor'].default_value = 1.0
    tree.links.new(coords.outputs['Object'], patches.inputs['Vector'])
    tree.links.new(coords.outputs['Object'], seams.inputs['Vector'])
    tree.links.new(patches.outputs['Color'], pick.inputs['Color'])
    tree.links.new(pick.outputs['Red'], flash.inputs['Fac'])
    tree.links.new(seams.outputs['Distance'], seam_depth.inputs['Value'])
    tree.links.new(flash.outputs['Color'], darken.inputs[6])
    tree.links.new(seam_depth.outputs['Result'], darken.inputs[7])
    tree.links.new(darken.outputs[2], bsdf.inputs['Base Color'])
    drive_rim(material, 0.35, floor=0.12)
    return facet_glint(material, strength=1.2, sharpness=40.0)


def matrix_material(hero):
    """The dull ironstone the opal grew in, raised as a thin frame round each dome."""
    matrix = '#6b6457'
    material = materials.surface_material('hero-%s-matrix' % hero['id'], matrix, roughness=0.65, coat=0.1)
    material['albedo_hex'] = matrix
    return material


def shifted_hue(slot, degrees):
    return dict(slot, hue=(slot['hue'] + degrees) % 360)


# --- prisms: crossed aquamarine prisms, watered along their length (ticket 744) -------------------


def build_prisms(hero, centre, rng):
    body = watered_glass(hero)
    return [sea_prism(hero, i, centre, *bar, rng=rng, body=body) for i, bar in enumerate(prism_layout(rng))]


def prism_layout(rng):
    """Three long prisms crossing at shallow angles, one short one beside them."""
    return [(rng.uniform(-0.35, -0.15), 0.64, 0.074, 0.0),
            (rng.uniform(0.95, 1.2), 0.5, 0.064, rng.choice((-1, 1)) * 0.07),
            (rng.uniform(2.0, 2.3), 0.42, 0.055, rng.choice((-1, 1)) * 0.1),
            (rng.uniform(0.3, 0.6), 0.24, 0.044, rng.choice((-1, 1)) * 0.3)]


def sea_prism(hero, i, centre, angle, length, radius, offset, rng, body):
    """A flat-ended hexagonal prism lying along the face, sunk past its axis, leaning a little out."""
    tilt = rng.uniform(0.08, 0.2)
    rotation = Vector((math.cos(angle), -tilt, math.sin(angle))).to_track_quat('Z', 'Y').to_euler()
    across = (-math.sin(angle), math.cos(angle))
    at = (centre[0] + across[0] * offset, -0.02 - radius * 0.15, centre[1] + across[1] * offset)
    prism = shapes.add_prism('%s-mark-%d' % (hero['id'], i), radius, length, at, rotation=rotation)
    return shapes.assign(prism, body)


def watered_glass(hero):
    """Pale sea glass, with soft rippled bands of a deeper sea along the length: the watered pattern."""
    body = species.slot_hex(hero['hue'])
    deep = species.slot_hex(hero['hue'], luma=0.64)
    material = surface_gem(hero, body, roughness=0.05, transmission=0.3, ior=1.58)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    wave = tree.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 9.0
    wave.inputs['Distortion'].default_value = 2.5
    wave.inputs['Detail'].default_value = 2.0
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = materials.rgba(materials.linear_of_hex(deep))
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = materials.rgba(materials.linear_of_hex(body))
    tree.links.new(coords.outputs['Object'], wave.inputs['Vector'])
    tree.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    drive_rim(material, 0.4, floor=0.1)
    return facet_glint(material)


# --- the gems' shared treatment (ticket 744) ------------------------------------------------------

# The ore stage's key lamp travels along (0.35, 0.8, -0.45) (ladder_scene.add_lamp_rig); a facet
# whose normal looks back along it catches the lamp whole.
LAMP_FACING = Vector((-0.35, -0.8, 0.45)).normalized()


def surface_gem(hero, body, roughness, transmission, ior):
    """A gem body in the hue slot, its emission colour the slot near white for the rim and glints."""
    pale = species.slot_hex(hero['hue'], luma=0.9)
    material = materials.surface_material('hero-' + hero['id'], body, roughness=roughness, transmission=transmission,
                                          ior=ior, coat=0.5, emission_hex=pale, emission_strength=0.0)
    material['albedo_hex'] = body
    return material


def facet_glint(material, strength=1.6, sharpness=24.0):
    """
    The gems' shared facet-glint treatment (Horizontal Scaler on #741, ticket 744): a hard clear
    coat, and a facet whose normal looks back along the key lamp lights up whole, in the pale
    emission colour, on top of the rim the material already drives. Flat-shaded stones glint a
    facet at a time; a smooth dome a soft crown.
    """
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    bsdf.inputs['Coat Weight'].default_value = 1.0
    bsdf.inputs['Coat Roughness'].default_value = 0.03
    rim = next(link for link in tree.links if link.to_socket == bsdf.inputs['Emission Strength'])
    geometry = tree.nodes.new('ShaderNodeNewGeometry')
    toward_lamp = tree.nodes.new('ShaderNodeVectorMath')
    toward_lamp.operation = 'DOT_PRODUCT'
    toward_lamp.inputs[1].default_value = LAMP_FACING
    lit = math_node(tree, 'MAXIMUM', 0.0)
    narrowed = math_node(tree, 'POWER', sharpness)
    scaled = math_node(tree, 'MULTIPLY', strength)
    glint_and_rim = math_node(tree, 'ADD', 0.0)
    tree.links.new(geometry.outputs['Normal'], toward_lamp.inputs[0])
    tree.links.new(toward_lamp.outputs['Value'], lit.inputs[0])
    tree.links.new(lit.outputs['Value'], narrowed.inputs[0])
    tree.links.new(narrowed.outputs['Value'], scaled.inputs[0])
    tree.links.new(rim.from_socket, glint_and_rim.inputs[0])
    tree.links.new(scaled.outputs['Value'], glint_and_rim.inputs[1])
    tree.links.new(glint_and_rim.outputs['Value'], bsdf.inputs['Emission Strength'])
    return material


def math_node(tree, operation, second):
    node = tree.nodes.new('ShaderNodeMath')
    node.operation = operation
    node.inputs[1].default_value = second
    return node


def faceted(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


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
    'stars': build_stars,
    'ovals': build_ovals,
    'prisms': build_prisms,
}
