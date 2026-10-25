"""
The five non-gem heroes of P4 (ticket 853 under #647, the `foothold-p4` pool of #453), registered
in hero_marks.PATTERN_BUILDERS under the row's silhouette and pattern: Wire Silver (`curls`,
`tarnished`), Belemnite (`darts`, `polished`), Clockspring Steel (`springs`, `blued`), Alexandrite
(`twins`, `colour-change`) and Ichthyosaur Eye (`rings`, `plated`). Each follows its mineral-skin
row (docs/art/mineral-skins batches p4-b2 and p4-b3: ram's-horn curls under sulphide tarnish,
bullet darts, coil springs in blued temper, cyclic twins in dichroic zones, the sclerotic ring of
sutured plates) in the hue slot's colour, under the subdued treatment of hero_bodies.py. P4's
cheapest gem is the quietest of the five planets, so these stay the darkest: the silver is mostly
tarnish, the amber and the green wear a hard coat, the bone plates are pitted.
"""

import math

import hero_bodies as bodies
import hero_marks as marks
import ore_materials as materials
import ore_shapes as shapes
from mathutils import Vector


def in_face(angle):
    return Vector((math.cos(angle), 0.0, math.sin(angle)))


def along_face(direction):
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


# --- curls, tarnished: wire silver, four wires curled like a ram's horn, mostly gone to tarnish -------


def build_tarnished_curls(hero, centre, rng):
    body = tarnished_silver(hero)
    phase = rng.uniform(0, math.tau)
    curls = []
    for i in range(4):
        heading = phase + i / 4 * math.tau + rng.uniform(-0.3, 0.3)
        root = Vector((centre[0], 0.0, centre[1])) + in_face(heading) * 0.06
        curls.append(curl(hero, i, root, heading, rng.choice((-1, 1)), rng.uniform(0.4, 0.48), body))
    return curls


def curl(hero, i, root, heading, turn, length, body):
    """A wire nearly straight from the root, turning with the cube of its length into a tight curl at the tip."""
    steps = 40
    points, radii = [], []
    at = Vector(root)
    for k in range(steps + 1):
        t = k / steps
        angle = heading + turn * 2.1 * math.pi * t ** 3
        points.append((at.x, -0.04 - 0.03 * t, at.z))
        radii.append(0.036 - 0.016 * t)
        at = at + in_face(angle) * (length / steps)
    wire = bodies.tapered_tube('%s-mark-%d' % (hero['id'], i), points, radii)
    return shapes.assign(wire, body)


def tarnished_silver(hero):
    """Silver under heavy sulphide tarnish: dark blotches with a slate fringe, the clean metal in between."""
    material = bodies.matte_body(hero, metallic=1.0, roughness=0.3, coat=0.1)
    coords = bodies.object_coords(material)
    field = bodies.noise_field(material, coords, 16.0, detail=3.0)
    clean = bodies.math_of(material, 'GREATER_THAN', field, 0.44)
    tarnish = bodies.colour_ramp(material, field, [(0.0, '#2b2a2e'), (0.36, '#56535c'), (0.44, bodies.body_hex(hero))],
                                 interpolation='CONSTANT')
    bodies.drive_base_colour(material, tarnish)
    bodies.drive_roughness(material, clean, 0.74, 0.28)
    return material


# --- darts, polished: belemnite, bullet-shaped guards lying every way, one snapped in two -------------


def build_polished_darts(hero, centre, rng):
    cortex = bodies.accent_body(hero, 'cortex', saturation=0.14, luma=0.4, roughness=0.65)
    amber = polished_calcite(hero)
    darts = []
    for i, (px, pz) in enumerate(shapes.scatter_positions(rng, 4, 0.24, 0.3)):
        angle = rng.uniform(0, math.pi)
        at = Vector((centre[0] + px, 0.0, centre[1] + pz))
        darts += guard(hero, i, at, angle, rng.uniform(0.042, 0.05), rng.uniform(0.2, 0.26), i == 1, cortex, amber)
    return darts


def guard(hero, i, at, angle, radius, length, snapped, cortex, amber):
    """
    A guard: a round body drawn out to a long point one way and rounded the other, lying along the
    face, its dull cortex cut by one polished window that shows the amber calcite inside.
    """
    direction = Vector((math.cos(angle), -0.06, math.sin(angle))).normalized()
    rotation = along_face(direction)
    centre = at + Vector((0.0, -radius * 0.2, 0.0))
    gap = direction * (0.05 if snapped else 0.0)
    shaft = shapes.add_prism('%s-mark-%d' % (hero['id'], i), radius, length, tuple(centre - gap / 2), rotation=rotation, sides=12)
    tip = shapes.add_cone('%s-tip-%d' % (hero['id'], i), radius, radius * 3.0, tuple(centre + gap / 2 + direction * (length / 2 + radius * 1.5)),
                          rotation=rotation, sides=12)
    heel = shapes.add_icosphere('%s-heel-%d' % (hero['id'], i), radius, tuple(centre - gap / 2 - direction * (length / 2)), subdivisions=2,
                                scale=(1.0, 1.0, 0.55), rotation=rotation)
    shapes.shade_smooth(shaft)
    window = polished_window(hero, i, centre - gap / 2, direction, radius, length)
    return [shapes.assign(obj, cortex) for obj in (shaft, tip, heel)] + [shapes.assign(window, amber)]


def polished_window(hero, i, centre, direction, radius, length):
    """The polished cut along the guard's crest: a long six-sided lens, flat, on the face toward the camera."""
    across = Vector((-direction.z, 0.0, direction.x)).normalized()
    half = length * 0.34
    points = [centre + direction * half, centre + direction * (half * 0.6) + across * (radius * 0.5),
              centre - direction * (half * 0.6) + across * (radius * 0.5), centre - direction * half,
              centre - direction * (half * 0.6) - across * (radius * 0.5), centre + direction * (half * 0.6) - across * (radius * 0.5)]
    return shapes.add_polygon('%s-window-%d' % (hero['id'], i), [tuple(p.xz) for p in points], centre.y - radius - 0.002, 0.005)


def polished_calcite(hero):
    """
    Amber calcite under a hard polish, translucent, growth rings a shade deeper along the guard. The
    clear coat and the light through the stone pale the amber, as they pale the gems' glass.
    """
    material = bodies.matte_body(hero, roughness=0.12, coat=1.0, transmission=0.32, ior=1.6)
    coords = bodies.object_coords(material)
    rings = bodies.wave_bands(material, coords, 16.0, distortion=0.3, direction='Z')
    deep = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.2))
    bodies.drive_base_colour(material, bodies.colour_ramp(material, rings, [(0.3, deep), (0.75, bodies.body_hex(hero))]))
    return material


# --- springs, blued: clockspring steel, three coil springs lying on the face in temper colours --------


def build_blued_springs(hero, centre, rng):
    body = blued_steel(hero)
    springs = []
    layout = ((-0.06, 0.2, 0.36, 0.085, 6), (0.14, -0.14, 0.3, 0.07, 5), (-0.26, -0.22, 0.26, 0.06, 5))
    for i, (px, pz, length, radius, turns) in enumerate(layout):
        angle = rng.uniform(0, math.pi)
        at = Vector((centre[0] + px + rng.uniform(-0.02, 0.02), 0.0, centre[1] + pz + rng.uniform(-0.02, 0.02)))
        springs.append(spring(hero, i, at, angle, length, radius, turns, body))
    return springs


def spring(hero, i, at, angle, length, radius, turns, body):
    """A helix of wire lying along the face, its coils resting on the rock and rising clear of it."""
    along, across = in_face(angle), in_face(angle + math.pi / 2)
    steps = turns * 16
    points = []
    for k in range(steps + 1):
        t = k / steps
        phase = t * turns * math.tau
        point = at + along * ((t - 0.5) * length) + across * (radius * math.cos(phase))
        points.append((point.x, -radius * 0.85 - radius * math.sin(phase), point.z))
    coil = shapes.add_tube('%s-mark-%d' % (hero['id'], i), points, 0.017, resolution=3)
    return shapes.assign(coil, body)


def blued_steel(hero):
    """Blued spring steel: temper drifting from the slot's blue to a deeper indigo, fine draw-file lines."""
    material = bodies.matte_body(hero, metallic=1.0, roughness=0.3, coat=0.2)
    coords = bodies.object_coords(material)
    indigo = bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], 22, 0.5)), luma=0.4)
    temper = bodies.colour_ramp(material, bodies.noise_field(material, coords, 5.0, detail=1.0),
                                [(0.35, indigo), (0.6, bodies.body_hex(hero))])
    bodies.drive_base_colour(material, temper)
    file_lines = bodies.wave_bands(material, coords, 90.0, direction='X')
    bodies.drive_roughness(material, file_lines, 0.22, 0.4)
    bodies.add_sheen(material, bodies.math_of(material, 'GREATER_THAN', file_lines, 0.94), 0.2)
    return material


# --- twins, colour-change: alexandrite, two sixlings of tabular crystals in dichroic zones -----------


def build_colour_change_twins(hero, centre, rng):
    body = dichroic_glass(hero)
    flash = bodies.sheen_mark_material(hero, saturation=0.3)
    twins = []
    for i, (px, pz, size) in enumerate(((-0.17, 0.13, 0.155), (0.21, -0.17, 0.12))):
        at = Vector((centre[0] + px, 0.0, centre[1] + pz))
        twins += sixling(hero, i, at, size, rng, body, flash)
    return twins


def sixling(hero, i, at, size, rng, body, flash):
    """Three long tabular crystals grown through each other at 60 degrees, a sector flash on one."""
    spin = rng.uniform(0, math.pi / 3)
    thickness = size * 0.3
    crystals = []
    for k in range(3):
        tabular = shapes.add_cube('%s-mark-%d-%d' % (hero['id'], i, k), size, (at.x, -thickness * 0.35, at.z),
                                  scale=(2.5, 0.3, 0.72), rotation=(0.0, spin + k * math.pi / 3, 0.0))
        crystals.append(shapes.assign(shapes.bevel(tabular, size * 0.06, segments=1), body))
    return crystals + [sector(hero, i, at, size, spin, flash, thickness)]


def sector(hero, i, at, size, spin, flash, thickness):
    """The sector flash: one pale wedge on a tabular face, where a zone throws the lamp back whole."""
    along, across = in_face(-spin), in_face(-spin + math.pi / 2)
    base = at + along * (size * 0.55)
    points = [tuple((base + across * (size * 0.3)).xz), tuple((base + along * (size * 0.55)).xz), tuple((base - across * (size * 0.3)).xz)]
    wedge = shapes.add_polygon('%s-flash-%d' % (hero['id'], i), points, -thickness * 0.85 - 0.006, 0.004)
    return shapes.assign(wedge, flash)


def dichroic_glass(hero):
    """
    The colour change under the headlamp's warm light: raspberry over most of the stone and toward
    the grazing edge, the slot's green in zones face-on, as alexandrite turns red by lamplight.
    """
    material = bodies.matte_body(hero, roughness=0.06, coat=1.0, transmission=0.3, ior=1.75)
    coords = bodies.object_coords(material)
    raspberry = bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], 175, 0.45)), luma=0.42)
    zoned = bodies.colour_ramp(material, bodies.noise_field(material, coords, 4.0, detail=1.5),
                               [(0.6, raspberry), (0.7, bodies.body_hex(hero))])
    tree = material.node_tree
    turned = tree.nodes.new('ShaderNodeMix')
    turned.data_type = 'RGBA'
    turned.inputs[7].default_value = materials.rgba(materials.linear_of_hex(raspberry))
    tree.links.new(bodies.value_range(material, bodies.facing_term(material, 0.5), 0.0, 1.0, from_max=0.7), turned.inputs['Factor'])
    tree.links.new(zoned, turned.inputs[6])
    bodies.drive_base_colour(material, turned.outputs[2])
    return material


# --- rings, plated: ichthyosaur eye, the sclerotic ring of lapped bone plates, one whole, one broken ---


def build_plated_rings(hero, centre, rng):
    body = sutured_bone(hero)
    eye = Vector((centre[0] + 0.04, 0.0, centre[1] + 0.03))
    plates = [plate(hero, k, eye, 0.165, 0.3, k / 13 * math.tau + rng.uniform(-0.03, 0.03), 13, k % 2, rng, body) for k in range(13)]
    broken = Vector((centre[0] - 0.3, 0.0, centre[1] - 0.3))
    plates += [plate(hero, 13 + k, broken, 0.08, 0.17, math.radians(15 + 32 * k), 11, k % 2, rng, body) for k in range(5)]
    return plates


def plate(hero, k, eye, inner, outer, angle, count, lapped, rng, body):
    """One bone plate of the ring: a trapezoid from the eye's rim outward, lapped over its neighbours."""
    direction, across = in_face(angle), in_face(angle + math.pi / 2)
    half_in, half_out = math.pi * inner / count * 1.12, math.pi * outer / count * 1.12
    corners = [eye + direction * inner - across * half_in, eye + direction * inner + across * half_in,
               eye + direction * outer + across * half_out * rng.uniform(0.85, 1.0), eye + direction * outer - across * half_out * rng.uniform(0.85, 1.0)]
    bone = shapes.add_polygon('%s-mark-%d' % (hero['id'], k), [tuple(c.xz) for c in corners], -0.012 - 0.02 * lapped, 0.024)
    return shapes.assign(shapes.bevel(bone, 0.006, segments=1), body)


def sutured_bone(hero):
    """Slate bone, greasy: pitted with pores, a bluer tone over some plates, a soft coat and no gloss."""
    material = bodies.matte_body(hero, roughness=0.45, coat=0.3)
    coords = bodies.object_coords(material)
    _, pores = bodies.voronoi_patches(material, coords, 30.0)
    pitted = bodies.math_of(material, 'GREATER_THAN', pores, 0.17)
    cooler = bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], -12, 0.25)), luma=0.57)
    tones = bodies.colour_ramp(material, bodies.noise_field(material, coords, 3.0, detail=1.0),
                               [(0.48, cooler), (0.68, bodies.body_hex(hero))])
    pit = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.3))
    tree = material.node_tree
    mixed = tree.nodes.new('ShaderNodeMix')
    mixed.data_type = 'RGBA'
    mixed.inputs[6].default_value = materials.rgba(materials.linear_of_hex(pit))
    tree.links.new(pitted, mixed.inputs['Factor'])
    tree.links.new(tones, mixed.inputs[7])
    bodies.drive_base_colour(material, mixed.outputs[2])
    bodies.drive_bump(material, pores, 0.25)
    return material


marks.PATTERN_BUILDERS.update({
    ('curls', 'tarnished'): build_tarnished_curls,
    ('darts', 'polished'): build_polished_darts,
    ('springs', 'blued'): build_blued_springs,
    ('twins', 'colour-change'): build_colour_change_twins,
    ('rings', 'plated'): build_plated_rings,
})
