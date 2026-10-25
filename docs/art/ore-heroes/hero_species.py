"""
The hero species of the materials pools with hero art (#452, tickets 744 and 785): the `hero: true`
rows of the materials slice's `materials.json` with the body colour of their hue slot, the acts an
authored set serves (planet-mix's `oreThemes.json`) and the cell table the per-act hero atlas (#451)
reads. An act's atlas packs every authored set that paints one of its planets, set after set in
`AUTHORED_SETS` order, so the legacy four keep cells 0 to 3 in both acts, P1's gems follow them in
the foothold.base atlas and P2's own gems in the foothold.heavy atlas, then the gems of P3 to P5.
An act's atlas is an unbounded list of 16-cell pages (ticket 852): a hero sits on the page its
mineral skin row records (`atlasPage` in mineralSkins.json), and a hero with none on the first
page with room, a new page opening when the last is full, as `packHeroPages` in
src/systems/render/heroAtlas.ts packs them. Plain Python: the Blender authoring script and the
python3 post step both import it.
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
GEM_ROWS_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'ores', 'ores.economy.json')
SKINS_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'mineral-skins', 'mineralSkins.json')
CELLS_PATH = os.path.join(HERE, 'hero-cells.json')
BLENDER_VERSION = '4.2.9 LTS'

# The per-act hero atlas of #451 (TD shape on #450): 1024 px, 256 px cells, 16 a sheet, albedo only.
ATLAS = {'sidePx': 1024, 'cellPx': 256, 'contentPx': 248, 'gutterPx': 4, 'cellsPerRow': 4}
# HERO_ATLAS_CELLS in src/constants/scene.ts: the cells of one page (ticket 852).
CELLS_PER_PAGE = 16
# Which hero rows of a materials pool an authored set draws: every hero of the pool, the heroes on
# the pool's gem slots (the `ore.gems` rows of the ores slice, ticket 741), or every other hero.
EVERY_HERO, GEM_HEROES, NON_GEM_HEROES = 'every', 'gems', 'non-gems'
# The authored sets, in packing order, each a materials pool, the planets it paints and which of
# the pool's heroes it draws. `legacy` is #452's four on P1 and a P2 held under ore rules 5 or
# earlier (#447): its gem slots bind only on a P1 under rules 12 (ticket 713), so P1's three gems are
# their own set painting P1 alone (ticket 785), and keep the foothold.heavy atlas within 16 cells.
# `foothold-p2` is a fresh P2's three gems (ticket 744). The gem sets of P3 to P5 (ticket 785) draw
# the gem rows of the foothold pools of #453; their other `hero: true` rows have no art yet and draw
# the shader look.
AUTHORED_SETS = (
    {'id': 'legacy', 'pool': 'legacy', 'planets': (1, 2), 'heroes': NON_GEM_HEROES},
    {'id': 'p1-gems', 'pool': 'legacy', 'planets': (1,), 'heroes': GEM_HEROES},
    {'id': 'foothold-p2', 'pool': 'foothold-p2', 'planets': (2,), 'heroes': EVERY_HERO},
    {'id': 'foothold-p3-gems', 'pool': 'foothold-p3', 'planets': (3,), 'heroes': GEM_HEROES},
    {'id': 'foothold-p4-gems', 'pool': 'foothold-p4', 'planets': (4,), 'heroes': GEM_HEROES},
    {'id': 'foothold-p5-gems', 'pool': 'foothold-p5', 'planets': (5,), 'heroes': GEM_HEROES},
)
RARITY_ORDER = ('common', 'uncommon', 'rare', 'epic', 'mythic')


def load_materials():
    with open(MATERIALS_PATH, encoding='utf-8') as file:
        return json.load(file)


def load_acts():
    with open(THEMES_PATH, encoding='utf-8') as file:
        return json.load(file)['acts']


def load_atlas_pages():
    """Per species, the atlas page its mineral skin row records (ticket 852); absent for none."""
    with open(SKINS_PATH, encoding='utf-8') as file:
        skins = json.load(file)['skins']
    return {skin['species']: skin['atlasPage'] for skin in skins if 'atlasPage' in skin}


def load_gem_slots():
    """Per materials pool, the kind slots that sell as gems (`ore.gems.pools`, ticket 741)."""
    with open(GEM_ROWS_PATH, encoding='utf-8') as file:
        pools = json.load(file)['ore']['gems']['pools']
    return {row['pool']: tuple(row['slots']) for row in pools}


def set_named(set_id):
    found = [entry for entry in AUTHORED_SETS if entry['id'] == set_id]
    if not found:
        raise SystemExit('no authored set is named %s (one of %s)' % (set_id, ', '.join(s['id'] for s in AUTHORED_SETS)))
    return found[0]


def heroes_of(pool, materials=None):
    """The pool's hero rows in rarity order, then by slot, each with its hue slot's colour attached."""
    materials = materials or load_materials()
    slots = {slot['id']: slot for slot in materials['hueSlots']}
    rows = [row for row in materials['materials'] if row['pool'] == pool and row['hero']]
    rows.sort(key=lambda row: (RARITY_ORDER.index(row['rarity']), row['slot']))
    return [dict(row, hue=slots[row['hueSlot']]) for row in rows]


def heroes_of_set(set_id, materials=None, gem_slots=None):
    """The set's hero rows: the pool's heroes it draws, in `heroes_of` order."""
    entry = set_named(set_id)
    gem_slots = gem_slots or load_gem_slots()
    gems = gem_slots.get(entry['pool'], ())
    return [hero for hero in heroes_of(entry['pool'], materials) if draws_hero(entry['heroes'], hero['slot'] in gems)]


def draws_hero(which, is_gem):
    return which == EVERY_HERO or (which == GEM_HEROES) == is_gem


def acts_of_set(set_id, acts=None):
    """The act ids whose planets the set paints: one hero atlas per act."""
    acts = acts or load_acts()
    planets = set_named(set_id)['planets']
    return [act['id'] for act in acts if any(act['firstPlanet'] <= p <= act['lastPlanet'] for p in planets)]


def sets_of_act(act, sets=AUTHORED_SETS, acts=None):
    """The authored sets an act's atlas packs, in packing order."""
    acts = acts or load_acts()
    return [entry['id'] for entry in sets if act in acts_of_set(entry['id'], acts)]


def acts_of_sets(sets=AUTHORED_SETS, acts=None):
    """Every act an authored set paints, in the acts' own order."""
    acts = acts or load_acts()
    painted = {act for entry in sets for act in acts_of_set(entry['id'], acts)}
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


def hero_entry_of(set_id, hero):
    return {'speciesId': hero['id'], 'set': set_id, 'pool': hero['pool'], 'family': hero['family'],
            'rarity': hero['rarity'], 'silhouette': hero['silhouette'], 'pattern': hero['pattern'],
            'hueSlot': hero['hueSlot'], 'bodyHex': slot_hex(hero['hue']), 'gradeBand': hero['gradeBand'],
            'cell': 'cells/%s.png' % hero['id'], 'blend': 'blend/hero-%s.blend' % hero['id']}


def packed_pages(species_ids, page_of):
    """The act's pages, page 1 first: a recorded hero on its page, the rest in order on the first page
    with room, a new page opening when every page is full; cells in the act's order within a page."""
    recorded = [page_of[i] for i in species_ids if i in page_of]
    pages = [[] for _ in range(max(recorded, default=0))]
    for species_id in species_ids:
        if species_id in page_of:
            pages[page_of[species_id] - 1].append(species_id)
    for species_id in species_ids:
        if species_id not in page_of:
            open_page = next((page for page in pages if len(page) < CELLS_PER_PAGE), None)
            if open_page is None:
                open_page = []
                pages.append(open_page)
            open_page.append(species_id)
    return [sorted(page, key=species_ids.index) for page in pages]


def atlas_entry_of(act, sets, materials, acts, gem_slots, page_of):
    packed_sets = sets_of_act(act, sets, acts)
    packed = [hero['id'] for set_id in packed_sets for hero in heroes_of_set(set_id, materials, gem_slots)]
    return {'act': act, 'sets': packed_sets,
            'cells': [{'index': i, 'page': at + 1, 'speciesId': species_id, 'rect': cell_rect_of(i)}
                      for at, page in enumerate(packed_pages(packed, page_of))
                      for i, species_id in enumerate(page)]}


def cells_of_page(atlas_entry):
    """The act's cells by page (ticket 852): a list per page, page 1 first."""
    pages = [[] for _ in range(max((cell['page'] for cell in atlas_entry['cells']), default=0))]
    for cell in atlas_entry['cells']:
        pages[cell['page'] - 1].append(cell)
    return pages


def cell_table_of(sets=AUTHORED_SETS, materials=None, acts=None):
    materials = materials or load_materials()
    acts = acts or load_acts()
    gem_slots = load_gem_slots()
    page_of = load_atlas_pages()
    set_ids = [entry['id'] for entry in sets]
    return {
        '$comment': 'The hero cells of the authored sets %s (#452, tickets 744 and 785): one 256 px albedo cell '
                    'per hero species (`heroes`), and per act the cells its atlas of #451 packs (`atlases`: cell i '
                    'of its page at column i mod %d, row i div %d, %d px of content inside a %d px gutter), set after '
                    'set in packing order, each on the page its mineral skin row records (ticket 852). Rendered lit on the ore stage with the rock held out, so the alpha is the '
                    'mask; the shader draws the rarity frame and glow, never the sprite.'
                    % (', '.join(set_ids), ATLAS['cellsPerRow'], ATLAS['cellsPerRow'], ATLAS['contentPx'], ATLAS['gutterPx']),
        'sets': set_ids,
        'atlas': dict(ATLAS),
        'atlases': [atlas_entry_of(act, sets, materials, acts, gem_slots, page_of) for act in acts_of_sets(sets, acts)],
        'heroes': [hero_entry_of(set_id, hero) for set_id in set_ids for hero in heroes_of_set(set_id, materials, gem_slots)],
    }


def heroes_of_table(table, set_id=None):
    """The table's hero entries, or those of one authored set."""
    return [hero for hero in table['heroes'] if set_id is None or hero['set'] == set_id]


def heroes_sharing_acts(table, set_id):
    """Every hero packed into an act the set paints: what the set's heroes sit beside."""
    acts = [atlas for atlas in table['atlases'] if set_id in atlas['sets']]
    ids = {cell['speciesId'] for atlas in acts for cell in atlas['cells']}
    return [hero for hero in table['heroes'] if hero['speciesId'] in ids]


def write_cell_table(sets=AUTHORED_SETS):
    table = cell_table_of(sets)
    with open(CELLS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(layout.json_text_of(table))
    return table


if __name__ == '__main__':
    written = write_cell_table()
    print('%d hero cells for %s, acts %s' % (len(written['heroes']), ', '.join(written['sets']),
                                             ', '.join(atlas['act'] for atlas in written['atlases'])))
