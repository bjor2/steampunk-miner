"""
The hero species of one materials pool (#452): the `hero: true` rows of the materials slice's
`materials.json` with the body colour of their hue slot, the acts the pool serves (planet-mix's
`oreThemes.json`) and the cell table the per-act hero atlas (#451) reads. Plain Python: the Blender
authoring script and the python3 post step both import it.
"""

import colorsys
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ORES = os.path.normpath(os.path.join(HERE, '..', 'ores'))
if ORES not in sys.path:
    sys.path.insert(0, ORES)

import atlas_layout as layout  # noqa: E402

MATERIALS_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'materials', 'materials.json')
THEMES_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'planet-mix', 'oreThemes.json')
CELLS_PATH = os.path.join(HERE, 'hero-cells.json')
BLENDER_VERSION = '4.2.9 LTS'

# The per-act hero atlas of #451 (TD shape on #450): 1024 px, 256 px cells, 16 a sheet, albedo only.
ATLAS = {'sidePx': 1024, 'cellPx': 256, 'contentPx': 248, 'gutterPx': 4, 'cellsPerRow': 4}
# The planets a pool paints: `legacy` is P1 and P2 (#447), the foothold pools are P3 to P7 (#453).
POOL_PLANETS = {'legacy': (1, 2), 'foothold-p3': (3,), 'foothold-p4': (4,), 'foothold-p5': (5,), 'foothold-p6-p7': (6, 7)}
RARITY_ORDER = ('common', 'uncommon', 'rare', 'epic', 'mythic')


def load_materials():
    with open(MATERIALS_PATH, encoding='utf-8') as file:
        return json.load(file)


def load_acts():
    with open(THEMES_PATH, encoding='utf-8') as file:
        return json.load(file)['acts']


def heroes_of(pool, materials=None):
    """The pool's hero rows in rarity order, then by slot, each with its hue slot's colour attached."""
    materials = materials or load_materials()
    slots = {slot['id']: slot for slot in materials['hueSlots']}
    rows = [row for row in materials['materials'] if row['pool'] == pool and row['hero']]
    rows.sort(key=lambda row: (RARITY_ORDER.index(row['rarity']), row['slot']))
    return [dict(row, hue=slots[row['hueSlot']]) for row in rows]


def acts_of_pool(pool, acts=None):
    """The act ids whose planets the pool paints: one hero atlas per act."""
    acts = acts or load_acts()
    planets = POOL_PLANETS[pool]
    return [act['id'] for act in acts if any(act['firstPlanet'] <= p <= act['lastPlanet'] for p in planets)]


# --- colour ---------------------------------------------------------------------------------------


def luma_of_rgb(rgb):
    """Rec. 601, the kernel's `lumaOf` (src/systems/render/colour.ts), as materials.json measures."""
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def with_luma(rgb, target):
    luma = luma_of_rgb(rgb)
    if luma >= target:
        factor = 0.0 if luma == 0 else target / luma
        return tuple(min(1.0, channel * factor) for channel in rgb)
    share = (target - luma) / (1 - luma)
    return tuple(channel + (1 - channel) * share for channel in rgb)


def hex_of_rgb(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(channel * 255))) for channel in rgb)


def slot_hex(slot, luma=None):
    """The hue slot's colour at its luma (or another luma on the same hue and saturation)."""
    base = colorsys.hls_to_rgb(slot['hue'] / 360.0, 0.5, slot['saturation'])
    return hex_of_rgb(with_luma(base, slot['luma'] if luma is None else luma))


# --- the cell table -------------------------------------------------------------------------------


def cell_rect_of(index):
    cell, gutter, per_row = ATLAS['cellPx'], ATLAS['gutterPx'], ATLAS['cellsPerRow']
    return {'x': (index % per_row) * cell + gutter, 'y': (index // per_row) * cell + gutter,
            'w': ATLAS['contentPx'], 'h': ATLAS['contentPx']}


def cell_table_of(pool, materials=None, acts=None):
    heroes = heroes_of(pool, materials)
    return {
        '$comment': 'The hero cells of the %s pool (#452): one 256 px albedo cell per hero species, in the order '
                    'the per-act hero atlas of #451 packs them (cell i at column i mod %d, row i div %d, %d px '
                    'of content inside a %d px gutter). Rendered lit on the ore stage with the rock held out, '
                    'so the alpha is the mask; the shader draws the rarity frame and glow, never the sprite.'
                    % (pool, ATLAS['cellsPerRow'], ATLAS['cellsPerRow'], ATLAS['contentPx'], ATLAS['gutterPx']),
        'pool': pool,
        'acts': acts_of_pool(pool, acts),
        'atlas': dict(ATLAS),
        'cells': [{'index': i, 'speciesId': hero['id'], 'family': hero['family'], 'rarity': hero['rarity'],
                   'silhouette': hero['silhouette'], 'pattern': hero['pattern'], 'hueSlot': hero['hueSlot'],
                   'bodyHex': slot_hex(hero['hue']), 'gradeBand': hero['gradeBand'], 'rect': cell_rect_of(i),
                   'cell': 'cells/%s.png' % hero['id'], 'blend': 'blend/hero-%s.blend' % hero['id']}
                  for i, hero in enumerate(heroes)],
    }


def write_cell_table(pool):
    table = cell_table_of(pool)
    with open(CELLS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(layout.json_text_of(table))
    return table


if __name__ == '__main__':
    written = write_cell_table(sys.argv[1] if len(sys.argv) > 1 else 'legacy')
    print('%d hero cells for %s, acts %s' % (len(written['cells']), written['pool'], ', '.join(written['acts'])))
