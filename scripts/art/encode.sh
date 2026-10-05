#!/usr/bin/env bash
# Encodes one asset's PNG bakes (art/build/<id>/) into the KTX2 maps the game ships, beside its
# parts.json under public/assets/<category>/<id>/ (#52 "Formats"):
#   albedo, emissive  Basis ETC1S, sRGB
#   normal            Basis UASTC (ETC1S is too lossy for normals), linear, zstd-supercompressed
# Every map gets a full mip chain. One thread, so the encoder's output is byte-stable.
# Needs KTX-Software's toktx (4.4.2 on the shared box). Usage: scripts/art/encode.sh <asset-id>
set -euo pipefail

asset_id="${1:?usage: scripts/art/encode.sh <asset-id>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
bake="$root/art/build/$asset_id"
sidecar=("$root"/public/assets/*/"$asset_id"/"$asset_id".parts.json)

if [[ ! -f "${sidecar[0]}" ]]; then
  echo "encode: no exported parts.json for $asset_id; run scripts/art/export.sh first" >&2
  exit 1
fi
out="$(dirname "${sidecar[0]}")"

encode_etc1s_srgb() {
  toktx --t2 --encode etc1s --clevel 2 --qlevel 192 --assign_oetf srgb --genmipmap --threads 1 "$1" "$2"
}

encode_uastc_linear() {
  toktx --t2 --encode uastc --uastc_quality 2 --zcmp 19 --assign_oetf linear --genmipmap --threads 1 "$1" "$2"
}

for map in albedo normal; do
  if [[ ! -f "$bake/$asset_id.$map.png" ]]; then
    echo "encode: missing bake $bake/$asset_id.$map.png" >&2
    exit 1
  fi
done

encode_etc1s_srgb "$out/$asset_id.albedo.ktx2" "$bake/$asset_id.albedo.png"
encode_uastc_linear "$out/$asset_id.normal.ktx2" "$bake/$asset_id.normal.png"
# The export writes no emissive bake when nothing glows, and the sidecar then says emissive: false.
if [[ -f "$bake/$asset_id.emissive.png" ]]; then
  encode_etc1s_srgb "$out/$asset_id.emissive.ktx2" "$bake/$asset_id.emissive.png"
else
  rm -f "$out/$asset_id.emissive.ktx2"
fi
echo "encoded $asset_id into ${out#"$root"/}"
