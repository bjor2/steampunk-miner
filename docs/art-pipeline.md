# Art pipeline: Blender to the game

How a Blender asset becomes something the game draws, and what the game draws before the art
exists. The decisions are [#52](https://github.com/bjor2/steampunk-miner/issues/52) (format, naming,
folders) and [#51](https://github.com/bjor2/steampunk-miner/issues/51) (which assets are Blender,
vector, shader or procedural). Built in S7 ([#61](https://github.com/bjor2/steampunk-miner/issues/61)).

## Tools

| Tool                   | Version on the shared box | Used for                                                  |
| ---------------------- | ------------------------- | --------------------------------------------------------- |
| Blender                | 4.2.9 LTS                 | authoring (Blender MCP) and the headless export           |
| KTX-Software (`toktx`) | 4.4.2                     | PNG to KTX2 (Basis ETC1S and UASTC)                       |
| Git LFS                | 3.6.1                     | `.blend` sources (`*.blend filter=lfs` in .gitattributes) |

Installing them on a new Debian box: `sudo apt-get install git-lfs`, then the
`KTX-Software-4.4.2-Linux-x86_64.deb` from the KhronosGroup/KTX-Software releases
(`sudo apt-get install ./KTX-Software-4.4.2-Linux-x86_64.deb`). Run `git lfs install` once in a
clone before committing the first `.blend`; without it git stores the file whole.

## Folders

```
art/
  asset-manifest.json            the #51 inventory: id, source, form, status, placeholder colours
  asset-rules.json               vehicle part names, px per metre, atlas limits (read by TS and Python)
  placeholders/<id>.parts.json   checked-in placeholder sidecars, one per Blender parts asset
  blender/<id>/<id>.blend        sources, Git LFS
  build/<id>/                    intermediate PNG bakes (gitignored)
scripts/art/
  export.sh                      the one export command: bake, then encode
  export_asset.py                headless Blender: refuse or bake, write parts.json
  encode.sh                      toktx: PNG bakes to KTX2 maps
  asset_layout.py                part ids, atlas packing, the sidecar (no bpy)
  repack_placeholder.py          re-packs a hand-edited placeholder sidecar
public/assets/<category>/<id>/   generated exports only: <id>.parts.json and <id>.<map>.ktx2
src/ui/icons/<id>.svg            vector icons; the data-testid is the file stem
```

The category is the id's prefix: `vehicle`, `platform-*`, `enemy-*`, `prop-*`, `ground-*` and
`casing-*`.

## Exporting an asset

```
npm run art:export -- <asset-id>
```

This runs `blender -b art/blender/<id>/<id>.blend --python-exit-code 1 -P scripts/art/export_asset.py -- --asset <id>`
and then `scripts/art/encode.sh <id>`. Set `BLENDER` to use another Blender binary, or
`ART_BLEND` to export from a file outside `art/blender/` (for example a scratch file you're
trying out). The `.blend` is never saved.

**It refuses the scene** (exit 1, with every problem listed) when the asset id names no category or
isn't a `parts` asset in the manifest, when the file has an armature, a shape key or an action, or
when a mesh object's name isn't a valid part id. For the vehicle, `t<tier>-<part>` objects must also
sit in the `tier-<tier>` collection.

**Otherwise it bakes** each part with Cycles (CPU, 1 sample, seed 0) from a quad just behind it, so
the view is along +Y (Blender's Front view). Each part gets its own rectangle of a power-of-two
atlas with an 8 px margin:

- `albedo`: base colour, with the part's mask in alpha
- `normal`: tangent space, OpenGL convention (+Y up), flat outside the parts
- `emissive`: emission. If nothing glows, no emissive map is written and the sidecar says
  `"emissive": false`

`encode.sh` then writes `albedo` and `emissive` as ETC1S sRGB, and `normal` as UASTC linear with
zstd. All three get full mip chains and are encoded on one thread.

**Idempotent:** an unchanged `.blend` gives byte-identical PNGs, sidecar and KTX2 files. The sidecar
sorts its parts by id, rounds metres to 4 decimals, and records the Blender version and the
`.blend`'s sha256. Re-running the export is safe, and the diff shows exactly what changed.

### Scene conventions (#52)

- Metric units, 1 Blender unit = 1 m = one world cell. Game right is +X, game up is +Z, and Y is
  depth (nearer the camera, meaning smaller Y, draws on top).
- One mesh object per part. The object's name is the part id, and its origin is the pivot the code
  animates around (axle, bearing, hinge).
- The vehicle has collections `tier-1`, `tier-2` and `tier-3`. A higher tier holds only the parts it
  adds or replaces: `t3-wheel-2` replaces `t1-wheel-2`, and everything else carries over.
- Draw order: an integer custom property `z` on the object if set, otherwise the depth rank.
- The hub has collections `outpost` and `core-drive`, one part each.

## Bay screen backdrops

`npm run art:export -- platform-bay-<bay>-backdrop` renders the bay's screen backdrop (#45, #51)
from the bay's own file, `art/blender/platform-bay-<bay>/platform-bay-<bay>.blend`. There is no
second model. The scene camera frames the shot. The floor and wall that stage it are meshes in the
`backdrop-staging` collection, which the parts bake skips, and its lights are ordinary lights. The
render uses Cycles on the CPU with a fixed seed, sample count and thread count, at the
`backdropPx` size in `art/asset-rules.json`. It ships as one `<id>.albedo.ktx2` (ETC1S, sRGB) in
`public/assets/platform/<id>/`.

`scripts/art/author_platform.py` wrote the first version of the three platform files (S7b). From
then on the `.blend` files are the sources: change the art in Blender and re-export.

## The `parts.json` sidecar, schema 1

```json
{
  "assetId": "vehicle",
  "schema": 1,
  "source": { "blend": "art/blender/vehicle/vehicle.blend", "sha256": "…", "blender": "4.2.9 LTS" },
  "pxPerMetre": 512,
  "atlasPx": [1024, 2048],
  "maps": {
    "albedo": "vehicle.albedo.ktx2",
    "normal": "vehicle.normal.ktx2",
    "emissive": "vehicle.emissive.ktx2"
  },
  "parts": [
    {
      "id": "t1-wheel",
      "tier": 1,
      "rect": [8, 8, 123, 123],
      "sizeM": [0.24, 0.24],
      "pivotM": [0.12, 0.12],
      "atM": [-0.32, -0.36],
      "z": 1
    }
  ]
}
```

`rect` is in atlas pixels from the image's top-left. `sizeM` and `pivotM` are in metres from the
part's bottom-left. `atM` is where the pivot sits in the asset's frame (the object's X and Z), and
`z` is the draw order. `atM` and `atlasPx` go beyond the example in #52: without `atM` the game
couldn't place a part, and `atlasPx` is what the rects are checked against. A placeholder that no
export has written yet has a null `sha256` and `blender`.

## Placeholders

Until an asset is exported, its manifest entry is `"status": "placeholder"` with a `color`, plus
`partColors` per part if you want them. It ships no files. The game draws it as flat-coloured quads
using the part ids, sizes, pivots and draw order of `art/placeholders/<id>.parts.json`
(`src/systems/art/placeholderLook.ts`). An asset id with no entry or no placeholder draws as one 1 m
magenta quad.

`steampunkDebug.vehicleParts()` reports the part ids the run vehicle shows. The real asset must
keep the placeholder's part ids and tiers (S7a–S7d acceptance; the lint checks it). To change a placeholder, edit its part list, then run
`python3 scripts/art/repack_placeholder.py <id>` and `npm run format`.

To ship real art: export it, set its manifest entry to `"status": "final"`, add its exported
sidecar to `EXPORTED_SIDECARS` in `src/systems/art/artCatalogue.ts`, and commit the `.blend` (LFS)
together with the files under `public/assets/`.

## Drawing final art

A final asset's parts come from its exported sidecar (`src/systems/art/assetLook.ts`): each part
is one quad, the same quads its placeholder drew, with texture coordinates cut from the atlas
rect. `PartQuadMesh` draws it with the albedo map (alpha is the part mask, cut at 0.5) and falls
back to the flat placeholder quad while the map transcodes. Maps load with three's `KTX2Loader`;
its Basis transcoder (three r169) is copied into `public/basis/`, so update that copy when three
is upgraded. The vehicle (S7a) is the first asset drawn this way.

The enemies (S7c) draw from their atlases through the enemy pool (`src/scene/EnemyFigures.tsx`):
each body is its kind's one part, tinted by the tier ramp and the telegraph (`enemyLookOf`; the
chitin is authored pale so the tint reads over it) and rolled to local up. The artefact cache
(S7c) is final art too, but nothing in the world draws it until the artefacts build places
caches.

## The asset lint

`src/systems/art/assetLint.test.ts` runs in `npm test` and fails when:

- the manifest isn't the #51 inventory under the #52 ids: every Blender asset and vector icon
  derived from the registries is listed, nothing unknown is listed, and every Blender placeholder
  has a colour
- a file under `public/assets/` or `src/ui/icons/` has no final manifest entry, or isn't a file its
  form ships (so a raster icon fails), or a final entry is missing one of its files
- a sidecar (placeholder or exported) fails schema 1: wrong ids or tiers, a zero-size or
  out-of-atlas rect, a pivot outside `sizeM`, the wrong texel density or wrong map names
- a KTX2 map is over 4096 px or not power-of-two, or isn't in its Basis format and colour space

## Not built yet

- Baking the `tile` form (ground, casing). The script refuses it and names the form; S7d adds it.
- Showing a backdrop behind a bay screen. A DOM panel can't show KTX2, so S8 decides how the screen
  draws it (for example in the canvas behind the panel).
- Lighting final art. Parts draw unlit with the albedo map; the lit render (S6) adds the normal
  and emissive maps to its lit material. Keep each final asset's `color`: it is the loading
  fallback.
