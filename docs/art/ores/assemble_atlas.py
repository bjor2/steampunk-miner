"""
Packs the baked ore tiles into the three ore atlases (#144, #151 budgets) and encodes them as the
game's KTX2 maps: albedo with the mask in alpha and emissive as Basis ETC1S sRGB, normal as UASTC
linear, the same toktx settings as scripts/art/encode.sh. Cells follow atlas-layout.json (which
atlas_layout.py writes from the slice's family rows); each 248 px tile sits inside its 256 px cell
and its edge pixels are extended into the 4 px gutter, so bilinear sampling at the cell edge never
reads a neighbour. A cell with no tile stays empty (transparent albedo, flat normal, black
emission) and is reported. Plain python3 with Pillow and numpy; no Blender.

    python3 docs/art/ores/assemble_atlas.py [--no-encode]

Reads art/build/ores/<cell-id>.<map>.png (bake_cells.py) and writes art/build/ores/ore-atlas.<map>.png
and .ktx2 (both gitignored until the kernel manifest form for the atlas lands).
"""

import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import atlas_layout as layout  # noqa: E402

BUILD_DIR = os.path.join(layout.REPO_ROOT, 'art', 'build', 'ores')
FLAT_NORMAL = (128, 128, 255, 255)
EMPTY = {'albedo': (0, 0, 0, 0), 'normal': FLAT_NORMAL, 'emissive': (0, 0, 0, 255)}
TOKTX = {
    'albedo': ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '192', '--assign_oetf', 'srgb'],
    'emissive': ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '192', '--assign_oetf', 'srgb'],
    'normal': ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '19', '--assign_oetf', 'linear'],
}


def main():
    encode = '--no-encode' not in sys.argv
    with open(layout.LAYOUT_PATH, encoding='utf-8') as file:
        table = json.load(file)
    missing = {}
    for kind in table['maps']:
        path = assemble(table, kind, missing)
        if encode:
            encode_ktx2(path, kind)
    report(table, missing)


def assemble(table, kind, missing):
    side = table['atlas']['sidePx']
    atlas = np.zeros((side, side, 4), dtype=np.uint8)
    atlas[:, :] = EMPTY[kind]
    for cell in table['cells']:
        tile = read_tile(cell, kind, table)
        if tile is None:
            missing.setdefault(kind, []).append(layout.cell_id_of(cell))
            continue
        place_tile(atlas, tile, cell['rectPx'], table['atlas']['gutterPx'])
    path = os.path.join(BUILD_DIR, 'ore-atlas.%s.png' % kind)
    Image.fromarray(atlas, 'RGBA').save(path, optimize=True)
    return path


def read_tile(cell, kind, table):
    """The baked tile, or None; an emissive cell below the glowing grades is empty by design."""
    if kind == 'emissive' and cell['grade'] < table['emissiveFromGrade']:
        return np.array(EMPTY[kind], dtype=np.uint8)[None, None, :]
    path = os.path.join(BUILD_DIR, '%s.%s.png' % (layout.cell_id_of(cell), kind))
    if not os.path.isfile(path):
        return None
    image = Image.open(path).convert('RGBA')
    return np.asarray(image, dtype=np.uint8)


def place_tile(atlas, tile, rect, gutter):
    x, y, w, h = rect
    if tile.shape[0] == 1:
        atlas[y - gutter:y + h + gutter, x - gutter:x + w + gutter] = tile[0, 0]
        return
    content = tile[:h, :w]
    padded = np.pad(content, ((gutter, gutter), (gutter, gutter), (0, 0)), mode='edge')
    atlas[y - gutter:y + h + gutter, x - gutter:x + w + gutter] = padded


def encode_ktx2(png_path, kind):
    out = png_path[:-4] + '.ktx2'
    command = ['toktx', '--t2'] + TOKTX[kind] + ['--genmipmap', '--threads', '1', out, png_path]
    subprocess.run(command, check=True)
    return out


def report(table, missing):
    for kind in table['maps']:
        png = os.path.join(BUILD_DIR, 'ore-atlas.%s.png' % kind)
        ktx = png[:-4] + '.ktx2'
        sizes = ['%s %.1f MiB' % (os.path.basename(path), os.path.getsize(path) / 2 ** 20) for path in (png, ktx) if os.path.exists(path)]
        print(', '.join(sizes))
    for kind, cells in missing.items():
        print('%s: %d of %d cells have no tile yet (first: %s)' % (kind, len(cells), len(table['cells']), ', '.join(cells[:4])))


if __name__ == '__main__':
    main()
