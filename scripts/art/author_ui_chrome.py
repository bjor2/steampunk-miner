"""
Authors the first version of the UI chrome sprites' Blender sources (ticket 683, the art brief of
docs/ui/design-system.md section 13): the gauge bar and dial, the edge gauge, the odometer drum,
the sheet, card and tab frames, the scroll rail and thumb, the slot ring, the status plate and the
gear button, one .blend per `art.*` token; ticket 716 added the gauge cluster's needle and its
brass and glass frame.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_ui_chrome.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for every asset of the `uiSprites` table in
art/asset-rules.json, or only the ids given after `--`. From then on those files are the sources
(#52): change the art in Blender and re-export, rather than editing this script.

Conventions (export_asset.py, ui_sprites.py): one Blender unit is one CSS px at 1x; the camera
looks along +Y, so a piece at a smaller Y draws over one behind it. Every sprite is a set of flat
faces, one material per piece; the part is their join, named for its sprite, its origin at the
sprite's centre. Nothing is lit: the albedo bake reads the base colour, so a material is a
material's three stops of section 3 (`designTokens.json`) as a vertical gradient along the part
(highlight up), a well the same gradient upside down, or one flat stop. The `accent` material
marks what a planet skin tints (the tint mask), baked in the colour it wears without a skin. A
frame is hollow: its body colour is the CSS behind it, so a translucent panel stays translucent.
Every stroke is at least 1 px wide at 1x.
"""

import json
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import write_ui_placeholders  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TOKENS_PATH = os.path.join(REPO_ROOT, 'src', 'data', 'design', 'designTokens.json')
RULES_PATH = os.path.join(REPO_ROOT, 'art', 'asset-rules.json')
ACCENT_MATERIAL = 'accent'
CIRCLE_SEGMENTS = 128
CORNER_SEGMENTS = 6
# Faces of one part sit this far apart in Y; the export's cage spans whatever the part uses.
LAYER = 1.0
# The odometer's digit cells (section 13: ten digits stacked, 24 px each).
DRUM_CELL_PX = 24
DRUM_DIGITS = 10
# The dial's ticks sweep 240 degrees, like the CSS needle (kit/Gauge.tsx).
DIAL_SWEEP_DEGREES = 240


def main():
    tokens, rules = load_json(TOKENS_PATH), load_json(RULES_PATH)
    for asset_id in requested_asset_ids(rules):
        reset_scene()
        AUTHORS[asset_id](Materials(tokens), rules['uiSprites'][asset_id])
        save_as(asset_id)


def requested_asset_ids(rules):
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return wanted or sorted(rules['uiSprites'])


def load_json(path):
    with open(path, encoding='utf-8') as file:
        return json.load(file)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'NONE'


def save_as(asset_id):
    folder = os.path.join(REPO_ROOT, 'art', 'blender', asset_id)
    os.makedirs(folder, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder, asset_id + '.blend'), compress=True)
    print('authored ' + asset_id)


# --- the sprites ----------------------------------------------------------------------------------


def author_gauge_bar(m, sprites):
    """An iron well in a 2 px brass bezel; the fill and the glass sheen are CSS."""
    pieces = [
        rounded_rect(m.graded('brass'), 96, 16, 5, 0, 0, 0),
        rounded_rect(m.well('iron'), 92, 12, 3, 0, 0, -LAYER),
    ]
    return [build_part('ui-gauge-bar', pieces, (0, 0), sprites)]


def author_gauge_dial(m, sprites):
    """A brass rim round a dark gap, the tintable face (colour.dialFace), 240 degrees of ticks, the hub."""
    face = m.accent(m.colour('dialFace'))
    pieces = [
        disc(m.graded('brass'), 32, 0, 0, 0),
        disc(m.stop('iron', 'shadow'), 29.5, 0, 0, -LAYER),
        disc(face, 28, 0, 0, -2 * LAYER),
        disc(m.graded('brass'), 4, 0, 0, -3 * LAYER),
        disc(m.stop('iron', 'shadow'), 1.5, 0, 0, -4 * LAYER),
    ]
    pieces += dial_ticks(m.stop('iron', 'base'))
    return [build_part('ui-gauge-dial', pieces, (0, 0), sprites)]


def dial_ticks(material):
    """Major ticks every 30 degrees, minor every 10, from -120 (empty) to +120 (full), 0 up."""
    ticks = []
    for step in range(DIAL_SWEEP_DEGREES // 10 + 1):
        angle = -DIAL_SWEEP_DEGREES / 2 + 10 * step
        is_major = step % 3 == 0
        width, length = (2, 6) if is_major else (1, 3)
        ticks.append(tick(material, width, length, 27.5 - length / 2, angle, 0, 0, -3 * LAYER))
    return ticks


def author_gauge_needle(m, sprites):
    """A tapered brass pointer from the dial's hub up to its tip (ticket 716); the origin is the
    foot, where it turns, so CSS sets it on the dial's centre and rotates it there; the shaded
    right flank reads as a ridge."""
    pieces = [
        face(m.graded('brass'), [(-2, 0), (2, 0), (0.5, 28), (-0.5, 28)], 0),
        face(m.stop('brass', 'shadow'), [(0.5, 0), (2, 0), (0.5, 28)], -LAYER),
    ]
    return [build_part('ui-gauge-needle', pieces, (0, 0), sprites)]


def author_edge_gauge(m, sprites):
    """A vertical iron trough between two 1 px brass rails, capped top and bottom; the mark is CSS."""
    pieces = [rect(m.well('iron'), 8, 64, 0, 0, 0)]
    pieces += [rect(m.graded('brass'), 1, 64, x, 0, -LAYER) for x in (-3.5, 3.5)]
    pieces += [rect(m.graded('brass'), 8, 2, 0, z, -LAYER) for z in (-31, 31)]
    return [build_part('ui-edge-gauge', pieces, (0, 0), sprites)]


def author_odometer_drum(m, sprites):
    """Ten parchment digits down an iron drum, 0 at the top, each cell shaded on its own."""
    height = DRUM_CELL_PX * DRUM_DIGITS
    pieces = [rect(m.cell_graded('iron', DRUM_CELL_PX), 16, height, 0, 0, 0)]
    for digit in range(DRUM_DIGITS):
        centre_z = height / 2 - DRUM_CELL_PX / 2 - DRUM_CELL_PX * digit
        pieces.append(glyph(m.stop('parchment', 'base'), str(digit), 14, 0, centre_z, -2 * LAYER))
        if digit > 0:
            pieces.append(rect(m.stop('iron', 'shadow'), 16, 1, 0, centre_z + DRUM_CELL_PX / 2, -LAYER))
    return [build_part('ui-odometer-drum', pieces, (0, 0), sprites)]


def author_frame_sheet(m, sprites):
    """The double brass frame: a 2 px edge, a 4 px iron band with a rivet in each corner, a hairline."""
    pieces = [
        rounded_frame(m.graded('brass'), 128, 128, 6, 2, 0, 0, 0),
        rounded_frame(m.stop('iron', 'base'), 124, 124, 4, 4, 0, 0, 0),
        rounded_frame(m.graded('brass'), 116, 116, 2, 1, 0, 0, 0),
    ]
    pieces += [rivet(m, 2, x, z, -LAYER) for x in (-60, 60) for z in (-60, 60)]
    return [build_part('ui-frame-sheet', pieces, (0, 0), sprites)]


def author_frame_card(m, sprites):
    """A single 2 px bezel over a dark hairline, a stud in each corner."""
    pieces = [
        rounded_frame(m.graded('brass'), 96, 64, 4, 2, 0, 0, 0),
        rounded_frame(m.stop('iron', 'shadow'), 92, 60, 2, 1, 0, 0, 0),
    ]
    pieces += [rivet(m, 1.5, x, z, -LAYER) for x in (-45.5, 45.5) for z in (-29.5, 29.5)]
    return [build_part('ui-frame-card', pieces, (0, 0), sprites)]


def author_frame_glass(m, sprites):
    """The gauge cluster's brass and glass frame (ticket 716): a 3 px bezel, a dark lip, a glint
    of glass along the top inside it and a stud in each corner; hollow, the glass sheen is CSS."""
    pieces = [
        rounded_frame(m.graded('brass'), 48, 48, 8, 3, 0, 0, 0),
        rounded_frame(m.stop('iron', 'shadow'), 42, 42, 5, 1, 0, 0, 0),
        rect(m.stop('parchment', 'highlight'), 24, 1, 0, 19.5, -LAYER),
    ]
    pieces += [rivet(m, 1.5, x, z, -LAYER) for x in (-20, 20) for z in (-20, 20)]
    return [build_part('ui-frame-glass', pieces, (0, 0), sprites)]


def author_frame_tab(m, sprites):
    """A brass top edge and 1 px sides, open at the foot; the active tab's edge is the accent."""
    parts = []
    for at, (part_id, edge) in enumerate((('ui-frame-tab', m.graded('brass')),
                                          ('ui-frame-tab-active', m.accent(m.colour('accent'))))):
        x = write_ui_placeholders.variant_x_of(sprites[part_id], at)
        pieces = [
            rect(m.graded('brass'), 1, 32, x - 31.5, 0, 0),
            rect(m.graded('brass'), 1, 32, x + 31.5, 0, 0),
            rect(edge, 64, 3, x, 14.5, -LAYER),
            rect(m.stop('iron', 'shadow') if at == 0 else m.graded('brass'), 62, 1, x, 12.5, -LAYER),
        ]
        parts.append(build_part(part_id, pieces, (x, 0), sprites))
    return parts


def author_scroll_rail(m, sprites):
    """The thin trough with dim rails and brass caps, and the riveted thumb beside it."""
    rail = [rect(m.well('iron'), 8, 64, 0, 0, 0)]
    rail += [rect(m.stop('brass', 'shadow'), 1, 64, x, 0, -LAYER) for x in (-3.5, 3.5)]
    rail += [rect(m.graded('brass'), 8, 1, 0, z, -2 * LAYER) for z in (-31.5, 31.5)]
    x = write_ui_placeholders.variant_x_of(sprites['ui-scroll-rail-thumb'], 1)
    thumb = [
        rounded_rect(m.graded('brass'), 12, 24, 2, x, 0, 0),
        rounded_frame(m.stop('brass', 'shadow'), 12, 24, 2, 1, x, 0, -LAYER),
    ]
    thumb += [disc(m.stop('iron', 'shadow'), 1.5, x, z, -LAYER) for z in (-6, 6)]
    return [
        build_part('ui-scroll-rail', rail, (0, 0), sprites),
        build_part('ui-scroll-rail-thumb', thumb, (x, 0), sprites),
    ]


def author_slot_ring(m, sprites):
    """A brass ring over an iron well, with a 1 px accent ring inside it; the cooldown is a CSS mask."""
    pieces = [
        disc(m.well('iron'), 20, 0, 0, 0),
        ring(m.graded('brass'), 24, 20, 0, 0, -LAYER),
        ring(m.accent(m.colour('accent')), 20, 19, 0, 0, -2 * LAYER),
    ]
    return [build_part('ui-slot-ring', pieces, (0, 0), sprites)]


def author_status_plate(m, sprites):
    """The #158 triangle plate: a brass triangle frame round an iron face, pointing up."""
    pieces = [
        triangle(m.graded('brass'), 12, 0, 0, 0),
        triangle(m.stop('iron', 'base'), 9, 0, -1, -LAYER),
    ]
    return [build_part('ui-status-plate', pieces, (0, 0), sprites)]


def author_gear_button(m, sprites):
    """A brass gear on a riveted iron plate with an accent lamp at its hub; pressed, the plate sinks."""
    parts = []
    for at, (part_id, plate, gear_z) in enumerate((('ui-gear-button', m.graded('iron'), 0),
                                                    ('ui-gear-button-pressed', m.well('iron'), -1))):
        x = write_ui_placeholders.variant_x_of(sprites[part_id], at)
        pieces = [
            rounded_rect(plate, 48, 48, 6, x, 0, 0),
            rounded_frame(m.graded('brass'), 48, 48, 6, 1, x, 0, -LAYER),
            gear(m.graded('brass'), 11, 15, 8, x, gear_z, -2 * LAYER),
            disc(m.stop('iron', 'shadow'), 5, x, gear_z, -3 * LAYER),
            disc(m.accent(m.colour('accent')), 3, x, gear_z, -4 * LAYER),
        ]
        pieces += [rivet(m, 1.5, x + dx, dz, -2 * LAYER) for dx in (-20, 20) for dz in (-20, 20)]
        parts.append(build_part(part_id, pieces, (x, 0), sprites))
    return parts


def rivet(m, radius, cx, cz, y):
    """A brass stud: its highlight over a shadow dot offset down-right, as the plaque's CSS draws."""
    return [
        disc(m.stop('iron', 'shadow'), radius, cx + 0.5, cz - 0.5, y + LAYER / 2),
        disc(m.stop('brass', 'highlight'), radius, cx, cz, y),
    ]


AUTHORS = {
    'ui-gauge-bar': author_gauge_bar,
    'ui-gauge-dial': author_gauge_dial,
    'ui-gauge-needle': author_gauge_needle,
    'ui-edge-gauge': author_edge_gauge,
    'ui-odometer-drum': author_odometer_drum,
    'ui-frame-sheet': author_frame_sheet,
    'ui-frame-card': author_frame_card,
    'ui-frame-glass': author_frame_glass,
    'ui-frame-tab': author_frame_tab,
    'ui-scroll-rail': author_scroll_rail,
    'ui-slot-ring': author_slot_ring,
    'ui-status-plate': author_status_plate,
    'ui-gear-button': author_gear_button,
}


# --- parts ----------------------------------------------------------------------------------------


def build_part(part_id, pieces, origin_xz, sprites):
    """Joins the pieces into one mesh named for the sprite, its origin the sprite's centre."""
    pieces = flattened(pieces)
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    part = bpy.context.view_layer.objects.active
    bpy.context.scene.cursor.location = (origin_xz[0], 0.0, origin_xz[1])
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    part.name = part_id
    part.data.name = part_id
    part['z'] = 0
    inset = sprites[part_id].get('insetPx')
    if inset is not None:
        part['inset'] = list(inset)
    return part


def flattened(pieces):
    """A rivet is two pieces; the lists read better unflattened."""
    return [piece for entry in pieces for piece in (entry if isinstance(entry, list) else [entry])]


# --- flat pieces (x right, z up, at depth y) -------------------------------------------------------


def face(material, points_xz, y):
    """One flat polygon facing the camera (-Y)."""
    return mesh_piece(material, [(x, y, z) for x, z in points_xz], [list(range(len(points_xz)))])


def band(material, outer_xz, inner_xz, y):
    """Quads between two outlines with the same point count: a ring, a frame or a triangle frame."""
    count = len(outer_xz)
    vertices = [(x, y, z) for x, z in outer_xz] + [(x, y, z) for x, z in inner_xz]
    faces = [[i, (i + 1) % count, count + (i + 1) % count, count + i] for i in range(count)]
    return mesh_piece(material, vertices, faces)


def mesh_piece(material, vertices, faces):
    mesh = bpy.data.meshes.new('piece')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(material)
    piece = bpy.data.objects.new('piece', mesh)
    bpy.context.scene.collection.objects.link(piece)
    return piece


def rect(material, width, height, cx, cz, y):
    return face(material, rect_points(width, height, cx, cz), y)


def rect_points(width, height, cx, cz):
    w, h = width / 2, height / 2
    return [(cx - w, cz - h), (cx + w, cz - h), (cx + w, cz + h), (cx - w, cz + h)]


def disc(material, radius, cx, cz, y):
    return face(material, circle_points(radius, cx, cz), y)


def ring(material, outer, inner, cx, cz, y):
    return band(material, circle_points(outer, cx, cz), circle_points(inner, cx, cz), y)


def circle_points(radius, cx, cz, segments=CIRCLE_SEGMENTS):
    """Starts on +X and passes every axis, so the bounds are exactly the radius."""
    return [(cx + radius * math.cos(2 * math.pi * i / segments), cz + radius * math.sin(2 * math.pi * i / segments))
            for i in range(segments)]


def rounded_rect(material, width, height, radius, cx, cz, y):
    return face(material, rounded_rect_points(width, height, radius, cx, cz), y)


def rounded_frame(material, width, height, radius, thickness, cx, cz, y):
    """A rounded rectangle's outline, `thickness` wide, its inner corners rounded to match."""
    outer = rounded_rect_points(width, height, radius, cx, cz)
    inner = rounded_rect_points(width - 2 * thickness, height - 2 * thickness, max(radius - thickness, 0.0), cx, cz)
    return band(material, outer, inner, y)


def rounded_rect_points(width, height, radius, cx, cz):
    """Counter-clockwise from the bottom-right corner, every corner an arc of CORNER_SEGMENTS."""
    w, h = width / 2 - radius, height / 2 - radius
    corners = [((cx + w, cz - h), -90), ((cx + w, cz + h), 0), ((cx - w, cz + h), 90), ((cx - w, cz - h), 180)]
    points = []
    for (x, z), start in corners:
        for step in range(CORNER_SEGMENTS + 1):
            angle = math.radians(start + 90 * step / CORNER_SEGMENTS)
            points.append((x + radius * math.cos(angle), z + radius * math.sin(angle)))
    return points


def triangle(material, radius, cx, cz, y):
    """An isosceles triangle pointing up, as wide as it is tall (the 24 px plate is square)."""
    return face(material, [(cx, cz + radius), (cx - radius, cz - radius), (cx + radius, cz - radius)], y)


def tick(material, width, length, radius, angle_degrees, cx, cz, y):
    """A radial mark `length` long centred at `radius`, `angle` degrees clockwise from up."""
    angle = math.radians(angle_degrees)
    along = (math.sin(angle), math.cos(angle))
    across = (math.cos(angle), -math.sin(angle))
    points = []
    for a, b in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
        r, s = radius + a * length, b * width
        points.append((cx + along[0] * r + across[0] * s, cz + along[1] * r + across[1] * s))
    return face(material, points, y)


def gear(material, root, tip, teeth, cx, cz, y):
    """A spur gear outline: `teeth` trapezoid teeth from the root circle to the tip circle."""
    points = []
    pitch = 2 * math.pi / teeth
    for tooth in range(teeth):
        base = tooth * pitch
        for fraction, radius in ((0.0, root), (0.25, root), (0.35, tip), (0.65, tip), (0.75, root)):
            angle = base + fraction * pitch
            points.append((cx + radius * math.cos(angle), cz + radius * math.sin(angle)))
    return face(material, points, y)


def glyph(material, text, cap_height, cx, cz, y):
    """A digit of Blender's built-in font as a flat mesh, scaled to `cap_height` and centred."""
    bpy.ops.object.text_add(location=(0.0, 0.0, 0.0))
    piece = bpy.context.view_layer.objects.active
    piece.data.body = text
    piece.data.fill_mode = 'FRONT'
    piece.data.offset = 0.02
    bpy.ops.object.convert(target='MESH')
    piece = bpy.context.view_layer.objects.active
    fit_glyph(piece.data, cap_height, cx, cz, y)
    piece.data.materials.append(material)
    return piece


def fit_glyph(mesh, cap_height, cx, cz, y):
    """Text lies in XY facing +Z; its Y becomes the sprite's Z, scaled so the glyph is `cap_height` tall."""
    xs = [vertex.co.x for vertex in mesh.vertices]
    ys = [vertex.co.y for vertex in mesh.vertices]
    scale = cap_height / (max(ys) - min(ys))
    mid_x, mid_y = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    for vertex in mesh.vertices:
        vertex.co = (cx + (vertex.co.x - mid_x) * scale, y, cz + (vertex.co.y - mid_y) * scale)


# --- materials: the three stops of section 3, baked as flat colour ----------------------------------


class Materials:
    def __init__(self, tokens):
        self.stops = tokens['materials']
        self.colours = tokens['colour']

    def colour(self, name):
        return self.colours[name]

    def graded(self, material):
        """Shadow at the foot, base in the middle, highlight at the top of the part."""
        return self.ramp_material(material, (0.0, 'shadow'), (0.5, 'base'), (1.0, 'highlight'))

    def well(self, material):
        """The gradient upside down: a sunken surface catches its shadow at the top."""
        return self.ramp_material(material + '-well', (0.0, 'highlight'), (0.5, 'base'), (1.0, 'shadow'),
                                  stops_of=material)

    def stop(self, material, stop):
        return flat_material('%s-%s' % (material, stop), self.stops[material][stop])

    def accent(self, hex_colour):
        return flat_material(ACCENT_MATERIAL, hex_colour)

    def cell_graded(self, material, period):
        """The odometer's drum: the gradient repeats every `period` units up the part."""
        return self.ramp_material(material + '-cell', (0.0, 'shadow'), (0.5, 'base'), (1.0, 'highlight'),
                                  stops_of=material, period=period)

    def ramp_material(self, name, *elements, stops_of=None, period=None):
        existing = bpy.data.materials.get(name)
        if existing is not None:
            return existing
        stops = self.stops[stops_of or name]
        return ramp_material(name, [(position, stops[stop]) for position, stop in elements], period)


def flat_material(name, hex_colour):
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    material, shader = new_base_material(name)
    shader.inputs['Base Color'].default_value = (*linear_of(hex_colour), 1.0)
    return material


def ramp_material(name, elements, period):
    material, shader = new_base_material(name)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    ramp = nodes.new('ShaderNodeValToRGB')
    fill_ramp(ramp.color_ramp, elements)
    links.new(height_fraction_output(nodes, links, period), ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], shader.inputs['Base Color'])
    return material


def height_fraction_output(nodes, links, period):
    """0 at the part's foot and 1 at its top (Generated Z), or wrapped every `period` units (Object Z)."""
    coordinates = nodes.new('ShaderNodeTexCoord')
    split = nodes.new('ShaderNodeSeparateXYZ')
    if period is None:
        links.new(coordinates.outputs['Generated'], split.inputs['Vector'])
        return split.outputs['Z']
    links.new(coordinates.outputs['Object'], split.inputs['Vector'])
    wrap = nodes.new('ShaderNodeMath')
    wrap.operation = 'WRAP'
    wrap.inputs[1].default_value = 0.0
    wrap.inputs[2].default_value = float(period)
    links.new(split.outputs['Z'], wrap.inputs[0])
    divide = nodes.new('ShaderNodeMath')
    divide.operation = 'DIVIDE'
    divide.inputs[1].default_value = float(period)
    links.new(wrap.outputs[0], divide.inputs[0])
    return divide.outputs[0]


def fill_ramp(colour_ramp, elements):
    colour_ramp.interpolation = 'LINEAR'
    while len(colour_ramp.elements) < len(elements):
        colour_ramp.elements.new(0.5)
    for element, (position, hex_colour) in zip(colour_ramp.elements, elements):
        element.position = position
        element.color = (*linear_of(hex_colour), 1.0)


def new_base_material(name):
    """A dielectric Principled BSDF: the albedo bake reads its base colour and nothing else."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Metallic'].default_value = 0.0
    shader.inputs['Roughness'].default_value = 1.0
    return material, shader


def linear_of(hex_colour):
    """Scene-linear RGB of a `#rrggbb` token, so the sRGB bake writes the token's bytes back."""
    return tuple(linear_channel_of(int(hex_colour[i:i + 2], 16) / 255.0) for i in (1, 3, 5))


def linear_channel_of(encoded):
    return encoded / 12.92 if encoded <= 0.04045 else ((encoded + 0.055) / 1.055) ** 2.4


if __name__ == '__main__':
    main()
