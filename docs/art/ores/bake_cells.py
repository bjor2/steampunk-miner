"""
Bakes one family's cells into atlas tiles (#144, the #52 bake carried to ore cells): for each
cell, a 1 m quad just behind the marks bakes, with Cycles selected-to-active at 1 sample and seed
0, the albedo (each material's authored colour through an emission stand-in, so glass and metal
bake their colour and not a lit result; the mask from a white stand-in goes into the alpha), the
tangent-space normal (OpenGL, +Y up) and the emission, divided by `coreEmissionMax` so the map
holds strength / 4 for the shader to scale back. Tiles are `contentPx` square (248) and land in
art/build/ores/<cell-id>.<map>.png (gitignored); assemble_atlas.py packs them into the atlases.
The host rock is never baked: the game draws its own strata under the ore.
"""

import os

import bpy
import numpy as np

import atlas_layout as layout
import ore_stage as stage

BUILD_DIR = os.path.join(layout.REPO_ROOT, 'art', 'build', 'ores')
BAKE_CLEARANCE = 0.01
FLAT_NORMAL = (0.5, 0.5, 1.0, 1.0)
EMISSION_THRESHOLD = 1.0 / 255.0
COLOUR_SPACES = {'albedo': 'sRGB', 'normal': 'Non-Color', 'emissive': 'sRGB', 'mask': 'Non-Color'}


def bake_family(family, looks):
    configure_cycles_bake()
    convert_tubes_to_meshes()
    os.makedirs(BUILD_DIR, exist_ok=True)
    size = looks['atlas']['contentPx']
    scale = 1.0 / looks['grades']['coreEmissionMax']
    for variant in range(family['variants']):
        for grade in stage.GRADES:
            cell = {'familyId': family['id'], 'variant': variant, 'grade': grade}
            bake_cell(layout.cell_id_of(cell), size, scale, glows=grade >= looks['grades']['emissiveFromGrade'])
    print('baked %s: %d tiles into %s' % (family['id'], family['variants'] * len(stage.GRADES), os.path.relpath(BUILD_DIR, layout.REPO_ROOT)))


def convert_tubes_to_meshes():
    """Selected-to-active bakes from meshes; the file was saved before, so the curves stay in it."""
    curves = [obj for obj in bpy.context.scene.objects if obj.type == 'CURVE']
    if not curves:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for obj in curves:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = curves[0]
    bpy.ops.object.convert(target='MESH')


def configure_cycles_bake():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.seed = 0
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_clear = False
    scene.render.bake.margin = 4
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.normal_space = 'TANGENT'
    scene.frame_set(stage.PEAK_FRAME)


def bake_cell(cell_id, size, emission_scale, glows):
    """The cell's marks (its collection, lights left out) baked from a quad covering its 1 m."""
    marks = [obj for obj in bpy.data.collections[cell_id].objects if obj.type in ('MESH', 'CURVE')]
    bodies = [obj for obj in marks if not is_glow_layer(obj)]
    centre = cell_centre_of(cell_id)
    images = {kind: blank_image(cell_id, kind, size) for kind in COLOUR_SPACES}
    quad = bake_quad_for(marks, centre)
    hidden = hide_other_collections(cell_id)
    try:
        with_stand_ins(bodies, albedo_stand_in, lambda: bake_onto(quad, bodies, images['albedo'], 'EMIT'))
        bake_onto(quad, bodies, images['normal'], 'NORMAL')
        if glows:
            bake_onto(quad, marks, images['emissive'], 'EMIT')
        with_stand_ins(bodies, mask_stand_in, lambda: bake_onto(quad, bodies, images['mask'], 'EMIT'))
    finally:
        for collection in hidden:
            collection.hide_render = False
        remove_quad(quad)
    glows = finish_tile(images, emission_scale) and glows
    save_tile(cell_id, images, glows)
    for image in images.values():
        bpy.data.images.remove(image)


def is_glow_layer(obj):
    """Cores, veins, arcs and sparkles are emission the shader animates: emissive map only."""
    return any(slot.material is not None and slot.material.get('glow_only') for slot in obj.material_slots)


def hide_other_collections(cell_id):
    """Only the cell's own objects go into the bake's scene, so each bake syncs 20 objects, not 400."""
    hidden = [collection for collection in bpy.data.collections if collection.name != cell_id and not collection.hide_render]
    for collection in hidden:
        collection.hide_render = True
    return hidden


def cell_centre_of(cell_id):
    rock = bpy.data.objects['rock-' + cell_id]
    return rock.location.x, rock.location.z


def bake_quad_for(marks, centre):
    """A 1 m quad behind the marks, facing -Y, its UVs across the whole tile; the cage covers the marks."""
    cx, cz = centre
    low_y = min(bounds_y_of(obj)[0] for obj in marks)
    high_y = max(bounds_y_of(obj)[1] for obj in marks)
    y = high_y + BAKE_CLEARANCE
    mesh = bpy.data.meshes.new('bake-quad')
    mesh.from_pydata([(cx - 0.5, y, cz - 0.5), (cx + 0.5, y, cz - 0.5), (cx + 0.5, y, cz + 0.5), (cx - 0.5, y, cz + 0.5)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new()
    for corner, uv_point in zip(mesh.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[corner.index].uv = uv_point
    quad = bpy.data.objects.new('bake-quad', mesh)
    bpy.context.scene.collection.objects.link(quad)
    quad['cage_extrusion'] = (high_y - low_y) + 2 * BAKE_CLEARANCE
    return quad


def bounds_y_of(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    ys = [(evaluated.matrix_world @ vertex.co).y for vertex in mesh.vertices] or [0.0]
    evaluated.to_mesh_clear()
    return min(ys), max(ys)


def blank_image(cell_id, kind, size):
    image = bpy.data.images.new('%s.%s' % (cell_id, kind), size, size, alpha=True, float_buffer=(kind == 'emissive'))
    image.colorspace_settings.name = COLOUR_SPACES[kind]
    image.generated_color = FLAT_NORMAL if kind == 'normal' else (0.0, 0.0, 0.0, 0.0)
    return image


# --- stand-ins ----------------------------------------------------------------------------------------------


def with_stand_ins(marks, stand_in_of, bake):
    """Swaps every slot's material for a stand-in, bakes, then puts the originals back."""
    originals = [(slot, slot.material) for obj in marks for slot in obj.material_slots]
    for slot, material in originals:
        slot.material = stand_in_of(material)
    try:
        bake()
    finally:
        for slot, material in originals:
            slot.material = material


def albedo_stand_in(material):
    """Pure emission in the material's authored colour, so the bake is the colour and nothing else."""
    hex_colour = material.get('albedo_hex') if material is not None else None
    if hex_colour is None:
        hex_colour = hex_of_base_colour(material)
    return emission_material('stand-in-albedo-' + hex_colour, hex_colour)


def hex_of_base_colour(material):
    if material is None:
        return '#808080'
    bsdf = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return '#808080'
    linear = bsdf.inputs['Base Color'].default_value[:3]
    display = [channel * 12.92 if channel <= 0.0031308 else 1.055 * channel ** (1 / 2.4) - 0.055 for channel in linear]
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c * 255))) for c in display)


def mask_stand_in(material):
    return emission_material('stand-in-mask', '#ffffff')


def emission_material(name, hex_colour):
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = stage.materials.rgba(stage.materials.linear_of_hex(hex_colour))
    emission.inputs['Strength'].default_value = 1.0
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    return material


# --- the bake ---------------------------------------------------------------------------------------------------


def bake_onto(quad, marks, image, bake_type):
    target_material_on(quad, image)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in marks:
        obj.select_set(True)
    quad.select_set(True)
    bpy.context.view_layer.objects.active = quad
    bpy.ops.object.bake(
        type=bake_type,
        pass_filter=set(),
        use_selected_to_active=True,
        cage_extrusion=quad['cage_extrusion'],
        max_ray_distance=0.0,
        normal_space='TANGENT',
        margin=bpy.context.scene.render.bake.margin,
        margin_type='EXTEND',
        use_clear=False,
        target='IMAGE_TEXTURES',
    )


def target_material_on(quad, image):
    material = bpy.data.materials.new('bake-target')
    material.use_nodes = True
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    material.node_tree.nodes.active = node
    quad.data.materials.clear()
    quad.data.materials.append(material)


def remove_quad(quad):
    mesh = quad.data
    for material in list(mesh.materials):
        bpy.data.materials.remove(material)
    bpy.data.objects.remove(quad)
    bpy.data.meshes.remove(mesh)


def finish_tile(images, emission_scale):
    """Albedo alpha becomes the mask, the normal is flat outside it, emission is scaled; answers whether anything glows."""
    mask = pixels_of(images['mask'])[:, 0:1]
    albedo = pixels_of(images['albedo'])
    albedo[:, 3:4] = mask
    write_pixels(images['albedo'], albedo)
    normal = pixels_of(images['normal'])
    normal = np.where(mask > 0.5, normal, np.array(FLAT_NORMAL, dtype=np.float32))
    normal[:, 3] = 1.0
    write_pixels(images['normal'], normal)
    emissive = pixels_of(images['emissive'])
    emissive[:, 0:3] = np.clip(emissive[:, 0:3] * emission_scale, 0.0, 1.0)
    emissive[:, 3] = 1.0
    write_pixels(images['emissive'], emissive)
    return bool(emissive[:, 0:3].max() > EMISSION_THRESHOLD)


def pixels_of(image):
    pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(-1, 4)


def write_pixels(image, pixels):
    image.pixels.foreach_set(pixels.reshape(-1))
    image.update()


def save_tile(cell_id, images, glows):
    kinds = ('albedo', 'normal', 'emissive') if glows else ('albedo', 'normal')
    stale = os.path.join(BUILD_DIR, '%s.emissive.png' % cell_id)
    if not glows and os.path.exists(stale):
        os.remove(stale)
    for kind in kinds:
        image = images[kind]
        image.filepath_raw = os.path.join(BUILD_DIR, '%s.%s.png' % (cell_id, kind))
        image.file_format = 'PNG'
        image.save()
