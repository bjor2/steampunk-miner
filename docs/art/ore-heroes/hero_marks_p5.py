"""
The five non-gem heroes of P5 (ticket 853 under #647, the `foothold-p5` pool of #453), registered
in hero_marks.PATTERN_BUILDERS under the row's silhouette and pattern: Wolfram (`bars`, `satin`),
Saurian Vertebra (`vertebrae`, `porous`), Firebrass (`ribbons`, `flame-lit`), Heat Spinel
(`octahedra`, `faceted`; the lustrous and fiery octahedra are gems of other planets) and Petrified
Heartwood (`logs`, `growth-ringed`). Each follows its mineral-skin row (docs/art/mineral-skins
batches p5-b2 and p5-b3: crossed bars, a vertebra column, curled ribbons lit by flame tongues,
spinel-law macles with a banked glow, log rounds with growth rings) in the hue slot's colour, under
the subdued treatment of hero_bodies.py. Nothing here glows in the reserved heat band (15 to 45):
the brass stays at its slot's 50 and the spinel's glow on its own pink.
"""

import math

import bpy
import hero_bodies as bodies
import hero_marks as marks
import ore_materials as materials
import ore_shapes as shapes
from mathutils import Vector


def in_face(angle):
    return Vector((math.cos(angle), 0.0, math.sin(angle)))


def along_face(direction):
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


# --- bars, satin: wolfram, a heap of square bars, three laid one way and two crossed over them --------


def build_satin_bars(hero, centre, rng):
    body = satin_steel(hero)
    angle = rng.uniform(0, math.pi)
    bars = [bar(hero, i, centre, angle + rng.uniform(-0.08, 0.08), offset + rng.uniform(-0.02, 0.02), rng.uniform(0.5, 0.62), -0.045, body)
            for i, offset in enumerate((-0.17, 0.0, 0.17))]
    bars += [bar(hero, 3 + i, centre, angle + turn, offset, rng.uniform(0.46, 0.56), -0.135, body)
             for i, (turn, offset) in enumerate(((0.95, 0.08), (-0.95, -0.08)))]
    return bars


def bar(hero, i, centre, angle, offset, length, depth, body):
    """A square bar lying along the face at `angle`, `offset` across it, its centre `depth` off the face."""
    across = in_face(angle + math.pi / 2)
    at = Vector((centre[0], depth, centre[1])) + across * offset
    rotation = along_face(Vector((math.cos(angle), 0.0, math.sin(angle))))
    square = shapes.add_prism('%s-mark-%d' % (hero['id'], i), 0.045, length, tuple(at), rotation=rotation, sides=4)
    return shapes.assign(square, body)


def satin_steel(hero):
    """Wolfram's steel grey in a fibre satin: fine streaks along every bar in the roughness and the bump."""
    material = bodies.matte_body(hero, metallic=1.0, roughness=0.45, coat=0.1)
    coords = bodies.object_coords(material)
    fibres = bodies.wave_bands(material, coords, 48.0, distortion=0.6, direction='X')
    bodies.drive_roughness(material, fibres, 0.32, 0.55)
    bodies.drive_bump(material, fibres, 0.1)
    return material


# --- vertebrae, porous: saurian vertebra, four waisted spools along a gentle curve ---------------------


def build_porous_vertebrae(hero, centre, rng):
    body = spongy_bone(hero)
    spine = Vector((centre[0], 0.0, centre[1] - 0.9))
    tilt = rng.uniform(-0.2, 0.2)
    vertebrae = []
    for i, step in enumerate((-1.5, -0.5, 0.5, 1.5)):
        angle = math.pi / 2 + tilt + math.radians(10.5 * step)
        vertebrae += vertebra(hero, i, spine + in_face(angle) * 0.9, angle, rng, body)
    return vertebrae


def vertebra(hero, i, at, radial_angle, rng, body):
    """A centrum, a waisted spool with flared ends, its neural spine above and a process below."""
    up, along = in_face(radial_angle), in_face(radial_angle + math.pi / 2)
    rotation = along_face(along)
    centre = at + Vector((0.0, -0.04, 0.0))
    spool = shapes.add_prism('%s-mark-%d' % (hero['id'], i), 0.052, 0.12, tuple(centre), rotation=rotation, sides=14)
    ends = [shapes.add_prism('%s-end-%d-%d' % (hero['id'], i, k), 0.08, 0.028, tuple(centre + along * (sign * 0.074)), rotation=rotation, sides=14)
            for k, sign in enumerate((1, -1))]
    spine = fin(hero, i, at, up, along, rng)
    process = shapes.add_cone('%s-process-%d' % (hero['id'], i), 0.03, 0.08, tuple(centre - up * 0.09), rotation=along_face(-up), sides=8)
    return [shapes.assign(obj, body) for obj in [spool, *ends, spine, process]]


def fin(hero, i, at, up, along, rng):
    """The neural spine: a flat blade rising from the centrum, flared at its top."""
    foot = at + up * 0.05
    top = at + up * rng.uniform(0.17, 0.2)
    lean = along * rng.uniform(-0.03, 0.03)
    corners = [foot - along * 0.04, foot + along * 0.04, top + lean + along * 0.025, top + lean - along * 0.025]
    return shapes.add_polygon('%s-spine-%d' % (hero['id'], i), [tuple(c.xz) for c in corners], -0.03, 0.03)


def spongy_bone(hero):
    """Old bone, dry: a pale lattice of struts round dark pores, no gloss at all."""
    material = bodies.matte_body(hero, roughness=0.85)
    coords = bodies.object_coords(material)
    _, pores = bodies.voronoi_patches(material, coords, 26.0)
    pit = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.32))
    pitted = bodies.colour_ramp(material, pores, [(0.1, pit), (0.2, bodies.body_hex(hero))])
    bodies.drive_base_colour(material, pitted)
    bodies.drive_bump(material, pores, 0.3)
    return material


# --- ribbons, flame-lit: firebrass, three brass ribbons ending in a curl, lit from below ---------------


def build_flame_lit_ribbons(hero, centre, rng):
    body = flame_lit_brass(hero)
    layout = ((-0.4, 0.28, 0.25, 0.5), (-0.3, -0.05, -0.15, 0.56), (-0.1, -0.38, 0.4, 0.44))
    ribbons = []
    for i, (px, pz, angle, length) in enumerate(layout):
        start = Vector((centre[0] + px, 0.0, centre[1] + pz))
        ribbons.append(ribbon(hero, i, start, angle + rng.uniform(-0.1, 0.1), length, rng.choice((-1, 1)), rng, body))
    return ribbons


def ribbon(hero, i, start, angle, length, turn, rng, body):
    """A wavering strip that narrows where it twists and ends in a tight curl."""
    spine = ribbon_spine(start, angle, length, turn, rng)
    left, right = [], []
    for k, (point, width) in enumerate(spine):
        ahead = spine[min(k + 1, len(spine) - 1)][0] - spine[max(k - 1, 0)][0]
        side = Vector((-ahead.z, 0.0, ahead.x)).normalized() * width
        left.append(tuple((point + side).xz))
        right.append(tuple((point - side).xz))
    strip = shapes.add_polygon('%s-mark-%d' % (hero['id'], i), left + right[::-1], -0.014, 0.022)
    return shapes.assign(strip, body)


def ribbon_spine(start, angle, length, turn, rng):
    """The strip's centreline and half-width: a sinuous run, then a curl of a turn and a quarter."""
    along, across = in_face(angle), in_face(angle + math.pi / 2)
    phase = rng.uniform(0, math.tau)
    spine = []
    for k in range(19):
        t = k / 18
        point = start + along * (t * length) + across * (math.sin(t * 2.3 * math.pi + phase) * 0.05)
        spine.append((point, 0.028 * (0.55 + 0.45 * abs(math.cos(t * 2.6 * math.pi)))))
    end = spine[-1][0]
    pivot = end + across * (turn * 0.075)
    for k in range(1, 15):
        t = k / 14
        theta = math.atan2(-turn * 0.075 * across.z, -turn * 0.075 * across.x) + turn * t * 1.25 * math.tau
        radius = 0.075 * (1.0 - 0.62 * t)
        spine.append((pivot + in_face(theta) * radius, 0.025 * (1.0 - 0.5 * t)))
    return spine


def flame_lit_brass(hero):
    """
    Brass gone dark under a furnace patina, the bright metal showing where the flame tongues lick it
    from below, as the skin's base draws it: a soft lift along each ribbon's foot, never heat orange.
    """
    material = bodies.matte_body(hero, metallic=1.0, roughness=0.32, coat=1.0)
    coords = bodies.object_coords(material)
    patina = bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], 0, 0.22)), luma=0.26)
    bodies.drive_base_colour(material, bodies.colour_ramp(material, bodies.noise_field(material, coords, 9.0, detail=2.0),
                                                          [(0.5, patina), (0.68, bodies.body_hex(hero))]))
    bodies.drive_bump(material, bodies.noise_field(material, coords, 40.0, detail=1.0), 0.12)
    tree = material.node_tree
    height = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coords, height.inputs['Vector'])
    from_below = tree.nodes.new('ShaderNodeMapRange')
    from_below.inputs['From Min'].default_value = -0.25
    from_below.inputs['From Max'].default_value = 0.2
    from_below.inputs['To Min'].default_value = 1.0
    from_below.inputs['To Max'].default_value = 0.0
    tree.links.new(height.outputs['Z'], from_below.inputs['Value'])
    tongues = bodies.math_of(material, 'MULTIPLY', from_below.outputs['Result'],
                             bodies.wave_bands(material, coords, 7.0, distortion=2.0, direction='X'))
    bodies.add_sheen(material, tongues, 0.35)
    materials.principled_of(material).inputs['Emission Color'].default_value = materials.rgba(
        materials.linear_of_hex(bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], 0, 0.35)), luma=0.62)))
    return material


# --- octahedra, faceted: heat spinel, spinel-law macles, flat triangles with a smaller twin turned on each


def build_faceted_octahedra(hero, centre, rng):
    body = banked_glass(hero)
    macles = []
    phase = rng.uniform(0, math.tau)
    for i, ((px, pz), radius) in enumerate(zip(shapes.ring_positions(3, 0.22, phase), (0.2, 0.17, 0.15))):
        at = (centre[0] + px + rng.uniform(-0.02, 0.02), centre[1] + pz + rng.uniform(-0.02, 0.02))
        macles += macle_pair(hero, i, at, radius, rng.uniform(0, math.tau), body)
    return macles


def macle_pair(hero, i, at, radius, spin, body):
    """A flat triangular macle and its smaller twin turned through 60 degrees on its face: the spinel law."""
    base = add_macle('%s-mark-%d' % (hero['id'], i), radius, (at[0], 0.0, at[1]), spin, 0.3)
    twin = add_macle('%s-twin-%d' % (hero['id'], i), radius * 0.62, (at[0], -radius * 0.3 * 0.75, at[1]), spin + math.pi / 3, 0.3)
    return [shapes.assign(base, body), shapes.assign(twin, body)]


def add_macle(name, radius, location, spin, flatness):
    """A flattened triangular bipyramid: three corners in the face, a shallow apex toward the camera and back."""
    corners = [(radius * math.cos(spin + k * math.tau / 3), 0.0, radius * math.sin(spin + k * math.tau / 3)) for k in range(3)]
    vertices = corners + [(0.0, -radius * flatness, 0.0), (0.0, radius * flatness * 0.6, 0.0)]
    faces = [(0, 1, 3), (1, 2, 3), (2, 0, 3), (1, 0, 4), (2, 1, 4), (0, 2, 4)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return marks.faceted(obj)


def banked_glass(hero):
    """Pink spinel under a hard coat, the banked glow: a faint lift face-on, on the stone's own pink."""
    material = bodies.matte_body(hero, roughness=0.06, coat=0.8, transmission=0.15, ior=1.72)
    face_on = bodies.math_of(material, 'SUBTRACT', 1.0, bodies.facing_term(material, 0.6))
    bodies.add_sheen(material, face_on, 0.3)
    materials.principled_of(material).inputs['Emission Color'].default_value = materials.rgba(
        materials.linear_of_hex(bodies.body_hex(dict(hero, hue=bodies.shifted_hue(hero['hue'], 0, 0.4)), luma=0.6)))
    return material


# --- logs, growth-ringed: petrified heartwood, two rounds seen end-on and a log lying across ---------


def build_growth_ringed_logs(hero, centre, rng):
    body = heartwood(hero)
    angle = rng.uniform(0.2, 0.7)
    logs = [log(hero, 0, centre, angle, rng, body)]
    for i, (px, pz, radius) in enumerate(((-0.27, 0.26, 0.16), (0.3, -0.26, 0.125))):
        logs.append(log_round(hero, 1 + i, (centre[0] + px, centre[1] + pz), radius, rng, body))
    return logs


def log_round(hero, i, at, radius, rng, body):
    """A short section of trunk seen end-on, its cut face toward the camera."""
    disc = shapes.add_prism('%s-mark-%d' % (hero['id'], i), radius, 0.09, (at[0], -0.03, at[1]),
                            rotation=(-math.pi / 2, 0.0, rng.uniform(0, math.tau)), sides=20)
    return shapes.assign(disc, body)


def log(hero, i, centre, angle, rng, body):
    """A length of trunk lying across the cell, its bark grain along it."""
    rotation = along_face(Vector((math.cos(angle), -0.04, math.sin(angle))))
    trunk = shapes.add_prism('%s-mark-%d' % (hero['id'], i), 0.1, 0.56, (centre[0], -0.055, centre[1]), rotation=rotation, sides=18)
    shapes.shade_smooth(trunk)
    return shapes.assign(trunk, body)


def heartwood(hero):
    """Olive stone wood: growth rings round the axis, a shade deeper, under a faint chalcedony gleam."""
    material = bodies.matte_body(hero, roughness=0.5, coat=0.35)
    coords = bodies.object_coords(material)
    rings = bodies.wave_bands(material, coords, 11.0, distortion=0.5, direction='Z', wave_type='RINGS')
    deep = bodies.body_hex(hero, luma=max(0.1, hero['hue']['luma'] - 0.2))
    bodies.drive_base_colour(material, bodies.colour_ramp(material, rings, [(0.3, deep), (0.7, bodies.body_hex(hero))]))
    bodies.drive_bump(material, rings, 0.15)
    bodies.add_sheen(material, bodies.math_of(material, 'SUBTRACT', 1.0, bodies.facing_term(material, 0.6)), 0.12)
    return material


marks.PATTERN_BUILDERS.update({
    ('bars', 'satin'): build_satin_bars,
    ('vertebrae', 'porous'): build_porous_vertebrae,
    ('ribbons', 'flame-lit'): build_flame_lit_ribbons,
    ('octahedra', 'faceted'): build_faceted_octahedra,
    ('logs', 'growth-ringed'): build_growth_ringed_logs,
})
