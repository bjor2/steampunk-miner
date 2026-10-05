#!/usr/bin/env bash
# The one export command (#52): bakes art/blender/<id>/<id>.blend headlessly, writes its
# parts.json, then encodes the KTX2 maps. Re-running it on an unchanged .blend rewrites the same
# files. See docs/art-pipeline.md. Usage: npm run art:export -- <asset-id>
set -euo pipefail

asset_id="${1:?usage: npm run art:export -- <asset-id>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
blend="${ART_BLEND:-$root/art/blender/$asset_id/$asset_id.blend}"

"${BLENDER:-blender}" -b "$blend" --python-exit-code 1 \
  -P "$root/scripts/art/export_asset.py" -- --asset "$asset_id"
"$root/scripts/art/encode.sh" "$asset_id"
