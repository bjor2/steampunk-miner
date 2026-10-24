"""
The gem heroes of P4 and P5 (ticket 785, the GD lock on #746), registered in
hero_marks.PATTERN_BUILDERS like gem_marks.py: P4's Watermelon Tourmaline (`pencils`, `two-tone`),
Starsteel (`stars`, `watered`) and Painite (`spindles`, `deep-red`), and P5's Fire Garnet
(`spheres`, `glowing`), Core Gold (`blooms`, `molten`) and Kiln Ruby (`hearts`, `inner-fire`) of
#453. Each follows its mineral-skin row (docs/art/mineral-skins: pencil prisms pink at heart,
watered star bursts, a spindle spray, faceted spheres with an ember glow, gold blooms with a
molten sheen, heart crystals with ruby fire) in the hue slot's colour, flat-shaded where it is a
stone, with the shared facet glint of ticket 744. The inner fire stays on the ruby's own side of
the hue circle, never in the reserved heat band (15 to 45, #450).
"""

import math

import hero_marks as marks
import hero_species as species
import ore_materials as materials
import ore_shapes as shapes
from mathutils import Euler, Vector


# --- pencils, two-tone: P4's watermelon tourmaline, slender three-sided pencils, pink at the cut -------


def build_two_tone_pencils(hero, centre, rng):
    rind = rind_glass(hero)
    heart = heart_glass(hero)
    line = marks.spark_material(hero)
    pencils = []
    phase = rng.uniform(0, math.pi)
    for i in range(4):
        angle = phase + rng.uniform(-0.25, 0.25) + (0.0 if i < 3 else math.pi / 2)
        offset = (-0.2, 0.0, 0.2, 0.05)[i] + rng.uniform(-0.03, 0.03)
        length = rng.uniform(0.5, 0.64) if i < 3 else 0.34
        pencils += pencil(hero, i, centre, angle, offset, length, rng, rind, heart, line)
    return pencils


def pencil(hero, i, centre, angle, offset, length, rng, rind, heart, line):
    """
    A three-sided prism lying along the face, its two cut ends showing the pink heart, and the skin's
    prism line, a thin pale light along the ridge the lamp catches.
    """
    radius = rng.uniform(0.055, 0.07)
    across = (-math.sin(angle), math.cos(angle))
    at = Vector((centre[0] + across[0] * offset, -radius * 0.35, centre[1] + across[1] * offset))
    rotation = Vector((math.cos(angle), rng.uniform(-0.1, 0.1), math.sin(angle))).to_track_quat('Z', 'Y').to_euler()
    along = rotation.to_matrix() @ Vector((0, 0, 1))
    body = shapes.add_prism('%s-mark-%d' % (hero['id'], i), radius, length, tuple(at), rotation=rotation, sides=3)
    # A ridge toward the camera, not a face, so the lamp lights one side and the other stays green.
    body.rotation_euler = (rotation.to_matrix() @ Euler((0.0, 0.0, math.pi / 6 + rng.uniform(-0.15, 0.15))).to_matrix()).to_euler()
    made = [shapes.assign(body, rind)]
    for k, sign in enumerate((1, -1)):
        end_at = at + along * (sign * (length / 2 + 0.008))
        cut = shapes.add_prism('%s-heart-%d-%d' % (hero['id'], i, k), radius * 0.8, 0.02, tuple(end_at), rotation=body.rotation_euler, sides=3)
        made.append(shapes.assign(cut, heart))
    ridge = shapes.shard_points((at.x, at.z), length * 0.36, radius * 0.1, angle)
    made.append(shapes.assign(shapes.add_polygon('%s-line-%d' % (hero['id'], i), ridge, -radius * 1.05 - 0.012, 0.004), line))
    return made


def rind_glass(hero):
    body = species.slot_hex(hero['hue'])
    material = marks.surface_gem(hero, body, roughness=0.08, transmission=0.15, ior=1.62)
    marks.drive_rim(material, 0.3, floor=0.08)
    # Long flat faces: a narrow glint, so a lit face keeps its green and only its ridge goes pale.
    return marks.facet_glint(material, strength=0.7, sharpness=60.0)


def heart_glass(hero):
    """The pink heart the cut shows: the skin's light end, well off the green rind."""
    pink = species.slot_hex(dict(hero['hue'], hue=340, saturation=0.55), luma=0.74)
    material = materials.surface_material('hero-%s-heart' % hero['id'], pink, roughness=0.1, transmission=0.1, ior=1.62, coat=0.5,
                                          emission_hex=species.slot_hex(dict(hero['hue'], hue=340, saturation=0.4), luma=0.9),
                                          emission_strength=0.0)
    material['albedo_hex'] = pink
    marks.drive_rim(material, 0.3, floor=0.16)
    return material


# --- stars, watered: P4's starsteel, six-rayed steel bursts with a watered damask --------------------


def build_watered_stars(hero, centre, rng):
    body = watered_steel(hero)
    spark = marks.spark_material(hero)
    stars = []
    for i, (px, pz, outer) in enumerate(((0.0, 0.0, 0.3), (-0.3, 0.26, 0.17), (0.3, -0.24, 0.19))):
        at = (centre[0] + px + rng.uniform(-0.03, 0.03), centre[1] + pz + rng.uniform(-0.03, 0.03))
        stars += star_burst(hero, i, at, outer, rng, body, spark)
    return stars


def star_burst(hero, i, at, outer, rng, body, spark):
    """A six-armed star plate standing proud of the face, chamfered, with a hot point at its centre."""
    phase = rng.uniform(0, math.pi / 3)
    points = shapes.star_points(at, outer, outer * 0.3, arms=6, phase=phase)
    plate = shapes.add_polygon('%s-mark-%d' % (hero['id'], i), points, -0.01, outer * 0.28)
    plate = shapes.bevel(plate, outer * 0.06, segments=1)
    point = shapes.add_polygon('%s-spark-%d' % (hero['id'], i), shapes.regular_points(at, outer * 0.11, 6, phase),
                               -0.01 - outer * 0.28 - 0.003, 0.004)
    return [shapes.assign(plate, body), shapes.assign(point, spark)]


def watered_steel(hero):
    """Lavender-grey steel with the watered damask: fine wandering bands in roughness and bump."""
    body = species.slot_hex(hero['hue'])
    material = materials.surface_material('hero-' + hero['id'], body, metallic=1.0, roughness=0.25, coat=0.3,
                                          emission_hex=species.slot_hex(hero['hue'], luma=0.92), emission_strength=0.0)
    tree = material.node_tree
    bsdf = materials.principled_of(material)
    coords = tree.nodes.new('ShaderNodeTexCoord')
    wave = tree.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = 9.0
    wave.inputs['Distortion'].default_value = 5.0
    wave.inputs['Detail'].default_value = 1.0
    roughness = tree.nodes.new('ShaderNodeMapRange')
    roughness.inputs['To Min'].default_value = 0.08
    roughness.inputs['To Max'].default_value = 0.4
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    tree.links.new(coords.outputs['Object'], wave.inputs['Vector'])
    tree.links.new(wave.outputs['Fac'], roughness.inputs['Value'])
    tree.links.new(roughness.outputs['Result'], bsdf.inputs['Roughness'])
    tree.links.new(wave.outputs['Fac'], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    material['albedo_hex'] = body
    marks.drive_rim(material, 0.3, floor=0.1)
    return marks.facet_glint(material, strength=0.8, sharpness=24.0)


# --- spindles, deep-red: P4's painite, a spray of six-sided spindles fanning from a root ---------------


def build_deep_red_spindles(hero, centre, rng):
    body = deep_red_glass(hero)
    spark = marks.spark_material(hero)
    root = (centre[0] + rng.uniform(-0.08, 0.08), centre[1] - 0.3)
    spindles = []
    count = 6
    for i in range(count):
        angle = math.pi / 2 + (i - (count - 1) / 2) * 0.36 + rng.uniform(-0.06, 0.06)
        length = rng.uniform(0.44, 0.6)
        spindles += spindle(hero, i, root, angle, length, rng.uniform(0.05, 0.065), body, spark if i % 2 == 0 else None)
    return spindles


def spindle(hero, i, root, angle, length, radius, body, spark):
    """
    Two six-sided cones base to base, the spindle habit, its foot at the root, lying on the face; every
    other spindle carries the skin's fire glint, a thin spark along its waist.
    """
    direction = Vector((math.cos(angle), -0.12, math.sin(angle))).normalized()
    foot = Vector((root[0], -radius * 0.3, root[1]))
    made = []
    for k, sign in enumerate((1, -1)):
        centre = foot + direction * (length / 2 + sign * length / 4)
        rotation = (direction * sign).to_track_quat('Z', 'Y').to_euler()
        cone = shapes.add_cone('%s-mark-%d-%d' % (hero['id'], i, k), radius, length / 2, tuple(centre), rotation=rotation)
        made.append(shapes.assign(cone, body))
    if spark is not None:
        waist = foot + direction * (length / 2)
        points = shapes.shard_points((waist.x, waist.z), radius * 0.9, radius * 0.12, angle)
        made.append(shapes.assign(shapes.add_polygon('%s-spark-%d' % (hero['id'], i), points, -radius * 1.05 - 0.01, 0.004), spark))
    return made


def deep_red_glass(hero):
    body = species.slot_hex(hero['hue'])
    material = marks.surface_gem(hero, body, roughness=0.05, transmission=0.2, ior=1.8)
    marks.drive_rim(material, 0.4, floor=0.14)
    return marks.facet_glint(material, strength=2.0, sharpness=16.0)


# --- spheres, glowing: P5's fire garnet, six faceted balls lit from within ----------------------------


def build_glowing_spheres(hero, centre, rng):
    body = ember_glass(hero)
    spark = marks.spark_material(hero)
    balls = []
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 6, 0.3, 0.24)):
        radius = rng.uniform(0.1, 0.135)
        at = (centre[0] + px, centre[1] + pz)
        ball = shapes.add_icosphere('%s-mark-%d' % (hero['id'], i), radius, (at[0], radius * 0.25, at[1]),
                                    subdivisions=2, rotation=(rng.uniform(0, math.tau), rng.uniform(0, math.tau), 0.0))
        balls.append(shapes.assign(marks.faceted(ball), body))
        if i % 2 == 0:
            # The ember glow's hot point: a small pale spot where the crown catches the lamp.
            spot = shapes.regular_points((at[0] - radius * 0.25, at[1] + radius * 0.25), radius * 0.16, 6, rng.uniform(0, math.pi))
            balls.append(shapes.assign(shapes.add_polygon('%s-spark-%d' % (hero['id'], i), spot, -radius * 0.78 - 0.012, 0.004), spark))
    return balls


def ember_glass(hero):
    """Red garnet glowing from within: a floor of its own colour's emission under the rim and glint."""
    body = species.slot_hex(hero['hue'])
    material = marks.surface_gem(hero, body, roughness=0.08, transmission=0.1, ior=1.8)
    bsdf = materials.principled_of(material)
    bsdf.inputs['Emission Color'].default_value = materials.rgba(materials.linear_of_hex(species.slot_hex(hero['hue'], luma=0.7)))
    marks.drive_rim(material, 0.3, floor=0.3)
    return marks.facet_glint(material, strength=1.2, sharpness=24.0)


# --- blooms, molten: P5's core gold, rosettes of smooth gold lobes ------------------------------------


def build_molten_blooms(hero, centre, rng):
    body = molten_gold(hero)
    lobes = []
    for i, (px, pz, radius) in enumerate(((-0.2, 0.18, 0.19), (0.22, 0.14, 0.15), (0.0, -0.22, 0.17))):
        at = (centre[0] + px + rng.uniform(-0.03, 0.03), centre[1] + pz + rng.uniform(-0.03, 0.03))
        lobes += bloom(hero, i, at, radius, rng, body)
    return lobes


def bloom(hero, i, at, radius, rng, body):
    """A rosette: a raised centre lobe ringed by five petal lobes, all smooth and sunk past the waist."""
    phase = rng.uniform(0, math.tau)
    made = [shapes.add_icosphere('%s-mark-%d' % (hero['id'], i), radius * 0.5, (at[0], radius * 0.15, at[1]), subdivisions=2,
                                 scale=(1.0, 0.7, 1.0))]
    for k, (px, pz) in enumerate(shapes.ring_positions(5, radius * 0.72, phase)):
        petal = shapes.add_icosphere('%s-petal-%d-%d' % (hero['id'], i, k), radius * 0.42, (at[0] + px, radius * 0.22, at[1] + pz),
                                     subdivisions=2, scale=(1.25, 0.6, 0.85), rotation=(0.0, 0.0, phase + k / 5 * math.tau))
        made.append(petal)
    return [shapes.assign(obj, body) for obj in made]


def molten_gold(hero):
    body = species.slot_hex(hero['hue'])
    material = materials.surface_material('hero-' + hero['id'], body, metallic=1.0, roughness=0.12, coat=0.4,
                                          emission_hex=species.slot_hex(hero['hue'], luma=0.92), emission_strength=0.0)
    material['albedo_hex'] = body
    marks.drive_rim(material, 0.4, floor=0.16)
    return marks.facet_glint(material, strength=1.2, sharpness=12.0)


# --- hearts, inner-fire: P5's kiln ruby, heart crystals with a flame-bright core ------------------------


def build_inner_fire_hearts(hero, centre, rng):
    body = hearth_glass(hero)
    fire = inner_fire_material(hero)
    hearts = []
    for i, (px, pz, size) in enumerate(((-0.19, 0.14, 0.34), (0.22, 0.2, 0.26), (0.08, -0.24, 0.3))):
        at = (centre[0] + px + rng.uniform(-0.03, 0.03), centre[1] + pz + rng.uniform(-0.03, 0.03))
        hearts += heart_crystal(hero, i, at, size, rng.uniform(-0.5, 0.5), body, fire)
    return hearts


def heart_crystal(hero, i, at, size, spin, body, fire):
    """A heart outline extruded toward the camera and chamfered, its core a smaller heart of fire."""
    thickness = size * 0.45
    crystal = shapes.add_polygon('%s-mark-%d' % (hero['id'], i), heart_points(at, size, spin), -0.01, thickness)
    crystal = shapes.bevel(crystal, size * 0.09, segments=1)
    core = shapes.add_polygon('%s-fire-%d' % (hero['id'], i), heart_points(at, size * 0.42, spin), -0.01 - thickness - 0.003, 0.004)
    return [shapes.assign(crystal, body), shapes.assign(core, fire)]


def heart_points(centre, size, spin, count=24):
    """The classic heart curve, scaled to `size` across, turned by `spin`, the point downward."""
    cx, cz = centre
    points = []
    for k in range(count):
        t = k / count * math.tau
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        x, z = x / 34 * size, z / 34 * size
        points.append((cx + x * math.cos(spin) - z * math.sin(spin), cz + x * math.sin(spin) + z * math.cos(spin)))
    return points


def hearth_glass(hero):
    body = species.slot_hex(hero['hue'])
    material = marks.surface_gem(hero, body, roughness=0.05, transmission=0.2, ior=1.77)
    marks.drive_rim(material, 0.35, floor=0.1)
    return marks.facet_glint(material, strength=1.5, sharpness=26.0)


def inner_fire_material(hero):
    """The flame in the heart: the ruby's own side of red, bright, emission alone; never heat orange."""
    flame = species.slot_hex(dict(hero['hue'], hue=10, saturation=0.9), luma=0.8)
    material = materials.flat_material('hero-%s-fire' % hero['id'], flame, strength=1.4)
    material['albedo_hex'] = flame
    return material


marks.PATTERN_BUILDERS.update({
    ('pencils', 'two-tone'): build_two_tone_pencils,
    ('stars', 'watered'): build_watered_stars,
    ('spindles', 'deep-red'): build_deep_red_spindles,
    ('spheres', 'glowing'): build_glowing_spheres,
    ('blooms', 'molten'): build_molten_blooms,
    ('hearts', 'inner-fire'): build_inner_fire_hearts,
})
