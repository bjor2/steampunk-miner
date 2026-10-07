"""
Fills the measured tables of README.md (#144) between its `<!-- name -->` / `<!-- /name -->`
markers from the slice's family rows, the atlas cell table, the family sheets' luma and budget
reports and the assembled atlas sizes, so the README never carries a number by hand.

    python3 docs/art/ores/readme_tables.py
"""

import json
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import atlas_layout as layout  # noqa: E402

README = os.path.join(HERE, 'README.md')
SHEET_DIR = os.path.join(HERE, 'sheets')
BUILD_DIR = os.path.join(layout.REPO_ROOT, 'art', 'build', 'ores')
GRADE_NAMES = {1: 'Raw', 2: 'Lustrous', 3: 'Crystal', 4: 'Lumen', 5: 'Aether'}


def main():
    looks = layout.load_looks()
    tables = {
        'families': families_table(looks),
        'atlas': atlas_table(looks),
        'budgets': budgets_table(looks),
        'luma': luma_table(looks),
        'ladder': ladder_table(),
    }
    text = open(README, encoding='utf-8').read()
    for name, table in tables.items():
        text = fill(text, name, table)
    with open(README, 'w', encoding='utf-8', newline='\n') as file:
        file.write(text)
    print('filled %s' % ', '.join(tables))


def fill(text, name, table):
    pattern = re.compile(r'<!-- %s -->.*?<!-- /%s -->' % (name, name), re.S)
    if pattern.search(text) is None:
        raise SystemExit('README.md has no <!-- %s --> block' % name)
    return pattern.sub(lambda _: '<!-- %s -->\n\n%s\n\n<!-- /%s -->' % (name, table, name), text)


def read_json(path):
    if not os.path.isfile(path):
        return None
    with open(path, encoding='utf-8') as file:
        return json.load(file)


# --- tables ---------------------------------------------------------------------------------------------


def families_table(looks):
    rows = ['| family | silhouette (G1 to G5 escalates this shape) | hue band | sat | luma band | kernel decal |',
            '| --- | --- | --- | --- | --- | --- |']
    for family in looks['families']:
        rows.append('| %s | %s: %s | %d-%d | %.2f | %.2f-%.2f | %s |' % (
            family['id'], family['silhouette'], family['escalation'], family['hueBand'][0], family['hueBand'][1],
            family['saturation'], family['lumaBand'][0], family['lumaBand'][1], family['shaderSilhouette']))
    return '\n'.join(rows)


def atlas_table(looks):
    atlas = looks['atlas']
    cells = layout.atlas_cells(looks)
    per_row = layout.cells_per_row(looks)
    lines = [
        '| | |', '| --- | --- |',
        '| atlas | %d x %d px, %d cells of %d px, %d a row |' % (atlas['sidePx'], atlas['sidePx'], per_row * per_row, atlas['cellPx'], per_row),
        '| cell | %d px of content inside a %d px gutter; cell `i` at column `i mod %d`, row `i div %d` |' % (atlas['contentPx'], atlas['gutterPx'], per_row, per_row),
        '| order | families by id (%s), then variant 0-3, then grade 1-5 |' % ', '.join(f['id'] for f in looks['families']),
        '| cells used | %d of %d (%d rows, the last %d cells spare) |' % (len(cells), per_row * per_row, (len(cells) + per_row - 1) // per_row, per_row * per_row - len(cells)),
        '| maps | albedo (mask in alpha, ETC1S sRGB), normal (UASTC linear), emissive (ETC1S sRGB; cells below G%d empty) |' % looks['grades']['emissiveFromGrade'],
    ]
    sizes = atlas_sizes()
    if sizes:
        lines.append('| encoded | %s |' % ', '.join(sizes))
    return '\n'.join(lines)


def atlas_sizes():
    sizes = []
    for kind in layout.MAP_KINDS:
        path = os.path.join(BUILD_DIR, 'ore-atlas.%s.ktx2' % kind)
        if os.path.isfile(path):
            sizes.append('%s %.1f MiB' % (kind, os.path.getsize(path) / 2 ** 20))
    return sizes


def budgets_table(looks):
    rows = ['| grade | mean tris | min | max | maps |', '| --- | --- | --- | --- | --- |']
    for grade in layout.GRADES:
        counts = []
        for family in looks['families']:
            budget = read_json(os.path.join(SHEET_DIR, '%s.budget.json' % family['id'])) or {}
            counts += [cell['triangles'] for cell_id, cell in budget.items() if cell_id.endswith('-g%d' % grade)]
        if not counts:
            continue
        maps = 'albedo, normal' + (', emissive' if grade >= looks['grades']['emissiveFromGrade'] else '')
        rows.append('| G%d %s | %d | %d | %d | %s |' % (grade, GRADE_NAMES[grade], statistics.mean(counts), min(counts), max(counts), maps))
    return '\n'.join(rows)


def luma_table(looks):
    rows = ['| family | G1 body / cell / rock | G2 | G3 | G4 | G5 | body order | cell order |',
            '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for family in looks['families']:
        report = read_json(os.path.join(SHEET_DIR, '%s.shallow.luma.json' % family['id']))
        if report is None:
            continue
        cells = {cell['id']: cell for cell in report['cells']}
        columns = []
        for grade in layout.GRADES:
            cell = cells.get('%s-v0-g%d' % (family['id'], grade))
            columns.append('%.2f / %.2f / %.2f' % (cell.get('bodyLuma', 0), cell['oreLuma'], cell['rockLuma']) if cell else '-')
        rows.append('| %s | %s | %s | %s |' % (family['id'], ' | '.join(columns),
                                               order_word(report.get('bodyLumaRisesAlongEveryRow')), order_word(report['oreLumaRisesAlongEveryRow'])))
    return '\n'.join(rows)


def order_word(flag):
    return {True: 'rises', False: 'not strict', None: '-'}[flag]


def ladder_table():
    rows = ['| palette | body luma rises along every family row | cells |', '| --- | --- | --- |']
    for name in sorted(os.listdir(SHEET_DIR)) if os.path.isdir(SHEET_DIR) else []:
        if name.startswith('ladder.') and name.endswith('.luma.json'):
            report = read_json(os.path.join(SHEET_DIR, name))
            rows.append('| %s | %s | %d |' % (name[len('ladder.'):-len('.luma.json')], order_word(report.get('bodyLumaRisesAlongEveryRow')), len(report['cells'])))
    return '\n'.join(rows) if len(rows) > 2 else '(ladder sheets not rendered yet)'


if __name__ == '__main__':
    main()
