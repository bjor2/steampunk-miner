"""
The looks the star map carousel previews (ticket 795): the first system's five planets, each with
the look on its planet row (ticket 653; planet 1 wears its archetype palette, #13), and the eight
SS2 palette looks with their art rows (ticket 778). Read from the rows the game reads, so the art
follows the data: `src/features/ores/ores.economy.json` (`ore.planets.rows`),
`src/systems/render/artDirection.json` (the archetype palettes), `src/features/solar-systems/palette.json`
and `lookArt.json`. Each look is a dict with its `key` (the preview asset is `ui-star-map-planet-<key>`),
its name, its motif, and the colours a preview is authored in: `rockSurface`, `rockDeep`, `horizon`
and the sky band's `skyBand`. No bpy here: the author, placeholder and post scripts share it.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
BRIEF_PATH = os.path.join(REPO_ROOT, 'src', 'data', 'design', 'starMapCarouselArt.json')
PLANET_ROWS_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'ores', 'ores.economy.json')
ART_DIRECTION_PATH = os.path.join(REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')
PALETTE_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'solar-systems', 'palette.json')
LOOK_ART_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'solar-systems', 'lookArt.json')
ECONOMY_PATH = os.path.join(REPO_ROOT, 'src', 'systems', 'economy', 'economy.json')

PREVIEW_PREFIX = 'ui-star-map-planet-'
SYSTEM_ASSET_ID = 'ui-star-map-system'

# The first system's motifs: the planet's hazard theme (ticket 651), what the preview's crust shows.
FIRST_SYSTEM_MOTIFS = {
    1: 'pitted sandstone',
    2: 'rockfall scree',
    3: 'coal seams',
    4: 'spine crystals',
    5: 'steam vents',
}


def load_json(path):
    with open(path, encoding='utf-8') as file:
        return json.load(file)


def load_brief():
    return load_json(BRIEF_PATH)


def asset_id_of(look):
    return PREVIEW_PREFIX + look['key']


def first_system_looks():
    """One look per place of system 1: the row's look, or planet 1's archetype palette."""
    rows = load_json(PLANET_ROWS_PATH)['ore']['planets']['rows']
    palettes = load_json(ART_DIRECTION_PATH)['palettes']
    places = load_json(ECONOMY_PATH)['starMap']['planetsPerSystem']
    looks = []
    for row in rows[:places]:
        look = row.get('look') or archetype_look_of(palettes['palette.planet_1'])
        looks.append({
            'key': str(row['planet']),
            'name': row['name'],
            'motif': FIRST_SYSTEM_MOTIFS[row['planet']],
            'rockSurface': look['rockSurface'],
            'rockDeep': look['rockDeep'],
            'horizon': look['horizon'],
            'skyBand': look['skyBand']['colour'],
        })
    return looks


def archetype_look_of(palette):
    """Planet 1 has no row look (ticket 653): its surface, deep and sky are the palette's."""
    return {'rockSurface': palette['surface'], 'rockDeep': palette['deep'], 'horizon': palette['sky'],
            'skyBand': {'colour': palette['sky']}}


def palette_looks():
    """The eight SS2 looks in palette order with their art rows."""
    rows = load_json(LOOK_ART_PATH)['looks']
    looks = []
    for look in load_json(PALETTE_PATH)['looks']:
        row = rows[look['id']]
        looks.append({
            'key': look['id'],
            'name': look['id'].replace('-', ' ').title(),
            'motif': look['groundMotif'],
            'rockSurface': row['rockSurface'],
            'rockDeep': row['rockDeep'],
            'horizon': row['horizon'],
            'skyBand': row['skyBand']['colour'],
        })
    return looks


PREVIEW_LOOKS = first_system_looks() + palette_looks()
