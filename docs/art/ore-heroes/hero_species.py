"""
The hero species of the materials pools with hero art (#452, ticket 744): the `hero: true` rows of
the materials slice's `materials.json` with the body colour of their hue slot, the acts a pool
serves (planet-mix's `oreThemes.json`) and the cell table the per-act hero atlas (#451) reads. An
act's atlas packs every authored pool that paints one of its planets, pool after pool in
`AUTHORED_POOLS` order, so the legacy four keep cells 0 to 3 in both acts and P2's own gems follow
them in the foothold.heavy atlas. Plain Python: the Blender authoring script and the python3 post
step both import it.
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
# The planets a pool paints: `legacy` is P1 and P2 (#447; a P2 held under ore rules 5 or earlier),
# `foothold-p2` a fresh P2 (ticket 632), the foothold pools P3 to P7 (#453).
POOL_PLANETS = {'legacy': (1, 2), 'foothold-p2': (2,), 'foothold-p3': (3,), 'foothold-p4': (4,), 'foothold-p5': (5,),
                'foothold-p6-p7': (6, 7)}
# The pools whose heroes have cells, in packing order: the legacy four of #452 first, so a P1 or an
# older P2 keeps its cells, then P2's three gems of ticket 744. A pool whose `hero: true` rows have
# no art yet (foothold-p3 on) stays off the list and its heroes draw the shader look.
AUTHORED_POOLS = ('legacy', 'foothold-p2')
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


def pools_of_act(act, pools=AUTHORED_POOLS, acts=None):
    """The authored pools an act's atlas packs, in packing order."""
    acts = acts or load_acts()
    return [pool for pool in pools if act in acts_of_pool(pool, acts)]


def acts_of_pools(pools=AUTHORED_POOLS, acts=None):
    """Every act an authored pool paints, in the acts' own order."""
    acts = acts or load_acts()
    painted = {act for pool in pools for act in acts_of_pool(pool, acts)}
    return [act['id'] for act in acts if act['id'] in painted]


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


def hero_entry_of(pool, hero):
    return {'speciesId': hero['id'], 'pool': pool, 'family': hero['family'], 'rarity': hero['rarity'],
            'silhouette': hero['silhouette'], 'pattern': hero['pattern'], 'hueSlot': hero['hueSlot'],
            'bodyHex': slot_hex(hero['hue']), 'gradeBand': hero['gradeBand'],
            'cell': 'cells/%s.png' % hero['id'], 'blend': 'blend/hero-%s.blend' % hero['id']}


def atlas_entry_of(act, pools, materials, acts):
    packed = [hero for pool in pools_of_act(act, pools, acts) for hero in heroes_of(pool, materials)]
    return {'act': act, 'pools': pools_of_act(act, pools, acts),
            'cells': [{'index': i, 'speciesId': hero['id'], 'rect': cell_rect_of(i)} for i, hero in enumerate(packed)]}


def cell_table_of(pools=AUTHORED_POOLS, materials=None, acts=None):
    materials = materials or load_materials()
    acts = acts or load_acts()
    return {
        '$comment': 'The hero cells of the %s pools (#452, ticket 744): one 256 px albedo cell per hero species '
                    '(`heroes`), and per act the cells its atlas of #451 packs (`atlases`: cell i at column i mod %d, '
                    'row i div %d, %d px of content inside a %d px gutter), pool after pool in packing order. '
                    'Rendered lit on the ore stage with the rock held out, so the alpha is the mask; the shader '
                    'draws the rarity frame and glow, never the sprite.'
                    % (' and '.join(pools), ATLAS['cellsPerRow'], ATLAS['cellsPerRow'], ATLAS['contentPx'], ATLAS['gutterPx']),
        'pools': list(pools),
        'atlas': dict(ATLAS),
        'atlases': [atlas_entry_of(act, pools, materials, acts) for act in acts_of_pools(pools, acts)],
        'heroes': [hero_entry_of(pool, hero) for pool in pools for hero in heroes_of(pool, materials)],
    }


def heroes_of_table(table, pool=None):
    """The table's hero entries, or those of one pool."""
    return [hero for hero in table['heroes'] if pool is None or hero['pool'] == pool]


def heroes_sharing_acts(table, pool):
    """Every hero packed into an act the pool paints: what the pool's heroes sit beside."""
    acts = [atlas for atlas in table['atlases'] if pool in atlas['pools']]
    ids = {cell['speciesId'] for atlas in acts for cell in atlas['cells']}
    return [hero for hero in table['heroes'] if hero['speciesId'] in ids]


def write_cell_table(pools=AUTHORED_POOLS):
    table = cell_table_of(pools)
    with open(CELLS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(layout.json_text_of(table))
    return table


if __name__ == '__main__':
    written = write_cell_table()
    print('%d hero cells for %s, acts %s' % (len(written['heroes']), ', '.join(written['pools']),
                                             ', '.join(atlas['act'] for atlas in written['atlases'])))
