"""
Writes the placeholder sidecars and manifest entries of the star map carousel's assets (ticket
795, spec #647) from the brief in src/data/design/starMapCarouselArt.json and the look rows: one
art/placeholders/<id>.parts.json and one art/assets/<id>.json per preview (`ui-star-map-planet-<key>`,
the hero and its orbit dot) and for the system strip (`ui-star-map-system`: the backdrop, the frame,
the here ring, the selected marker), each part at one unit per CSS px with its pivot at its centre,
packed with the packer the Blender export uses. An entry that already exists keeps its status (so a
final asset stays final) and only its colour follows the rows. Run `npm run format` afterwards.
Idempotent.

    python3 docs/art/star-map-carousel/write_placeholders.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))
sys.path.insert(0, HERE)

import asset_layout  # noqa: E402
from carousel_looks import PREVIEW_LOOKS, SYSTEM_ASSET_ID, asset_id_of, load_brief  # noqa: E402

# Variants of one asset sit side by side in the .blend, this many CSS px apart, so the file reads.
VARIANT_PITCH = 16


def main():
    brief, rules = load_brief(), asset_layout.load_rules()
    for look in PREVIEW_LOOKS:
        write_asset(asset_id_of(look), preview_parts_of(asset_id_of(look), brief), rules, look['rockSurface'])
    write_asset(SYSTEM_ASSET_ID, system_parts_of(brief), rules, '#c9a24b')


def write_asset(asset_id, parts, rules, colour):
    sidecar = asset_layout.build_sidecar(asset_id, parts, rules, placeholder_source_of(asset_id), has_emissive=False)
    asset_layout.write_sidecar(asset_layout.placeholder_path_of(asset_id), sidecar)
    write_manifest_entry(asset_id, colour)
    print('wrote placeholder ' + asset_id)


def preview_parts_of(asset_id, brief):
    """The hero at the origin, the orbit dot beside it."""
    hero, dot = brief['hero']['sizePx'], brief['dot']['sizePx']
    return [
        square_part(asset_id, hero, 0),
        square_part(asset_id + '-dot', dot, hero / 2 + VARIANT_PITCH + dot / 2),
    ]


def system_parts_of(brief):
    """The backdrop at the origin; the frame, here ring and marker in a row under it."""
    system = brief['system']
    width, height = system['sizePx']
    frame = system['frame']
    row_z = -(height / 2 + VARIANT_PITCH + frame['sizePx'] / 2)
    parts = [part_of(SYSTEM_ASSET_ID, (width, height), (0, 0))]
    x = -width / 2 + frame['sizePx'] / 2
    frame_part = part_of(SYSTEM_ASSET_ID + '-frame', (frame['sizePx'], frame['sizePx']), (x, row_z))
    frame_part['insetPx'] = [frame['insetPx'], frame['insetPx']]
    parts.append(frame_part)
    x += frame['sizePx'] + VARIANT_PITCH + system['herePx'] / 2
    parts.append(part_of(SYSTEM_ASSET_ID + '-here', (system['herePx'], system['herePx']), (x, row_z)))
    x += system['herePx'] / 2 + VARIANT_PITCH + system['selectedPx'] / 2
    parts.append(part_of(SYSTEM_ASSET_ID + '-selected', (system['selectedPx'], system['selectedPx']), (x, row_z)))
    return parts


def square_part(part_id, size, x):
    return part_of(part_id, (size, size), (x, 0))


def part_of(part_id, size, at):
    width, height = size
    return {
        'id': part_id,
        'tier': 1,
        'sizeM': [float(width), float(height)],
        'pivotM': [width / 2.0, height / 2.0],
        'atM': [float(at[0]), float(at[1])],
        'z': 0,
    }


def placeholder_source_of(asset_id):
    return {'blend': 'art/blender/%s/%s.blend' % (asset_id, asset_id), 'sha256': None, 'blender': None}


def write_manifest_entry(asset_id, colour):
    """A new entry is a placeholder; an existing one keeps its status and takes the colour."""
    path = os.path.join(REPO_ROOT, 'art', 'assets', asset_id + '.json')
    status = 'placeholder'
    if os.path.exists(path):
        with open(path, encoding='utf-8') as file:
            status = json.load(file)['status']
    entry = {'id': asset_id, 'source': 'blender', 'form': 'parts', 'status': status, 'color': colour}
    with open(path, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json.dumps(entry, indent=2) + '\n')


if __name__ == '__main__':
    main()
