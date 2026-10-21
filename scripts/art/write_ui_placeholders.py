"""
Writes the placeholder sidecars of the UI chrome sprites (ticket 683) from the `uiSprites` table
of art/asset-rules.json: one art/placeholders/ui-<name>.parts.json per asset, each part a sprite at
one unit per CSS px with its nine-slice insets, its pivot at the sprite's centre, packed with the
same packer the Blender export uses. Run `npm run format` afterwards. Idempotent.

    python3 scripts/art/write_ui_placeholders.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asset_layout  # noqa: E402

# Variants of one asset sit side by side in the .blend, this many CSS px apart, so the file reads.
VARIANT_PITCH = 16


def main():
    rules = asset_layout.load_rules()
    for asset_id, sprites in sorted(rules['uiSprites'].items()):
        sidecar = asset_layout.build_sidecar(asset_id, placeholder_parts_of(sprites), rules,
                                             placeholder_source_of(asset_id), has_emissive=False)
        asset_layout.write_sidecar(asset_layout.placeholder_path_of(asset_id), sidecar)
        print('wrote placeholder ' + asset_id)


def placeholder_parts_of(sprites):
    return [placeholder_part_of(part_id, rule, at) for at, (part_id, rule) in enumerate(sorted(sprites.items()))]


def placeholder_part_of(part_id, rule, at):
    width, height = rule['sizePx']
    part = {
        'id': part_id,
        'tier': 1,
        'sizeM': [float(width), float(height)],
        'pivotM': [width / 2.0, height / 2.0],
        'atM': [float(variant_x_of(rule, at)), 0.0],
        'z': 0,
    }
    if 'insetPx' in rule:
        part['insetPx'] = list(rule['insetPx'])
    return part


def variant_x_of(rule, at):
    """The first part at the origin; each later variant right of it with a clear gap."""
    return 0 if at == 0 else at * (rule['sizePx'][0] + VARIANT_PITCH)


def placeholder_source_of(asset_id):
    return {'blend': 'art/blender/%s/%s.blend' % (asset_id, asset_id), 'sha256': None, 'blender': None}


if __name__ == '__main__':
    main()
