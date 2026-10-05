"""
Re-packs a checked-in placeholder sidecar (art/placeholders/<asset-id>.parts.json) after its part
list was edited by hand: atlas rects, atlas size and map names are recomputed with the same packer
the Blender export uses, so a placeholder is a valid schema-1 sidecar (#52). Run `npm run format`
afterwards; the placeholders are formatted like the rest of the repo.

    python3 scripts/art/repack_placeholder.py <asset-id> [<asset-id> ...]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asset_layout  # noqa: E402


def repack(asset_id, rules):
    placeholder = asset_layout.load_placeholder_sidecar(asset_id)
    if placeholder is None:
        raise SystemExit('no placeholder at ' + asset_layout.placeholder_path_of(asset_id))
    has_emissive = placeholder.get('maps', {}).get('emissive', False) is not False
    source = placeholder.get('source') or placeholder_source_of(asset_id)
    sidecar = asset_layout.build_sidecar(asset_id, placeholder['parts'], rules, source, has_emissive)
    asset_layout.write_sidecar(asset_layout.placeholder_path_of(asset_id), sidecar)


def placeholder_source_of(asset_id):
    """Where the Blender source will live; no hash or version until a real export writes them."""
    return {'blend': 'art/blender/%s/%s.blend' % (asset_id, asset_id), 'sha256': None, 'blender': None}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    RULES = asset_layout.load_rules()
    for ASSET_ID in sys.argv[1:]:
        repack(ASSET_ID, RULES)
