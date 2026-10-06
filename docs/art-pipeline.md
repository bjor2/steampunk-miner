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
  assets/<id>.json               the #51 inventory, one manifest entry per asset: id, source, form,
                                 status, placeholder colours
  asset-rules.json               vehicle part names, px per metre, atlas limits (read by TS and Python)
  placeholders/<id>.parts.json   checked-in placeholder sidecars, one per Blender parts asset
  blender/<id>/<id>.blend        sources, Git LFS
  build/<id>/                    intermediate PNG bakes (gitignored)
scripts/art/
  export.sh                      the one export command: bake, then encode
  export_asset.py                headless Blender: refuse or bake, write parts.json
  bake_tile.py                   headless Blender: bake a ground or casing tile (S7d)
  encode.sh                      toktx: PNG bakes to KTX2 maps
  asset_layout.py                part ids, atlas packing, the sidecar (no bpy)
  repack_placeholder.py          re-packs a hand-edited placeholder sidecar
  merge_check.sh                 shows two art branches merge with no hand edits (#116)
public/assets/<category>/<id>/   generated exports only: <id>.parts.json and <id>.<map>.ktx2
src/ui/icons/<id>.svg            vector icons; the data-testid is the file stem
```

The category is the id's prefix: `vehicle` (and the vehicle modules, `vehicle-*`), `platform-*`,
`enemy-*`, `prop-*`, `ground-*` and `casing-*`.

## Adding an asset

Every file an asset needs is a file of its own, so two branches that each add an asset merge with
no hand edits (#116). Create:

1. `art/assets/<id>.json`, the asset's manifest entry. The file name is its id (the lint checks it).
2. For a Blender `parts` asset, `art/placeholders/<id>.parts.json`, its placeholder sidecar.
3. Its spec, `src/systems/art/<module>Art.test.ts`, one per module (see `autoGunsArt.test.ts` or
   `blastingChargesArt.test.ts`). Don't add module cases to the shared `assetManifest`,
   `assetLook` or `partsSidecar` specs.

Don't edit a shared list: no manifest file and no catalogue imports. The loader
`src/scene/shippedArt.ts` finds every entry file, placeholder sidecar and exported sidecar with
`import.meta.glob` and sorts them by id into the `ArtCatalogue` that the pure rules in
`src/systems/art` take as an argument. `systems/` imports no `import.meta`, so it stays testable in
node. The export script reads the asset's own entry file.

The one code change left is the id itself. #52 derives every id from a registry. An asset of a
registered kind (an economy enemy, a platform bay, an upgrade track) is derived already. An asset
whose name comes from a new place (the first art of a schedule row, like the charge rack) adds that
derivation to `src/systems/art/artIds.ts`, or the lint rejects the id.

`npm run art:merge-check` proves this from the committed HEAD in a throwaway clone. Two branches add
assets whose ids sort next to each other, and they merge cleanly. A control pair that appends to one
shared file must conflict.

**Why one file per asset, not a sorted generated manifest:** a committed generated file still
conflicts when two branches add neighbouring ids, and a generated file that isn't committed would
have to be rebuilt before every typecheck, test and Python export. One file per asset never
conflicts, and the folder is the list.

## Exporting an asset

```
npm run art:export -- <asset-id>
```

This runs `blender -b art/blender/<id>/<id>.blend --python-exit-code 1 -P scripts/art/export_asset.py -- --asset <id>`
and then `scripts/art/encode.sh <id>`. Set `BLENDER` to use another Blender binary, or
`ART_BLEND` to export from a file outside `art/blender/` (for example a scratch file you're
trying out). The `.blend` is never saved.

**It refuses the scene** (exit 1, with every problem listed) when the asset id names no category or
isn't a `parts`, `tile` or `backdrop` asset in the manifest, when the file has an armature, a shape key or an action, or
when a mesh object's name isn't a valid part id. Tiered `t<tier>-<part>` objects (the vehicle's and
a vehicle module's) must also sit in the `tier-<tier>` collection.

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

## Vehicle modules

A schedule row whose unlock shows on the vehicle (#81 acceptance 3) gets its own tiered part
family, `vehicle-<row>`, listed with its part names under `vehicleModuleParts` in
`art/asset-rules.json` (the lint checks every key is a row of `docs/scaling/horizontal/stats.json`).
Its parts are authored in the vehicle's own frame (chassis centre at the origin, drill towards +X),
so drawing the family with the vehicle's transform puts it on the hull. Its tiers are the module's
own looks, not the vehicle's visual tier.

- **`vehicle-auto-guns`** (`auto_guns`, #107, #108): a hull turret, visible at every visual tier.
  - `t1-turret-mount`: a pedestal on the chassis top at (0.04, 0.13); it never moves.
  - `t1-turret-head`: a brass cupola with a sight slit and an amber pilot lamp, the one glowing
    part; its pivot is the trunnion at (0.04, 0.64), above the stacks.
  - `t1-gun-barrel`, `t2-gun-barrel`, `t3-gun-barrel`: the three barrel looks for the gun-level
    breakpoints (one plain barrel; a longer barrel with a cooling jacket and muzzle brake; twin
    finned barrels with a heat band and flared muzzles). Each pivots on the same trunnion and rests
    pointing at the rear (-X), the arc the guns cover; the code turns it to the aim angle. Which
    gun level picks which look is the build's (#93).
  - Draw order 10 (mount), 11 (barrel), 12 (head), over every vehicle part.

  `scripts/art/author_auto_guns.py` wrote the first version of the file. From then on the
  `.blend` is the source.

## Bay screen backdrops

`npm run art:export -- platform-bay-<bay>-backdrop` renders the bay's screen backdrop (#45, #51)
from the bay's own file, `art/blender/platform-bay-<bay>/platform-bay-<bay>.blend`. There is no
second model. The scene camera frames the shot. The floor and wall that stage it are meshes in the
`backdrop-staging` collection, which the parts bake skips, and its lights are ordinary lights. The
render uses Cycles on the CPU with a fixed seed, sample count and thread count, at the
`backdropPx` size in `art/asset-rules.json`. It ships as one `<id>.albedo.ktx2` (ETC1S, sRGB) in
`public/assets/platform/<id>/`.

`scripts/art/author_platform.py` wrote the first version of the three platform files (S7b), and
of the Refinery bay later (#106). From then on the `.blend` files are the sources: change the art
in Blender and re-export.

A part whose `backdrop_hidden` custom property is set is left out of the backdrop render (and
still baked as a part). `hide_render` would also drop it from the parts bake.

## The Refinery bay

`platform-bay-refinery` is the third bay module (#105 art, #106), the same 4 x 3 m frame as Sell
and Upgrade in ember iron and brass, with a firebrick crucible furnace, its stack, a pour trough
and a mould table. Its looks are three parts drawn over the frame (`z` 1), one at a time, all
pivoted on the furnace door's bottom centre (`atM` [-0.75, 0.72]):

| Part                | Look (#105) | What it shows                                                       |
| ------------------- | ----------- | ------------------------------------------------------------------- |
| `refinery-idle`     | `idle`      | the furnace door shut                                               |
| `refinery-refining` | `refining`  | the door open on the fire, metal running into the moulds (emissive) |
| `refinery-ready`    | `ready`     | the door shut and a pyramid of six ingots on the mould table        |

The looks are `REFINERY_BAY_LOOKS` in `src/systems/authority/platformState.ts`, and
`refineryLookPartIdOf` names their parts. The refining look's smoke is procedural (#51): it
rises from the top of the stack, at [-0.75, 2.98] m in the bay's frame. The backdrop shows the
refining look. Nothing draws platform bays in the world yet; the refinery build (#92) places the
bay on the pad and picks the look from its batches. The bay's emblem (`emblem-bay-refinery`) is
a placeholder like the other two bays' emblems.

## Ground and casing tiles

`npm run art:export -- ground-band-<n>` (or `casing-grade-<n>`) bakes a `tile` asset (#52 "Ground
and casing"). The `.blend` holds one mesh object named for the asset id: a 4 x 4 m quad in the XZ
plane facing -Y, its UVs 0..1 across it, with a material that repeats at its edges. Anything else
is refused. `scripts/art/bake_tile.py` bakes the material's diffuse colour into a 1024 x 1024
`albedo` (opaque) and its bump into a tangent-space `normal` (OpenGL, +Y up), with Cycles on the
CPU at the `tileSamples` count in `art/asset-rules.json`, seed 0 and fixed threads. `encode.sh`
writes them as `<id>.albedo.ktx2` (ETC1S, sRGB) and `<id>.normal.ktx2` (UASTC, linear) in
`public/assets/<category>/<id>/`. The lint holds every tile map to 1024 x 1024.

A tile whose material glows (the refractory lining's seams and the lava, #113) says
`"emissive": true` in its entry. `bake_tile.py` then bakes its emit pass too, and `encode.sh` writes
`<id>.emissive.ktx2` (ETC1S, sRGB) beside the other two maps. The lint expects that third map for
exactly those tiles, and `tileEmissiveMapOf` (`src/systems/art/tileLook.ts`) names it for the
renderer. Only a tile carries the flag; a parts asset's sidecar names its own maps.

`scripts/art/author_tiles.py` wrote the first version of the ten files (S7d). Every texture in
them reads 4D noise on a torus and every lattice has a whole number of periods across the tile,
so the maps tile with no seam. From then on the `.blend` files are the sources.

- **Ground** (`ground-band-1` to `-5`): five strata, each its own character (soil with pebbles,
  wavy sediment beds, cracked shale, blocky bedrock, jointed basalt), with its mean colour at
  planet 1's band colour. The terrain shader wraps a band's map around the planet in rings, a
  whole number of 4 m tiles around the band's middle (`src/systems/render/groundStrata.ts`),
  tints it by the planet's band colour over planet 1's, and tilts the lamp and point lights by
  its normal map. It draws the strata only once all five bands are final and loaded
  (`steampunkDebug.ui.getRenderStats().strataBands` is then 5); until then the flat band colours
  show.
- **Casing** (`casing-grade-1` to `-5`): one lining, five plate and rivet patterns, so grade reads
  without colour (#48): rusting 1 m sheets with sparse rivets; lapped 0.25 m strips; tread plate
  with corner rivets; blued panels with an X strap and bolts; staggered gunmetal armour with two
  brass rivet rows. Every pattern repeats within 0.5 m, so a 0.25 m lining strip shows it. Nothing
  draws the lining yet; the casing build (S2) does.

## Blasting charges

The art of the `blasting_charges` schedule row ([#110](https://github.com/bjor2/steampunk-miner/issues/110),
for the spec [#109](https://github.com/bjor2/steampunk-miner/issues/109) "Visibility"). The ids take
the #52 kebab form of the row id (`src/systems/art/artIds.ts`).

| Id                         | Source         | What the build draws                                                                   |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `vehicle-blasting-charges` | Blender, parts | the rack on the vehicle once it is bought: `charge-rack` plus `charge-1` to `charge-8` |
| `prop-blasting-charge`     | Blender, parts | a planted charge: `prop-blasting-charge`, and `fuse-lamp`, the only part that glows    |
| `icon-blasting-charges`    | vector, SVG    | the rack-slot and restock rows in the Upgrade bay and the HUD charge count             |
| `fx-blast-scorch`          | shader, code   | scorch on the tunnel edge after a blast (`src/scene/blastScorchShader.ts`, #95)        |

- The rack is authored in the **vehicle's frame**: draw its parts at the vehicle's origin, rolled
  with it, under the vehicle's own parts. It sits behind the chassis at the rear, bolted on by one
  arm.
- `charge-<n>` is drawn while the count carried is at least `n`, so the rack shows exactly the
  charges on board. The slots fill the bottom row first, left to right. Their number is
  `chargeRackSlots` in `art/asset-rules.json`, #109's `rackMax` of 8; a rack that grows past it
  needs new slots in the `.blend`.
- The planted charge's pivot is its centre. `fuse-lamp` is a separate part so the fuse light can
  blink by showing and hiding it (or by its emissive map once the lit render lands).
- `scripts/art/author_blasting_charges.py` wrote the first version of both `.blend` files. From then
  on the `.blend` files are the sources.

## Heat planets and the refractory lining

The art of the `heat_lava` and `refractory_lining` schedule rows
([#114](https://github.com/bjor2/steampunk-miner/issues/114), for the spec
[#113](https://github.com/bjor2/steampunk-miner/issues/113) "Visibility"). The ids take the #52 kebab
form of the row ids, and the refractory tiles take the lining type #113 names
(`src/systems/art/artIds.ts`).

| Id                                                         | Source               | What the build draws                                                   |
| ---------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `ground-heat-lava`                                         | Blender, tile + glow | lava pockets: black crust plates on molten rock, the cracks glowing    |
| `casing-refractory-grade-1` to `-5`                        | Blender, tile + glow | a refractory ring of that grade: firebrick with ember joints, ironwork |
| `icon-heat-lava`                                           | vector, SVG          | the HUD heat gauge                                                     |
| `icon-refractory-lining`                                   | vector, SVG          | the lining type row in the Upgrade bay                                 |
| `fx-heat-shimmer`                                          | shader, code         | the shimmer on the vehicle above `throttleAt` (#51 row; placeholder)   |
| `palette.heat` (in `src/systems/render/artDirection.json`) | procedural colours   | heat planets' bands, ember sky and molten core                         |

- All six tiles say `"emissive": true`, so each ships `<id>.emissive.ktx2`; `tileEmissiveMapOf`
  names it. Add it on top of the lit colour, so the joints and the lava still glow where the
  ambient light has faded with depth. The renderer may scroll the lava tile and pulse either glow;
  the maps hold still.
- A standard ring keeps drawing `casing-grade-<n>`, a refractory ring `casing-refractory-grade-<n>`.
  Every refractory grade is the same firebrick, so the type reads by brick and glow. The grade reads
  by the ironwork over it, which steps up like the standard lining's plates: anchor bolts on a 0.5 m
  grid; a riveted band every 0.5 m; a riveted 0.5 m frame; the frame braced by an X with big bolts;
  a 0.25 m gunmetal cage with brass bolts. Iron covers the joints under it, so they never glow.
  Each pattern repeats within 0.5 m, like the standard grades.
- `palette.heat` is a palette like the planets' (#13); the heat archetype (#96) points its
  `paletteId` at it. Its band colours tint the ground strata as any planet's do.
- `scripts/art/author_heat_tiles.py` wrote the first version of the six `.blend` files, reusing
  `author_tiles.py`'s seamless graph. From then on the `.blend` files are the sources.
- The archetype stinger on arrival at P8 (#113) is audio, not art.

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

To ship real art: export it, set `"status": "final"` in `art/assets/<id>.json`, and commit the
`.blend` (LFS) together with the files under `public/assets/`. The loader finds the exported
sidecar on its own.

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

An enemy's art can land before its kind is in `economy.json`. `SCHEDULED_ENEMY_ART_ROW_IDS` in
`src/systems/art/artIds.ts` names the locked schedule's Enemy rows that already have art, and
the row id is the kind id the enemy's module will register. The first is `enemy-tunnel-wrecker`
(#112), written by `scripts/art/author_tunnel_wrecker.py`: a dome of pale scales with a spiked
outline, two toothed rasp wheels for jaws, and a yellow-green glow. It is one 0.9 m part, like the
burrower. Nothing draws it until the tunnel wrecker build (#94) adds the kind, and the pool then
picks it up like the other two enemies.

## The asset lint

`src/systems/art/assetLint.test.ts` runs in `npm test` and fails when:

- the manifest isn't the #51 inventory under the #52 ids: every Blender asset and vector icon
  derived from the registries is listed, nothing unknown is listed, and every Blender placeholder
  has a colour
- an entry file under `art/assets/` isn't named `<id>.json` for the id it holds
- a file under `public/assets/` or `src/ui/icons/` has no final manifest entry, or isn't a file its
  form ships (so a raster icon fails), or a final entry is missing one of its files
- a sidecar (placeholder or exported) fails schema 1: wrong ids or tiers, a zero-size or
  out-of-atlas rect, a pivot outside `sizeM`, the wrong texel density or wrong map names
- a KTX2 map is over 4096 px or not power-of-two, or isn't in its Basis format and colour space

## Not built yet

- Showing a backdrop behind a bay screen. A DOM panel can't show KTX2, so S8 decides how the screen
  draws it (for example in the canvas behind the panel).
- Lighting final art. Parts draw unlit with the albedo map; the lit render (S6) adds the normal
  and emissive maps to its lit material. Keep each final asset's `color`: it is the loading
  fallback.
