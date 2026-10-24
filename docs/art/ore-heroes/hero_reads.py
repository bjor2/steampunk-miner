"""
The gem-read measures of every committed hero cell (ticket 785; the GD addendum on #746: a gem
reads on frame 1 as "a faceted outline and at least one highlight, at 360 px and 1280+", and
Systems' price-order score is "k plus the share of bright or saturated pixels in the gem's cell").
Each cell is composited over its band's rock and box-filtered to a tile at the two gem-read screens
(30 px a tile on 360x640, 67 px on 1280x800, hero_post.SCREEN_TILE_PX), and measured:

- `highlightCount`: separate patches of the body brighter than HIGHLIGHT_LUMA (a facet or spark
  catching the lamp), four-connected;
- `facetEdgeShare`: the share of the body's pixels on a luma edge of EDGE_STEP or more against a
  four-neighbour, inside the body or on its outline: a faceted stone is cut up by such edges, a
  smooth blob has only its outline;
- `outlineContrast`: the body's mean luma against the rock's, as the distinctness report counts it;
- `brightOrSaturatedShare`: the share of the whole tile that is body brighter than BRIGHT_LUMA or
  more saturated than SATURATION, Systems' showiness term.

The file `hero-reads.json` carries them per species with the SHA-256 of its cell, so the roster
spec (`roster.skinContactSheet.test.ts`) can refuse a measure that no longer matches the cell on
disk. Pure measurement over the cells: it draws nothing and the game never reads it.
"""

import hashlib
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
READS_PATH = os.path.join(HERE, 'hero-reads.json')
# The two screens of the gem-read test (ticket 744): a tile at the default 12 m zoom.
SCREEN_TILE_PX = {'360x640': 30, '1280x800': 67}
MASK_THRESHOLD = 0.5
HIGHLIGHT_LUMA = 0.82
BRIGHT_LUMA = 0.72
SATURATION = 0.5
EDGE_STEP = 0.1
REC601 = np.array([0.299, 0.587, 0.114], dtype=np.float32)


def write_hero_reads(table, cell_of, rock_rgb_of, resample_rgba, json_text_of):
    """
    Every hero of the table with a committed cell, measured at both screens; `cell_of` reads a
    hero's cell. A set authored before another's cells exist skips those (the roster spec refuses
    a gem with no read, so nothing is hidden), and names them.
    """
    measured = [hero for hero in table['heroes'] if os.path.exists(os.path.join(HERE, hero['cell']))]
    skipped = [hero['speciesId'] for hero in table['heroes'] if hero not in measured]
    if skipped:
        print('hero reads: no cell yet for %s' % ', '.join(skipped))
    reads = {
        '$comment': 'The gem-read measures of every committed hero cell at the two gem-read screens (ticket 785, '
                    'hero_reads.py): highlights, facet edges, outline contrast and the bright-or-saturated share, '
                    'with the SHA-256 of the cell they were measured from. Written by hero_post.py; look only.',
        'screens': dict(SCREEN_TILE_PX),
        'heroes': [hero_read_of(hero, cell_of(hero), rock_rgb_of(hero), resample_rgba) for hero in measured],
    }
    with open(READS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(reads))
    return reads


def hero_read_of(hero, cell_rgba, rock_rgb, resample_rgba):
    return {
        'speciesId': hero['speciesId'],
        'cellSha256': sha256_of(os.path.join(HERE, hero['cell'])),
        'screens': {screen: tile_read_of(resample_rgba(cell_rgba, tile_px), rock_rgb)
                    for screen, tile_px in SCREEN_TILE_PX.items()},
    }


def sha256_of(path):
    with open(path, 'rb') as file:
        return hashlib.sha256(file.read()).hexdigest()


def tile_read_of(rgba, rock_rgb):
    """The measures of one tile: the cell's content box-filtered to the screen's tile size."""
    mask = rgba[:, :, 3] > MASK_THRESHOLD
    alpha = rgba[:, :, 3:4]
    over = rgba[:, :, :3] * alpha + np.array(rock_rgb, dtype=np.float32) * (1.0 - alpha)
    luma = over @ REC601
    rock_luma = float(np.array(rock_rgb, dtype=np.float32) @ REC601)
    body_luma = float(luma[mask].mean()) if mask.any() else rock_luma
    return {
        'highlightCount': patch_count(mask & (luma >= HIGHLIGHT_LUMA)),
        'facetEdgeShare': round(edge_share_of(luma, mask), 3),
        'outlineContrast': round((max(body_luma, rock_luma) + 0.05) / (min(body_luma, rock_luma) + 0.05), 2),
        'brightOrSaturatedShare': round(float((mask & ((luma >= BRIGHT_LUMA) | (saturation_of(over) >= SATURATION))).mean()), 3),
    }


def saturation_of(rgb):
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    return np.where(high > 0, (high - low) / np.maximum(high, 1e-6), 0.0)


def edge_share_of(luma, mask):
    """The share of body pixels whose luma steps EDGE_STEP or more to a four-neighbour."""
    if not mask.any():
        return 0.0
    padded = np.pad(luma, 1, mode='edge')
    steps = [np.abs(padded[1 + dy:padded.shape[0] - 1 + dy, 1 + dx:padded.shape[1] - 1 + dx] - luma)
             for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))]
    on_edge = np.max(steps, axis=0) >= EDGE_STEP
    return float((on_edge & mask).sum() / mask.sum())


def patch_count(bright):
    """Four-connected patches of true pixels, by flood fill."""
    seen = np.zeros_like(bright, dtype=bool)
    count = 0
    height, width = bright.shape
    for y in range(height):
        for x in range(width):
            if bright[y, x] and not seen[y, x]:
                count += 1
                flood(bright, seen, y, x, height, width)
    return count


def flood(bright, seen, y, x, height, width):
    stack = [(y, x)]
    seen[y, x] = True
    while stack:
        cy, cx = stack.pop()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < height and 0 <= nx < width and bright[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
