"""
Packs and encodes the gem-cut library's atlas pages (ticket 889) from the committed 256 px cells
(`cells/<cut>.png`) in library order (`gem-cut-cells.json`): page 1 is
`public/assets/ground/ground-gem-cut-atlas/ground-gem-cut-atlas.albedo.ktx2`, page n
`ground-gem-cut-atlas-page-<n>/...`, each as the hero atlas encoder of #451 writes a page (Basis
ETC1S, sRGB, four mip levels written here, the colour of transparent texels bled in). The game stacks
the pages after an act's own as the layers of one texture and colours them by hue. python3 with
Pillow and numpy, and KTX-Software's toktx 4.4.2 on PATH.

    python3 docs/art/gem-cuts/encode_gem_cut_atlas.py
"""

import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import gem_cuts as library  # noqa: E402
import encode_hero_atlases as hero_encoder  # noqa: E402,I100  (gem_cuts puts ore-heroes on the path)


def main():
    with open(library.CELLS_PATH, encoding='utf-8') as file:
        table = json.load(file)
    for page in table['pages']:
        cells = library.cells_of_page(table, page['page'])
        hero_encoder.encode(page['assetId'], write_level_pngs(page['assetId'], table['atlas'], cells))
    print('encoded %d pages of the gem-cut atlas' % len(table['pages']))


def write_level_pngs(asset_id, shape, cells):
    folder = os.path.join(hero_encoder.BUILD_ROOT, asset_id)
    os.makedirs(folder, exist_ok=True)
    level = packed_atlas(shape, cells)
    paths = []
    for at in range(hero_encoder.LEVELS):
        path = os.path.join(folder, '%s.albedo.%d.png' % (asset_id, at))
        Image.fromarray(np.round(hero_encoder.bled(level) * 255).astype(np.uint8), 'RGBA').save(path)
        paths.append(path)
        level = hero_encoder.halved(level)
    return paths


def packed_atlas(shape, cells):
    side, size, gutter = shape['sidePx'], shape['cellPx'], shape['gutterPx']
    atlas = np.zeros((side, side, 4), dtype=np.float32)
    for cell in cells:
        rect = cell['rect']
        x, y = rect['x'] - gutter, rect['y'] - gutter
        name = library.short_name_of({'id': cell['cutId']})
        atlas[y:y + size, x:x + size] = hero_encoder.read_rgba(os.path.join(HERE, 'cells', '%s.png' % name))
    return atlas


if __name__ == '__main__':
    main()
