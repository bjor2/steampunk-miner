# Hero ore looks: the P1 and P2 acts

The hero sprites of
[Art: hero ore looks for acts 1 and 2 (#452)](https://github.com/bjor2/steampunk-miner/issues/452)
and of P2's three gems
([Art: hero gem skins for P2 Star Garnet, Verdigris Opal, Aquamarine (#744)](https://github.com/bjor2/steampunk-miner/issues/744),
below),
under the Game Director's materials rulings on
[Wayfinder: Materials expansion (#139)](https://github.com/bjor2/steampunk-miner/issues/139): a
look layer under the 12 ore families, with 4 or 5 hero species per act drawn by Blender and shipped
in a per-act atlas swapped in at the act change
([Render: per-act hero sprite atlas (#451)](https://github.com/bjor2/steampunk-miner/issues/451)).
The heroes are the `hero: true` rows of the `legacy` pool in
`src/features/materials/materials.json`, the P1 and P2 roster of
[Materials rows for P1 and P2 (#447)](https://github.com/bjor2/steampunk-miner/issues/447): the
three rares and Violet Fluorite, four for the act. P1 (`foothold.base`) and a P2 a save holds
under ore rules 5 or earlier (`foothold.heavy`, to P7) draw that pool, so both acts get these four
cells first; the `foothold.heavy` atlas then packs the three gems of a fresh P2's own pool
(`foothold-p2`, #744), and the foothold pools of P3 to P7 add their own heroes in a follow-up art
ticket. This folder holds sources and renders; the game draws the cells from the per-act atlases
`encode_hero_atlases.py` packs from them (#451).

Authored in Blender 4.2.9 on the shared box, headless, on the ore stage of
[docs/art/ores](../ores/README.md) (the same 1 m cell, lamp rig, orthographic camera and band
rock as the family atlas, so a hero sits in the same light as the ground it lands on). The
`.blend` files under `blend/` are the sources from now on (Git LFS).

## The four heroes

<!-- heroes -->

| cell | species                     | family  | rarity   | silhouette + pattern | hue slot (hue, sat, luma)         | window | what it is                                                                                                             |
| ---- | --------------------------- | ------- | -------- | -------------------- | --------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 0    | `violet-fluorite-quartzine` | crystal | uncommon | cubes, zoned         | `fluorite-violet` 258, 0.55, 0.52 | b2-b5  | six interpenetrating cubes with three twins grown on their corners, half-sunk; soft colour zones parallel to the faces |
| 1    | `vein-gold-brassvein`       | metal   | rare     | wires, veined        | `gold-vein` 54, 0.85, 0.74        | b3-b5  | three dendritic gold wires with side wires and nuggets at the tips, standing off a pale, kinked quartz vein            |
| 2    | `blue-corundum-quartzine`   | crystal | rare     | barrels, silky       | `corundum-blue` 222, 0.75, 0.50   | b3-b4  | five hexagonal barrels (prism with tapered ends) leaning out of a root; silk as fine bands along the axis              |
| 3    | `red-beryl-quartzine`       | crystal | rare     | columns, clear       | `beryl-red` 352, 0.65, 0.50       | b4-b5  | six long flat-ended hexagonal columns radiating from a root, clear and rim-lit                                         |

<!-- /heroes -->

Rules the looks keep: the body colour is the species' hue slot at its luma (Rec. 601, as the
materials guard measures), so every hero stays out of the reserved heat (15-45) and enemy-purple
(268-285) hue bands and above its host rock; the silhouette carries identity (cubes, wires,
barrels, columns are four constructions, never one shape recoloured); rarity is not drawn in the
sprite, since the terrain shader adds the rarity tint, frame and glow on top
([#450](https://github.com/bjor2/steampunk-miner/issues/450)), and a sprite with its own frame
would double it. No glow layer, no compositor bloom, no animation.

## The P2 gems (#744)

The three gem rows of P2's own pool, the rows Planet & Narrative's audit found reading as plain
ore at 360 px (GD lock on #741: skins only for those), each its own construction in its hue slot,
sharing the facet-glint treatment the Horizontal Scaler asked of every gem: a hard clear coat, and
a facet whose normal looks back along the stage's key lamp lighting up whole in the slot's pale
tint, on top of the rim the legacy heroes drive (`facet_glint` in `hero_marks.py`). The ids and
hue slots are unchanged; the mineral skin rows of
[docs/art/mineral-skins](../mineral-skins/README.md) stay as data, and the ground draws the cell.

<!-- gems -->

| cell | species                | family  | rarity | silhouette + pattern  | hue slot (hue, sat, luma)       | window | what it is                                                                                                                                                                      |
| ---- | ---------------------- | ------- | ------ | --------------------- | ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4    | `p2-r1` Star Garnet    | metal   | rare   | stars, starred        | `star-garnet` 340, 0.6, 0.52    | b3-b5  | one large and three small twenty-faced stones sunk to the waist, flat-shaded, a six-rayed spark of three thin rays on each crown                                                |
| 5    | `p2-r2` Verdigris Opal | crystal | rare   | ovals, play-of-colour | `verdigris-opal` 155, 0.5, 0.62 | b3-b4  | four cabochon domes on a loose ring, each in a thin raised frame of dull matrix, broken into harlequin patches flashing a little either side of the hue with dark seams between |
| 6    | `p2-r4` Aquamarine     | crystal | rare   | prisms, watered       | `aquamarine-sea` 172, 0.42, 0.8 | b4-b5  | three long flat-ended hexagonal prisms crossing at shallow angles and a short fourth beside them, pale sea glass rippled along the length with a deeper sea                     |

<!-- /gems -->

Authored with the same pipeline, per pool: `author_ore_heroes.py -- foothold-p2` and
`hero_post.py foothold-p2` touch only this pool's cells, blends and sheets (`heroes-foothold-p2.*`),
leaving the legacy cells byte-identical, and `encode_hero_atlases.py` packs both acts again; the
`foothold.base` atlas comes out byte-identical, the `foothold.heavy` atlas gains cells 4 to 6.

<!-- gem-readings -->

From `sheets/heroes-foothold-p2.distinct.json`, the gems against each other and against the four
legacy heroes of the same atlas, at 40 px a tile over the band rock; the two screens of the
gem-read test (`screens`: a tile at the default 12 m zoom on 360x640 is 30 px, on 1280x800
67 px) read within 0.02 of these on every pair:

| pair                                    | silhouette apart (1 - IoU) | hue apart | luma apart | deuteranopia distance |
| --------------------------------------- | -------------------------- | --------- | ---------- | --------------------- |
| garnet vs opal                          | 0.85                       | 160°      | 0.04       | 0.12                  |
| garnet vs aquamarine                    | 0.71                       | 178°      | 0.12       | 0.19                  |
| opal vs aquamarine                      | 0.78                       | 21°       | 0.17       | 0.30                  |
| garnet vs red beryl (least, cross-pool) | 0.65                       | 10°       | 0.09       | 0.22                  |
| opal vs fluorite                        | 0.69                       | 115°      | 0.08       | 0.29                  |
| aquamarine vs corundum                  | 0.55                       | 58°       | 0.13       | 0.37                  |

<!-- /gem-readings -->

Every gem sits above its rock (contrast 1.8 to 2.8 at 40 px, 2.1 to 2.6 under the deep fill).
Opal and aquamarine share a green-blue quarter of the hue circle, as their locked hue slots do,
and are told apart by silhouette (framed domes against crossed bars), by luma (the aquamarine is
the brightest cell of the atlas) and in greyscale and under deuteranopia by the opal's dark
frames. The closest pair of the atlas, Star Garnet and Red Beryl, never shares a planet: the beryl
is a legacy hero and the garnet a fresh P2's. On a fresh P2 the gems' other 14 neighbours draw the
shader look, so that half of the gem-read test is the browser spec `e2e/browser/p2GemSkins.spec.ts`
(every slot's sprite key its own at 360x640 and 1280x800), and the eye check is the scale strip
`sheets/heroes-foothold-p2.scale-x4.png` with its blind copies: at 22 px all seven still read as
seven, the garnet a pink stone pile with a white spark, the opal green framed ovals, the
aquamarine a pale cross of bars.

## Files

| File                                            | What it is                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blend/hero-<species>.blend`                    | the hero's scene: its 1 m cell on the middle band of its window, the shallow lamp rig and the game's camera framing the cell at 248 px                                                                   |
| `blend/heroes-<pool>.blend`                     | the pool's review scene: its cells in a row                                                                                                                                                              |
| `cells/<species>.png`                           | the atlas cell: the 248 px lit sprite (straight alpha, the mask) with its edge pixels extended into the 4 px gutter of a 256 px cell, ready to pack                                                      |
| `hero-cells.json`                               | the cell table for #451: the authored pools, the atlas shape, per act the cells it packs (index, species, content rect) and per hero the species, rarity, hue slot, body colour, window, cell and source |
| `sheets/atlas-preview.<act>.png`                | the 1024 px per-act atlas as #451's shape packs it (cell `i` at column `i mod 4`, row `i div 4`); a preview, #451 owns the shipped KTX2                                                                  |
| `encode_hero_atlases.py`                        | packs `cells/` into each act's shipped atlas, `public/assets/ground/ground-hero-atlas-<act>/` (ETC1S sRGB, four mip levels, colour bled into transparent texels)                                         |
| `sheets/heroes-legacy.shallow.jpg`              | the four cells at 256 px/m on their band's rock under the headlamp and fill                                                                                                                              |
| `sheets/heroes-legacy.deep.jpg`                 | the same under the dim cool fill of band 5                                                                                                                                                               |
| `sheets/heroes-legacy.closeup.jpg`              | the four at 480 px/m                                                                                                                                                                                     |
| `sheets/*-gray.png`, `*-ingame.png`             | the greyscale blind-order copy and the 85 px/m downsample (about a 1080p screen at the default 12 m zoom)                                                                                                |
| `sheets/heroes-legacy.scale.png`                | the game-scale strip: every hero over its rock at 85, 40 and 22 px a tile (default zoom, the 20 m zoom, a phone); `-x4` is the same magnified 4x, with `-gray` and `-deutan` copies                      |
| `sheets/heroes-legacy.{shallow,deep}.luma.json` | measured ore and rock luma per cell, as the family sheets report                                                                                                                                         |
| `sheets/heroes-legacy.distinct.json`            | per hero at 40 px: coverage, mean hue, luma, contrast; per pair: silhouette, hue, luma and deuteranopia distance, and the least different pair                                                           |

## Pipeline

```
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ore-heroes/author_ore_heroes.py -- <pool>       # the pool's .blend files, sprites and sheets; hero-cells.json for every authored pool
python3 docs/art/ore-heroes/hero_post.py <pool>               # the pool's cells, every act's atlas preview, scale strip, blind copies, distinctness, JPEG shrink
python3 docs/art/ore-heroes/encode_hero_atlases.py            # every act's shipped atlas from the committed cells
```

A pool is `legacy` or `foothold-p2` (`AUTHORED_POOLS` in `hero_species.py`); set
`PYTHONDONTWRITEBYTECODE=1` so importing the modules leaves the tracked `__pycache__` alone.

- `hero_species.py` reads a pool's hero rows, the hue slot colour of each and the acts the pool
  paints (`oreThemes.json`), and writes `hero-cells.json`: per act, the cells of every authored
  pool that paints one of its planets, pool after pool, so the legacy four keep cells 0 to 3 in
  both acts and P2's gems follow them in `foothold.heavy`. Plain Python, shared by both steps.
- `hero_marks.py` builds one silhouette per `silhouette` word of the rows (`cubes`, `wires`,
  `barrels`, `columns`, and the gems' `stars`, `ovals`, `prisms`) with the species' material,
  seeded per species, from the ore stage's shapes and materials. A pool naming a silhouette with
  no builder fails, never falls back.
- `author_ore_heroes.py` stages each hero's cell, saves its `.blend`, and renders the sprite with
  the rock slab held out (`is_holdout`) on a transparent film: what stands off the face keeps its
  lamp shading, the rock and whatever is sunk into it come out transparent, and no compositor glow
  runs. Sprites land in `art/build/ore-heroes/` (gitignored). Then the review scene and sheets.
- `hero_post.py` (python3, Pillow and numpy) pads the sprites into 256 px cells, packs the atlas
  previews, composites the scale strip over the band rock of `artDirection.json`, writes the
  greyscale and deuteranopia copies, measures distinctness and shrinks the colour sheets to JPEG.
- Through the MCP: add this folder, `docs/art/ores` and `docs/art/ore-ladder` to `sys.path`,
  `import author_ore_heroes`, `author_ore_heroes.author('legacy', sheets=False)` and `look`.

## Readings

From `sheets/heroes-legacy.distinct.json`, at 40 px a tile over the band rock (what the 20 m zoom
shows):

<!-- readings -->

| pair                         | silhouette apart (1 - IoU) | hue apart | luma apart | deuteranopia distance |
| ---------------------------- | -------------------------- | --------- | ---------- | --------------------- |
| fluorite vs gold             | 0.75                       | 151°      | 0.04       | 0.55                  |
| fluorite vs corundum (least) | 0.60                       | 36°       | 0.12       | 0.23                  |
| fluorite vs beryl            | 0.67                       | 94°       | 0.03       | 0.40                  |
| gold vs corundum             | 0.75                       | 173°      | 0.09       | 0.71                  |
| gold vs beryl                | 0.67                       | 57°       | 0.00       | 0.18                  |
| corundum vs beryl            | 0.64                       | 130°      | 0.09       | 0.54                  |

<!-- /readings -->

Every hero sits above its rock (contrast 1.6 to 2.0 in luma under the headlamp, 2.2 to 2.6 under
the deep fill; gold 1.1 under the deep fill, where only its rim reads, which the shader's rarity
glow then lifts). The closest pair, Violet Fluorite and Blue Corundum, is 36° apart in hue and the
cube pile and the barrel star share 40% of their mask; in the deuteranopia copy they stay a
striped block pile beside a smooth five-arm star. Gold and beryl match in luma and are told
apart by hue, silhouette (wires on a vein against a six-column star) and in greyscale by the
wires' thin, bright lines. At 22 px (the phone row of the scale strip) all four still read as
four, checked by eye on `heroes-legacy.scale-x4.png` and its blind copies.

Known limits: the sprite is lit from the stage's fixed headlamp, so it does not turn with the
vehicle's lamp (the family atlas carries a normal map for that, the per-act hero atlas is albedo
only by the TD's budget); the gold's quartz vein crosses the cell edge, so its gutter extends the
vein's edge pixels, as the family cells do.
