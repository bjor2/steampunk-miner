"""
Packs the baked ore tiles into the three ore atlases (#144, #151 budgets) and encodes them as the
game's KTX2 maps: albedo with the mask in alpha and emissive as Basis ETC1S sRGB, normal as UASTC
linear, the same toktx settings as scripts/art/encode.sh. Cells follow atlas-layout.json (which
atlas_layout.py writes from the slice's family rows); each 248 px tile sits inside its 256 px cell
and its edge pixels are extended into the 4 px gutter, so bilinear sampling at the cell edge never
reads a neighbour. A cell with no tile stays empty (transparent albedo, flat normal, black
emission) and is reported. Plain python3 with Pillow and numpy; no Blender.

    python3 docs/art/ores/assemble_atlas.py [--no-encode]

Reads art/build/ores/<cell-id>.<map>.png (bake_cells.py), writes art/build/ores/ore-atlas.<map>.png
and .ktx2 (gitignored), then ships the asset: the three KTX2 maps and the schema-1 `parts.json`
sidecar (every cell a part, hashed over the 12 `.blend` sources) under
public/assets/ground/ground-ore-atlas/, where the asset lint checks them against the slice's
registration (`oreAtlasArtAssetOf`) and its placeholder sidecar.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import atlas_layout as layout  # noqa: E402

BUILD_DIR = os.path.join(layout.REPO_ROOT, 'art', 'build', 'ores')
BLENDER_VERSION = '4.2.9 LTS'
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
    dark = []
    for kind in table['maps']:
        path = assemble(table, kind, missing, dark)
        if encode:
            encode_ktx2(path, kind)
    report(table, missing, dark)
    if not missing:
        ship_asset(table)


def assemble(table, kind, missing, dark):
    side = table['atlas']['sidePx']
    atlas = np.zeros((side, side, 4), dtype=np.uint8)
    atlas[:, :] = EMPTY[kind]
    for cell in table['cells']:
        tile = read_tile(cell, kind, table)
        if tile is None and kind == 'emissive' and has_tile(cell, 'albedo'):
            # Baked, but no texel above the bake's threshold: a dark cell, not a missing one.
            dark.append(layout.cell_id_of(cell))
            tile = empty_tile(kind)
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
        return empty_tile(kind)
    if not has_tile(cell, kind):
        return None
    image = Image.open(tile_path(cell, kind)).convert('RGBA')
    return np.asarray(image, dtype=np.uint8)


def tile_path(cell, kind):
    return os.path.join(BUILD_DIR, '%s.%s.png' % (layout.cell_id_of(cell), kind))


def has_tile(cell, kind):
    return os.path.isfile(tile_path(cell, kind))


def empty_tile(kind):
    return np.array(EMPTY[kind], dtype=np.uint8)[None, None, :]


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


def ship_asset(table):
    """The maps and the exported sidecar under public/assets; the placeholder sidecar beside the others."""
    looks = layout.load_looks()
    os.makedirs(layout.ASSET_DIR, exist_ok=True)
    for kind in table['maps']:
        shutil.copyfile(os.path.join(BUILD_DIR, 'ore-atlas.%s.ktx2' % kind),
                        os.path.join(layout.ASSET_DIR, '%s.%s.ktx2' % (layout.ASSET_ID, kind)))
    layout.write_json(layout.PLACEHOLDER_PATH, layout.sidecar_of(looks))
    layout.write_json(layout.EXPORTED_PATH, layout.sidecar_of(looks, sha256=blend_sources_sha256(looks), blender=BLENDER_VERSION))
    print('shipped %s: 3 maps and the sidecar' % os.path.relpath(layout.ASSET_DIR, layout.REPO_ROOT))


def blend_sources_sha256(looks):
    """One hash over the 12 family sources in id order, so a re-authored family changes it."""
    digest = hashlib.sha256()
    for family in looks['families']:
        with open(os.path.join(layout.BLEND_DIR, 'ore-%s.blend' % family['id']), 'rb') as file:
            digest.update(file.read())
    return digest.hexdigest()


def report(table, missing, dark):
    for kind in table['maps']:
        png = os.path.join(BUILD_DIR, 'ore-atlas.%s.png' % kind)
        ktx = png[:-4] + '.ktx2'
        sizes = ['%s %.1f MiB' % (os.path.basename(path), os.path.getsize(path) / 2 ** 20) for path in (png, ktx) if os.path.exists(path)]
        print(', '.join(sizes))
    for kind, cells in missing.items():
        print('%s: %d of %d cells have no tile yet (first: %s)' % (kind, len(cells), len(table['cells']), ', '.join(cells[:4])))
    if dark:
        print('emissive: %d glowing-grade cells baked no texel above the threshold and ship dark: %s' % (len(dark), ', '.join(dark)))


if __name__ == '__main__':
    main()
