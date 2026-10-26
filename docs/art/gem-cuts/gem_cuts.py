"""
The gem-cut library (ticket 889, ME of the GD's Materials Expansion lock of 25 Oct): the cuts of
the `gem-cuts` slice's `gemCuts.json`, in library order, and the cell table the library's
hue-tinted atlas pages are packed from. A cut's cell is its place in the library (16 a page, page 1
`ground-gem-cut-atlas`, page n `-page-<n>`), so the library is append-only: a new cut goes last and
every earlier cell stays where it is. The cells are rendered neutral (a grey stone, white
highlights) on the ore stage; the game colours each by the gem's hue slot and lays the planet's
overlay over it (`src/scene/terrainKindShader.ts`). Plain Python: the Blender authoring script and
the python3 post step both import it.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ORE_HEROES = os.path.normpath(os.path.join(HERE, '..', 'ore-heroes'))
for folder in (ORE_HEROES, os.path.normpath(os.path.join(HERE, '..', 'ores'))):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import hero_species as species  # noqa: E402

LIBRARY_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'gem-cuts', 'gemCuts.json')
CELLS_PATH = os.path.join(HERE, 'gem-cut-cells.json')
READS_PATH = os.path.join(HERE, 'gem-cut-reads.json')
ATLAS_ASSET = 'ground-gem-cut-atlas'
# The hero atlas shape (#451) and page size (ticket 852), shared with the act atlases.
ATLAS = species.ATLAS
CELLS_PER_PAGE = species.CELLS_PER_PAGE
# The neutral stone: a mid grey whose shaded body lands near the middle luma the shader maps the
# hue slot's own colour to, and white for the rim and the facet glint.
BODY_HEX = '#6e6e6e'
GLINT_HEX = '#ffffff'
# The band whose rock a cut is reviewed and measured on: the middle of the gems' window (bands 3-5).
REVIEW_BAND = 4
# The rock the cells are composited over for the reads: the middle band of the gems' window.
ROCK_PALETTE = 'palette.planet_1'


def load_library():
    with open(LIBRARY_PATH, encoding='utf-8') as file:
        return json.load(file)['cuts']


def cut_named(cut_id, cuts=None):
    found = [cut for cut in (cuts or load_library()) if cut['id'] == cut_id]
    if not found:
        raise SystemExit('no cut is named %s' % cut_id)
    return found[0]


def short_name_of(cut):
    """`gem-cut.half-moon` -> `half-moon`: the file stem of the cut's sources and cell."""
    return cut['id'].split('.', 1)[1]


def asset_id_of(page):
    return ATLAS_ASSET if page == 1 else '%s-page-%d' % (ATLAS_ASSET, page)


def cell_entry_of(index, cut):
    return {'index': index % CELLS_PER_PAGE, 'page': index // CELLS_PER_PAGE + 1, 'cutId': cut['id'],
            'rect': species.cell_rect_of(index % CELLS_PER_PAGE)}


def cell_table_of(cuts=None):
    cuts = cuts or load_library()
    return {
        '$comment': 'The cells of the gem-cut library (ticket 889): one 256 px neutral albedo cell per cut, '
                    'cell i of its page at column i mod %d, row i div %d, %d px of content inside a %d px gutter, '
                    'in library order (a cut is only ever appended, so no cell moves). Rendered lit on the ore '
                    'stage with the rock held out, so the alpha is the mask; the shader colours the cut by the '
                    'gem\'s hue slot, lays the planet overlay over it and draws the rarity frame and the rank glint.'
                    % (ATLAS['cellsPerRow'], ATLAS['cellsPerRow'], ATLAS['contentPx'], ATLAS['gutterPx']),
        'atlas': dict(ATLAS),
        'pages': [{'page': page, 'assetId': asset_id_of(page)} for page in range(1, (len(cuts) - 1) // CELLS_PER_PAGE + 2)],
        'cells': [cell_entry_of(index, cut) for index, cut in enumerate(cuts)],
        'cuts': [{'cutId': cut['id'], 'name': cut['name'], 'since': cut['since'], 'shape': cut['shape'],
                  'cell': 'cells/%s.png' % short_name_of(cut), 'blend': 'blend/cut-%s.blend' % short_name_of(cut)}
                 for cut in cuts],
    }


def cells_of_page(table, page):
    return [cell for cell in table['cells'] if cell['page'] == page]


def write_cell_table(cuts=None):
    import atlas_layout as layout
    table = cell_table_of(cuts)
    with open(CELLS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(layout.json_text_of(table))
    return table


if __name__ == '__main__':
    written = write_cell_table()
    print('%d gem cuts on %d pages' % (len(written['cells']), len(written['pages'])))
