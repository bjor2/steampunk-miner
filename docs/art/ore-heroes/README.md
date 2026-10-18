# Hero ore looks: the P1 and P2 acts

The hero sprites of
[Art: hero ore looks for acts 1 and 2 (#452)](https://github.com/bjor2/steampunk-miner/issues/452),
under the Game Director's materials rulings on
[Wayfinder: Materials expansion (#139)](https://github.com/bjor2/steampunk-miner/issues/139): a
look layer under the 12 ore families, with 4 or 5 hero species per act drawn by Blender and shipped
in a per-act atlas swapped in at the act change
([Render: per-act hero sprite atlas (#451)](https://github.com/bjor2/steampunk-miner/issues/451)).
The heroes are the `hero: true` rows of the `legacy` pool in
`src/features/materials/materials.json`, the P1 and P2 roster of
[Materials rows for P1 and P2 (#447)](https://github.com/bjor2/steampunk-miner/issues/447): the
three rares and Violet Fluorite, four for the act. P1 (`foothold.base`) and P2 (`foothold.heavy`,
to P7) draw the same pool, so both acts get these four cells; the foothold pools of P3 to P7 add
their own heroes in the follow-up art ticket. This folder holds sources and renders; the game
draws the cells from the per-act atlases `encode_hero_atlases.py` packs from them (#451).

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

## Files

| File                                            | What it is                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blend/hero-<species>.blend`                    | the hero's scene: its 1 m cell on the middle band of its window, the shallow lamp rig and the game's camera framing the cell at 248 px                                              |
| `blend/heroes-legacy.blend`                     | the review scene: the four cells in a row                                                                                                                                           |
| `cells/<species>.png`                           | the atlas cell: the 248 px lit sprite (straight alpha, the mask) with its edge pixels extended into the 4 px gutter of a 256 px cell, ready to pack                                 |
| `hero-cells.json`                               | the cell table for #451: pool, acts, atlas shape, and per cell the species, rarity, hue slot, body colour, window and content rect                                                  |
| `sheets/atlas-preview.<act>.png`                | the 1024 px per-act atlas as #451's shape packs it (cell `i` at column `i mod 4`, row `i div 4`); a preview, #451 owns the shipped KTX2                                             |
| `encode_hero_atlases.py`                        | packs `cells/` into each act's shipped atlas, `public/assets/ground/ground-hero-atlas-<act>/` (ETC1S sRGB, four mip levels, colour bled into transparent texels)                    |
| `sheets/heroes-legacy.shallow.jpg`              | the four cells at 256 px/m on their band's rock under the headlamp and fill                                                                                                         |
| `sheets/heroes-legacy.deep.jpg`                 | the same under the dim cool fill of band 5                                                                                                                                          |
| `sheets/heroes-legacy.closeup.jpg`              | the four at 480 px/m                                                                                                                                                                |
| `sheets/*-gray.png`, `*-ingame.png`             | the greyscale blind-order copy and the 85 px/m downsample (about a 1080p screen at the default 12 m zoom)                                                                           |
| `sheets/heroes-legacy.scale.png`                | the game-scale strip: every hero over its rock at 85, 40 and 22 px a tile (default zoom, the 20 m zoom, a phone); `-x4` is the same magnified 4x, with `-gray` and `-deutan` copies |
| `sheets/heroes-legacy.{shallow,deep}.luma.json` | measured ore and rock luma per cell, as the family sheets report                                                                                                                    |
| `sheets/heroes-legacy.distinct.json`            | per hero at 40 px: coverage, mean hue, luma, contrast; per pair: silhouette, hue, luma and deuteranopia distance, and the least different pair                                      |

## Pipeline

```
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ore-heroes/author_ore_heroes.py -- legacy       # the .blend files, the sprites, the sheets, hero-cells.json
python3 docs/art/ore-heroes/hero_post.py legacy               # cells, atlas previews, scale strip, blind copies, distinctness, JPEG shrink
```

- `hero_species.py` reads the pool's hero rows, the hue slot colour of each and the acts the pool
  paints (`oreThemes.json`), and writes `hero-cells.json`. Plain Python, shared by both steps.
- `hero_marks.py` builds one silhouette per `silhouette` word of the rows (`cubes`, `wires`,
  `barrels`, `columns`) with the species' material, seeded per species, from the ore stage's
  shapes and materials. A pool naming a silhouette with no builder fails, never falls back.
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
