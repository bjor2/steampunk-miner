"""
Headless Blender export of one art asset (#52 "Folders"). Run through scripts/art/export.sh, or:

    blender -b art/blender/<id>/<id>.blend --python-exit-code 1 \
        -P scripts/art/export_asset.py -- --asset <id>

It refuses the scene (exit 1, every problem listed) if it has an armature, a shape key or an
action, or a part object whose name is not a valid part id (#52 acceptance 4). Otherwise it bakes
every part with Cycles onto its own rectangle of the atlas, viewed along +Y (Blender's Front view):
base colour with the part mask in alpha, a tangent-space normal map (OpenGL, +Y up) and emission.
The PNG bakes go to art/build/<id>/ (gitignored) for scripts/art/encode.sh; the parts.json sidecar
goes to public/assets/<category>/<id>/. The .blend is never saved, and an unchanged .blend writes a
byte-identical sidecar (#52 acceptance 5).
"""

import hashlib
import json
import os
import sys

import bpy
import numpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asset_layout  # noqa: E402

TIER_COLLECTION_PREFIX = 'tier-'
# A part's quad sits this far behind it, and bake rays start this far in front (metres).
BAKE_CLEARANCE = 0.01
FLAT_NORMAL = (0.5, 0.5, 1.0, 1.0)
EMISSION_THRESHOLD = 1.0 / 255.0
MAP_COLOUR_SPACES = {'albedo': 'sRGB', 'normal': 'Non-Color', 'emissive': 'sRGB', 'mask': 'Non-Color'}


def main():
    asset_id = asset_id_from_arguments()
    rules = asset_layout.load_rules()
    refuse_unless_exportable(asset_id, rules)
    parts = part_layouts_of(asset_id, rules, part_objects())
    sidecar = asset_layout.build_sidecar(asset_id, parts, rules, source_of(), has_emissive=True)
    has_emissive = bake_atlas(asset_id, sidecar, rules)
    if not has_emissive:
        sidecar['maps']['emissive'] = False
    write_outputs(asset_id, sidecar)


def asset_id_from_arguments():
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(arguments) != 2 or arguments[0] != '--asset':
        fail(['usage: blender -b <file.blend> -P export_asset.py -- --asset <asset-id>'])
    return arguments[1]


def fail(problems):
    for problem in problems:
        print('export refused: ' + problem, file=sys.stderr)
    sys.stderr.flush()
    sys.exit(1)


# --- refusal (#52 acceptance 4) -----------------------------------------------------------------


def refuse_unless_exportable(asset_id, rules):
    problems = asset_problems(asset_id) + rig_problems() + part_name_problems(asset_id, rules)
    if problems:
        fail(problems)


def asset_problems(asset_id):
    if asset_layout.category_of(asset_id) is None:
        return ['"%s" names no asset category (%s)' % (asset_id, ', '.join(asset_layout.CATEGORIES))]
    form = manifest_form_of(asset_id)
    if form != 'parts':
        return ['"%s" is a %s asset; this script bakes parts assets only' % (asset_id, form)]
    return []


def manifest_form_of(asset_id):
    with open(os.path.join(asset_layout.REPO_ROOT, 'art', 'asset-manifest.json'), encoding='utf-8') as file:
        manifest = json.load(file)
    forms = [entry['form'] for entry in manifest['assets'] if entry['id'] == asset_id]
    return forms[0] if forms else 'unlisted'


def rig_problems():
    """No armatures, shape keys or actions: parts move in code, never in the file (#51 acc. 2)."""
    problems = ['armature "%s"' % armature.name for armature in bpy.data.armatures]
    problems += ['shape keys on mesh "%s"' % key.user.name for key in bpy.data.shape_keys]
    problems += ['action "%s"' % action.name for action in bpy.data.actions]
    return [problem + ' is not allowed: parts move in code (#52)' for problem in problems]


def part_name_problems(asset_id, rules):
    objects = part_objects()
    if not objects:
        return ['the scene has no mesh objects to export']
    problems = []
    for obj in objects:
        problems += asset_layout.part_id_problems(asset_id, obj.name, rules)
        problems += tier_collection_problems(asset_id, obj, rules)
    return problems


def tier_collection_problems(asset_id, obj, rules):
    if asset_id != 'vehicle' or asset_layout.part_id_problems(asset_id, obj.name, rules):
        return []
    wanted = TIER_COLLECTION_PREFIX + str(asset_layout.tier_of_vehicle_part(obj.name, rules))
    names = [collection.name for collection in obj.users_collection]
    return [] if wanted in names else ['part "%s" belongs in the collection %s' % (obj.name, wanted)]


def part_objects():
    """One mesh object per part (#52); lights, cameras and empties are not parts."""
    return sorted((obj for obj in bpy.context.scene.objects if obj.type == 'MESH'), key=lambda o: o.name)


# --- layout ---------------------------------------------------------------------------------------


def part_layouts_of(asset_id, rules, objects):
    depth_order = sorted(objects, key=lambda obj: (-round(obj.matrix_world.translation.y, 4), obj.name))
    layouts = [part_layout_of(asset_id, rules, obj, depth_order.index(obj)) for obj in objects]
    problems = [problem for layout in layouts for problem in layout.pop('problems')]
    if problems:
        fail(problems)
    return layouts


def part_layout_of(asset_id, rules, obj, depth_rank):
    """Size and pivot from the evaluated mesh's bounds in X (right) and Z (up); the origin is the pivot."""
    (min_x, min_z), (max_x, max_z), _ = bounds_of(obj)
    origin = obj.matrix_world.translation
    pivot = (origin.x - min_x, origin.z - min_z)
    size = (max_x - min_x, max_z - min_z)
    inside = all(-1e-6 <= pivot[axis] <= size[axis] + 1e-6 for axis in (0, 1))
    return {
        'id': obj.name,
        'tier': asset_layout.tier_of_vehicle_part(obj.name, rules) if asset_id == 'vehicle' else 1,
        'sizeM': list(size),
        'pivotM': [min(max(value, 0.0), size[axis]) for axis, value in enumerate(pivot)],
        'atM': [origin.x, origin.z],
        'z': int(obj['z']) if 'z' in obj else depth_rank,
        'problems': [] if inside else ['part "%s" has its origin outside its bounds' % obj.name],
    }


def bounds_of(obj):
    """((min x, min z), (max x, max z), (min y, max y)) of the evaluated mesh, world space."""
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = numpy.array([tuple(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices])
    evaluated.to_mesh_clear()
    low, high = points.min(axis=0), points.max(axis=0)
    return (low[0], low[2]), (high[0], high[2]), (low[1], high[1])


def source_of():
    path = bpy.data.filepath
    with open(path, 'rb') as file:
        digest = hashlib.sha256(file.read()).hexdigest()
    return {
        'blend': os.path.relpath(path, asset_layout.REPO_ROOT).replace(os.sep, '/'),
        'sha256': digest,
        'blender': bpy.app.version_string,
    }


# --- baking ---------------------------------------------------------------------------------------


def bake_atlas(asset_id, sidecar, rules):
    """Bakes every map into art/build/<id>/; answers whether anything on the asset glows."""
    configure_cycles_bake(rules['atlasMarginPx'])
    width, height = sidecar['atlasPx']
    images = {kind: blank_image(asset_id, kind, width, height) for kind in MAP_COLOUR_SPACES}
    for part in sidecar['parts']:
        bake_part(bpy.data.objects[part['id']], part['rect'], (width, height), images)
    has_emissive = finish_maps(images)
    save_maps(asset_id, images, has_emissive)
    return has_emissive


def configure_cycles_bake(margin):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.seed = 0
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_clear = False
    scene.render.bake.margin = margin
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.normal_space = 'TANGENT'


def blank_image(asset_id, kind, width, height):
    image = bpy.data.images.new('%s.%s' % (asset_id, kind), width, height, alpha=True)
    image.colorspace_settings.name = MAP_COLOUR_SPACES[kind]
    image.generated_color = FLAT_NORMAL if kind == 'normal' else (0.0, 0.0, 0.0, 0.0)
    return image


def bake_part(obj, rect, atlas, images):
    """Bakes one part from a quad just behind it, its UVs on the part's atlas rectangle."""
    quad = bake_quad_for(obj, rect, atlas)
    stand_in = mask_stand_in_for(obj)
    try:
        bake_onto(quad, obj, images['albedo'], 'DIFFUSE', {'COLOR'})
        bake_onto(quad, obj, images['normal'], 'NORMAL', set())
        bake_onto(quad, obj, images['emissive'], 'EMIT', set())
        bake_onto(quad, stand_in, images['mask'], 'EMIT', set())
    finally:
        bpy.data.objects.remove(stand_in)
        remove_quad(quad)


def bake_quad_for(obj, rect, atlas):
    (min_x, min_z), (max_x, max_z), (min_y, max_y) = bounds_of(obj)
    y = max_y + BAKE_CLEARANCE
    mesh = bpy.data.meshes.new('bake-quad')
    # Faces -Y, towards the Front view camera, so its tangent space is +X right and +Z up.
    mesh.from_pydata([(min_x, y, min_z), (max_x, y, min_z), (max_x, y, max_z), (min_x, y, max_z)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new()
    for corner, uv_point in zip(mesh.loops, uv_corners_of(rect, atlas)):
        uv.data[corner.index].uv = uv_point
    quad = bpy.data.objects.new('bake-quad', mesh)
    bpy.context.scene.collection.objects.link(quad)
    quad['cage_extrusion'] = (max_y - min_y) + 2 * BAKE_CLEARANCE
    return quad


def uv_corners_of(rect, atlas):
    """Rects count from the image's top-left; UVs from its bottom-left."""
    x, y, w, h = rect
    width, height = atlas
    left, right = x / width, (x + w) / width
    bottom, top = 1.0 - (y + h) / height, 1.0 - y / height
    return [(left, bottom), (right, bottom), (right, top), (left, top)]


def mask_stand_in_for(obj):
    """A copy of the part that glows pure white, so an emission bake of it is the part's mask."""
    stand_in = obj.copy()
    bpy.context.scene.collection.objects.link(stand_in)
    white = mask_material()
    for slot in stand_in.material_slots:
        slot.link = 'OBJECT'
        slot.material = white
    if not stand_in.material_slots:
        stand_in.data = obj.data.copy()
        stand_in.data.materials.append(white)
    return stand_in


def mask_material():
    existing = bpy.data.materials.get('bake-mask')
    if existing is not None:
        return existing
    material = bpy.data.materials.new('bake-mask')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    return material


def bake_onto(quad, source, image, bake_type, pass_filter):
    target_material_on(quad, image)
    bpy.ops.object.select_all(action='DESELECT')
    source.select_set(True)
    quad.select_set(True)
    bpy.context.view_layer.objects.active = quad
    bpy.ops.object.bake(
        type=bake_type,
        pass_filter=pass_filter,
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
    """The quad's one material holds only the active image node the bake writes into."""
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


def finish_maps(images):
    """Albedo alpha becomes the part mask; outside every part the normal map is flat."""
    mask = pixels_of(images['mask'])[:, 0:1]
    albedo = pixels_of(images['albedo'])
    albedo[:, 3:4] = mask
    write_pixels(images['albedo'], albedo)
    normal = pixels_of(images['normal'])
    normal = numpy.where(mask > 0.5, normal, numpy.array(FLAT_NORMAL, dtype=numpy.float32))
    normal[:, 3] = 1.0
    write_pixels(images['normal'], normal)
    emissive = pixels_of(images['emissive'])
    emissive[:, 3] = 1.0
    write_pixels(images['emissive'], emissive)
    return bool(emissive[:, 0:3].max() > EMISSION_THRESHOLD)


def pixels_of(image):
    pixels = numpy.empty(image.size[0] * image.size[1] * 4, dtype=numpy.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(-1, 4)


def write_pixels(image, pixels):
    image.pixels.foreach_set(pixels.reshape(-1))
    image.update()


def save_maps(asset_id, images, has_emissive):
    folder = asset_layout.bake_dir_of(asset_id)
    os.makedirs(folder, exist_ok=True)
    stale = os.path.join(folder, '%s.emissive.png' % asset_id)
    if not has_emissive and os.path.exists(stale):
        os.remove(stale)
    kinds = ('albedo', 'normal', 'emissive') if has_emissive else ('albedo', 'normal')
    for kind in kinds:
        image = images[kind]
        image.filepath_raw = os.path.join(folder, '%s.%s.png' % (asset_id, kind))
        image.file_format = 'PNG'
        image.save()


def write_outputs(asset_id, sidecar):
    path = os.path.join(asset_layout.export_dir_of(asset_id), asset_id + '.parts.json')
    asset_layout.write_sidecar(path, sidecar)
    print('exported %s: %d parts, atlas %dx%d' % (asset_id, len(sidecar['parts']), *sidecar['atlasPx']))


if __name__ == '__main__':
    main()
