"""
Authors, bakes and reviews one ore family (#144): a `.blend` of its 4 variants x 5 grades (rows
are variants, columns are grades, each cell on its grade's band rock), the baked atlas tiles of
every cell (albedo with the mask in alpha, tangent-space normal, emissive from G3) and the review
sheets. Headless, from the repo root:

    BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
      -P docs/art/ores/author_ores.py -- [family ...] [--no-bake] [--no-render] [--ambient shallow|deep]

Through the Blender MCP, add this folder to `sys.path`, `import author_ores` and call
`author('crystal')`. The family rows come from src/features/ore-visuals/oreLooks.json, so the
bake enumerates the same families the slice registers. Outputs: `blend/ore-<family>.blend`, the
tiles under art/build/ores/<cell-id>.<map>.png (gitignored; assemble_atlas.py packs them), and
`sheets/<family>.{shallow,deep}.png` plus `<family>.closeup.png` and `<family>.luma.json`.
"""

import importlib
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

import atlas_layout as layout  # noqa: E402
import bake_cells  # noqa: E402
import ore_families as families  # noqa: E402
import ore_grades as grades  # noqa: E402
import ore_stage as stage  # noqa: E402

BLEND_DIR = os.path.join(HERE, 'blend')
SHEET_DIR = os.path.join(HERE, 'sheets')
LAYOUT_SEED = 144
COLUMNS = len(stage.GRADES)


def main():
    ids, bake, render, ambients = parse_arguments(sys.argv)
    for family_id in ids:
        author(family_id, bake=bake, render=render, ambients=ambients)


def parse_arguments(argv):
    given = argv[argv.index('--') + 1:] if '--' in argv else []
    looks = layout.load_looks()
    known = [family['id'] for family in looks['families']]
    ids = [arg for arg in given if not arg.startswith('--')]
    unknown = [arg for arg in ids if arg not in known]
    if unknown:
        raise SystemExit('author_ores: no family named %s' % ', '.join(unknown))
    ambients = ('shallow', 'deep')
    if '--ambient' in given:
        ambients = (given[given.index('--ambient') + 1],)
    return ids or known, '--no-bake' not in given, '--no-render' not in given, ambients


def author(family_id, bake=True, render=True, ambients=('shallow', 'deep')):
    reload_modules()
    looks = layout.load_looks()
    family = layout.family_of(looks, family_id)
    stage.reset_scene()
    stage.add_lamp_rig('shallow')
    build_family_grid(family, looks)
    stage.save_blend(blend_path(family_id))
    write_budgets(family)
    if bake:
        bake_cells.bake_family(family, looks)
    if render:
        return render_family(family, looks, ambients)
    return None


def reload_modules():
    """Pick up edits between MCP calls without restarting Blender."""
    for module in (layout, stage, grades, families, bake_cells):
        importlib.reload(module)


def blend_path(family_id):
    os.makedirs(BLEND_DIR, exist_ok=True)
    return os.path.join(BLEND_DIR, 'ore-%s.blend' % family_id)


def sheet_path(family_id, suffix):
    os.makedirs(SHEET_DIR, exist_ok=True)
    return os.path.join(SHEET_DIR, '%s.%s' % (family_id, suffix))


# --- building --------------------------------------------------------------------------------------------


def build_family_grid(family, looks, palette_id=stage.DEFAULT_PALETTE):
    rows = family['variants']
    for variant in range(rows):
        for grade in stage.GRADES:
            centre = stage.cell_centre(grade - 1, variant, COLUMNS, rows)
            build_cell(family, variant, grade, centre, palette_id)


def build_cell(family, variant, grade, centre, palette_id=stage.DEFAULT_PALETTE, with_rock=True, with_light=True):
    """One cell: its rock slab in `stage`, its marks and glow layers in a collection named for the cell."""
    cell_id = layout.cell_id_of({'familyId': family['id'], 'variant': variant, 'grade': grade})
    if with_rock:
        stage.add_rock_slab('rock-' + cell_id, centre, stage.band_colour_hex(stage.BAND_OF_GRADE[grade], palette_id))
    rng = random.Random('%d:%s' % (LAYOUT_SEED, cell_id))
    objects = build_marks(family, variant, grade, centre, rng)
    objects += build_glow_layers(family, grade, centre, objects, rng, with_light)
    stage.move_to_collection(objects, stage.collection_named(cell_id))
    return objects


def build_marks(family, variant, grade, centre, rng):
    material = grades.body_material(family, variant, grade)
    relief = grades.relief_of_grade(grade)
    count = grades.mark_count(grade, families.DENSITY[family['id']])
    marks = []
    for i, (x, z, size, angle) in enumerate(grades.placements(grade, count, rng, centre)):
        made = families.as_list(families.MARKS[family['id']]('%s-mark-%d' % (family['id'], i), x, z, size, angle, relief, grade, rng))
        marks += [assign_body(obj, material, family) for obj in made]
    return marks


def assign_body(obj, material, family):
    if family['id'] == 'volcanic' and 'fracture' in obj.name:
        fracture = bpy.data.materials.get('volcanic-fracture') or grades.materials.surface_material('volcanic-fracture', families.FRACTURE_HEX, roughness=0.2)
        fracture['albedo_hex'] = families.FRACTURE_HEX
        return grades.shapes.assign(obj, fracture)
    return grades.shapes.assign(obj, material)


def build_glow_layers(family, grade, centre, marks, rng, with_light):
    """What each grade adds on top of its marks (#151 table), keeping the layers below it."""
    layers = []
    if grade >= 2:
        layers += grades.add_glints([mark for mark in marks if 'mark' in mark.name], family, rng)
    if grade >= 3:
        layers += grades.add_sparkles(centre, family, grade, rng)
    if grade == 4:
        layers.append(grades.add_core(centre, family, 4, 0.09))
        layers += grades.add_veins(centre, family, rng)
    if grade == 5:
        layers.append(grades.add_core(centre, family, 5, 0.08))
        layers += grades.add_arcs(centre, family, hover_tips(marks), rng)
        if with_light:
            layers.append(grades.add_neighbour_light(centre, family))
    return layers


def hover_tips(marks):
    """The arcs' far ends: one point per hovering mark, at its location."""
    return [tuple(grades.centre_of(mark)) for mark in marks if is_primary_mark(mark)]


def is_primary_mark(obj):
    """`<family>-mark-<n>` (Blender may add `.001`), not a mark's `-tip`, `-halo` or `-egg`."""
    tail = obj.name.split('-mark-')[-1] if '-mark-' in obj.name else ''
    return tail != '' and '-' not in tail


# --- budgets --------------------------------------------------------------------------------------------


def write_budgets(family):
    """Source triangles per cell (render-evaluated, modifiers applied); they never reach the game."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    budgets = {}
    for variant in range(family['variants']):
        for grade in stage.GRADES:
            cell_id = layout.cell_id_of({'familyId': family['id'], 'variant': variant, 'grade': grade})
            objects = [obj for obj in bpy.data.collections[cell_id].objects if obj.type in ('MESH', 'CURVE')]
            budgets[cell_id] = {'triangles': sum(triangles_of(obj, depsgraph) for obj in objects), 'objects': len(objects)}
    with open(sheet_path(family['id'], 'budget.json'), 'w', encoding='utf-8', newline='\n') as file:
        file.write(layout.json_text_of(budgets))
    return budgets


def triangles_of(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    count = sum(len(polygon.vertices) - 2 for polygon in mesh.polygons)
    evaluated.to_mesh_clear()
    return count


# --- review renders ----------------------------------------------------------------------------------------


def render_family(family, looks, ambients=('shallow', 'deep')):
    rows = family['variants']
    labels = [[layout.cell_id_of({'familyId': family['id'], 'variant': v, 'grade': g}) for g in stage.GRADES] for v in range(rows)]
    reports = {}
    for ambient in ambients:
        relight(ambient)
        stage.frame_grid(COLUMNS, rows)
        sheet = stage.render_to(sheet_path(family['id'], ambient + '.png'))
        reports[ambient] = stage.report_grid_luma(sheet, COLUMNS, rows, labels, sheet_path(family['id'], ambient + '.luma.json'))
    relight('shallow')
    stage.frame_grid(COLUMNS, 1, stage.CLOSEUP_PX_PER_M, centre=(0.0, stage.cell_centre(0, 0, COLUMNS, rows)[1]))
    stage.render_to(sheet_path(family['id'], 'closeup.png'))
    stage.frame_grid(COLUMNS, rows)
    print('rendered %s: %s' % (family['id'], reports))
    return reports


def relight(ambient):
    for obj in list(bpy.data.objects):
        if obj.type == 'LIGHT' and obj.name in ('key', 'fill', 'deep-key', 'deep-fill'):
            bpy.data.objects.remove(obj, do_unlink=True)
    stage.add_lamp_rig(ambient)


if __name__ == '__main__':
    main()
