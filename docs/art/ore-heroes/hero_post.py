"""
The python3 post step of the hero ore looks (#452), after author_ore_heroes.py has rendered:
the 256 px atlas cells (the 248 px sprite with its edge pixels extended into the 4 px gutter), a
preview of each act's hero atlas, the game-scale strip (every hero over its rock at 85, 40 and
22 px a tile: the default zoom on a 1080p screen, the 20 m zoom and a phone), the greyscale and
deuteranopia copies, the distinctness report between every pair of heroes, and the JPEG shrink
of the big colour sheets. Pillow and numpy; Blender's Python has neither.
"""

import itertools
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import hero_species as species  # noqa: E402
from atlas_layout import json_text_of  # noqa: E402

CELL_DIR = os.path.join(HERE, 'cells')
SHEET_DIR = os.path.join(HERE, 'sheets')
BUILD_DIR = os.path.join(species.REPO_ROOT, 'art', 'build', 'ore-heroes')
ART_DIRECTION_PATH = os.path.join(species.REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')
# A tile on screen: the default 12 m zoom on 1080p, the 20 m zoom, and a phone at that zoom.
TILE_PX = (85, 40, 22)
STRIP_MAGNIFY = 4
STRIP_GAP_PX = 6
IN_GAME_DOWNSAMPLE = 3
JPEG_QUALITY = 90
MASK_THRESHOLD = 0.5
DEUTERANOPIA = np.array([
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
], dtype=np.float32)


def main():
    pool = sys.argv[1] if len(sys.argv) > 1 else 'legacy'
    table = species.cell_table_of(pool)
    cells = {cell['speciesId']: write_cell(cell) for cell in table['cells']}
    for act in table['acts']:
        write_atlas_preview(act, table, cells)
    strip = write_scale_strip(pool, table, cells)
    write_blind_copies(strip)
    report = write_distinctness(pool, table, cells)
    post_sheets(pool)
    print('post done: %d cells, %d acts, least different pair %s' % (len(cells), len(table['acts']), report['leastDifferentPair']))


# --- cells and the atlas preview -----------------------------------------------------------------------


def write_cell(cell):
    """The sprite in its 256 px cell: 248 px of content, the edge pixels extended into the gutter."""
    sprite = read_rgba(os.path.join(BUILD_DIR, '%s.sprite.png' % cell['speciesId']))
    content = species.ATLAS['contentPx']
    if sprite.shape[0] != content or sprite.shape[1] != content:
        raise SystemExit('%s sprite is %dx%d, not %d' % (cell['speciesId'], sprite.shape[1], sprite.shape[0], content))
    gutter = species.ATLAS['gutterPx']
    padded = np.pad(sprite, ((gutter, gutter), (gutter, gutter), (0, 0)), mode='edge')
    write_rgba(os.path.join(HERE, cell['cell']), padded)
    return padded


def write_atlas_preview(act, table, cells):
    side = table['atlas']['sidePx']
    atlas = np.zeros((side, side, 4), dtype=np.float32)
    size = table['atlas']['cellPx']
    for cell in table['cells']:
        rect = cell['rect']
        x, y = rect['x'] - table['atlas']['gutterPx'], rect['y'] - table['atlas']['gutterPx']
        atlas[y:y + size, x:x + size] = cells[cell['speciesId']]
    return write_rgba(os.path.join(SHEET_DIR, 'atlas-preview.%s.png' % act), atlas)


# --- the game-scale strip --------------------------------------------------------------------------------


def write_scale_strip(pool, table, cells):
    """One row per tile size, every hero over its band's rock, then magnified so the eye can read it."""
    rows = [strip_row(table, cells, px) for px in TILE_PX]
    width = max(row.shape[1] for row in rows)
    rows = [np.pad(row, ((0, STRIP_GAP_PX), (0, width - row.shape[1]), (0, 0)), constant_values=0.0) for row in rows]
    strip = np.concatenate(rows, axis=0)
    write_rgb(os.path.join(SHEET_DIR, 'heroes-%s.scale.png' % pool), strip)
    path = os.path.join(SHEET_DIR, 'heroes-%s.scale-x%d.png' % (pool, STRIP_MAGNIFY))
    return write_rgb(path, magnified(strip, STRIP_MAGNIFY))


def strip_row(table, cells, tile_px):
    tiles = [tile_at(cells[cell['speciesId']], rock_rgb_of(cell), tile_px) for cell in table['cells']]
    gap = np.zeros((tile_px, STRIP_GAP_PX, 3), dtype=np.float32)
    return np.concatenate(list(itertools.chain.from_iterable((tile, gap) for tile in tiles))[:-1], axis=1)


def tile_at(cell, rock_rgb, tile_px):
    """The 1 m content composited over the rock colour, box-filtered down to the tile size."""
    content = content_of(cell)
    over = composite_over(content, rock_rgb)
    return resampled(over, tile_px)


def content_of(cell):
    gutter, content = species.ATLAS['gutterPx'], species.ATLAS['contentPx']
    return cell[gutter:gutter + content, gutter:gutter + content]


def composite_over(rgba, rock_rgb):
    alpha = rgba[:, :, 3:4]
    return rgba[:, :, :3] * alpha + np.array(rock_rgb, dtype=np.float32) * (1.0 - alpha)


def resampled(rgb, size):
    image = Image.fromarray(to_bytes(rgb), 'RGB').resize((size, size), Image.BOX)
    return np.asarray(image, dtype=np.float32) / 255.0


def magnified(rgb, factor):
    return np.repeat(np.repeat(rgb, factor, axis=0), factor, axis=1)


# --- rock -----------------------------------------------------------------------------------------------


def rock_rgb_of(cell):
    """The band colour of the middle band of the hero's window, mixed like bandPalette.ts."""
    low, high = cell['gradeBand']
    band = int((low + high) / 2)
    with open(ART_DIRECTION_PATH, encoding='utf-8') as file:
        palette = json.load(file)['palettes']['palette.planet_1']
    surface, deep = rgb_of_hex(palette['surface']), rgb_of_hex(palette['deep'])
    amount = (band - 1) / 4
    return tuple(a + (b - a) * amount for a, b in zip(surface, deep))


def rgb_of_hex(hex_colour):
    return tuple(int(hex_colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5))


# --- blind copies ---------------------------------------------------------------------------------------


def write_blind_copies(strip_path):
    rgb = read_rgb(strip_path)
    stem = strip_path[:-4]
    write_rgb(stem + '-gray.png', gray_of(rgb))
    write_rgb(stem + '-deutan.png', deuteranopia_of(rgb))


def linear_of(rgb):
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def display_of(linear):
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(np.clip(linear, 0, None), 1 / 2.4) - 0.055)


def gray_of(rgb):
    luma = linear_of(rgb) @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    return np.repeat(display_of(luma)[:, :, None], 3, axis=2)


def deuteranopia_of(rgb):
    return display_of(linear_of(rgb) @ DEUTERANOPIA.T)


# --- distinctness -----------------------------------------------------------------------------------------


def write_distinctness(pool, table, cells):
    """
    Per hero at the 40 px tile: coverage, mean hue, luma and contrast against its rock. Per pair:
    how far apart the silhouettes (1 - mask IoU), the hues (degrees), the lumas and the colours
    seen with deuteranopia are. The least different pair is named so the README can say it.
    """
    measures = {cell['speciesId']: hero_measures(cells[cell['speciesId']], rock_rgb_of(cell)) for cell in table['cells']}
    pairs = [pair_measures(a, b, measures) for a, b in itertools.combinations(measures, 2)]
    least = min(pairs, key=lambda pair: pair['hueDifferenceDeg'] / 180 + pair['silhouetteDifference'] + pair['lumaDifference'])
    report = {'pool': pool, 'tilePx': 40, 'heroes': {hero_id: printable(measure) for hero_id, measure in measures.items()},
              'pairs': pairs, 'leastDifferentPair': [least['a'], least['b']]}
    with open(os.path.join(SHEET_DIR, 'heroes-%s.distinct.json' % pool), 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(report))
    return report


def printable(measure):
    """The measure without its working arrays (the mask and the deuteranopia colour)."""
    return {key: value for key, value in measure.items() if key not in ('mask', 'deutanRgb')}


def hero_measures(cell, rock_rgb, tile_px=40):
    rgba = resampled_rgba(content_of(cell), tile_px)
    mask = rgba[:, :, 3] > MASK_THRESHOLD
    body = rgba[:, :, :3][mask]
    luma = float(gray_of(body[None, :, :])[0, :, 0].mean())
    rock_luma = float(gray_of(np.array(rock_rgb, dtype=np.float32)[None, None, :])[0, 0, 0])
    return {'coverage': round(float(mask.mean()), 3), 'hueDeg': round(mean_hue_of(body), 1), 'luma': round(luma, 3),
            'rockLuma': round(rock_luma, 3), 'contrast': round((max(luma, rock_luma) + 0.05) / (min(luma, rock_luma) + 0.05), 2),
            'mask': mask, 'deutanRgb': deuteranopia_of(body[None, :, :])[0].mean(axis=0)}


def pair_measures(a, b, measures):
    first, second = measures[a], measures[b]
    union = np.logical_or(first['mask'], second['mask']).sum()
    overlap = np.logical_and(first['mask'], second['mask']).sum()
    return {'a': a, 'b': b,
            'silhouetteDifference': round(float(1.0 - overlap / union) if union else 1.0, 3),
            'hueDifferenceDeg': round(hue_distance(first['hueDeg'], second['hueDeg']), 1),
            'lumaDifference': round(abs(first['luma'] - second['luma']), 3),
            'deutanDistance': round(float(np.linalg.norm(first['deutanRgb'] - second['deutanRgb'])), 3)}


def resampled_rgba(rgba, size):
    image = Image.fromarray(to_bytes(rgba), 'RGBA').resize((size, size), Image.BOX)
    return np.asarray(image, dtype=np.float32) / 255.0


def mean_hue_of(rgb):
    """The circular mean hue of the pixels, weighted by their chroma so grey pixels do not vote."""
    high, low = rgb.max(axis=1), rgb.min(axis=1)
    chroma = high - low
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    hue = np.where(chroma == 0, 0.0,
                   np.where(high == r, ((g - b) / np.where(chroma == 0, 1, chroma)) % 6,
                            np.where(high == g, (b - r) / np.where(chroma == 0, 1, chroma) + 2,
                                     (r - g) / np.where(chroma == 0, 1, chroma) + 4))) * 60.0
    radians = np.radians(hue)
    x, y = (np.cos(radians) * chroma).sum(), (np.sin(radians) * chroma).sum()
    return float(np.degrees(np.arctan2(y, x)) % 360.0)


def hue_distance(a, b):
    difference = abs(a - b) % 360.0
    return min(difference, 360.0 - difference)


# --- sheets ----------------------------------------------------------------------------------------------


def post_sheets(pool):
    """Greyscale and in-game copies of the colour sheets, then the colour sheets to JPEG for git."""
    for name in sorted(os.listdir(SHEET_DIR)):
        if not name.startswith('heroes-%s.' % pool) or not name.endswith('.png') or any(tag in name for tag in ('-gray', '-ingame', '-deutan', '.scale')):
            continue
        path = os.path.join(SHEET_DIR, name)
        rgb = read_rgb(path)
        write_rgb(path[:-4] + '-gray.png', gray_of(rgb))
        write_rgb(path[:-4] + '-ingame.png', downsampled(rgb, IN_GAME_DOWNSAMPLE))
        Image.open(path).convert('RGB').save(path[:-4] + '.jpg', quality=JPEG_QUALITY, optimize=True)
        os.remove(path)


def downsampled(rgb, factor):
    height, width = (rgb.shape[0] // factor) * factor, (rgb.shape[1] // factor) * factor
    return rgb[:height, :width].reshape(height // factor, factor, width // factor, factor, 3).mean(axis=(1, 3))


# --- files -----------------------------------------------------------------------------------------------


def read_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32) / 255.0


def read_rgb(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0


def to_bytes(channels):
    return (np.clip(channels, 0, 1) * 255 + 0.5).astype(np.uint8)


def write_rgba(path, rgba):
    Image.fromarray(to_bytes(rgba), 'RGBA').save(path, optimize=True)
    return path


def write_rgb(path, rgb):
    Image.fromarray(to_bytes(rgb), 'RGB').save(path, optimize=True)
    return path


if __name__ == '__main__':
    main()
