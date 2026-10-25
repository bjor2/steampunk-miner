"""
The five non-gem heroes of P3 (ticket 853 under #647, the `foothold-p3` pool of #453), registered
in hero_marks.PATTERN_BUILDERS under the row's silhouette and pattern: Native Platinum (`pebbles`,
`burnished`), Coiled Ammonite (`spirals`, `nacreous`), Meteoric Iron (`slabs`, `etched`), Star
Sapphire (`domes`, `starred`) and Opal Jaw (`jaws`, `opaline`). Each follows its mineral-skin row
(docs/art/mineral-skins batches p3-b2 and p3-b3: rolled pebbles, ammonite coils, crusted slabs with
a Widmanstätten etch, cabochon domes with an asterism, a toothed jaw in opal potch) in the hue
slot's colour, under the subdued treatment of hero_bodies.py: the rares are one matte body, the
epics add a second tone and one sheen mark, and none wears the gems' facet glint.
"""

import math

import hero_bodies as bodies
import hero_marks as marks
import ore_materials as materials
import ore_shapes as shapes
from mathutils import Vector

# A standing mark leans this far toward the camera (the -Y of the #52 frame) along its own axis.
TOWARD_CAMERA = -0.25


def in_face(angle):
    return Vector((math.cos(angle), 0.0, math.sin(angle)))


def along_face(direction):
    """The rotation turning a shape's local Z along `direction` (a Vector in the #52 frame)."""
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


# --- pebbles, burnished: native platinum, flattened rolled pebbles in a gravel stringer ----------------


def build_burnished_pebbles(hero, centre, rng):
    body = burnished_metal(hero)
    angle = rng.uniform(0.3, 0.9)
    along, across = in_face(angle), in_face(angle + math.pi / 2)
    pebbles = []
    for i in range(6):
        reach = -0.36 + 0.72 * i / 5 + rng.uniform(-0.03, 0.03)
        offset = rng.uniform(-0.1, 0.1) * (1.0 if i % 2 else -1.0)
        at = Vector((centre[0], 0.0, centre[1])) + along * reach + across * offset
        pebbles.append(pebble(hero, i, at, rng.uniform(0.07, 0.11), rng, body))
    return pebbles


def pebble(hero, i, at, radius, rng, body):
    """A water-rolled pebble: a flattened sphere, half-sunk, longer than it is wide."""
    stone = shapes.add_icosphere('%s-mark-%d' % (hero['id'], i), radius, (at.x, -radius * 0.12, at.z), subdivisions=2,
                                 scale=(rng.uniform(1.05, 1.4), 0.5, rng.uniform(0.8, 1.0)),
                                 rotation=(rng.uniform(-0.15, 0.15), rng.uniform(0, math.tau), 0.0))
    return shapes.assign(stone, body)


def burnished_metal(hero):
    """
    Pale platinum, burnished rather than polished: a broad dull sheen from a high roughness, two
    crossing sets of hairline scratches in the bump, and a soft mottle of wear a shade deeper.
    """
    material = bodies.matte_body(hero, metallic=1.0, roughness=0.58)
    coords = bodies.object_coords(material)
    scratches = bodies.math_of(material, 'MAXIMUM',
                               bodies.wave_bands(material, coords, 70.0, distortion=0.4, direction='X'),
                               bodies.wave_bands(material, coords, 55.0, distortion=0.4, direction='Z'))
    bodies.drive_bump(material, scratches, 0.12)
    wear = bodies.noise_field(material, coords, 7.0)
    bodies.drive_roughness(material, wear, 0.54, 0.75)
    worn = bodies.body_hex(hero, luma=hero['hue']['luma'] - 0.23)
    bodies.drive_base_colour(material, bodies.colour_ramp(material, wear, [(0.22, worn), (0.83, bodies.body_hex(hero))]))
    return material


# --- spirals, nacreous: coiled ammonite, two shells coiled flat, each whorl a run of chambers ----------


def build_nacreous_spirals(hero, centre, rng):
    body = nacre(hero)
    shells = []
    for i, (px, pz, outer, turns) in enumerate(((-0.19, 0.1, 0.25, 2.6), (0.22, -0.17, 0.17, 2.3))):
        at = (centre[0] + px + rng.uniform(-0.02, 0.02), centre[1] + pz + rng.uniform(-0.02, 0.02))
        shells += ammonite(hero, i, at, outer, turns, rng, body)
    return shells


def ammonite(hero, i, at, outer, turns, rng, body):
    """A shell coiled flat: a tube widening as it winds out, ribbed across the outer whorls."""
    phase = rng.uniform(0, math.tau)
    steps = 72
    points, radii = [], []
    for k in range(steps + 1):
        t = k / steps
        theta, radius, tube = whorl_at(t, phase, outer, turns)
        points.append((at[0] + math.cos(theta) * radius, -tube * 0.7, at[1] + math.sin(theta) * radius))
        radii.append(tube)
    shell = bodies.tapered_tube('%s-mark-%d' % (hero['id'], i), points, radii)
    ribs = [rib(hero, '%d-%d' % (i, k), at, whorl_at(0.55 + 0.45 * k / 22, phase, outer, turns), body)
            for k in range(22)]
    return [shapes.assign(shell, body)] + ribs


def whorl_at(t, phase, outer, turns):
    """Where the coil is at `t` of its length: the angle, the whorl's radius and the tube's."""
    theta = phase + t * turns * math.tau
    radius = outer * 0.1 * math.exp(t * math.log(9.0))
    return theta, radius, 0.012 + 0.03 * t


def rib(hero, tag, at, whorl, body):
    """A chamber wall: a thin arch over the whorl, from its inner edge to its outer."""
    theta, radius, tube = whorl
    direction = in_face(theta)
    centre = Vector((at[0], 0.0, at[1]))
    inner = centre + direction * (radius - tube * 0.9)
    crown = centre + direction * radius
    outer = centre + direction * (radius + tube * 0.9)
    points = [(inner.x, -tube * 0.5, inner.z), (crown.x, -tube * 1.7, crown.z), (outer.x, -tube * 0.5, outer.z)]
    return shapes.assign(shapes.add_tube('%s-rib-%s' % (hero['id'], tag), points, 0.009, resolution=2), body)


def nacre(hero):
    """Rose nacre: the body face-on, turning pale and a touch green toward the grazing edge."""
    material = bodies.matte_body(hero, roughness=0.3, coat=0.35)
    pale = bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], 70, 0.2)), luma=0.72)
    sheets = bodies.colour_ramp(material, bodies.facing_term(material, 0.5),
                                [(0.0, bodies.body_hex(hero)), (0.45, bodies.body_hex(hero)), (1.0, pale)])
    bodies.drive_base_colour(material, sheets)
    return material


# --- slabs, etched: meteoric iron, crusted slabs with the Widmanstätten etch and a lamella flash --------


def build_etched_slabs(hero, centre, rng):
    body = etched_iron(hero)
    slabs = []
    phase = rng.uniform(0, math.tau)
    for i, (px, pz) in enumerate(shapes.ring_positions(3, 0.2, phase)):
        size = rng.uniform(0.27, 0.34)
        at = (centre[0] + px + rng.uniform(-0.03, 0.03), centre[1] + pz + rng.uniform(-0.03, 0.03))
        slabs.append(slab(hero, i, at, size, rng, body))
    slabs.append(slab(hero, 3, centre, 0.2, rng, body))
    return slabs


def slab(hero, i, at, size, rng, body):
    """A thick angular slab lying nearly flat, its crust chamfered, standing most of its thickness proud."""
    thickness = size * 0.32
    block = shapes.add_cube('%s-mark-%d' % (hero['id'], i), size, (at[0], -thickness * 0.3, at[1]),
                            scale=(1.0, 0.32, rng.uniform(0.62, 0.8)),
                            rotation=(rng.uniform(-0.12, 0.12), rng.uniform(0, math.tau), rng.uniform(-0.1, 0.1)))
    return shapes.assign(shapes.bevel(block, size * 0.05, segments=1), body)


def etched_iron(hero):
    """
    Steel grey iron with the etch: kamacite bands in three sets 60 degrees apart, dark plessite
    between, and a bright taenite rim along each band, the lamella flash, as the skin draws it.
    """
    material = bodies.matte_body(hero, metallic=1.0, roughness=0.42, coat=0.1)
    coords = bodies.object_coords(material)
    domain = bodies.channel_of(material, bodies.voronoi_patches(material, coords, 2.6, randomness=0.7)[0])
    lamellae = None
    for k, turn in enumerate((0.0, math.pi / 3, 2 * math.pi / 3)):
        band = bodies.wave_bands(material, rotated_in_face(material, coords, turn), 11.0, distortion=0.15, direction='X')
        line = bodies.math_of(material, 'GREATER_THAN', band, 0.78)
        here = bodies.math_of(material, 'MULTIPLY', line, domain_of_third(material, domain, k))
        lamellae = here if lamellae is None else bodies.math_of(material, 'MAXIMUM', lamellae, here)
    plessite = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.22))
    taenite = bodies.body_hex(hero, luma=0.7)
    etched = bodies.colour_ramp(material, bodies.noise_field(material, coords, 6.0, detail=3.0),
                                [(0.35, plessite), (0.65, bodies.body_hex(hero))])
    tree = material.node_tree
    blend = tree.nodes.new('ShaderNodeMix')
    blend.data_type = 'RGBA'
    blend.inputs[7].default_value = materials.rgba(materials.linear_of_hex(taenite))
    tree.links.new(lamellae, blend.inputs['Factor'])
    tree.links.new(etched, blend.inputs[6])
    bodies.drive_base_colour(material, blend.outputs[2])
    bodies.add_sheen(material, lamellae, 0.3)
    return material


def domain_of_third(material, domain, k):
    """One where the cell's random value falls in the k-th third: each etch domain keeps one band set."""
    above = bodies.math_of(material, 'GREATER_THAN', domain, k / 3 - 0.001)
    below = bodies.math_of(material, 'LESS_THAN', domain, (k + 1) / 3)
    return bodies.math_of(material, 'MULTIPLY', above, below)


def rotated_in_face(material, vector, angle):
    """The object's coordinates turned about its depth axis, so a second band set crosses the first."""
    tree = material.node_tree
    rotate = tree.nodes.new('ShaderNodeVectorRotate')
    rotate.rotation_type = 'AXIS_ANGLE'
    rotate.inputs['Axis'].default_value = (0.0, 1.0, 0.0)
    rotate.inputs['Angle'].default_value = angle
    tree.links.new(vector, rotate.inputs['Vector'])
    return rotate.outputs['Vector']


# --- domes, starred: star sapphire, cabochon domes grown in hexagonal zones, an asterism on the crown --


def build_starred_domes(hero, centre, rng):
    body = zoned_sapphire(hero)
    star = bodies.sheen_mark_material(hero, saturation=0.25)
    domes = []
    phase = rng.uniform(0, math.tau)
    for i, ((px, pz), radius) in enumerate(zip(shapes.ring_positions(3, 0.21, phase), (0.2, 0.15, 0.13))):
        at = (centre[0] + px + rng.uniform(-0.02, 0.02), centre[1] + pz + rng.uniform(-0.02, 0.02))
        domes.append(cabochon(hero, i, at, radius, rng, body))
        if i < 2:
            domes += marks.six_rayed_spark(hero, i, at, -radius * 0.6 - 0.012, radius * 0.85, rng, star)
    return domes


def cabochon(hero, i, at, radius, rng, body):
    """A cabochon sunk past its waist: a flattened sphere bulging toward the camera, an oval on the face."""
    dome = shapes.add_icosphere('%s-mark-%d' % (hero['id'], i), radius, (at[0], 0.03, at[1]), subdivisions=3,
                                scale=(1.0, 0.78, 0.6), rotation=(math.pi / 2, rng.uniform(0, math.pi), 0.0))
    return shapes.assign(dome, body)


def zoned_sapphire(hero):
    """Deep blue-violet grown in colour zones round one core a stone: stepped tones, a soft gloss."""
    material = bodies.matte_body(hero, roughness=0.16, coat=0.45, transmission=0.06, ior=1.76)
    coords = bodies.object_coords(material)
    _, distance = bodies.voronoi_patches(material, coords, 2.2, randomness=0.3)
    deep = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.14))
    deeper = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.22))
    zones = bodies.colour_ramp(material, distance, [(0.0, bodies.body_hex(hero)), (0.3, deep), (0.6, bodies.body_hex(hero)), (0.85, deeper)],
                               interpolation='CONSTANT')
    bodies.drive_base_colour(material, zones)
    return material


# --- jaws, opaline: opal jaw, a toothed lower jaw gone to common opal, a flash on a few patches --------


def build_opaline_jaws(hero, centre, rng):
    bone = opal_potch(hero)
    enamel = tooth_enamel(hero)
    pivot = Vector((centre[0], 0.0, centre[1] + 0.16))
    jaw = [jawbone(hero, pivot, 0.38, rng, bone)]
    for i in range(7):
        angle = math.radians(205 + 130 * i / 6 + rng.uniform(-3, 3))
        jaw.append(tooth(hero, i, pivot, 0.38, angle, rng.uniform(0.15, 0.23), rng.uniform(0.038, 0.05), enamel))
    return jaw


def jawbone(hero, pivot, radius, rng, bone):
    """The bone: an arch across the lower half of the cell, tapering toward both ends."""
    points, radii = [], []
    for k in range(25):
        t = k / 24
        angle = math.radians(200 + 140 * t)
        at = pivot + in_face(angle) * radius
        tube = 0.026 + 0.026 * math.sin(t * math.pi)
        points.append((at.x, -tube * 0.5, at.z))
        radii.append(tube)
    arch = bodies.tapered_tube('%s-mark-0' % hero['id'], points, radii)
    return shapes.assign(arch, bone)


def tooth(hero, i, pivot, radius, angle, height, root_radius, enamel):
    """A tooth standing on the bone, pointing in toward the jaw's pivot and leaning out to the camera."""
    base = pivot + in_face(angle) * (radius - 0.01)
    direction = Vector((-math.cos(angle), TOWARD_CAMERA, -math.sin(angle))).normalized()
    cone = shapes.add_cone('%s-tooth-%d' % (hero['id'], i), root_radius, height, tuple(base + direction * (height / 2)),
                           rotation=along_face(direction), sides=8)
    return shapes.assign(cone, enamel)


def opal_potch(hero):
    """
    Milky common opal where the bone was: a mosaic of patches each its own depth, dark seams between,
    and the opal flash on a few, a soft lift toward either side of the hue.
    """
    material = bodies.matte_body(hero, roughness=0.22, coat=0.4, transmission=0.05, ior=1.45)
    coords = bodies.object_coords(material)
    colour, _ = bodies.voronoi_patches(material, coords, 9.0, randomness=0.85)
    _, seam = bodies.voronoi_patches(material, coords, 9.0, randomness=0.85, feature='DISTANCE_TO_EDGE')
    pick = bodies.channel_of(material, colour)
    shadow = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.32))
    mid = bodies.body_hex(hero, luma=hero['hue']['luma'] - 0.16)
    patches = bodies.colour_ramp(material, pick, [(0.0, shadow), (0.3, mid), (0.9, bodies.body_hex(hero))], interpolation='CONSTANT')
    seams = bodies.value_range(material, seam, 0.4, 1.0, from_max=0.03)
    tree = material.node_tree
    darken = tree.nodes.new('ShaderNodeMix')
    darken.data_type = 'RGBA'
    darken.blend_type = 'MULTIPLY'
    darken.inputs['Factor'].default_value = 1.0
    tree.links.new(patches, darken.inputs[6])
    tree.links.new(bodies.colour_ramp(material, seams, [(0.0, '#000000'), (1.0, '#ffffff')]), darken.inputs[7])
    bodies.drive_base_colour(material, darken.outputs[2])
    bodies.add_sheen(material, bodies.math_of(material, 'GREATER_THAN', pick, 0.88), 0.45)
    materials.principled_of(material).inputs['Emission Color'].default_value = materials.rgba(
        materials.linear_of_hex(bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], -45, 0.35)), luma=bodies.SHEEN_LUMA)))
    return material


def tooth_enamel(hero):
    """The teeth keep the bone's milk whole and a touch glossier: enamel, not potch."""
    return bodies.matte_body(hero, roughness=0.3, coat=0.4, name='hero-%s-enamel' % hero['id'])


marks.PATTERN_BUILDERS.update({
    ('pebbles', 'burnished'): build_burnished_pebbles,
    ('spirals', 'nacreous'): build_nacreous_spirals,
    ('slabs', 'etched'): build_etched_slabs,
    ('domes', 'starred'): build_starred_domes,
    ('jaws', 'opaline'): build_opaline_jaws,
})
