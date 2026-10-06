"""
The ore atlas cell table (#151 budgets, #144), the Python side of
`src/features/ore-visuals/systems/oreAtlasLayout.ts`: one 256 px cell per family x variant x
grade, 248 px of baked content inside a 4 px gutter, 16 cells a row in a 4096 atlas, families in
id order (code-unit order, as the kernel registries sort), then variant, then grade. No bpy here,
so the bake and the assembler share it, and `atlas-layout.json` beside this file is what the
slice's spec compares against. Run it to rewrite that file:

    python3 docs/art/ores/atlas_layout.py
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
LOOKS_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'ore-visuals', 'oreLooks.json')
LAYOUT_PATH = os.path.join(HERE, 'atlas-layout.json')
GRADES = (1, 2, 3, 4, 5)
MAP_KINDS = ('albedo', 'normal', 'emissive')


def load_looks():
    """The slice's look data, its families sorted by id the way the registry enumerates them."""
    with open(LOOKS_PATH, encoding='utf-8') as file:
        looks = json.load(file)
    looks['families'] = sorted(looks['families'], key=lambda family: family['id'].encode('utf-8'))
    return looks


def family_of(looks, family_id):
    return next(family for family in looks['families'] if family['id'] == family_id)


def cells_per_row(looks):
    return looks['atlas']['sidePx'] // looks['atlas']['cellPx']


def atlas_cells(looks):
    """Every cell in cell order: family (by id), variant, grade."""
    cells = []
    for family in looks['families']:
        for variant in range(family['variants']):
            for grade in GRADES:
                cells.append(cell_at(looks, len(cells), family['id'], variant, grade))
    return cells


def cell_at(looks, index, family_id, variant, grade):
    atlas = looks['atlas']
    per_row = cells_per_row(looks)
    column, row = index % per_row, index // per_row
    return {
        'familyId': family_id,
        'variant': variant,
        'grade': grade,
        'index': index,
        'rectPx': [column * atlas['cellPx'] + atlas['gutterPx'], row * atlas['cellPx'] + atlas['gutterPx'],
                   atlas['contentPx'], atlas['contentPx']],
    }


def cell_of(looks, family_id, variant, grade):
    return next(cell for cell in atlas_cells(looks)
                if cell['familyId'] == family_id and cell['variant'] == variant and cell['grade'] == grade)


def cell_id_of(cell):
    """`<family>-v<variant>-g<grade>`: the bake tile's file stem and the Blender collection name."""
    return '%s-v%d-g%d' % (cell['familyId'], cell['variant'], cell['grade'])


def write_layout(path=LAYOUT_PATH):
    looks = load_looks()
    layout = {
        'atlas': looks['atlas'],
        'maps': list(MAP_KINDS),
        'emissiveFromGrade': looks['grades']['emissiveFromGrade'],
        'cells': atlas_cells(looks),
    }
    with open(path, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(layout))
    return layout


SCALAR_LIST = re.compile(r'\[\s*((?:(?:-?\d+(?:\.\d+)?|"[^"]*"),?\s*)+)\]')


def json_text_of(value):
    """Two-space JSON with scalar lists on one line, the way the repo's Prettier writes JSON."""
    text = json.dumps(value, indent=2, ensure_ascii=False)
    return SCALAR_LIST.sub(lambda match: '[' + ', '.join(match.group(1).split()).replace(',,', ',') + ']', text) + '\n'


if __name__ == '__main__':
    written = write_layout()
    print('wrote %d cells to %s' % (len(written['cells']), os.path.relpath(LAYOUT_PATH, REPO_ROOT)))
