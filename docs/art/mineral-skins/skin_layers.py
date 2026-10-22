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
import math
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
# slots 1 to 5, #599 its slots 6 to 10 and #600 its slots 11 to 15 and the planet's signature
# material, of the foothold-p3 pool; #601 is P4 slots 1 to 5, #602 its slots 6 to 10 and #603 its
# slots 11 to 15 and the planet's signature material; #604 is P5 slots 1 to 5, #605 its slots 6 to 10
# and #606 its slots 11 to 15 and the planet's signature material, of the foothold-p5 pool; #595 is
# P2 slots 1 to 5, of the foothold-p2 pool, which binds the legacy slots, #596 its slots 6 to 9,
# the four uncommons, #597 its slots 10 to 12, the three rares, #710 its slots 13 to 15, the pool's
# own kinds of ticket 709, and #736 the species its slots 6, 7 and 12 swap in under ore rules 9),
# named `p<planet>-b<n>`, in slot order. A batch is measured against all of its planet's other
# batches (`planet_mates`), less the skins on the slots it dresses itself (`mate_skins`). A batch's
# `signature` is the planet whose signature skin row it adds. A batch's `oreRules` picks, on a slot
# that swaps species (a row's `fromOreRules`/`beforeOreRules`, ticket 736), the species bound under
# those rules; a batch without it reads the slot's first species.
BATCHES = {
    'p1-b1': {'pool': 'legacy', 'slots': ('legacy.c1', 'legacy.c2', 'legacy.c3', 'legacy.c4', 'legacy.c5')},
    'p1-b2': {'pool': 'legacy', 'slots': ('legacy.u1', 'legacy.u2', 'legacy.u3', 'legacy.u4', 'legacy.r1')},
    'p1-b3': {'pool': 'legacy', 'slots': ('legacy.r2', 'legacy.r3')},
    'p2-b1': {'pool': 'foothold-p2', 'slots': ('legacy.c1', 'legacy.c2', 'legacy.c3', 'legacy.c4', 'legacy.c5')},
    'p2-b2': {'pool': 'foothold-p2', 'slots': ('legacy.u1', 'legacy.u2', 'legacy.u3', 'legacy.u4')},
    'p2-b3': {'pool': 'foothold-p2', 'slots': ('legacy.r1', 'legacy.r2', 'legacy.r3')},
    'p2-b4': {'pool': 'foothold-p2', 'slots': ('legacy.u5', 'legacy.r4', 'legacy.r5')},
    'p2-b5': {'pool': 'foothold-p2', 'slots': ('legacy.u1', 'legacy.u2', 'legacy.r3'), 'oreRules': 9},
    'p3-b1': {'pool': 'foothold-p3', 'slots': ('mixed.c1', 'mixed.c2', 'mixed.c3', 'mixed.c4', 'mixed.u1')},
    'p3-b2': {'pool': 'foothold-p3', 'slots': ('mixed.u2', 'mixed.u3', 'mixed.r1', 'mixed.r2', 'mixed.r3')},
    'p3-b3': {'pool': 'foothold-p3', 'slots': ('mixed.e1', 'mixed.e2', 'mixed.e3', 'mixed.m1', 'mixed.m2'),
              'signature': 3},
    'p4-b1': {'pool': 'foothold-p4', 'slots': ('mixed.c1', 'mixed.c2', 'mixed.c3', 'mixed.c4', 'mixed.u1')},
    'p4-b2': {'pool': 'foothold-p4', 'slots': ('mixed.u2', 'mixed.u3', 'mixed.r1', 'mixed.r2', 'mixed.r3')},
    'p4-b3': {'pool': 'foothold-p4', 'slots': ('mixed.e1', 'mixed.e2', 'mixed.e3', 'mixed.m1', 'mixed.m2'),
              'signature': 4},
    'p5-b1': {'pool': 'foothold-p5', 'slots': ('mixed.c1', 'mixed.c2', 'mixed.c3', 'mixed.c4', 'mixed.u1')},
    'p5-b2': {'pool': 'foothold-p5', 'slots': ('mixed.u2', 'mixed.u3', 'mixed.r1', 'mixed.r2', 'mixed.r3')},
    'p5-b3': {'pool': 'foothold-p5', 'slots': ('mixed.e1', 'mixed.e2', 'mixed.e3', 'mixed.m1', 'mixed.m2'),
              'signature': 5},
}
# A signature material has no hue slot (#453 E1): its palette is built on a slot-shaped look chosen
# inside its family's hue and luma bands of docs/art/ores (#151; relic 155-168 degrees, luma
# 0.46-0.68), which the slice's loader holds it to.
SIGNATURE_LOOKS = {
    3: {'id': 'p3-signature', 'hue': 163, 'saturation': 0.5, 'luma': 0.5},
    4: {'id': 'p4-signature', 'hue': 166, 'saturation': 0.5, 'luma': 0.6},
    5: {'id': 'p5-signature', 'hue': 157, 'saturation': 0.5, 'luma': 0.52},
}
# A colour-change species' shadow end sits on its second colour, not on its own hue: alexandrite is
# green by lamplight and red by candle, so its ramp runs from raspberry through the green body.
# Bismuth's oxide skin runs through the temper colours, so its shadow sits on magenta under the
# cyan body (ticket 596).
SHADOW_HUES = {'alexandrite': 335, 'bismuth-rainbow': 300}
# A light end can sit off the species' own hue. A two-tone species' light end sits on its heart's
# colour: watermelon tourmaline is pink at heart and green at the rind, so its ramp runs from the
# green body up to a pale pink. An inner-fire species' light end sits on its flame: furnace ruby is
# "a ruby with a flame inside", so its ramp runs from its red body up into a flame orange, which also
# parts it from fire garnet, the hue slot five degrees from it on P5.
LIGHT_HUES = {'watermelon-tourmaline': 345, 'furnace-ruby': 25}


def load_skins():
    with open(SKINS_PATH, encoding='utf-8') as file:
        return json.load(file)


def species_by_id(materials=None):
    materials = materials or species.load_materials()
    slots = {slot['id']: slot for slot in materials['hueSlots']}
    return {row['id']: dict(row, hue=slots[row['hueSlot']]) for row in materials['materials']}


def batch_skins(batch, skins=None, materials=None):
    """
    The batch's skin rows in roster-slot order, each with its species row attached, then its
    signature skin, if it has one, under the wearer name `p<planet>-signature`. A slot is read in
    the batch's pool: the foothold pools of P3 to P7 bind the same `mixed.*` slots.
    """
    skins = skins or load_skins()
    rows = species_by_id(materials)
    pool, rules = BATCHES[batch]['pool'], BATCHES[batch].get('oreRules')
    by_slot = {rows[skin['species']]['slot']: dict(skin, row=rows[skin['species']])
               for skin in skins['skins']
               if rows[skin['species']]['pool'] == pool and is_bound_under(rows[skin['species']], rules)}
    missing = [slot for slot in BATCHES[batch]['slots'] if slot not in by_slot]
    if missing:
        raise SystemExit('batch %s has no skin row for slot(s) %s' % (batch, ', '.join(missing)))
    return [by_slot[slot] for slot in BATCHES[batch]['slots']] + batch_signature_skins(batch, skins)


def is_bound_under(row, rules):
    """
    Whether a species row binds its slot under ore rules `rules` (the materials slice's span, ticket
    736); `None` reads the slot's first species, the one bound before any swap.
    """
    if rules is None:
        return 'fromOreRules' not in row
    return row.get('fromOreRules', 0) <= rules < row.get('beforeOreRules', math.inf)


def mate_skins(batch):
    """
    The skins of the planet's other batches the batch shares a planet with: every one but those on a
    slot of its pool it dresses itself, which a swap (ticket 736) never shows beside it.
    """
    own = {(BATCHES[batch]['pool'], slot) for slot in BATCHES[batch]['slots']}
    return [skin for mate in planet_mates(batch) for skin in batch_skins(mate)
            if (skin['row'].get('pool'), skin['row'].get('slot')) not in own]


def batch_signature_skins(batch, skins):
    planet = BATCHES[batch].get('signature')
    if planet is None:
        return []
    found = [row for row in skins.get('signatures', []) if row['planet'] == planet]
    if not found:
        raise SystemExit('batch %s has no signature skin row for planet %d' % (batch, planet))
    return [dict(found[0], species=signature_wearer(planet), row={'hue': SIGNATURE_LOOKS[planet]})]


def signature_wearer(planet):
    return 'p%d-signature' % planet


def planet_of(batch):
    return batch.split('-')[0]


def planet_mates(batch):
    """
    The planet's other batches: the skins this one must stand apart from on screen. Every one, not
    only those before it, since a planet's batches may land out of order (P4's third before its first).
    """
    return [name for name in BATCHES if name != batch and planet_of(name) == planet_of(batch)]


# --- the palette ramp ------------------------------------------------------------------------------


def rgb_of_hex(hex_colour):
    return tuple(int(hex_colour[i:i + 2], 16) / 255.0 for i in (1, 3, 5))


def ramp_of_slot(slot):
    """
    Shadow, body, light: the body is the hue slot's colour (ticket 450), the ends on its hue, or the
    shadow on a colour-change species' second hue (SHADOW_HUES) and the light on a two-tone
    species' heart or an inner-fire species' flame (LIGHT_HUES).
    """
    body = rgb_of_hex(species.slot_hex(slot))
    luma = species.luma_of_rgb(body)
    shadow = species.with_luma(end_colour_of(slot, body, SHADOW_HUES), luma * SHADOW_LUMA_SHARE)
    light = species.with_luma(end_colour_of(slot, body, LIGHT_HUES), luma + (1 - luma) * LIGHT_LUMA_SHARE)
    return [species.hex_of_rgb(shadow), species.hex_of_rgb(body), species.hex_of_rgb(light)]


def end_colour_of(slot, body, end_hues):
    """The colour a ramp end is drawn from: the body, or the slot's look turned to the end's own hue."""
    hue = end_hues.get(slot['id'])
    return body if hue is None else rgb_of_hex(species.slot_hex(dict(slot, hue=hue)))


# --- the cell table --------------------------------------------------------------------------------


def cell_path(kind, layer_id):
    return 'cells/%s/%s.png' % (kind, layer_id)


def blend_path(kind, layer_id):
    return 'blend/%s-%s.blend' % (kind, layer_id)


def worn_by(skins, kind, layer_id):
    wearers = [skin['species'] for skin in skins['skins'] if skin[kind] == layer_id]
    wearers += [signature_wearer(row['planet']) for row in skins.get('signatures', []) if row[kind] == layer_id]
    return sorted(wearers)


def cell_table_of(skins=None):
    skins = skins or load_skins()
    return {
        '$comment': 'The drawn layer cells of the mineral skins (#576, tickets 592 to 606): one %d px cell per '
                    'base, vein and sheen layer of mineralSkins.json at %d px/m, the 1 m ore cell; '
                    'p<n>-signature wears a planet\'s signature skin row. base: '
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
