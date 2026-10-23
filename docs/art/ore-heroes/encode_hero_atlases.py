"""
Packs and encodes the per-act hero atlases the game ships (#451), from the committed 256 px cells
of #452 and ticket 744 (`cells/<species>.png`) in the order the committed `hero-cells.json` packs
them per act (`atlases`: cell i at column i mod 4, row i div 4). Each act becomes `public/assets/ground/ground-hero-atlas-<act>/
ground-hero-atlas-<act>.albedo.ktx2`: Basis ETC1S, sRGB, as every albedo map (#52 "Formats"),
with four mip levels so the last keeps half a texel of gutter and a cell never samples its
neighbour (toktx 4.4.2 builds only full chains, so the levels are written here, each a 2 x 2
mean weighted by alpha). Before encoding, the colour of every transparent texel is bled in from
its opaque neighbours, so filtering at a sprite's edge never darkens it (the mask stays in alpha).
python3 with Pillow and numpy, and KTX-Software's toktx 4.4.2 on PATH.

    python3 docs/art/ore-heroes/encode_hero_atlases.py
"""

import json
import os
import subprocess

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CELLS_PATH = os.path.join(HERE, 'hero-cells.json')
BUILD_ROOT = os.path.join(REPO_ROOT, 'art', 'build')
PUBLIC_GROUND = os.path.join(REPO_ROOT, 'public', 'assets', 'ground')
# HERO_ATLAS_LEVELS in src/constants/scene.ts: 1024, 512, 256, 128 px.
LEVELS = 4
# Passes of the colour bleed: enough to reach every transparent texel a level-3 texel averages.
BLEED_PASSES = 16


def main():
    with open(CELLS_PATH, encoding='utf-8') as file:
        table = json.load(file)
    for atlas in table['atlases']:
        asset_id = asset_id_of(atlas['act'])
        encode(asset_id, write_level_pngs(asset_id, table['atlas'], atlas['cells']))
    print('encoded %d hero atlases for the %s pools' % (len(table['atlases']), ', '.join(table['pools'])))


def asset_id_of(act):
    """heroAtlasAssetIdOf in src/features/materials/systems/render/heroAtlases.ts."""
    return 'ground-hero-atlas-%s' % act.replace('_', '-').replace('.', '-')


def write_level_pngs(asset_id, shape, cells):
    folder = os.path.join(BUILD_ROOT, asset_id)
    os.makedirs(folder, exist_ok=True)
    level = packed_atlas(shape, cells)
    paths = []
    for at in range(LEVELS):
        path = os.path.join(folder, '%s.albedo.%d.png' % (asset_id, at))
        Image.fromarray(np.round(bled(level) * 255).astype(np.uint8), 'RGBA').save(path)
        paths.append(path)
        level = halved(level)
    return paths


def halved(rgba):
    """The next level: each 2 x 2 block's alpha mean, its colour weighted by alpha."""
    height, width = rgba.shape[0] // 2, rgba.shape[1] // 2
    blocks = rgba.reshape(height, 2, width, 2, 4)
    alpha = blocks[..., 3]
    weight = alpha.sum(axis=(1, 3))
    colour = (blocks[..., :3] * alpha[..., None]).sum(axis=(1, 3)) / np.maximum(weight, 1e-6)[..., None]
    out = np.zeros((height, width, 4), dtype=np.float32)
    out[..., :3] = np.where(weight[..., None] > 0, colour, blocks[..., :3].mean(axis=(1, 3)))
    out[..., 3] = weight / 4.0
    return out


def packed_atlas(shape, cells):
    side, size, gutter = shape['sidePx'], shape['cellPx'], shape['gutterPx']
    atlas = np.zeros((side, side, 4), dtype=np.float32)
    for cell in cells:
        rect = cell['rect']
        x, y = rect['x'] - gutter, rect['y'] - gutter
        atlas[y:y + size, x:x + size] = read_rgba(os.path.join(HERE, 'cells', '%s.png' % cell['speciesId']))
    return atlas


def bled(rgba):
    """Transparent texels take the mean colour of their filled neighbours, pass by pass."""
    out = rgba.copy()
    filled = out[..., 3] > 0
    for _ in range(BLEED_PASSES):
        colour = np.where(filled[..., None], out[..., :3], 0.0)
        total = neighbour_sum(colour)
        count = neighbour_sum(filled.astype(np.float32)[..., None])
        reached = (~filled) & (count[..., 0] > 0)
        out[..., :3] = np.where(reached[..., None], total / np.maximum(count, 1.0), out[..., :3])
        filled = filled | reached
    return out


def neighbour_sum(values):
    padded = np.pad(values, ((1, 1), (1, 1), (0, 0)), mode='constant')
    height, width = values.shape[:2]
    return sum(
        padded[1 + dy:1 + dy + height, 1 + dx:1 + dx + width]
        for dy in (-1, 0, 1)
        for dx in (-1, 0, 1)
        if dx != 0 or dy != 0
    )


def encode(asset_id, level_pngs):
    folder = os.path.join(PUBLIC_GROUND, asset_id)
    os.makedirs(folder, exist_ok=True)
    out = os.path.join(folder, '%s.albedo.ktx2' % asset_id)
    # scripts/art/encode.sh's albedo flags, with the levels given instead of generated.
    subprocess.run([
        'toktx', '--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', '192',
        '--assign_oetf', 'srgb', '--mipmap', '--levels', str(LEVELS), '--threads', '1',
        out, *level_pngs,
    ], check=True)


def read_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32) / 255.0


if __name__ == '__main__':
    main()
