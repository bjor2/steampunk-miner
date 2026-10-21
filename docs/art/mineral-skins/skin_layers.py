"""
The mineral skin layers of #576 (GD ruling 20 Oct 2026) as the art sees them: the skin rows and
layer lists of the mineral-skins slice's `mineralSkins.json`, the species each row skins (with its
hue slot from the materials slice's `materials.json`), the palette ramp rule, and the cell table
`skin-layers.json` that names every layer's drawn cell. Plain Python: the Blender authoring script
and the python3 post step both import it.

A skin is four layers drawn bottom first. `base` and `vein` cells carry a ramp coordinate in their
luminance (the vein's alpha is its mask), the `palette` maps that coordinate to colour, and the
`sheen` cell is the lustre's highlight strength, screened toward the palette's light end (the
compositing rule in README.md, which the render seam follows).
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
HEROES = os.path.normpath(os.path.join(HERE, '..', 'ore-heroes'))
ORES = os.path.normpath(os.path.join(HERE, '..', 'ores'))
for folder in (HEROES, ORES):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import hero_species as species  # noqa: E402
from atlas_layout import json_text_of  # noqa: E402

SKINS_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'mineral-skins', 'mineralSkins.json')
CELLS_PATH = os.path.join(HERE, 'skin-layers.json')
BUILD_DIR = os.path.join(REPO_ROOT, 'art', 'build', 'mineral-skins')
LAYER_KINDS = ('base', 'vein', 'palette', 'sheen')
# The kinds drawn in Blender; a palette is three colours, data in the table.
DRAWN_KINDS = ('base', 'vein', 'sheen')
CELL_PX = 256
PX_PER_M = 256
# The ramp around the hue slot's colour: the shadow at half its luma, the light halfway to white.
SHADOW_LUMA_SHARE = 0.5
LIGHT_LUMA_SHARE = 0.5
# The batches of #576: a planet's species by roster slot, five a ticket (#592 is P1 slots 1 to 5,
# #593 its slots 6 to 10, #594 its last two, 11 and 12: the legacy pool has 12 species; #598 is P3
# slots 1 to 5 and #599 its slots 6 to 10, of the foothold-p3 pool), named `p<planet>-b<n>`. Keep a planet's batches in
# slot order: a batch is measured against the ones listed before it (`earlier_batches`).
BATCHES = {
    'p1-b1': {'pool': 'legacy', 'slots': ('legacy.c1', 'legacy.c2', 'legacy.c3', 'legacy.c4', 'legacy.c5')},
    'p1-b2': {'pool': 'legacy', 'slots': ('legacy.u1', 'legacy.u2', 'legacy.u3', 'legacy.u4', 'legacy.r1')},
    'p1-b3': {'pool': 'legacy', 'slots': ('legacy.r2', 'legacy.r3')},
    'p3-b1': {'pool': 'foothold-p3', 'slots': ('mixed.c1', 'mixed.c2', 'mixed.c3', 'mixed.c4', 'mixed.u1')},
    'p3-b2': {'pool': 'foothold-p3', 'slots': ('mixed.u2', 'mixed.u3', 'mixed.r1', 'mixed.r2', 'mixed.r3')},
}


def load_skins():
    with open(SKINS_PATH, encoding='utf-8') as file:
        return json.load(file)


def species_by_id(materials=None):
    materials = materials or species.load_materials()
    slots = {slot['id']: slot for slot in materials['hueSlots']}
    return {row['id']: dict(row, hue=slots[row['hueSlot']]) for row in materials['materials']}


def batch_skins(batch, skins=None, materials=None):
    """
    The batch's skin rows in roster-slot order, each with its species row attached. A slot is read
    in the batch's pool: the foothold pools of P3 to P7 bind the same `mixed.*` slots.
    """
    skins = skins or load_skins()
    rows = species_by_id(materials)
    pool = BATCHES[batch]['pool']
    by_slot = {rows[skin['species']]['slot']: dict(skin, row=rows[skin['species']])
               for skin in skins['skins'] if rows[skin['species']]['pool'] == pool}
    missing = [slot for slot in BATCHES[batch]['slots'] if slot not in by_slot]
    if missing:
        raise SystemExit('batch %s has no skin row for slot(s) %s' % (batch, ', '.join(missing)))
    return [by_slot[slot] for slot in BATCHES[batch]['slots']]


def planet_of(batch):
    return batch.split('-')[0]


def earlier_batches(batch):
    """The batches of the same planet before this one: the skins it must stand apart from on screen."""
    names = list(BATCHES)
    return [name for name in names[:names.index(batch)] if planet_of(name) == planet_of(batch)]


# --- the palette ramp ------------------------------------------------------------------------------


def rgb_of_hex(hex_colour):
    return tuple(int(hex_colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5))


def ramp_of_slot(slot):
    """Shadow, body, light: the body is the hue slot's colour (ticket 450), the ends on its hue."""
    body = rgb_of_hex(species.slot_hex(slot))
    luma = species.luma_of_rgb(body)
    shadow = species.with_luma(body, luma * SHADOW_LUMA_SHARE)
    light = species.with_luma(body, luma + (1 - luma) * LIGHT_LUMA_SHARE)
    return [species.hex_of_rgb(shadow), species.hex_of_rgb(body), species.hex_of_rgb(light)]


# --- the cell table --------------------------------------------------------------------------------


def cell_path(kind, layer_id):
    return 'cells/%s/%s.png' % (kind, layer_id)


def blend_path(kind, layer_id):
    return 'blend/%s-%s.blend' % (kind, layer_id)


def worn_by(skins, kind, layer_id):
    return sorted(skin['species'] for skin in skins['skins'] if skin[kind] == layer_id)


def cell_table_of(skins=None):
    skins = skins or load_skins()
    return {
        '$comment': 'The drawn layer cells of the mineral skins (#576, tickets 592 to 606): one %d px cell per '
                    'base, vein and sheen layer of mineralSkins.json at %d px/m, the 1 m ore cell. base: '
                    'opaque, its luminance the ramp coordinate, seamless at its edges. vein: the shape, its '
                    'luminance the ramp coordinate and its alpha the mask. sheen: the lustre highlight '
                    'strength, seamless. Palettes are data in mineralSkins.json.' % (CELL_PX, PX_PER_M),
        'cellPx': CELL_PX,
        'pxPerMetre': PX_PER_M,
        'layers': [{'kind': kind, 'id': entry['id'], 'cell': cell_path(kind, entry['id']),
                    'blend': blend_path(kind, entry['id']), 'wornBy': worn_by(skins, kind, entry['id'])}
                   for kind in DRAWN_KINDS for entry in skins['layers'][kind]],
    }


def write_cell_table():
    table = cell_table_of()
    with open(CELLS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(table))
    return table


def print_ramps(batch):
    for skin in batch_skins(batch):
        print(skin['palette'], ramp_of_slot(skin['row']['hue']))


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'ramps':
        print_ramps(sys.argv[2])
    else:
        print('%d drawn layer cells' % len(write_cell_table()['layers']))
