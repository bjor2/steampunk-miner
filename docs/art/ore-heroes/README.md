# Hero ore looks: the P1 and P2 acts

The hero sprites of
[Art: hero ore looks for acts 1 and 2 (#452)](https://github.com/bjor2/steampunk-miner/issues/452),
of P2's three gems
([Art: hero gem skins for P2 Star Garnet, Verdigris Opal, Aquamarine (#744)](https://github.com/bjor2/steampunk-miner/issues/744),
below) of the twelve gems of P1 and P3 to P5
([Gem hero cells P1–P5 (#785)](https://github.com/bjor2/steampunk-miner/issues/785), below) and
of the fifteen other heroes of P3 to P5
([MB: Blender hero sprites for 15 P3–P5 heroes (#853)](https://github.com/bjor2/steampunk-miner/issues/853),
below), under the Game Director's materials rulings on
[Wayfinder: Materials expansion (#139)](https://github.com/bjor2/steampunk-miner/issues/139): a
look layer under the 12 ore families, with 4 or 5 hero species per act drawn by Blender and shipped
in a per-act atlas swapped in at the act change
([Render: per-act hero sprite atlas (#451)](https://github.com/bjor2/steampunk-miner/issues/451)).
The heroes are the `hero: true` rows of the `legacy` pool in
`src/features/materials/materials.json`, the P1 and P2 roster of
[Materials rows for P1 and P2 (#447)](https://github.com/bjor2/steampunk-miner/issues/447): the
three rares and Violet Fluorite, four for the act. P1 (`foothold.base`) and a P2 a save holds
under ore rules 5 or earlier (`foothold.heavy`, to P7) draw that pool, so both acts get these four
cells first; the `foothold.base` atlas then packs P1's three gems (`p1-gems`, #785), and the
`foothold.heavy` atlas the three gems of a fresh P2's own pool (`foothold-p2`, #744) and the nine
gems of the P3 to P5 pools (`foothold-p3-gems` to `foothold-p5-gems`, #785), which fill its 16
cells, and on its second page the fifteen other `hero: true` rows of P3 to P5
(`foothold-p3-heroes` to `foothold-p5-heroes`, #853); the P6 and P7 pool's heroes have no mineral
skin row to record a page on yet, so they have no art and draw the shader look. This folder
holds sources and renders; the game draws the cells from the per-act atlases
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

## The twelve gems (#785)

The gem rows of P1 and P3 to P5 that #746's contact sheet found drawing their grains on frame 1
(the GD lock on #746: a gem reads as "a faceted outline and at least one highlight, at 360 px and
1280+, distinguishable from every non-gem on its planet"). Each is its own construction in its hue
slot with the shared facet glint, built from the species' mineral-skin row
([docs/art/mineral-skins](../mineral-skins/README.md): the vein layout and the sheen) so the sprite
and the skin agree. Builders live in `gem_marks.py` (P1, P3) and `gem_marks_deep.py` (P4, P5),
keyed on the row's silhouette and pattern together, since emerald shares `prisms` with aquamarine
and starsteel `stars` with the star garnet. Every gem is flat-shaded so a facet lights whole; a
spark or fire where the skin has one is emission alone, in the slot's pale tint or on the ruby's
own side of red, never in the reserved heat band (15 to 45).

<!-- gems-785 -->

| atlas, cell       | species                                      | silhouette + pattern | what it is                                                                                                                       |
| ----------------- | -------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| foothold.base 4   | `diamond-quartzine` Diamond (P1)             | octahedra, lustrous  | five near-white octahedra with a point toward the camera, the largest ring a small centre stone, four-rayed fire sparks on three |
| foothold.base 5   | `emerald-quartzine` Emerald (P1)             | prisms, faceted      | five stubby hexagonal prisms standing toward the camera with chamfered ends, deep green with a pale jardin                       |
| foothold.base 6   | `ruby-quartzine` Ruby (P1)                   | drops, faceted       | five faceted pears radiating from a heart, each drawn out to a six-sided point toward the centre, crimson                        |
| foothold.heavy 7  | `blue-topaz-quartzine` Blue Topaz (P3)       | blocks, clear        | four chamfered rectangular blocks on a ring, each ending in a four-sided wedge, pale clear blue                                  |
| foothold.heavy 8  | `orichalcum-brassvein` Orichalcum (P3)       | lattices, lustrous   | a trellis of six square gold bars, three crossing three at 60 degrees, hammered                                                  |
| foothold.heavy 9  | `heart-diamond-quartzine` Heart Diamond (P3) | octahedra, fiery     | three large blush-white octahedra tipped on their side, a long edge to the camera, a warm pink fire spark on each crown          |
| foothold.heavy 10 | `watermelon-tourmaline-quartzine` (P4)       | pencils, two-tone    | four three-sided pencils lying ridge-on, green rind, the cut ends showing the pink heart                                         |
| foothold.heavy 11 | `starsteel-brassvein` Starsteel (P4)         | stars, watered       | three six-armed steel star plates standing proud, chamfered, a hot point at each centre, watered damask over lavender grey       |
| foothold.heavy 12 | `painite-quartzine` Painite (P4)             | spindles, deep-red   | six six-sided spindles fanning from a root, deep red, a fire glint along every other waist                                       |
| foothold.heavy 13 | `fire-garnet-quartzine` Fire Garnet (P5)     | spheres, glowing     | six faceted balls lit from within, an ember floor of their own red under the glint                                               |
| foothold.heavy 14 | `core-gold-brassvein` Core Gold (P5)         | blooms, molten       | three rosettes of smooth gold lobes, a raised centre ringed by five petals, a molten sheen                                       |
| foothold.heavy 15 | `furnace-ruby-quartzine` Kiln Ruby (P5)      | hearts, inner-fire   | three heart crystals extruded toward the camera and chamfered, a smaller flame-bright heart on each                              |

<!-- /gems-785 -->

Authored a set at a time: `author_ore_heroes.py -- <set>` and `hero_post.py <set>` for `p1-gems`,
`foothold-p3-gems`, `foothold-p4-gems` and `foothold-p5-gems`, leaving the legacy and P2 cells
byte-identical, then `encode_hero_atlases.py` packs both acts again.

### Gem reads

`hero_post.py` measures every committed cell at the two gem-read screens (`hero_reads.py`, written
to `hero-reads.json` with the cell's SHA-256; 30 px a tile on 360x640, 67 px on 1280x800): the
patches of the body brighter than 0.82 (highlights), the share of the body on a luma edge of 0.1
or more (facet edges and the outline), the body's contrast against its rock, and the share of the
tile that is bright (0.72) or saturated (0.5), Systems' showiness term. The roster's contact-sheet
spec reads them: every gem shows a highlight at both screens, at least 0.15 of its body on facet
edges and a 1.2 contrast, and its score, rank k plus the bright-or-saturated share, never falls as
the price rises nor under the planet's top non-gem (a row with no cell has no cell pixels, so a
shader-look non-gem scores 0; P1's legacy heroes score their cells' shares, red beryl the most).

<!-- gem-reads-785 -->

From `hero-reads.json`, the twelve at the two screens (highlights · facet-edge share · contrast · bright-or-saturated share):

| species                                | 360x640 (30 px)          | 1280x800 (67 px)         |
| -------------------------------------- | ------------------------ | ------------------------ |
| `diamond-quartzine` (P1)               | 3 · 0.71 · 2.94 · 0.223  | 4 · 0.39 · 3.01 · 0.236  |
| `emerald-quartzine` (P1)               | 3 · 0.67 · 2.32 · 0.047  | 5 · 0.37 · 2.36 · 0.054  |
| `ruby-quartzine` (P1)                  | 2 · 0.76 · 2.13 · 0.036  | 2 · 0.45 · 2.18 · 0.048  |
| `blue-topaz-quartzine` (P3)            | 2 · 0.65 · 2.25 · 0.028  | 6 · 0.36 · 2.29 · 0.036  |
| `orichalcum-brassvein` (P3)            | 18 · 0.99 · 2.23 · 0.051 | 20 · 0.88 · 2.30 · 0.065 |
| `heart-diamond-quartzine` (P3)         | 6 · 0.68 · 2.60 · 0.124  | 9 · 0.39 · 2.64 · 0.138  |
| `watermelon-tourmaline-quartzine` (P4) | 1 · 0.78 · 2.22 · 0.013  | 18 · 0.55 · 2.27 · 0.024 |
| `starsteel-brassvein` (P4)             | 2 · 0.86 · 2.19 · 0.011  | 14 · 0.68 · 2.23 · 0.021 |
| `painite-quartzine` (P4)               | 2 · 0.65 · 2.38 · 0.026  | 5 · 0.44 · 2.42 · 0.035  |
| `fire-garnet-quartzine` (P5)           | 4 · 0.76 · 2.13 · 0.043  | 4 · 0.39 · 2.18 · 0.054  |
| `core-gold-brassvein` (P5)             | 8 · 0.99 · 2.32 · 0.063  | 22 · 0.88 · 2.43 · 0.077 |
| `furnace-ruby-quartzine` (P5)          | 3 · 0.92 · 2.25 · 0.104  | 3 · 0.51 · 2.32 · 0.122  |

- `p1-gems`: the closest pair within the set at 40 px is diamond-quartzine vs ruby-quartzine (silhouette 0.71 apart, 64° of hue, 0.25 of luma, 0.39 under deuteranopia); the closest pair of the whole atlas is red-beryl-quartzine vs ruby-quartzine.
- `foothold-p3-gems`: the closest pair within the set at 40 px is orichalcum-brassvein vs heart-diamond-quartzine (silhouette 0.69 apart, 46° of hue, 0.15 of luma, 0.39 under deuteranopia); the closest pair of the whole atlas is blue-corundum-quartzine vs starsteel-brassvein.
- `foothold-p4-gems`: the closest pair within the set at 40 px is watermelon-tourmaline-quartzine vs starsteel-brassvein (silhouette 0.74 apart, 88° of hue, 0.06 of luma, 0.17 under deuteranopia); the closest pair of the whole atlas is blue-corundum-quartzine vs starsteel-brassvein.
- `foothold-p5-gems`: the closest pair within the set at 40 px is fire-garnet-quartzine vs furnace-ruby-quartzine (silhouette 0.70 apart, 8° of hue, 0.03 of luma, 0.07 under deuteranopia); the closest pair of the whole atlas is blue-corundum-quartzine vs starsteel-brassvein.

<!-- /gem-reads-785 -->

## The fifteen heroes of P3 to P5 (#853)

The other `hero: true` rows of the `foothold-p3` to `foothold-p5` pools, the two rares and three
epics each planet keeps beside its three gems, which drew the shader look until the atlas had a
second page (#852). Each is its own construction from its mineral-skin row
([docs/art/mineral-skins](../mineral-skins/README.md): the vein layout, the base's pattern and the
sheen) in its hue slot's colour, built by `hero_marks_p3.py`, `hero_marks_p4.py` and
`hero_marks_p5.py` under the shared treatment of `hero_bodies.py`. The VS ruling of 24 Oct
("an epic looks rarer than a rare, and neither looks like a gem") sets the treatment: no facet
glint, no flat-shaded stone, a low rim; a **rare** is one matte body in its slot's colour; an
**epic** adds a second tone in zones or bands (the etch's taenite, the sapphire's zoning, the
alexandrite's raspberry, the steel's indigo temper, the heartwood's deep rings) and one sheen mark
the skin names (a lamella flash, an asterism, an opal flash, a filed gleam, a sector flash, flame
tongues, a banked glow, a chalcedony gleam), as emission under the bright threshold. The
price-order rule of #785 (`roster.skinContactSheet.test.ts`) also binds them: Systems' score,
rank k plus the share of the tile that is bright or saturated, must put every gem above its
planet's showiest non-gem, and the cheapest gem has rank 0, so each non-gem's share stays under
its planet's cheapest gem (Blue Topaz 0.028 and 0.036 on P3, Watermelon Tourmaline 0.013 and
0.024 on P4, Fire Garnet 0.043 and 0.054 on P5, at 30 and 67 px). That is why the platinum is
burnished and worn rather than polished, the amber and the alexandrite wear the gems' clear coat
and translucency (which pale a saturated body as they pale the gems' glass), the silver is mostly
tarnish and the brass mostly patina: the look the skins describe, and the quiet the rule asks.

<!-- heroes-853 -->

| page, cell | species                              | rarity | silhouette + pattern | what it is                                                                                                                                                                               |
| ---------- | ------------------------------------ | ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2, 0       | `native-platinum-brassvein` (P3)     | rare   | pebbles, burnished   | six flattened water-rolled pebbles along a gravel stringer, burnished grey with two crossing sets of hairline scratches and a mottle of wear                                             |
| 2, 1       | `coiled-ammonite-amberbone` (P3)     | rare   | spirals, nacreous    | two shells coiled flat, each a tube widening as it winds out over two and a half turns, ribbed across the outer whorls, rose nacre paling toward the edge                                |
| 2, 2       | `meteoric-iron-brassvein` (P3)       | epic   | slabs, etched        | four thick chamfered slabs lying nearly flat, etched in kamacite bands in three sets 60 degrees apart, one set a domain, with a taenite rim that flashes                                 |
| 2, 3       | `star-sapphire-quartzine` (P3)       | epic   | domes, starred       | three cabochon domes sunk past the waist, blue-violet grown in stepped colour zones round one core, a six-rayed star on the two larger crowns                                            |
| 2, 4       | `opal-jaw-amberbone` (P3)            | epic   | jaws, opaline        | a lower jaw gone to common opal, an arch of bone tapering to both ends with seven teeth standing in from it, a mosaic of potch patches with dark seams and a flash on a few              |
| 2, 5       | `wire-silver-brassvein` (P4)         | rare   | curls, tarnished     | four wires curled like a ram's horn, nearly straight from the root and tight at the tip, silver under heavy dark tarnish with a slate fringe                                             |
| 2, 6       | `belemnite-amberbone` (P4)           | rare   | darts, polished      | four bullet-shaped guards lying every way, one snapped in two, a dull cortex cut by one polished window along the crest that shows the amber calcite and its growth rings                |
| 2, 7       | `clockspring-steel-brassvein` (P4)   | epic   | springs, blued       | three coil springs lying along the face, their coils rising clear of the rock, blued steel with an indigo temper and fine draw-file lines                                                |
| 2, 8       | `alexandrite-quartzine` (P4)         | epic   | twins, colour-change | two sixlings of three tabular crystals grown through each other at 60 degrees, raspberry by the lamp with the slot's green in zones face-on, a pale sector flash on one face each        |
| 2, 9       | `ichthyosaur-eye-amberbone` (P4)     | epic   | rings, plated        | the sclerotic ring, thirteen bone plates lapped like shingles round an open eye, and a broken ring of five beside it, slate bone pitted with pores                                       |
| 2, 10      | `wolfram-brassvein` (P5)             | rare   | bars, satin          | a heap of five square bars, three laid one way and two crossed over them on the diagonals, steel grey in a fibre satin                                                                   |
| 2, 11      | `saurian-vertebra-amberbone` (P5)    | rare   | vertebrae, porous    | four vertebrae along a gentle curve, each a waisted spool with flared ends, a neural spine above and a process below, pale spongy bone round dark pores                                  |
| 2, 12      | `firebrass-brassvein` (P5)           | epic   | ribbons, flame-lit   | three brass ribbons wavering across the cell, narrowing where they twist and ending in a tight curl, dark under a furnace patina with the bright metal where flame tongues lick the foot |
| 2, 13      | `heat-spinel-quartzine` (P5)         | epic   | octahedra, faceted   | three spinel-law macles, flat triangular stones with a smaller twin turned through 60 degrees on each, pink under a hard coat with a faint banked glow face-on                           |
| 2, 14      | `petrified-heartwood-amberbone` (P5) | epic   | logs, growth-ringed  | two rounds of stone wood seen end-on with their growth rings, and a log lying across the cell, olive with deeper rings under a faint chalcedony gleam                                    |

<!-- /heroes-853 -->

Authored a set at a time: `author_ore_heroes.py -- <set>` and `hero_post.py <set>` for
`foothold-p3-heroes`, `foothold-p4-heroes` and `foothold-p5-heroes`, leaving every page-1 cell
byte-identical, then `encode_hero_atlases.py`, which writes `foothold.heavy`'s page 2
(`ground-hero-atlas-foothold-heavy-page-2`) and leaves both page-1 maps byte-identical. The cells
are measured into `hero-reads.json` like the gems' (the roster spec reads a non-gem's share from
there), and the P6 and P7 heroes wait on skin rows.

### Non-gem reads

<!-- reads-853 -->

From `hero-reads.json`, the fifteen at the two screens (highlights · facet-edge share · contrast · bright-or-saturated share), beside the bar each planet's cheapest gem sets (0.028 and 0.036, 0.013 and 0.024, 0.043 and 0.054):

| species                         | 360x640 (30 px)         | 1280x800 (67 px)         |
| ------------------------------- | ----------------------- | ------------------------ |
| `native-platinum-brassvein`     | 0 · 0.97 · 1.97 · 0.017 | 0 · 0.34 · 1.96 · 0.019  |
| `coiled-ammonite-amberbone`     | 0 · 0.92 · 2.13 · 0.008 | 10 · 0.75 · 2.21 · 0.017 |
| `meteoric-iron-brassvein`       | 0 · 0.53 · 2.01 · 0.002 | 10 · 0.67 · 2.04 · 0.007 |
| `star-sapphire-quartzine`       | 0 · 0.72 · 1.76 · 0.021 | 3 · 0.39 · 1.76 · 0.029  |
| `opal-jaw-amberbone`            | 1 · 0.96 · 1.83 · 0.019 | 6 · 0.64 · 1.87 · 0.032  |
| `wire-silver-brassvein`         | 0 · 0.90 · 1.51 · 0.000 | 10 · 0.81 · 1.54 · 0.006 |
| `belemnite-amberbone`           | 0 · 0.79 · 1.39 · 0.000 | 0 · 0.33 · 1.41 · 0.000  |
| `clockspring-steel-brassvein`   | 0 · 0.28 · 1.33 · 0.000 | 0 · 0.35 · 1.35 · 0.000  |
| `alexandrite-quartzine`         | 0 · 0.81 · 1.59 · 0.008 | 0 · 0.50 · 1.61 · 0.007  |
| `ichthyosaur-eye-amberbone`     | 0 · 0.60 · 1.78 · 0.000 | 0 · 0.53 · 1.80 · 0.007  |
| `wolfram-brassvein`             | 0 · 0.28 · 1.30 · 0.000 | 0 · 0.18 · 1.32 · 0.000  |
| `saurian-vertebra-amberbone`    | 0 · 0.92 · 2.09 · 0.000 | 0 · 0.63 · 2.16 · 0.006  |
| `firebrass-brassvein`           | 0 · 0.55 · 1.41 · 0.033 | 0 · 0.48 · 1.45 · 0.035  |
| `heat-spinel-quartzine`         | 0 · 0.62 · 1.97 · 0.000 | 0 · 0.32 · 2.00 · 0.000  |
| `petrified-heartwood-amberbone` | 0 · 0.40 · 1.68 · 0.002 | 1 · 0.38 · 1.70 · 0.002  |

- `foothold-p3-heroes`: the closest pair within the set at 40 px is meteoric-iron-brassvein vs star-sapphire-quartzine (silhouette 0.36 apart, 9° of hue, 0.09 of luma, 0.26 under deuteranopia); the closest pair of the whole atlas is meteoric-iron-brassvein vs star-sapphire-quartzine.
- `foothold-p4-heroes`: the closest pair within the set at 40 px is wire-silver-brassvein vs clockspring-steel-brassvein (silhouette 0.85 apart, 12° of hue, 0.05 of luma, 0.15 under deuteranopia); the closest pair of the whole atlas is meteoric-iron-brassvein vs star-sapphire-quartzine.
- `foothold-p5-heroes`: the closest pair within the set at 40 px is saurian-vertebra-amberbone vs petrified-heartwood-amberbone (silhouette 0.82 apart, 14° of hue, 0.03 of luma, 0.10 under deuteranopia); the closest pair of the whole atlas is meteoric-iron-brassvein vs star-sapphire-quartzine.

Every non-gem sits under its planet's bar at both screens, and every one stands off its rock
(contrast 1.3 for the wolfram bars to 2.2 for the ammonite). The closest pair of the whole heavy
atlas is now Meteoric Iron against Star Sapphire, two P3 epics whose hue slots sit 10 degrees
apart (236 and 246): the eye tells a stack of hatched grey slabs from glossy violet domes with
their stars, and in the deuteranopia copy they are 0.26 apart, over the legacy floor (fluorite
against corundum, 0.23). The scale strip `sheets/heroes-foothold-p5-heroes.scale-x4.png` holds
the whole atlas, thirty-one heroes at 85, 67, 40, 30 and 22 px a tile, with its blind copies.

<!-- /reads-853 -->

## Pages (#852)

An act's atlas is an unbounded list of pages
([MA: unbounded mineral atlas pages per act (#852)](https://github.com/bjor2/steampunk-miner/issues/852),
HS ruling (a) of 24 Oct): `foothold.heavy`'s first page is full, and a second atlas is never
hard-coded. A page is one 1024 px KTX2 of 16 cells, shaped as above. The page a hero sits on is
its mineral skin row's `atlasPage` in `src/features/mineral-skins/mineralSkins.json`, so a page
never moves once its art ships. A hero with none goes on the first page with room, and a new page
opens when the last is full (`packed_pages` in `hero_species.py`, the same rule as `packHeroPages`
in `src/systems/render/heroAtlas.ts`). The game refuses to load until the row records the page it
names. `hero-cells.json` gives each cell its `page` and its `index` on that page. The encoder
writes each page as its own map: page 1 keeps `ground-hero-atlas-<act>`, and page n is
`ground-hero-atlas-<act>-page-<n>`, so adding a page leaves every other page's map byte-identical.
The previews are `sheets/atlas-preview.<act>.png` and `atlas-preview.<act>.page-<n>.png`. The
game stacks an act's pages as the layers of one texture on the atlas's one sampler unit, so every
page of the act is resident together and the cost grows per act, never per planet. A new page
also needs its `atlas` row in the asset manifest before the game draws it; until then its heroes
draw the shader look.

## Files

| File                                            | What it is                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `blend/hero-<species>.blend`                    | the hero's scene: its 1 m cell on the middle band of its window, the shallow lamp rig and the game's camera framing the cell at 248 px                                                                       |
| `blend/heroes-<set>.blend`                      | the authored set's review scene: its cells in a row                                                                                                                                                          |
| `cells/<species>.png`                           | the atlas cell: the 248 px lit sprite (straight alpha, the mask) with its edge pixels extended into the 4 px gutter of a 256 px cell, ready to pack                                                          |
| `hero-cells.json`                               | the cell table for #451: the authored sets, the atlas shape, per act the cells it packs (index, species, content rect) and per hero the species, set, rarity, hue slot, body colour, window, cell and source |
| `hero-reads.json`                               | every committed cell's gem-read measures at the two screens, with its SHA-256 (#785; `hero_reads.py`)                                                                                                        |
| `sheets/atlas-preview.<act>[.page-<n>].png`     | each 1024 px page of the act's atlas as #451's shape packs it (cell `i` of the page at column `i mod 4`, row `i div 4`; page 1 unsuffixed, #852); a preview, #451 owns the shipped KTX2                      |
| `encode_hero_atlases.py`                        | packs `cells/` into each page of each act's shipped atlas, `public/assets/ground/ground-hero-atlas-<act>[-page-<n>]/` (ETC1S sRGB, four mip levels, colour bled into transparent texels)                     |
| `sheets/heroes-legacy.shallow.jpg`              | the four cells at 256 px/m on their band's rock under the headlamp and fill                                                                                                                                  |
| `sheets/heroes-legacy.deep.jpg`                 | the same under the dim cool fill of band 5                                                                                                                                                                   |
| `sheets/heroes-legacy.closeup.jpg`              | the four at 480 px/m                                                                                                                                                                                         |
| `sheets/*-gray.png`, `*-ingame.png`             | the greyscale blind-order copy and the 85 px/m downsample (about a 1080p screen at the default 12 m zoom)                                                                                                    |
| `sheets/heroes-legacy.scale.png`                | the game-scale strip: every hero over its rock at 85, 40 and 22 px a tile (default zoom, the 20 m zoom, a phone); `-x4` is the same magnified 4x, with `-gray` and `-deutan` copies                          |
| `sheets/heroes-legacy.{shallow,deep}.luma.json` | measured ore and rock luma per cell, as the family sheets report                                                                                                                                             |
| `sheets/heroes-legacy.distinct.json`            | per hero at 40 px: coverage, mean hue, luma, contrast; per pair: silhouette, hue, luma and deuteranopia distance, and the least different pair                                                               |

## Pipeline

```
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ore-heroes/author_ore_heroes.py -- <set>        # the set's .blend files, sprites and sheets; hero-cells.json for every authored set
python3 docs/art/ore-heroes/hero_post.py <set>                # the set's cells, every act's atlas preview, scale strip, blind copies, distinctness, hero-reads.json, JPEG shrink
python3 docs/art/ore-heroes/encode_hero_atlases.py            # every act's shipped atlas from the committed cells
```

An authored set (`AUTHORED_SETS` in `hero_species.py`) is a materials pool, the planets it paints
and which of the pool's heroes it draws: `legacy` (its non-gem heroes, P1 and an old P2),
`p1-gems` (the legacy pool's gem slots, P1), `foothold-p2` (every hero, P2),
`foothold-p3-gems` to `foothold-p5-gems` (each pool's gem slots, its planet) and
`foothold-p3-heroes` to `foothold-p5-heroes` (each pool's other heroes, its planet, #853); the
gem slots are the ores slice's `ore.gems.pools`. Set `PYTHONDONTWRITEBYTECODE=1` so importing the modules leaves
the tracked `__pycache__` alone.

- `hero_species.py` reads a set's hero rows, the hue slot colour of each and the acts the set
  paints (`oreThemes.json`), and writes `hero-cells.json`: per act, the cells of every authored
  set that paints one of its planets, set after set, so the legacy four keep cells 0 to 3 in
  both acts, P1's gems follow them in `foothold.base` and P2's gems then P3 to P5's in
  `foothold.heavy`. Plain Python, shared by both steps.
- `hero_marks.py` builds one silhouette per `silhouette` word of the rows (`cubes`, `wires`,
  `barrels`, `columns`, and the gems' `stars`, `ovals`, `prisms`) with the species' material,
  seeded per species, from the ore stage's shapes and materials; `gem_marks.py` and
  `gem_marks_deep.py` add the twelve gems of #785 under the row's silhouette and pattern pair,
  looked up first, and `hero_marks_p3.py`, `hero_marks_p4.py` and `hero_marks_p5.py` the fifteen
  non-gem heroes of #853 the same way, on the matte bodies and zone helpers of `hero_bodies.py`. A
  set naming a look with no builder fails, never falls back.
- `author_ore_heroes.py` stages each hero's cell, saves its `.blend`, and renders the sprite with
  the rock slab held out (`is_holdout`) on a transparent film: what stands off the face keeps its
  lamp shading, the rock and whatever is sunk into it come out transparent, and no compositor glow
  runs. Sprites land in `art/build/ore-heroes/` (gitignored). Then the review scene and sheets.
- `hero_post.py` (python3, Pillow and numpy) pads the sprites into 256 px cells, packs the atlas
  previews, composites the scale strip over the band rock of `artDirection.json`, writes the
  greyscale and deuteranopia copies, measures distinctness, writes every cell's gem reads
  (`hero_reads.py`) and shrinks the colour sheets to JPEG.
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
