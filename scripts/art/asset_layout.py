"""
The pure half of the art export (#52): part ids, atlas packing and the parts.json sidecar. No bpy
here, so `make_placeholder_parts.py` and the Blender export share one packer and one id rule.
The rules (part names, px per metre, atlas limits) come from art/asset-rules.json, which the
game's TypeScript asset lint reads too.
"""

import json
import math
import os
import re

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SIDECAR_SCHEMA = 1
CATEGORIES = ('vehicle', 'platform', 'enemy', 'prop', 'ground', 'casing')
MAP_KINDS = ('albedo', 'normal', 'emissive')
# Metres in the sidecar are rounded so float noise from Blender never changes the file (#52 acc. 5).
METRE_DECIMALS = 4
SMALLEST_ATLAS_SIDE = 64


def load_rules():
    with open(os.path.join(REPO_ROOT, 'art', 'asset-rules.json'), encoding='utf-8') as file:
        return json.load(file)


def load_manifest_entry(asset_id):
    """The asset's own entry file, `art/assets/<id>.json` (#116), or None if it has none."""
    path = os.path.join(REPO_ROOT, 'art', 'assets', asset_id + '.json')
    if not os.path.isfile(path):
        return None
    with open(path, encoding='utf-8') as file:
        return json.load(file)


def load_placeholder_sidecar(asset_id):
    path = placeholder_path_of(asset_id)
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as file:
        return json.load(file)


def placeholder_path_of(asset_id):
    return os.path.join(REPO_ROOT, 'art', 'placeholders', asset_id + '.parts.json')


def category_of(asset_id):
    """`vehicle`, or the prefix before the first dash (`enemy-crawler` is an enemy)."""
    for category in CATEGORIES:
        if asset_id == category or asset_id.startswith(category + '-'):
            return category
    return None


def export_dir_of(asset_id):
    return os.path.join(REPO_ROOT, 'public', 'assets', category_of(asset_id), asset_id)


def bake_dir_of(asset_id):
    return os.path.join(REPO_ROOT, 'art', 'build', asset_id)


def vehicle_part_pattern(rules):
    names = '|'.join(re.escape(name) for name in rules['vehiclePartNames'])
    return re.compile(r'^t([1-9][0-9]*)-(' + names + r')(-([2-9]|[1-9][0-9]+))?$')


def part_id_problems(asset_id, part_id, rules):
    """A vehicle part is `t<tier>-<part>[-n]`; any other asset's parts (a vehicle module's
    `t<tier>-<part>` too) are its placeholder's ids."""
    if asset_id == 'vehicle':
        if vehicle_part_pattern(rules).match(part_id):
            return []
        return ['part "%s" is not t<tier>-<part>[-n] with a part from asset-rules.json' % part_id]
    placeholder = load_placeholder_sidecar(asset_id) or {'parts': []}
    known = [part['id'] for part in placeholder['parts']]
    if part_id in known:
        return []
    return ['part "%s" is not one of the placeholder ids %s' % (part_id, ', '.join(known))]


TIER_PREFIX = re.compile(r'^t([1-9][0-9]*)-')


def tier_of_part(part_id):
    """The tier a `t<tier>-` id names (the vehicle and its module families), else 1."""
    match = TIER_PREFIX.match(part_id)
    return int(match.group(1)) if match else 1


def is_tiered_part(part_id):
    return TIER_PREFIX.match(part_id) is not None


def px_size_of(size_m, px_per_metre):
    return max(1, int(math.ceil(round(size_m * px_per_metre, 6))))


def round_metres(value):
    return round(value + 0.0, METRE_DECIMALS) + 0.0


def pack_atlas(sizes_px, margin, max_side):
    """
    Shelf-packs `{part_id: (w, h)}` into the smallest power-of-two atlas, each rect padded by
    `margin` on every side so mipmaps never bleed (#52). Returns `(rects, (width, height))` with
    rects `[x, y, w, h]` from the image's top-left, or None if nothing up to `max_side` fits.
    """
    order = sorted(sizes_px.items(), key=lambda item: (-item[1][1], -item[1][0], item[0]))
    best = None
    width = SMALLEST_ATLAS_SIDE
    while width <= max_side:
        packed = shelf_pack(order, margin, width)
        if packed is not None and packed[1] <= max_side:
            area = width * packed[1]
            if best is None or area < best[0]:
                best = (area, packed[0], (width, packed[1]))
        width *= 2
    return None if best is None else (best[1], best[2])


def shelf_pack(order, margin, width):
    rects = {}
    x = y = shelf_height = 0
    for part_id, (w, h) in order:
        cell_w, cell_h = w + 2 * margin, h + 2 * margin
        if cell_w > width:
            return None
        if x + cell_w > width:
            x, y, shelf_height = 0, y + shelf_height, 0
        rects[part_id] = [x + margin, y + margin, w, h]
        x += cell_w
        shelf_height = max(shelf_height, cell_h)
    return rects, next_power_of_two(max(y + shelf_height, SMALLEST_ATLAS_SIDE))


def next_power_of_two(value):
    side = 1
    while side < value:
        side *= 2
    return side


def build_sidecar(asset_id, parts, rules, source, has_emissive):
    """
    `parts` are dicts with id, tier, sizeM, pivotM, atM and z, in metres. Parts come out sorted by
    id and every number rounded, so an unchanged scene writes a byte-identical file (#52 acc. 5).
    """
    px_per_metre = rules['pxPerMetre'][category_of(asset_id)]
    sizes = {part['id']: tuple(px_size_of(m, px_per_metre) for m in part['sizeM']) for part in parts}
    packed = pack_atlas(sizes, rules['atlasMarginPx'], rules['maxAtlasPx'])
    if packed is None:
        raise ValueError('the parts of "%s" do not fit a %d px atlas' % (asset_id, rules['maxAtlasPx']))
    rects, atlas = packed
    return {
        'assetId': asset_id,
        'schema': SIDECAR_SCHEMA,
        'source': source,
        'pxPerMetre': px_per_metre,
        'atlasPx': list(atlas),
        'maps': {
            'albedo': asset_id + '.albedo.ktx2',
            'normal': asset_id + '.normal.ktx2',
            'emissive': asset_id + '.emissive.ktx2' if has_emissive else False,
        },
        'parts': [sidecar_part_of(part, rects[part['id']]) for part in sorted(parts, key=lambda p: p['id'])],
    }


def sidecar_part_of(part, rect):
    return {
        'id': part['id'],
        'tier': part['tier'],
        'rect': rect,
        'sizeM': [round_metres(v) for v in part['sizeM']],
        'pivotM': [round_metres(v) for v in part['pivotM']],
        'atM': [round_metres(v) for v in part['atM']],
        'z': part['z'],
    }


def write_sidecar(path, sidecar):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json.dumps(sidecar, indent=2, ensure_ascii=False) + '\n')
