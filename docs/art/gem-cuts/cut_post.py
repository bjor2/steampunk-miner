"""
The python3 post step of the gem-cut library (ticket 889), after author_gem_cuts.py has rendered
the cuts: the 256 px atlas cells (the 248 px neutral sprite with its edge pixels extended into the
4 px gutter), a preview of each library page, the game-scale strip (every cut over the review rock
at 85, 67, 40, 30, 24 and 22 px a tile, coloured by three hue slots as the shader colours it, with
the greyscale and deuteranopia copies), the distinctness report between every pair of cuts, the
gem-read measures of every committed cell at the three read screens (`gem-cut-reads.json`: 24 px a
tile on a 640x360 phone, 30 on 360x640, 67 on 1280x800), neutral and tinted by the dimmest hue slot,
and the JPEG shrink of the colour sheets. Pillow and numpy; Blender's Python has neither.

    python3 docs/art/gem-cuts/cut_post.py
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

import gem_cuts as library  # noqa: E402
import hero_post as post  # noqa: E402
import hero_reads as reads  # noqa: E402
import hero_species as species  # noqa: E402
from atlas_layout import json_text_of  # noqa: E402

CELL_DIR = os.path.join(HERE, 'cells')
SHEET_DIR = os.path.join(HERE, 'sheets')
BUILD_DIR = os.path.join(library.REPO_ROOT, 'art', 'build', 'gem-cuts')
# A tile on screen at the default zoom: 1080p, 1280x800, the 20 m zoom, a 360x640 phone, a landscape
# 640x360 phone at 15 m (24 px, ticket 315's floor) and the portrait phone at the 20 m zoom.
TILE_PX = (85, 67, 40, 30, 24, 22)
# The read screens (ticket 889: "the gems read at 24 px, with goldens at 360 px and 1280+").
SCREEN_TILE_PX = {'640x360': 24, '360x640': 30, '1280x800': 67}
REPORT_TILE_PX = 40
# Three hue slots the strip tints the cuts by, the shader's way: a warm, a cool and a pale one.
STRIP_TINTS = ('#c84e1e', '#2e74c8', '#e8d9a0')
REC601 = np.array([0.299, 0.587, 0.114], dtype=np.float32)


def main():
    cuts = library.load_library()
    table = library.write_cell_table(cuts)
    for cut in table['cuts']:
        write_cell(cut)
    cells = {cut['cutId']: post.read_rgba(os.path.join(HERE, cut['cell'])) for cut in table['cuts']}
    for page in table['pages']:
        write_page_preview(page, library.cells_of_page(table, page['page']), table['atlas'], cells)
    strip = write_scale_strip(table['cuts'], cells)
    post.write_blind_copies(strip)
    report = write_distinctness(table['cuts'], cells)
    write_cut_reads(table['cuts'], cells)
    post_sheets()
    print('post done: %d cells, least different pair %s' % (len(cells), report['leastDifferentPair']))


def write_cell(cut):
    sprite = post.read_rgba(os.path.join(BUILD_DIR, '%s.sprite.png' % library.short_name_of({'id': cut['cutId']})))
    content, gutter = library.ATLAS['contentPx'], library.ATLAS['gutterPx']
    if sprite.shape[0] != content or sprite.shape[1] != content:
        raise SystemExit('%s sprite is %dx%d, not %d' % (cut['cutId'], sprite.shape[1], sprite.shape[0], content))
    padded = np.pad(sprite, ((gutter, gutter), (gutter, gutter), (0, 0)), mode='edge')
    return post.write_rgba(os.path.join(HERE, cut['cell']), padded)


def write_page_preview(page, page_cells, shape, cells):
    side, size, gutter = shape['sidePx'], shape['cellPx'], shape['gutterPx']
    atlas = np.zeros((side, side, 4), dtype=np.float32)
    for cell in page_cells:
        rect = cell['rect']
        x, y = rect['x'] - gutter, rect['y'] - gutter
        atlas[y:y + size, x:x + size] = cells[cell['cutId']]
    return post.write_rgba(os.path.join(SHEET_DIR, 'atlas-preview.%s.png' % page['assetId']), atlas)


# --- the shader's colouring, in numpy, for the strip and the tinted reads --------------------------


def tinted(rgba, hue_rgb):
    """`gemCutSkin` of src/scene/terrainKindShader.ts with no overlay: the hue takes the luma below
    the middle, and the luma above it runs to white."""
    luma = rgba[..., :3] @ REC601
    hue = np.array(hue_rgb, dtype=np.float32)
    shaded = hue[None, None, :] * (luma * 2.0)[..., None]
    lit = hue[None, None, :] + (np.ones(3, dtype=np.float32) - hue)[None, None, :] * ((luma - 0.5) * 2.0)[..., None]
    rgb = np.where((luma < 0.5)[..., None], shaded, lit)
    return np.concatenate([np.clip(rgb, 0.0, 1.0), rgba[..., 3:4]], axis=2)


def rock_rgb():
    return post.rock_rgb_of({'gradeBand': [library.REVIEW_BAND, library.REVIEW_BAND]})


def dimmest_hue_slot_rgb():
    """The hue slot of the materials table with the least luma: the hardest case for the reads."""
    slots = species.load_materials()['hueSlots']
    dimmest = min(slots, key=lambda slot: slot['luma'])
    return post.rgb_of_hex(species.slot_hex(dimmest))


# --- the game-scale strip --------------------------------------------------------------------------------


def write_scale_strip(cuts, cells):
    rows = [strip_row(cuts, cells, px) for px in TILE_PX]
    width = max(row.shape[1] for row in rows)
    rows = [np.pad(row, ((0, post.STRIP_GAP_PX), (0, width - row.shape[1]), (0, 0)), constant_values=0.0) for row in rows]
    strip = np.concatenate(rows, axis=0)
    post.write_rgb(os.path.join(SHEET_DIR, 'gem-cuts.scale.png'), strip)
    path = os.path.join(SHEET_DIR, 'gem-cuts.scale-x%d.png' % post.STRIP_MAGNIFY)
    return post.write_rgb(path, post.magnified(strip, post.STRIP_MAGNIFY))


def strip_row(cuts, cells, tile_px):
    rock = rock_rgb()
    tiles = []
    for at, cut in enumerate(cuts):
        hue = post.rgb_of_hex(STRIP_TINTS[at % len(STRIP_TINTS)])
        content = post.content_of(tinted(cells[cut['cutId']], hue))
        tiles.append(post.resampled(post.composite_over(content, rock), tile_px))
    gap = np.zeros((tile_px, post.STRIP_GAP_PX, 3), dtype=np.float32)
    return np.concatenate(list(itertools.chain.from_iterable((tile, gap) for tile in tiles))[:-1], axis=1)


# --- distinctness ------------------------------------------------------------------------------------------


def write_distinctness(cuts, cells):
    """Per pair at 40 px, neutral: how far apart the silhouettes are (1 - mask IoU) and the lumas;
    the least different pair is named so the README can say it."""
    rock = rock_rgb()
    measures = {cut['cutId']: post.hero_measures(cells[cut['cutId']], rock, REPORT_TILE_PX) for cut in cuts}
    pairs = [post.pair_measures(a, b, measures) for a, b in itertools.combinations(measures, 2)]
    least = min(pairs, key=lambda pair: pair['silhouetteDifference'] + pair['lumaDifference'])
    report = {'tilePx': REPORT_TILE_PX, 'cuts': {cut_id: post.printable(m) for cut_id, m in measures.items()},
              'pairs': pairs, 'leastDifferentPair': [least['a'], least['b']]}
    with open(os.path.join(SHEET_DIR, 'gem-cuts.distinct.json'), 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(report))
    return report


# --- the reads ---------------------------------------------------------------------------------------------


def write_cut_reads(cuts, cells):
    """Every cut's gem-read measures (hero_reads.py) at the three screens, neutral and tinted by the
    dimmest hue slot, with the SHA-256 of its cell."""
    rock = rock_rgb()
    dim = dimmest_hue_slot_rgb()
    rows = []
    for cut in cuts:
        content = post.content_of(cells[cut['cutId']])
        rows.append({
            'cutId': cut['cutId'],
            'cellSha256': reads.sha256_of(os.path.join(HERE, cut['cell'])),
            'screens': {screen: reads.tile_read_of(post.resampled_rgba(content, px), rock) for screen, px in SCREEN_TILE_PX.items()},
            'dimmestTint': {screen: reads.tile_read_of(post.resampled_rgba(tinted(content, dim), px), rock)
                            for screen, px in SCREEN_TILE_PX.items()},
        })
    out = {
        '$comment': 'The gem-read measures of every committed gem-cut cell at the three read screens (ticket 889, '
                    'hero_reads.py over cut_post.py): highlights, facet edges, outline contrast and the bright-or-saturated '
                    'share of the neutral cell (`screens`) and of the cell coloured by the dimmest hue slot of the materials '
                    'table the shader\'s way (`dimmestTint`), with the SHA-256 of the cell. Look only.',
        'screens': dict(SCREEN_TILE_PX),
        'dimmestHueSlotHex': species.hex_of_rgb(dim),
        'cuts': rows,
    }
    with open(library.READS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(out))
    return out


def post_sheets():
    for name in sorted(os.listdir(SHEET_DIR)):
        if not name.startswith('gem-cuts.') or not name.endswith('.png') or any(tag in name for tag in ('-gray', '-ingame', '-deutan', '.scale')):
            continue
        path = os.path.join(SHEET_DIR, name)
        rgb = post.read_rgb(path)
        post.write_rgb(path[:-4] + '-gray.png', post.gray_of(rgb))
        Image.open(path).convert('RGB').save(path[:-4] + '.jpg', quality=post.JPEG_QUALITY, optimize=True)
        os.remove(path)


if __name__ == '__main__':
    main()
