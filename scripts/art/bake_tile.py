"""
Bakes a ground or casing tile (#52 "Ground and casing": tileable 1024x1024 maps, 4 x 4 m at
256 px/m, albedo and normal, plus emission for a tile whose entry says `"emissive": true`, #113). The .blend holds one mesh object named for the asset id: a 4 x 4 m
quad in the XZ plane facing -Y (the Front view, so +X is right and +Z up), its UVs 0..1 across it.
Its material must repeat at the UV edges; the S7d sources map their noise onto a torus
(scripts/art/author_tiles.py), so the left edge continues the right one.

The bake reads the object's own material: Cycles' diffuse colour pass is the albedo (opaque) and a
tangent-space normal bake (OpenGL, +Y up) picks up its bump. A glowing tile (refractory seams, lava)
also bakes its emit pass, which encode.sh writes as the emissive map. Cycles on the CPU with a fixed seed,
sample count and thread count, so an unchanged .blend bakes the same pixels. The PNGs go to
art/build/<id>/ for scripts/art/encode.sh; toktx mipmaps them.
"""

import os
import sys

import bpy
import numpy

import asset_layout

BAKE_THREADS = 8
# Blender stores vertices as 32-bit floats, so a 4 m side can be off in the last digits.
SIZE_TOLERANCE_M = 1e-4
MAP_COLOUR_SPACES = {'albedo': 'sRGB', 'normal': 'Non-Color', 'emissive': 'sRGB'}
BAKE_TYPES = {'albedo': ('DIFFUSE', {'COLOR'}), 'normal': ('NORMAL', set()), 'emissive': ('EMIT', set())}


def export_tile(asset_id, rules):
    tile = tile_object_of(asset_id, rules)
    configure_cycles_bake(rules)
    images = {kind: blank_image(asset_id, kind, rules['tilePx']) for kind in map_kinds_of(asset_id)}
    for kind, image in images.items():
        bake_into(tile, image, *BAKE_TYPES[kind])
    save_maps(asset_id, images)
    print('baked tile %s at %dx%d' % (asset_id, rules['tilePx'], rules['tilePx']))


def map_kinds_of(asset_id):
    """Albedo and normal, and emissive when the asset's entry says the tile glows."""
    entry = asset_layout.load_manifest_entry(asset_id) or {}
    return ['albedo', 'normal', 'emissive'] if entry.get('emissive') is True else ['albedo', 'normal']


def tile_object_of(asset_id, rules):
    """The one mesh object, named for the asset, spanning exactly one tile; refuses anything else."""
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    problems = tile_scene_problems(asset_id, rules, meshes)
    if problems:
        for problem in problems:
            print('export refused: ' + problem, file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)
    return meshes[0]


def tile_scene_problems(asset_id, rules, meshes):
    if [obj.name for obj in meshes] != [asset_id]:
        return ['a tile scene holds exactly one mesh object, named "%s" (found: %s)' % (asset_id, ', '.join(obj.name for obj in meshes) or 'none')]
    tile = meshes[0]
    problems = [] if tile.data.uv_layers else ['tile "%s" has no UV map' % asset_id]
    if not any(slot.material is not None for slot in tile.material_slots):
        problems.append('tile "%s" has no material to bake' % asset_id)
    metres = rules['tilePx'] / rules['pxPerMetre'][asset_layout.category_of(asset_id)]
    width, height = size_of(tile)
    if abs(width - metres) > SIZE_TOLERANCE_M or abs(height - metres) > SIZE_TOLERANCE_M:
        problems.append('tile "%s" is %.4f x %.4f m; a tile is %g x %g m (#52)' % (asset_id, width, height, metres, metres))
    return problems


def size_of(obj):
    """Width along X and height along Z of the evaluated mesh, world space."""
    points = numpy.array([tuple(obj.matrix_world @ vertex.co) for vertex in obj.data.vertices])
    extent = points.max(axis=0) - points.min(axis=0)
    return extent[0], extent[2]


def configure_cycles_bake(rules):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = rules['tileSamples']
    scene.cycles.seed = 0
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = BAKE_THREADS
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 0
    scene.render.bake.normal_space = 'TANGENT'


def blank_image(asset_id, kind, side):
    image = bpy.data.images.new('%s.%s' % (asset_id, kind), side, side, alpha=False)
    image.colorspace_settings.name = MAP_COLOUR_SPACES[kind]
    return image


def bake_into(tile, image, bake_type, pass_filter):
    """Bakes the tile's own material into `image` through a temporary active image node."""
    materials = {slot.material for slot in tile.material_slots if slot.material is not None}
    targets = [add_target_node(material, image) for material in sorted(materials, key=lambda m: m.name)]
    try:
        bpy.ops.object.select_all(action='DESELECT')
        tile.select_set(True)
        bpy.context.view_layer.objects.active = tile
        bpy.ops.object.bake(
            type=bake_type,
            pass_filter=pass_filter,
            use_selected_to_active=False,
            normal_space='TANGENT',
            margin=0,
            use_clear=True,
            target='IMAGE_TEXTURES',
        )
    finally:
        for material, node in targets:
            material.node_tree.nodes.remove(node)
    make_opaque(image)


def add_target_node(material, image):
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    material.node_tree.nodes.active = node
    return material, node


def make_opaque(image):
    pixels = numpy.empty(image.size[0] * image.size[1] * 4, dtype=numpy.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(-1, 4)
    pixels[:, 3] = 1.0
    image.pixels.foreach_set(pixels.reshape(-1))
    image.update()


def save_maps(asset_id, images):
    folder = asset_layout.bake_dir_of(asset_id)
    os.makedirs(folder, exist_ok=True)
    for kind, image in images.items():
        image.filepath_raw = os.path.join(folder, '%s.%s.png' % (asset_id, kind))
        image.file_format = 'PNG'
        image.save()
    # A stale emission bake would be encoded as a map this tile no longer ships.
    stale = os.path.join(folder, '%s.emissive.png' % asset_id)
    if 'emissive' not in images and os.path.exists(stale):
        os.remove(stale)
