"""
Review renders of the magnetic planet's Blender asset (#293): the aurora ribbon and the field dash
as the export bakes them, front on, and the ribbon tinted and repeated as the sky band draws it
over a strip of dark ground. Run in the shared MCP Blender (it appends the parts into a scene of
its own and never reloads the open file) or headless:

    blender -b --factory-startup -P docs/art/magnetic/render_magnetic.py

Writes magnetic-field.front.png and aurora.band.png beside this file.
"""

import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BLEND = os.path.join(REPO_ROOT, 'art', 'blender', 'prop-magnetic-field', 'prop-magnetic-field.blend')
SCENE_NAME = 'review-293'
# The look's colours (src/features/planet-mix/magneticLooks.json): aurora, then field lines.
AURORA_COLOUR = (0.12, 0.45, 1.0, 1.0)
GROUND_COLOUR = (0.05, 0.04, 0.035, 1.0)


def review_scene():
    scene = bpy.data.scenes.get(SCENE_NAME) or bpy.data.scenes.new(SCENE_NAME)
    for obj in list(scene.collection.objects):
        scene.collection.objects.unlink(obj)
    if bpy.context.window is not None:
        bpy.context.window.scene = scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.device = 'CPU'
    scene.view_settings.view_transform = 'Standard'
    scene.world = dark_world()
    return scene


def dark_world():
    world = bpy.data.worlds.get('review-293-sky') or bpy.data.worlds.new('review-293-sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.006, 0.01, 0.025, 1)
    return world


def appended_parts(scene, suffix):
    with bpy.data.libraries.load(BLEND, link=False) as (source, target):
        target.objects = [name for name in source.objects if name in ('aurora-ribbon', 'field-dash')]
    for obj in target.objects:
        obj.name = obj.name.split('.')[0] + suffix
        scene.collection.objects.link(obj)
    return {obj.name.split('.')[0]: obj for obj in target.objects}


def ortho_camera(scene, name, width_m, at):
    data = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = width_m
    camera = bpy.data.objects.get(name) or bpy.data.objects.new(name, data)
    if camera.name not in scene.collection.objects:
        scene.collection.objects.link(camera)
    camera.location = (at[0], -5.0, at[1])
    camera.rotation_euler = (1.5708, 0.0, 0.0)
    scene.camera = camera


def render(scene, file_name, size):
    bpy.context.view_layer.update()
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(HERE, file_name)
    bpy.ops.render.render(write_still=True, scene=scene.name)


def tinted(obj, colour):
    """The band shader's tint: the baked light's brightest channel times the look's colour."""
    material = obj.active_material.copy()
    bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Emission Color'].default_value = colour
    obj.active_material = material


def front_sheet():
    scene = review_scene()
    appended_parts(scene, '.front')
    ortho_camera(scene, 'review-293-front', 4.2, (0.0, -0.3))
    render(scene, 'magnetic-field.front.png', (1400, 700))


def band_sheet():
    """Three ribbons end to end above a ground strip, at the in-game 5 m band height."""
    scene = review_scene()
    for repeat in range(3):
        parts = appended_parts(scene, '.band%d' % repeat)
        scene.collection.objects.unlink(parts['field-dash'])
        ribbon = parts['aurora-ribbon']
        # The plane keeps its quarter turn about X, so its local Y is the world's up.
        ribbon.scale = (4.0, 4.0, 1.0)
        ribbon.location = ((repeat - 1) * 15.0, 0.0, 2.0 + 2.5)
        tinted(ribbon, AURORA_COLOUR)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.0, 0.2, -2.0), rotation=(1.5708, 0, 0))
    ground = bpy.context.view_layer.objects.active
    ground.scale = (46.0, 4.0, 1.0)
    ground.data.materials.append(ground_material())
    if ground.name not in scene.collection.objects:
        scene.collection.objects.link(ground)
    ortho_camera(scene, 'review-293-band', 46.0, (0.0, 3.0))
    render(scene, 'aurora.band.png', (1600, 520))


def ground_material():
    material = bpy.data.materials.get('review-293-ground') or bpy.data.materials.new('review-293-ground')
    material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = GROUND_COLOUR
    bsdf.inputs['Emission Color'].default_value = GROUND_COLOUR
    bsdf.inputs['Emission Strength'].default_value = 1.0
    return material


front_sheet()
band_sheet()
print('rendered magnetic review sheets')
