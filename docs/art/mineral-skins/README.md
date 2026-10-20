# Mineral skins: the drawn layers

The layer art of the mineral skins of
[Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576),
under the GD ruling of 20 Oct 2026: every species is "layered from base texture + vein/crystal
shape + palette + sheen chosen from the species row", and no two species on one planet share a
combination. The table is the `mineral-skins` slice's `src/features/mineral-skins/mineralSkins.json`
(ticket 591, feature-slices 3.73). This folder holds the Blender sources of the base, vein and
sheen layers, their 256 px cells, and the review sheets of each batch. Palettes are data: three
colours in the table.

Authored in Blender 4.2.9 on the shared box, headless, on the ore stage of
[docs/art/ores](../ores/README.md) (the same 1 m cell, lamp rig and orthographic camera). The
`.blend` files under `blend/` are the sources from now on (Git LFS).

**Not drawn in the game yet.** No renderer reads a skin: drawing one in the ground needs a kernel
seam beside the kind look table (feature-slices 3.72), within its uniform and sampler budgets. That
seam packs these cells into whatever atlas it chooses and registers it; until then the review
sheets below are the only pictures of a skin, and the kind look stays what the ground draws.

## Batch p1-b1: P1's species 1 to 5 (ticket 592)

The legacy pool's five commons, kind slots 1 to 5 on P1 (P2 draws the same pool, so it shows
them too). Each skin's layers follow its species row: the base its `pattern`, the vein its
`silhouette`, the palette its `hueSlot` and the sheen its lustre. No two of the five share any
layer.

<!-- p1-b1 -->

| slot | species                    | base               | vein             | palette (shadow, body, light)                    | sheen         |
| ---- | -------------------------- | ------------------ | ---------------- | ------------------------------------------------ | ------------- |
| 1    | `ironstone-brassvein`      | `mottled-grain`    | `nugget-cluster` | `ironstone-umber` `#44412f` `#87825e` `#c3c0ae`  | `earthy`      |
| 2    | `shallow-copper-brassvein` | `crusted-scale`    | `flake-scatter`  | `copper-verdigris` `#245d4a` `#49ba94` `#a4dcca` | `submetallic` |
| 3    | `deep-seam-tin-brassvein`  | `banded-seam`      | `plate-stack`    | `tin-grey` `#525457` `#a4a9ae` `#d2d4d6`         | `metallic`    |
| 4    | `clouded-quartzine`        | `clouded-mass`     | `nodule-bed`     | `quartz-milk` `#6d6e6e` `#dadcdd` `#eceeee`      | `waxy`        |
| 5    | `flint-glass-quartzine`    | `conchoidal-glass` | `shard-spray`    | `flint-glass` `#586466` `#afc9cc` `#d7e4e6`      | `vitreous`    |

<!-- /p1-b1 -->

- **Bases:** mottled blotches under a fine grain; a crust broken into scales with dark cracks;
  grey beds bent by a slow warp; milky smoke; a smooth glass face with fine conchoidal ripples.
- **Veins:** blocky rounded nuggets in two clusters; thin ragged flakes; flat plates lapped along a
  diagonal seam; round nodules sunk to their middles; long shards fanned from a fracture root.
- **Sheens** (lustre): earthy (next to none), submetallic (soft worn patches and flecks),
  metallic (bright streaks along the beds), waxy (a broad soft bloom), vitreous (sharp glints and
  slivers on curved fracture faces).

## Batch p1-b2: P1's species 6 to 10 (ticket 593)

The legacy pool's four uncommons and its first rare, kind slots 6 to 10 on P1 (and P2). The
layers come from the species row, as for p1-b1. Bright lead and violet fluorite share the `cubes`
silhouette, so each gets a cube vein of its own: galena cleaves into cubes square to each other,
while fluorite grows twins turned through one another. No layer is shared with p1-b1 or within the
batch.

<!-- p1-b2 -->

| slot | species                       | base            | vein             | palette (shadow, body, light)                   | sheen         |
| ---- | ----------------------------- | --------------- | ---------------- | ----------------------------------------------- | ------------- |
| 6    | `bright-lead-brassvein`       | `tarnish-steps` | `cleavage-cubes` | `lead-glance` `#4c4e58` `#999daf` `#ccced7`     | `splendent`   |
| 7    | `deep-grade-nickel-brassvein` | `speckled-grit` | `grain-scatter`  | `nickel-pale` `#5c5d56` `#b7baab` `#dbdcd5`     | `glittering`  |
| 8    | `honey-amber-quartzine`       | `resin-flow`    | `bead-drops`     | `amber-honey` `#604f0e` `#bf9e1b` `#dfce8d`     | `resinous`    |
| 9    | `violet-fluorite-quartzine`   | `zoned-growth`  | `twinned-cubes`  | `fluorite-violet` `#47386a` `#8e70d5` `#c7b8ea` | `fluorescent` |
| 10   | `vein-gold-brassvein`         | `quartz-veined` | `wire-dendrite`  | `gold-vein` `#706609` `#e0cc12` `#f0e689`       | `brilliant`   |

<!-- /p1-b2 -->

- **Bases:** staggered cleavage steps, each face its own tone, under a drifting tarnish fog; a pale
  matrix peppered with coarse dark grit and a few bright specks; slow flow lines in resin with
  trapped grit and bubble rings; growth zones as nested squares, two cubes by two to the cell;
  smoky quartz crossed by pale branching veinlets.
- **Veins:** a stair of sharp cubes square to the face; small hard grains alone and in twos and
  threes; three trails of resin drops, each a fat bead under a small neck; cubes grown through
  each other at an eighth of a turn; four kinked gold wires from one root, with twigs and a bead
  on every tip.
- **Sheens:** splendent (whole cleavage faces flash like mirrors, the fog dulls them), glittering
  (pinpoint sparks on a share of the grains), resinous (soft round pools of gloss), fluorescent
  (a faint glow in alternate growth zones, a few glints), brilliant (thin hard threads of light and
  strong glints).
- **The block lattice** (`lattice_of` in `layer_art.py`) cuts the cell into whole blocks and folds
  a staggered row back into the cell, so the stepped and zoned bases repeat with no seam like the
  noise ones.

## Compositing

What a renderer draws for a skin, per pixel, in display values (0..1), from the row's layers:

```
ramp(t)  = mix(shadow, body, t / 0.5)          for t <= 0.5
         = mix(body, light, (t - 0.5) / 0.5)   for t >  0.5
colour   = ramp(base.grey)
colour   = mix(colour, ramp(vein.grey), vein.alpha)
colour   = 1 - (1 - colour) * (1 - sheen.grey * light)
```

The base's mean coordinate is about 0.5, so a skin averages its hue slot's colour, which the
materials guard holds above the brightest host rock and out of the reserved hue bands; the slice's
loader refuses a palette whose body is off the hue slot of a species wearing it. The base and sheen
cells repeat at their edges, so ore tiles side by side join with no seam; a vein keeps inside its
cell, rimmed in the shadow end so it reads on a base of its own palette.

## Files

| File                                    | What it is                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `blend/<kind>-<id>.blend`               | the layer's scene: a 1 m emission quad (base, sheen) or the vein's marks on the held-out rock under the lamp rig, and camera |
| `cells/<kind>/<id>.png`                 | the 256 px cell (256 px/m): 8-bit grey for a base or sheen, grey with the mask in alpha for a vein                           |
| `skin-layers.json`                      | the cell table: each drawn layer's kind, id, cell, source and the species that wear it                                       |
| `sheets/<batch>.layers.jpg`             | one row per skin: base, vein (over the band rock), sheen, palette ramp, and the skin they make, at 256 px/m                  |
| `sheets/<batch>.skins.jpg`              | the batch's skins side by side at 256 px/m: one picture per new visual state                                                 |
| `sheets/<batch>.desktop.png`            | a 16 x 6 tile patch of band rock with each skin as a short run of ore tiles, at 85 px a tile (the default zoom on 1080p)     |
| `sheets/<batch>.phone.png`, `-x4`       | the same patch at 22 px a tile in a 360 px wide strip (a phone), and magnified 4x for the eye                                |
| `sheets/<batch>.scale.png`, `-x4`       | every skin as a 2 x 2 run on the rock at 85, 40 and 22 px a tile; `-x4-gray` and `-x4-deutan` are the blind copies           |
| `sheets/<batch>.distinct.json`          | per skin at 22 px: mean colour, luma, hue and rock contrast; per pair (and against the planet's earlier batches): distances  |
| `sheets/p<n>.scale.png`, `-x4`          | every skin of planet n so far, in slot order, as in `<batch>.scale`: written by each batch after the planet's first          |
| `skin_layers.py`                        | plain Python: the table and species rows, the palette ramp rule, the batches and the cell table writer                       |
| `layer_art.py`, `author_skin_layers.py` | Blender: one recipe per layer id (a layer with no recipe fails), and the authoring of sources and renders                    |
| `skin_post.py`                          | python3 (Pillow, numpy): the cells, the vein rims, the composites, the sheets and the distinctness report                    |

## Pipeline

```
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/mineral-skins/author_skin_layers.py -- [<kind>/<id> ...]   # sources, renders, skin-layers.json
python3 docs/art/mineral-skins/skin_post.py p1-b2                         # cells, composites, sheets
python3 docs/art/mineral-skins/skin_layers.py ramps p1-b1                 # the palette ramps of a batch's hue slots
```

A new batch adds its layer and skin rows to `mineralSkins.json` (the palette ramp from
`skin_layers.py ramps`: shadow at half the hue slot's luma, light halfway to white), a recipe per
new layer id in `layer_art.py`, and its slots to `BATCHES` in `skin_layers.py`. Renders land in
`art/build/mineral-skins/` (gitignored). Cycles on the CPU with seed 0 and fixed threads: a second
run writes byte-identical cells. Set `PYTHONDONTWRITEBYTECODE=1`, or importing the hero module
rewrites the tracked `docs/art/ore-heroes/__pycache__`.

## Readings

From `sheets/p1-b1.distinct.json`, at 22 px a tile (a phone), over P1's band 3 rock (luma 0.31):

<!-- p1-b1-readings -->

| pair                           | colour apart | deuteranopia apart | luma apart | texture apart |
| ------------------------------ | ------------ | ------------------ | ---------- | ------------- |
| ironstone vs copper            | 0.357        | 0.303              | 0.115      | 0.072         |
| ironstone vs tin               | 0.360        | 0.353              | 0.167      | 0.100         |
| ironstone vs clouded           | 0.622        | 0.614              | 0.327      | 0.078         |
| ironstone vs flint             | 0.541        | 0.543              | 0.272      | 0.060         |
| copper vs tin                  | 0.296        | 0.060              | 0.052      | 0.095         |
| copper vs clouded              | 0.505        | 0.313              | 0.212      | 0.071         |
| copper vs flint                | 0.388        | 0.240              | 0.157      | 0.056         |
| tin vs clouded                 | 0.274        | 0.274              | 0.160      | 0.094         |
| tin vs flint                   | 0.186        | 0.195              | 0.105      | 0.088         |
| clouded vs flint (least apart) | 0.122        | 0.085              | 0.055      | 0.068         |

<!-- /p1-b1-readings -->

Every skin sits above its rock (contrast 1.49 for ironstone to 2.39 for clouded quartzine). The
closest pair, Clouded Quartzine and Flint Glass, are both pale: they are told apart by the vein
(a bed of round nodules against one fan of shards) and the flint's cyan cast, which the phone
patch and its 4x copy still show. Copper and tin come close only with deuteranopia (0.06), where
the copper's crust of scales and the tin's horizontal beds keep them apart (the largest texture
distance of the batch). Checked by eye on `p1-b1.phone-x4.png`, `p1-b1.desktop.png` and the
`p1-b1.scale-x4` copies.

From `sheets/p1-b2.distinct.json`, at 22 px a tile. The first ten pairs are within the batch; the
rest are the closest pairs against p1-b1's skins (the report holds all 25):

<!-- p1-b2-readings -->

| pair                        | colour apart | deuteranopia apart | luma apart | texture apart |
| --------------------------- | ------------ | ------------------ | ---------- | ------------- |
| lead vs nickel              | 0.088        | 0.095              | 0.018      | 0.100         |
| lead vs amber               | 0.546        | 0.516              | 0.070      | 0.096         |
| lead vs fluorite            | 0.222        | 0.291              | 0.135      | 0.093         |
| lead vs gold                | 0.598        | 0.559              | 0.052      | 0.083         |
| nickel vs amber             | 0.472        | 0.442              | 0.088      | 0.065         |
| nickel vs fluorite          | 0.289        | 0.368              | 0.153      | 0.081         |
| nickel vs gold              | 0.512        | 0.467              | 0.034      | 0.056         |
| amber vs fluorite           | 0.634        | 0.651              | 0.065      | 0.074         |
| amber vs gold               | 0.192        | 0.207              | 0.122      | 0.063         |
| fluorite vs gold            | 0.737        | 0.765              | 0.187      | 0.066         |
| tin vs nickel (least apart) | 0.084        | 0.092              | 0.050      | 0.092         |
| tin vs lead                 | 0.078        | 0.074              | 0.032      | 0.110         |
| flint vs lead               | 0.119        | 0.130              | 0.073      | 0.085         |
| flint vs nickel             | 0.151        | 0.145              | 0.055      | 0.055         |
| clouded vs nickel           | 0.215        | 0.209              | 0.110      | 0.073         |

<!-- /p1-b2-readings -->

The materials table gives P1 three pale, near-grey hue slots: tin, lead and nickel. Their palettes
are pinned to those slots, so colour barely separates them, and texture has to. Tin is horizontal
beds and a plate seam. Lead is staggered blocks with whole faces flashing, the largest texture
distance of the batch. Nickel is a coarse pepper of dark grit and scattered grains. The nickel's
grit was made coarser until it still showed at 22 px: at a fine pepper it read as plain pale
stone beside flint glass. Honey amber and vein gold are the two warm yellows. Amber is darker
(luma 0.62 against 0.74) and is crossed by dark flow lines and bead trails. Gold is the brightest
skin on the planet, with pale veinlets and a wire star. Violet fluorite is the only violet. Every
skin sits above its rock (contrast 1.66 for fluorite to 2.18 for gold). Checked by eye on
`p1-b2.phone-x4.png`, `p1-b2.desktop.png`, the `p1-b2.scale-x4` copies and `p1.scale-x4.png`
(P1's ten skins side by side at 85, 40 and 22 px a tile).

Known limits: the cells are unlit tone, so a skin does not turn with the vehicle's lamp (the vein's
own shading is baked from the stage's fixed headlamp, as the hero sprites are); the earthy sheen
is all but empty by design.
