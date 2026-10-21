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

The legacy pool's five commons, kind slots 1 to 5 on P1 (a P2 entered before its own pool, under
ore rules 5, draws the same pool, so it shows them too). Each skin's layers follow its species row: the base its `pattern`, the vein its
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

The legacy pool's four uncommons and its first rare, kind slots 6 to 10 on P1 (and a P2 under ore rules 5). The
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

## Batch p1-b3: P1's species 11 and 12 (ticket 594)

The legacy pool's last two rares, kind slots 11 and 12 on P1 (and a P2 under ore rules 5). The pool has 12 species,
so P1 has no slots 13 to 15 and this batch closes the planet. The layers come from the species row,
as before. No layer is shared with p1-b1, p1-b2 or within the batch.

<!-- p1-b3 -->

| slot | species                   | base           | vein          | palette (shadow, body, light)                 | sheen        |
| ---- | ------------------------- | -------------- | ------------- | --------------------------------------------- | ------------ |
| 11   | `blue-corundum-quartzine` | `rutile-silk`  | `hex-barrels` | `corundum-blue` `#2a4074` `#5581e7` `#aac0f3` | `adamantine` |
| 12   | `red-beryl-quartzine`     | `clear-depths` | `hex-columns` | `beryl-red` `#6e2b34` `#db5667` `#edabb3`     | `prismatic`  |

<!-- /p1-b3 -->

- **Bases:** a deep, softly clouded body crossed by fine rutile silk, short needles in three sets
  at 60 degrees (each set a whole number of lines along u and v, so it repeats with no seam); clear
  stone with a slow swell of depth, fine growth tubes running up the column and faint healed veils.
- **Veins:** four barrel-shaped hexagonal crystals, each a six-sided body tapering to a point at
  both ends; five flat-ended hexagonal columns rising side by side from one root, tipped toward the
  lamp so their ends show.
- **Sheens:** adamantine (a hard bloom, strong glints, and the six-rayed star silky corundum throws,
  one centred on each tile, fading out before the cell edge); prismatic (long bars of light down
  the prism faces that meet the lamp, a column of the cell each, and sharp glints).

## Batch p2-b1: P2's species 1 to 5 (ticket 595)

P2's own pool, foothold-p2 (ticket 632, GD lock (b) on #595), binds a species of its own to each of
the 12 legacy kind slots under ore rules 6. This batch skins its five commons, kind slots 1 to 5. The
layers come from the species row, as on P1. No layer is shared within the batch or with any other
planet's batches. P2's slots 6 to 9 come with ticket 596 (p2-b2), and 10 to 12 with ticket 597.

<!-- p2-b1 -->

| slot | species | base             | vein              | palette (shadow, body, light)                  | sheen            |
| ---- | ------- | ---------------- | ----------------- | ---------------------------------------------- | ---------------- |
| 1    | `p2-c1` | `slaty-cleavage` | `split-slabs`     | `slate-grey` `#424852` `#8590a3` `#c2c8d1`     | `cleavage-sheen` |
| 2    | `p2-c2` | `ochre-powder`   | `ochre-lumps`     | `rust-ochre` `#663528` `#cd6a51` `#e6b4a8`     | `powdery`        |
| 3    | `p2-c3` | `gravel-bed`     | `rivet-grains`    | `tin-gravel` `#5c5f61` `#b8bec2` `#dcdee0`     | `grain-caps`     |
| 4    | `p2-c4` | `sulphur-crumb`  | `crumbled-masses` | `sulphur-yellow` `#737010` `#e6e021` `#f2f090` | `sugary`         |
| 5    | `p2-c5` | `graphite-smear` | `flake-books`     | `graphite-black` `#424248` `#838391` `#c1c1c8` | `slick`          |

<!-- /p2-b1 -->

- **Species:** slate shale, rust ochre, tin gravel, sulphur crust and graphite seam (`p2-c1` to
  `p2-c5`; the ids never follow the names, which the voice check may still change).
- **Bases:** fine slaty cleavage on a slight slant, broad silt beds across it, and dark broken lines
  where a sheet split off (whole lines along u and v, so it repeats); soft powdery earth stained in
  rusty drifts, the stain run down the face in streaks, with a dust of pale grains; a packed bed of
  rounded grains, each its own grey and domed to its middle, with dark grit in the gaps; a crumbly
  crust broken into clods along soft cracks, porous with small pits and a pale bloom; soft black
  smears drawn level, deep and pale in turn, with a few polished lenses and no ruled line.
- **Veins:** five long thin slabs stacked level with gaps between, each end broken on a slant;
  faceted earthy lumps, lop-sided where they crumbled, with loose crumbs round them; loose grains
  shaped like spent rivets, a domed head on a short shank, lying every way; two crumbly heaps of
  rounded clods grown together, with broken chips fallen off their edge; books of thin hexagonal
  flakes stacked a little askew, and three loose flakes slid off them.
- **Sheens:** cleavage sheen (a faint lip of light on each split sheet, a dim wash), powdery (no
  gloss, only a soft dusty lift where the powder lies thick), grain caps (a bright cap on the middle
  of every grain, a few hard glints), sugary (a dense frost of tiny glints over a weak resin wash),
  slick (long level smears of greasy shine where the seam was rubbed). Cleavage sheen and grain caps
  read the very sheet lines and grains of their bases (the same seeds), so the light sits on the
  stone's own shapes.
- **Seeds 701 to 792.** P2's later batches keep apart from them.
- **P2's rock** is `palette.planet_2`, the same slate blue P3 wears (band 3 luma 0.29).

## Batch p2-b2: P2's species 6 to 9 (ticket 596)

The foothold-p2 pool's four uncommons, kind slots 6 to 9 on P2 under ore rules 6. The layers come
from the species row, as for p2-b1. No layer is shared within the batch or with any other batch.
Bismuth's shadow sits on magenta (`SHADOW_HUES` in `skin_layers.py`), so its ramp runs through the
temper colours of its oxide skin into the cyan body, the way alexandrite's runs from its candle red.

<!-- p2-b2 -->

| slot | species | base             | vein               | palette (shadow, body, light)                   | sheen             |
| ---- | ------- | ---------------- | ------------------ | ----------------------------------------------- | ----------------- |
| 6    | `p2-u1` | `bloom-rosettes` | `fleck-drifts`     | `cobalt-blue` `#38466e` `#708bdb` `#b8c5ed`     | `fleck-glints`    |
| 7    | `p2-u2` | `oxide-stairs`   | `stair-crystals`   | `bismuth-rainbow` `#6c4c6c` `#82c5d0` `#c0e2e8` | `step-edge-flash` |
| 8    | `p2-u3` | `adularia-milk`  | `lenticle-scatter` | `moonstone-milk` `#707072` `#dfe0e5` `#eff0f2`  | `schiller-glow`   |
| 9    | `p2-u4` | `cubic-cleavage` | `dice-cubes`       | `galena-grey` `#585a5c` `#b0b3b9` `#d8d9dc`     | `satin-streaks`   |

<!-- /p2-b2 -->

- **Species:** cobalt bloom, bismuth stair, moonstone lens and galena cube (`p2-u1` to `p2-u4`).
- **Bases:** soft round blooms of colour on a dull dark matrix, each brightest at its heart under a
  powdery fringe and ringed faintly as it grew, with fine flecks between; square stairs climbing to
  one corner of every block (three blocks by three, so it repeats), each tread its own temper tone,
  a bright lip and a riser shadow on each; milky feldspar in a soft cloud, a broad bent band of
  glow drifting across the diagonal, and faint cleavage square to itself; fine steel grain with a
  satin weave, laid level in one block and upright in the next (four by four), the level blocks
  darker, cut by square cleavage cracks broken here and there.
- **Veins:** three drifts of small flat flecks tipped every way, each thickest at its head; three
  little stairs of flat treads, each stepped up and over from the one below with a raised rim on
  every tread; six loose lens-shaped stones, flat biconvex almonds lying apart, the big ones with a
  small lens on the shoulder; four cubes square as dice in a cluster square to the face, one fallen
  on its edge, and two small ones apart.
- **Sheens:** fleck glints (the blooms stay earthy, with sharp glints sprinkled mostly over them and
  a faint wash on their hearts), step-edge flash (a bright line on the lip of every tread, and whole
  treads flashing at the top of their temper), schiller glow (the base's band of glow, billowing and
  soft, never a hard glint), satin streaks (a soft shimmer along each block's grain, and a few whole
  cleavage faces flashing). Each sheen reads its base's field (blooms, stairs, band, weave) through
  the same seeds, so the light sits on the stone's own shapes.
- **Seeds 801 to 835**, apart from p2-b1's 701 to 792 and from every other batch's.

## Batch p3-b1: P3's species 1 to 5 (ticket 598)

The foothold-p3 pool's four commons and its metal uncommon, kind slots 1 to 5 on P3. The layers
come from the species row, as on P1. No layer is shared within the batch, with P1 or with p3-b2.
Authored through the Blender MCP (see Pipeline).

<!-- p3-b1 -->

| slot | species                   | base           | vein              | palette (shadow, body, light)                     | sheen        |
| ---- | ------------------------- | -------------- | ----------------- | ------------------------------------------------- | ------------ |
| 1    | `pig-iron-brassvein`      | `pitted-cast`  | `slag-knots`      | `pig-iron-grey` `#42474c` `#858e97` `#c2c6cb`     | `matte`      |
| 2    | `soot-zinc-brassvein`     | `soot-dusted`  | `spangle-scales`  | `zinc-soot` `#4a5154` `#93a2a7` `#c9d0d3`         | `smudged`    |
| 3    | `rail-quartz-quartzine`   | `frosted-face` | `rod-bundle`      | `rail-quartz-frost` `#646768` `#c7cecf` `#e3e6e7` | `silky`      |
| 4    | `smoke-calcite-quartzine` | `smoke-rhombs` | `lens-stack`      | `calcite-smoke` `#484a52` `#9093a4` `#c8c9d2`     | `satin`      |
| 5    | `step-bismuth-brassvein`  | `oxide-film`   | `hopper-terraces` | `bismuth-oxide` `#624262` `#c484c4` `#e2c2e2`     | `iridescent` |

<!-- /p3-b1 -->

- **Bases:** a cast face of fine mottle pocked with round blowholes, each dark with a pale lip;
  pale zinc under drifts of soot, with darker runs where it settled and a dust of specks; a frosted
  face, fine bright frost over a slow cloud, banded level across the prism with coarse striations;
  smoky wisps crossed by calcite's rhombic cleavage (3 and 2 whole lines along u and v, so the
  lattice repeats); the contour fringes of a thin oxide film, like oil on water.
- **Veins:** four small trefoil knots of drawn iron; round spangle scales lapped in staggered rows,
  each lower row over the one above and lifted at its foot; a bundle of thin round rods laid level,
  like rails; flat biconvex lenses, two stacks of three and one alone; three hopper crystals, square
  frames stepped up and in toward a hollow middle (the side bars stop at the end bars, so no two
  faces lie on one another).
- **Sheens:** matte (only the blowhole lips and a few burrs catch the lamp), smudged (zinc shows
  where the soot was wiped: two broken diagonal swipes and the bare patches), silky (fine broken
  level threads of light along the rods), satin (a soft glow toward one corner of each rhomb, never
  a glint), iridescent (bright bands along the oxide fringes, and glints). Matte and satin share
  the blowhole and rhomb fields of their bases, so the light sits where the stone is shaped.
- **Seeds 501 to 591**, apart from p3-b2's 401 to 482, so no two P3 layers share a noise field.

## Batch p3-b2: P3's species 6 to 10 (ticket 599)

The foothold-p3 pool's crystal and fossil uncommons and its three rares, kind slots 6 to 10 on P3.
The layers come from the species row, as on P1. No layer is shared within the batch or with P1;
P3's slots 1 to 5 (ticket 598, p3-b1) and 11 to 15 (ticket 600) add theirs. Slots 16 and 17, the two
fossil commons of #453 (chalk bed, fish bed), are held: no ticket skins them, and a spec pins them
unskinned.

<!-- p3-b2 -->

| slot | species                     | base                  | vein             | palette (shadow, body, light)                 | sheen         |
| ---- | --------------------------- | --------------------- | ---------------- | --------------------------------------------- | ------------- |
| 6    | `green-apatite-quartzine`   | `etched-glass`        | `hex-ends`       | `apatite-green` `#2a6045` `#55bf8a` `#aadfc4` | `subresinous` |
| 7    | `ribbed-shell-amberbone`    | `growth-lines`        | `ribbed-valves`  | `shell-cream` `#5d5c40` `#bab880` `#dcdcc0`   | `dull`        |
| 8    | `native-platinum-brassvein` | `burnished-scratches` | `rolled-pebbles` | `platinum-pale` `#626466` `#c5c7cb` `#e2e3e5` | `polished`    |
| 9    | `blue-topaz-quartzine`      | `cleaved-clear`       | `wedge-blocks`   | `topaz-blue` `#44606e` `#88c0dc` `#c4e0ee`    | `limpid`      |
| 10   | `coiled-ammonite-amberbone` | `nacre-sheets`        | `ammonite-coils` | `ammonite-rose` `#63505a` `#c6a0b3` `#e2d0d9` | `pearly`      |

<!-- /p3-b2 -->

- **Bases:** clear glassy stone with fine striae up the prism and small etch pits, each with a pale
  lip; a chalky matrix packed with shells, each a set of growth rings round its beak; a burnished
  face with a soft mottle of wear, long hairline scratches in two crossing sets and a few pits;
  clear stone crossed by flat basal cleavage cracks, a bright edge on each, and small liquid
  inclusions; thin wavy sheets of nacre crossed by the frilled suture lines of the shell.
- **Veins:** stubby hexagonal prisms seen end on, tipped so a side face or two shows (blue
  corundum's barrels and red beryl's columns on P1 lie along the face); three fan-shaped valves,
  nine ribs from the beak to a scalloped rim; flattened water-rolled pebbles in a gravel stringer;
  three upright blocks under pitched wedge ends, tipped back so the two roof faces catch the lamp;
  two shells coiled flat in a widening spiral, each whorl a run of chambers.
- **Sheens:** subresinous (soft gloss drawn out in streaks up the prism, a few small glints), dull
  (a faint even lift and nothing sharp), polished (broad diagonal sweeps, as a rolled pebble mirrors
  the lamp, and hard glints), limpid (light caught along the cleavage cracks, a wide faint gleam,
  pinpoint glints), pearly (soft edgeless bands along the nacre sheets, brightest where the shell
  swells). The limpid and pearly sheens follow the very cracks and sheets of their bases (the same
  seeds), so the light sits where the stone breaks.
- **P3's rock.** P3 wears `palette.planet_2` (planetTable.ts: planets past the slice reuse the heavy
  archetype until the heat act), a slate blue darker than P1's ground (band 3 luma 0.29). The post
  step lays a batch's skins in its own planet's rock (`ROCK_PALETTES` in `skin_post.py`).

## Batch p3-b3: P3's species 11 to 15 and its relic signature (ticket 600)

The foothold-p3 pool's three epics and two mythics, kind slots 11 to 15 on P3, and the planet's
signature material, `relic_t11`: the slotless 16th material (#453 E1), which has no species row and
wears the planet's `signatures` row instead (`p3-signature` in the cell table). The layers come
from the species row, as before, and the signature's from its family's look (Cogwork: cogs and gear
teeth). No layer is shared within the batch or with P1 or p3-b2.

<!-- p3-b3 -->

| slot | species                    | base                 | vein              | palette (shadow, body, light)                   | sheen            |
| ---- | -------------------------- | -------------------- | ----------------- | ----------------------------------------------- | ---------------- |
| 11   | `meteoric-iron-brassvein`  | `widmanstatten-etch` | `crusted-slabs`   | `meteoric-steel` `#50505a` `#a0a1b4` `#d0d0da`  | `lamella-flash`  |
| 12   | `star-sapphire-quartzine`  | `hex-zoning`         | `cabochon-domes`  | `sapphire-star` `#443f70` `#887edf` `#c3beef`   | `asterism`       |
| 13   | `opal-jaw-amberbone`       | `opal-potch`         | `toothed-jaw`     | `opal-jaw-milk` `#566a68` `#add3cf` `#d6e9e7`   | `opal-flash`     |
| 14   | `orichalcum-brassvein`     | `hammer-facets`      | `lattice-trellis` | `orichalcum-gold` `#5e5c10` `#bdb81f` `#dedc8f` | `hammered-shine` |
| 15   | `heart-diamond-quartzine`  | `triangle-facets`    | `octahedra`       | `diamond-blush` `#767172` `#ece2e4` `#f6f0f2`   | `facet-fire`     |
| sig. | `relic_t11` (P3 signature) | `clock-plate`        | `gear-train`      | `gearwork-teal` `#1c5242` `#37a485` `#9bd2c2`   | `perlage-gleam`  |

<!-- /p3-b3 -->

- **Bases:** an etched meteorite face, broad kamacite bands in three sets about 60 degrees apart with
  bright taenite rims and dark plessite between; a deep body grown in hexagonal colour zones round one
  core a cell; milky common opal where the bone was, a mosaic of soft patches each its own depth, faint
  broken bone fibres; worked metal beaten into shallow facets with a bright ridge where two meet; a
  clear body cut into triangular facets, each its own tone, crisp facet lines; a brass clock plate
  engine-turned in overlapping perlage circles and pierced by pivot holes.
- **Veins:** three angular slabs broken square from the mass; three smooth cabochon domes; a curved
  jawbone with a row of conical teeth, two broken; a diagonal lattice of rods with a bead at every
  crossing; sharp octahedra, two square pyramids base to base, tipped so three or four faces show;
  three whole gear wheels meshing in a train, each toothed and hubbed (P4's signature, ticket 603,
  wears broken cogs; P3's clockwork is intact).
- **Sheens:** lamella flash (one set of kamacite bands throws the lamp back, the other sets stay dark);
  asterism (a six-rayed star on each dome; the sheen and the vein share one dome layout,
  `STAR_DOMES`, so each star sits on its dome); opal flash (whole patches of the mosaic flaring at
  once, pinfire specks between); hammered shine (a bright spot in each facet facing the lamp, the
  ridges gleaming); facet fire (a few facets blaze, sparks where the facet lines meet); perlage gleam
  (a bright crescent on the lit side of each engine-turned circle, jewel glints in the pivot holes).
- **The signature's palette.** A signature has no hue slot, so its ramp is built by `skin_layers.py`'s
  rule on a slot-shaped look (`SIGNATURE_LOOKS`), chosen inside the relic family's #151 bands
  (155-168 degrees, luma 0.46-0.68), which the slice's loader holds it to. It keeps the hue the
  ground draws `relic_t11` in today (163 degrees, `oreLookOfType`) at the family's saturation
  (0.5). Its luma is 0.50, darker than the ground's 0.62, so it stays a step from green apatite
  (luma 0.60, hue 150), the planet's other green.
- **Seeds 601 to 661**, apart from p3-b1's 501 to 591 and p3-b2's 401 to 482, so no two P3 layers
  share a noise field.

## Batch p4-b1: P4's species 1 to 5 (ticket 601)

The `foothold-p4` pool's four commons and its metal uncommon, kind slots 1 to 5 on P4. P4's slots
11 to 15 and its signature material came first (ticket 603, p4-b3), so this batch's report measures
it against them (`planet_mates`); slots 6 to 10 come with #602. Slots 16 and 17 are #453's two
appended fossil commons (grey marl, crinoid stem), whose skins are held. The layers come from the
species rows as before; no layer is shared with another batch or within this one.

<!-- p4-b1 -->

| slot | species                  | base              | vein              | palette (shadow, body, light)                      | sheen            |
| ---- | ------------------------ | ----------------- | ----------------- | -------------------------------------------------- | ---------------- |
| 1    | `bog-iron-brassvein`     | `peat-crumb`      | `limonite-clods`  | `bog-iron-rust` `#563732` `#ac6e65` `#d6b7b2`      | `damp-dull`      |
| 2    | `cobalt-bloom-brassvein` | `bloom-crust`     | `globular-tufts`  | `cobalt-bloom-pink` `#643e58` `#c77daf` `#e3bed7`  | `bloom-sparkle`  |
| 3    | `rain-quartz-quartzine`  | `dew-beads`       | `needle-sheaves`  | `rain-quartz-mist` `#66696c` `#ccd2d7` `#e5e8eb`   | `dew-glints`     |
| 4    | `canal-jasper-quartzine` | `ribbon-stripes`  | `canal-cobbles`   | `canal-jasper-green` `#2d4b37` `#5a966e` `#accbb6` | `tumbled-polish` |
| 5    | `antimony-brassvein`     | `bladed-stibnite` | `stibnite-sprays` | `antimony-silver` `#575a5d` `#aeb3ba` `#d7d9dc`    | `blade-flash`    |

<!-- /p4-b1 -->

- **Bases:** bog ore broken into crumbs, each its own tone, with dark gaps, threads of rotted
  rootlet wandering up the face and rusty mottles; dark host rock crusted in patches of powdery
  bloom, each patch fringed where the crust thins; a pale clear face beaded with dew, each bead a
  dark rim round a bright crown, over faint upright needles in the stone; level ribbons of jasper,
  dark and pale in turn and of unequal widths (two strata sets, 5 and 8 beds a cell), bent by a slow
  warp, over fine chert laminae and grain; long stibnite blades packed side by side on a steep slant
  (3u - v, six blades a unit, six tones in turn, so the lattice repeats), each striated along its
  length with a pale lip and dark seams.
- **Veins:** four soft clods of limonite heaped low, knobbly with small lumps stuck on, and a few
  crumbs fallen off; six globular tufts of bloom, each a small dome bristling with hair-fine
  needles all round; two sheaves of hair-fine needles crossed at a slant, pinched at the waist and
  fanned at both ends; five big flat-lying cobbles packed together as ballast; two broom-like sprays
  of slender square-ended prisms, many and close, spreading only a little from their roots
  (painite's spindles in p4-b3 fan wide and taper).
- **Sheens:** damp dull (a faint wet sheen in the hollows and a few motes: bog ore drinks the
  light); bloom sparkle (the crust's tiny crystals spark, only where the bloom lies); dew glints (a
  hard point of light on every bead's crown over a wide faint gleam); tumbled polish (the pale
  ribbons shine in a slow sweep, a few glints); blade flash (two blades in six throw the lamp back
  along their length, broken where a blade ends). Each sheen but the damp dull shares its base's
  field (bloom patches, dew, ribbons, blades), so the light sits where the stone is shaped.
- **Seeds 701 to 792**, apart from p4-b3's 401 to 511, so no two P4 layers share a noise field
  (p2-b1 draws the same numbers on another planet, as the seed rule is per planet).

## Batch p4-b2: P4's species 6 to 10 (ticket 602)

The `foothold-p4` pool's crystal and fossil uncommons and its three rares, kind slots 6 to 10 on
P4. P4's slots 1 to 5 (ticket 601, p4-b1) and 11 to 15 with its signature material (ticket 603,
p4-b3) came first, so this batch's report measures it against them (`planet_mates`). Slots 16 and
17 are #453's two appended fossil commons (grey marl, crinoid stem), whose skins are held. The
layers come from the species rows as before; no layer is shared with another batch or within this
one.

<!-- p4-b2 -->

| slot | species                           | base               | vein             | palette (shadow, body, light)                         | sheen               |
| ---- | --------------------------------- | ------------------ | ---------------- | ----------------------------------------------------- | ------------------- |
| 6    | `rose-quartz-quartzine`           | `rosy-haze`        | `quartz-masses`  | `rose-quartz-pink` `#6e5e62` `#dbbdc5` `#eddee2`      | `inner-glow`        |
| 7    | `trilobite-amberbone`             | `ripple-shale`     | `lobed-segments` | `trilobite-olive` `#4f523c` `#9ea579` `#ced2bc`       | `crest-gleam`       |
| 8    | `wire-silver-brassvein`           | `sulphide-tarnish` | `ramshorn-curls` | `wire-silver-bright` `#646668` `#c9cdcf` `#e4e6e7`    | `untarnished-gleam` |
| 9    | `watermelon-tourmaline-quartzine` | `two-tone-pencils` | `pencil-prisms`  | `watermelon-pink-green` `#266244` `#4cc388` `#e9bec8` | `prism-lines`       |
| 10   | `belemnite-amberbone`             | `radial-guards`    | `bullet-darts`   | `belemnite-amber` `#585422` `#b0a743` `#d8d3a1`       | `guard-crescents`   |

<!-- /p4-b2 -->

- **Bases:** massive milky quartz in a soft rosy haze, crossed by a wobbled net of pale healed
  fractures, each with a faint dark side; dark shale with ripple marks on a gentle slant (lines of
  2u + 6v, so six ripples cross the cell one way and two the other and it repeats), slow up one
  side and steep down the other, over fine laminae; a pale silver-white host gone black in heavy
  sulphide tarnish blotches with a brown fringe, bright silver threads through the clean stone;
  seven upright pencils side by side, each pink down its heart (its own width) and green at its
  rind, striated along its length and broken across here and there; a polished slab cut across the
  guards, a staggered 3 by 3 lattice of amber calcite discs, fibres radiating from a dark apical
  point through fine growth rings, in a smooth matrix.
- **Veins:** three big broken masses of quartz, flat-shaded faces meeting at blunt edges, and a few
  chips knocked off them; two whole trilobites, a head shield running out into genal spines with a
  raised glabella and eyes, eight thorax segments each cut into a raised axial ring and two pleurae
  swept back at their tips, and a small tail shield; four wires of native silver curled like a
  ram's horn, each heading turning with the cube of the length, so nearly straight from the root
  and curling tight at the tip; five thick three-sided pencils, edges rounded off and ends cut flat,
  lying side by side, and one stood on end to show its rounded triangle; bullet-shaped guards lying
  every way, a round body tapering to a long point, one snapped in two.
- **Sheens:** inner glow (light pools softly in the middle of each piece between the cracks, the
  healed cracks catch a thin line, a few glints); crest gleam (the crest of every ripple catches a
  thin broken line, the rest dull); untarnished gleam (the clean silver shines in a slow sweep and
  its threads flash, the tarnish takes no light); prism lines (each pencil throws back the lamp along
  two facet edges, one bright and one faint, with sharp glints); guard crescents (each guard throws a
  crescent of light from its rim on the lamp's side, the slab under a faint polish). Each sheen
  shares its base's field (fractures, ripples, tarnish, pencils, guards), so the light sits where
  the stone is shaped.
- **Watermelon tourmaline's two tones.** It is pink at heart and green at the rind, so its ramp's
  light end sits on a pink (345 degrees, `LIGHT_HUES` in `skin_layers.py`) at the usual luma, as
  alexandrite's shadow sits on its second colour; the body is still its hue slot, as the loader asks.
  The base's hearts run high on the ramp, so they read pink and the rinds green.
- **Seeds 801 to 892**, apart from p4-b1's 701 to 792 and p4-b3's 401 to 511, so no two P4 layers
  share a noise field.

## Batch p4-b3: P4's species 11 to 15 and its signature material (ticket 603)

The `foothold-p4` pool's three epics and two mythics, kind slots 11 to 15 on P4, and the skin of
the planet's signature material: the relic (Cogwork) ore at its band-5 tier, `relic_t14`, the
slotless 16th material of #453 E1. It has no species row, so its skin is the planet's `signatures`
row in the table (feature-slices 3.73). P4's slots 16 and 17 are #453's two appended fossil commons
(grey marl, crinoid stem), whose skins are held: this batch does not skin them. P4's slots 1 to 10
come with #601 and #602, after this batch, so their reports compare against it (`planet_mates`).
The species' layers come from their rows as before; no layer is shared with P1's batches or within
this one.

<!-- p4-b3 -->

| slot | wearer                        | base             | vein             | palette (shadow, body, light)                      | sheen             |
| ---- | ----------------------------- | ---------------- | ---------------- | -------------------------------------------------- | ----------------- |
| 11   | `clockspring-steel-brassvein` | `blued-temper`   | `coil-springs`   | `clockspring-blue` `#3c4662` `#788bc5` `#bcc5e2`   | `filed-gleam`     |
| 12   | `alexandrite-quartzine`       | `dichroic-zones` | `cyclic-twins`   | `alexandrite-shift` `#643649` `#43b18d` `#a1d8c6`  | `sector-flash`    |
| 13   | `ichthyosaur-eye-amberbone`   | `sutured-plates` | `sclerotic-ring` | `ichthyosaur-slate` `#505d60` `#9fbabf` `#cfdcdf`  | `greasy`          |
| 14   | `starsteel-brassvein`         | `watered-damask` | `star-bursts`    | `starsteel-lavender` `#5a5a69` `#b4b4d2` `#dadae8` | `watered-shimmer` |
| 15   | `painite-quartzine`           | `inner-feathers` | `spindle-spray`  | `painite-red` `#70262c` `#e04d59` `#f0a6ac`        | `fire-glint`      |
| sig. | P4's signature, `relic_t14`   | `riveted-plate`  | `broken-cogs`    | `cogwork-patina` `#236052` `#46c1a4` `#a2e0d2`     | `worn-brass`      |

<!-- /p4-b3 -->

- **Bases:** slow temper bands drifting over drawn steel with fine draw-file lines; soft zones of
  the stone's two colours; bone plates meeting at wavy sutures, pitted with pores; watered steel,
  thin layers folded into ripples; a deep body with curved healed-fracture feathers caught bright
  in it; corroded plate in seamed half-cell panels with rivet heads along both seams and patina
  pits.
- **Veins:** three coiled springs of wire lying on the face, standing clear of it; two sixlings,
  three long tabular crystals grown through each other at 60 degrees; the sclerotic ring, small
  bone plates lapped like shingles round the eye, one ring whole and one broken; six-rayed stars,
  one large and three small; five four-sided spindles sprayed from one root; two toothed cogs with
  their hubs, the larger one broken, and a sheared tooth beside it.
- **Sheens:** filed gleam (short strokes along the file lines, a few glints); sector flash (the
  six sectors of a twin glow in turn, soft at their sides, with sharp glints); greasy (a dull oily
  film, no glint); watered shimmer (the pale damask layers catch the light along their ripples);
  fire glint (few, very strong glints, each with a soft halo); worn brass (rivet heads and seam
  lips rubbed bright, scuffed patches between).
- **Alexandrite's colour change.** Alexandrite is green by lamplight and red by candle, so its
  ramp puts the shadow on a raspberry hue (335 degrees, `SHADOW_HUES` in `skin_layers.py`) at the
  usual half luma; the body is still its hue slot, as the loader asks. Its dark zones read red-violet,
  which also moves it off the signature's teal.
- **The signature's palette.** It has no hue slot, so its body is built the same way on a
  slot-shaped look inside the relic family's #151 bands (hue 155-168 degrees, luma 0.46-0.68):
  hue 166, saturation 0.5, luma 0.60 (`SIGNATURE_LOOKS`). The loader refuses a signature body
  outside those bands. Luma 0.60 rather than the band's top keeps it apart from the two pale skins
  under deuteranopia (0.66 gave 0.07 against starsteel; 0.60 gives 0.10).

## Batch p5-b1: P5's species 1 to 5 (ticket 604)

The `foothold-p5` pool's four commons and its metal uncommon, kind slots 1 to 5 on P5. P5's slots
16 and 17 are #453's two appended fossil commons (coprolite, ash bed), whose skins are held: this
batch does not skin them. P5's slots 6 to 15 and its signature material come with #605 and #606,
after this batch, so their reports compare against it (`planet_mates`). The layers come from the
species rows as before; no layer is shared with another batch or within this one.

<!-- p5-b1 -->

| slot | species                    | base                  | vein                 | palette (shadow, body, light)                    | sheen          |
| ---- | -------------------------- | --------------------- | -------------------- | ------------------------------------------------ | -------------- |
| 1    | `furnace-iron-brassvein`   | `scorched-scale`      | `fused-clinkers`     | `furnace-iron-red` `#523434` `#a56868` `#d2b4b4` | `burnt-matte`  |
| 2    | `magnetite-brassvein`      | `black-grain`         | `field-filings`      | `magnetite-black` `#403f46` `#7f7e8c` `#bfbec6`  | `steel-glints` |
| 3    | `selenite-blade-quartzine` | `split-lamellae`      | `swallowtail-blades` | `selenite-white` `#6f7071` `#dee1e2` `#eef0f0`   | `moon-sheen`   |
| 4    | `ember-agate-quartzine`    | `fortification-bands` | `split-geodes`       | `ember-agate-red` `#64383c` `#c97177` `#e4b8bb`  | `banded-gloss` |
| 5    | `chromite-brassvein`       | `leopard-nodules`     | `seed-pods`          | `chromite-steel` `#4a4852` `#9491a5` `#cac8d2`   | `wet-gloss`    |

<!-- /p5-b1 -->

- **Bases:** fired iron under flaking heat scale, two in five Voronoi cells flaked dark with pale
  cracked rims, over scorch clouds and a fine grain; a black granular mass of grains, twelve across
  the cell so they still show at 22 px, each its own tone, with dark seams; soft selenite sheets
  split along one cleavage (u + 3v, 16 sheets across, four tones in turn, so the lattice repeats),
  each sheet's peeled edge pale and fine fibres along it; agate's fortification bands nested round
  a few centres, with a pale quartz core; round black chromite seeds packed in a paler serpentine
  matrix, streaked with fine veinlets.
- **Veins:** clinkers, rough lumps (every vertex knocked) fused into three clumps; magnetite grit
  drawn into a lodestone's field, needle grains strung end to end round the circles through both
  poles (in the plane the field lines of two opposite poles are exactly those circles) and along the
  line between them; two swallowtail twins, pairs of flat blades from one root in a V, and two loose
  blades along the base's cleavage; two split geodes, a thick rind round a banded wall and a druse of
  small crystals pointing into the hollow, through which the base shows; a split pod's curved row of
  almond seeds and a few spilled beside it.
- **Sheens:** burnt matte (only the heat scale's lifted rims and a faint warm cloud take the light);
  steel glints (one grain facet in seven flashes whole, and pinpoint sparks); moon sheen (a cool soft
  glow along each sheet's peeled edge, waxing and waning across the face); banded gloss (alternate
  agate bands lit in a slow sweep, a few glints); wet gloss (a bright bead of light on each chromite
  seed). Each sheen shares its base's field (scale, grains, sheets, bands, seeds), so the light sits
  where the stone is shaped.
- **Seeds 601 to 691**, apart from every other batch's.

## Batch p5-b2: P5's species 6 to 10 (ticket 605)

The `foothold-p5` pool's crystal and fossil uncommons and its three rares, kind slots 6 to 10 on P5.
The layers come from the species rows as before; no layer is shared with another batch or within
this one. P5's slots 16 and 17, #453's coprolite and ash bed, stay held, and P5's slots 11 to 15
and its signature material come with #606. These layers were authored through the Blender MCP, in
the shared Blender (the procedure under Pipeline), and a second run wrote byte-identical cells.

<!-- p5-b2 -->

| slot | species                      | base             | vein              | palette (shadow, body, light)                    | sheen          |
| ---- | ---------------------------- | ---------------- | ----------------- | ------------------------------------------------ | -------------- |
| 6    | `peridot-quartzine`          | `oily-swirls`    | `olive-drops`     | `peridot-olive` `#475d1b` `#8eba36` `#c7dc9b`    | `oil-film`     |
| 7    | `shark-tooth-amberbone`      | `phosphate-beds` | `serrated-teeth`  | `shark-tooth-grey` `#474a51` `#8e94a2` `#c6cad0` | `enamel-glaze` |
| 8    | `wolfram-brassvein`          | `bladed-columns` | `crossed-bars`    | `wolfram-steel` `#4e5257` `#9ca5ae` `#ced2d6`    | `fibre-satin`  |
| 9    | `fire-garnet-quartzine`      | `ember-depths`   | `faceted-spheres` | `fire-garnet-red` `#70283a` `#e05074` `#f0a8ba`  | `ember-glow`   |
| 10   | `saurian-vertebra-amberbone` | `spongy-bone`    | `vertebra-column` | `saurian-bone` `#5c5c48` `#b7b78f` `#dbdbc7`     | `bone-dust`    |

<!-- /p5-b2 -->

- **Bases:** olivine's oily body, slow bands swirled round by a warp, clouded, with dark basalt
  flecks caught in it; a bone bed, six level beds of grey phosphatic sand, fine grit and dark
  phosphate pellets along the partings; wolframite grown in upright blades, eight across in two
  staggered rows, each its own tone and finely striated, dark seams between; a deep red body lit from
  inside, soft glowing cores where the stone is thickest; spongy bone, a pale lattice of struts round
  dark pores, eleven across so they still show at 22 px, with a few smooth patches of cortex.
- **Veins:** seven olive drops, each a plump body drawn to a point; three flat triangular teeth with
  fine serrations up their slightly hollow edges, each over its lobed root; a heap of square bars,
  three laid one way and two crossed over them on the diagonals; six round garnets, balls of flat
  facets, some half-sunk; a short run of four vertebrae along a gentle curve, each a waisted spool
  with its spine flared at the top and a process below.
- **Sheens:** oil film (light lying along the swirl bands, waxing and waning, never a glint); enamel
  glaze (long level streaks along the bed tops and a few sharp glints); fibre satin (a soft upright
  streak down every other blade, broken along its length); ember glow (a soft halo round each
  glowing core and a bright point in it); bone dust (a dry faint lift on the struts and pale specks;
  old bone takes no gloss). Each sheen shares its base's field (swirls, beds, blades, cores, pores),
  so the light sits where the stone is shaped.
- **Seeds 701 to 791**, apart from P5's other batch.

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
| `sheets/<batch>.distinct.json`          | per skin at 22 px: mean colour, luma, hue and rock contrast; per pair (and against the planet's other batches): distances    |
| `sheets/p<n>.scale.png`, `-x4`          | every skin of planet n so far, in slot order, as in `<batch>.scale`: written by each batch after the planet's first          |
| `skin_layers.py`                        | plain Python: the table and species rows, the palette ramp rule, the batches and the cell table writer                       |
| `layer_art.py`, `author_skin_layers.py` | Blender: one recipe per layer id (a layer with no recipe fails), and the authoring of sources and renders                    |
| `skin_post.py`                          | python3 (Pillow, numpy): the cells, the vein rims, the composites, the sheets and the distinctness report                    |

## Pipeline

```
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/mineral-skins/author_skin_layers.py -- [<kind>/<id> ...]   # sources, renders, skin-layers.json
python3 docs/art/mineral-skins/skin_post.py p3-b2                         # cells, composites, sheets
python3 docs/art/mineral-skins/skin_layers.py ramps p1-b1                 # the palette ramps of a batch's hue slots
```

Through the Blender MCP (p3-b1 on): the open Blender is shared, so first drop
`author_skin_layers`, `layer_art`, `skin_layers`, `ore_stage`, `author_tiles`, `ore_materials`,
`ore_shapes`, `ladder_scene` and `hero_species` from `sys.modules` and put this worktree's
`docs/art/mineral-skins`, `docs/art/ores`, `docs/art/ore-ladder`, `docs/art/ore-heroes` and
`scripts/art` first on `sys.path`, then `import author_skin_layers` and call
`author(['vein/<id>', ...])`. `reset_scene` empties the open file in place, so the MCP keeps its
output. The post step reads every listed layer's render, so a fresh worktree authors them all once
(the committed cells come out byte-identical); restore the earlier batches' re-saved `.blend`
files from git afterwards. A batch's noise seeds stay apart from the other batches of its planet.

A new batch adds its layer and skin rows to `mineralSkins.json` (the palette ramp from
`skin_layers.py ramps`: shadow at half the hue slot's luma, light halfway to white), a recipe per
new layer id in `layer_art.py`, and its slots to `BATCHES` in `skin_layers.py`. Renders land in
`art/build/mineral-skins/` (gitignored); the post step keeps the committed cell of any layer with
no render there, so a checkout authors only its batch's new layers. Cycles on the CPU with seed 0 and fixed threads: a second
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

From `sheets/p1-b3.distinct.json`, at 22 px a tile. The first pair is the batch's own; the rest
are its closest pairs against p1-b1 and p1-b2 (the report holds all 21):

<!-- p1-b3-readings -->

| pair                               | colour apart | deuteranopia apart | luma apart | texture apart |
| ---------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| corundum vs beryl                  | 0.657        | 0.532              | 0.028      | 0.053         |
| fluorite vs corundum (least apart) | 0.232        | 0.152              | 0.039      | 0.074         |
| copper vs corundum                 | 0.336        | 0.460              | 0.090      | 0.065         |
| ironstone vs beryl                 | 0.367        | 0.136              | 0.053      | 0.067         |
| amber vs beryl                     | 0.369        | 0.259              | 0.076      | 0.064         |
| tin vs corundum                    | 0.369        | 0.431              | 0.142      | 0.096         |

<!-- /p1-b3-readings -->

Blue corundum is the planet's only blue and red beryl its only red, so colour alone parts each from
the other ten. The closest pair is corundum against violet fluorite, the other cool hue. There,
corundum's silk, star and barrels stand against fluorite's nested squares and twinned cubes, and the
pair stays apart under deuteranopia (0.15). Under deuteranopia the beryl drifts toward ironstone's
khaki (0.14). The beryl is still the paler, smoother skin, with a bright bar and upright columns
where ironstone has dark blotches and nuggets. Every new skin sits above its rock (contrast 1.56
for corundum, 1.63 for beryl). Checked by eye on `p1-b3.phone-x4.png`, `p1-b3.desktop.png`, the
`p1-b3.scale-x4` copies and `p1.scale-x4.png` with its `-deutan` and `-gray` copies, now all
twelve P1 skins side by side.

From `sheets/p2-b1.distinct.json`, at 22 px a tile over P2's band 3 rock (luma 0.29). It is P2's
first batch, so these are all ten pairs:

<!-- p2-b1-readings -->

| pair                            | colour apart | deuteranopia apart | luma apart | texture apart |
| ------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| slate vs ochre                  | 0.408        | 0.322              | 0.078      | 0.076         |
| slate vs tin gravel             | 0.223        | 0.226              | 0.136      | 0.089         |
| slate vs sulphur                | 0.596        | 0.590              | 0.209      | 0.078         |
| slate vs graphite (least apart) | 0.060        | 0.058              | 0.025      | 0.092         |
| ochre vs tin gravel             | 0.510        | 0.469              | 0.214      | 0.082         |
| ochre vs sulphur                | 0.474        | 0.481              | 0.287      | 0.062         |
| ochre vs graphite               | 0.357        | 0.273              | 0.053      | 0.088         |
| tin gravel vs sulphur           | 0.554        | 0.524              | 0.073      | 0.074         |
| tin gravel vs graphite          | 0.267        | 0.275              | 0.161      | 0.100         |
| sulphur vs graphite             | 0.579        | 0.586              | 0.234      | 0.084         |

<!-- /p2-b1-readings -->

The materials table gives P2's slate grey (hue 218, luma 0.56) and graphite (238, 0.52) all but one
colour, so texture has to part them. That is the closest pair of the batch. Slate is laid on a slant,
with broad diagonal beds and a stack of level slabs, and the faint lip of each sheet catches the
light. Graphite has no ruled line: deep and pale smears run level, high in contrast, under bright
slick streaks and hexagonal flake books. Its first draft carried level shear lines, which echoed the
slate's sheet edges, so they were taken out; the graphite smears were deepened and the slick
brightened, which lifted the texture distance from 0.079 to 0.092. At 22 px the slate reads as
blue-grey diagonal bands and the graphite as neutral level streaks. The first draft of grain caps
read a 4D Voronoi distance that seldom gets small, so it came out almost black. It now reads the
grains' distance to their edges, so each grain of tin gravel has its cap. Rust ochre is the only warm
red and sulphur the only yellow, the brightest skin (contrast 2.45). Every skin sits above its rock
(contrast 1.60 for rust ochre to 2.45 for sulphur). Checked by eye on `p2-b1.phone-x4.png`,
`p2-b1.desktop.png` and the `p2-b1.scale-x4` copies with `-deutan` and `-gray`.

From `sheets/p2-b2.distinct.json`, at 22 px a tile over P2's band 3 rock (luma 0.29). The first six
pairs are within the batch; the rest are the closest pairs against p2-b1's skins (the report holds
all 26):

<!-- p2-b2-readings -->

| pair                               | colour apart | deuteranopia apart | luma apart | texture apart |
| ---------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| cobalt vs bismuth                  | 0.306        | 0.383              | 0.203      | 0.081         |
| cobalt vs moonstone                | 0.606        | 0.641              | 0.372      | 0.086         |
| cobalt vs galena                   | 0.391        | 0.429              | 0.231      | 0.079         |
| bismuth vs moonstone               | 0.326        | 0.263              | 0.169      | 0.104         |
| bismuth vs galena                  | 0.153        | 0.070              | 0.028      | 0.093         |
| moonstone vs galena                | 0.244        | 0.243              | 0.141      | 0.101         |
| tin gravel vs galena (least apart) | 0.020        | 0.016              | 0.009      | 0.091         |
| tin gravel vs bismuth              | 0.144        | 0.072              | 0.019      | 0.087         |
| slate vs cobalt                    | 0.202        | 0.238              | 0.086      | 0.083         |
| slate vs bismuth                   | 0.220        | 0.229              | 0.117      | 0.090         |
| graphite vs cobalt                 | 0.221        | 0.242              | 0.061      | 0.090         |
| slate vs galena                    | 0.242        | 0.241              | 0.145      | 0.092         |

<!-- /p2-b2-readings -->

The materials table gives galena grey (hue 220, luma 0.70) and tin gravel (hue 205, luma 0.74) one
colour to the eye, so the closest pair on the planet is galena against tin gravel, and texture has
to part them. Galena is a checker of satin blocks, level grain against upright, under square-on
dice. Tin gravel is a mosaic of round grains with dark grit between. The first galena draft gave
both kinds of block one tone, and at 22 px its weave blurred into the same pale grey as the gravel
(texture 0.079). The level blocks are now darker than the upright ones, so the checker still shows
on the phone, and the texture distance is 0.091, as far apart as slate and graphite. Under
deuteranopia the bismuth's cyan falls toward the two greys (0.07). Its stairs still part it: high
contrast L-shaped treads in a three-by-three lattice, where galena has a fine four-by-four checker
and tin gravel has no straight line. Cobalt bloom is the planet's only saturated blue, and moonstone
its palest skin. The first cobalt draft sat low on its rock (contrast 1.43), because the blooms
were small on a dark matrix, and its glints read a 4D Voronoi distance that seldom gets small, so
they hardly showed (the trap p2-b1's grain caps met). The blooms are now wider, and the glints are
sprinkled. Every skin sits above its rock, with contrast from 1.58 for cobalt bloom to 2.68 for
moonstone lens. Checked by eye on `p2-b2.phone-x4.png`, `p2-b2.desktop.png`, the `p2-b2.scale-x4`
copies, and `p2.scale-x4.png` with its `-deutan` and `-gray` copies (P2's nine skins side by side).

From `sheets/p3-b1.distinct.json`, at 22 px a tile over P3's band 3 rock (luma 0.29). It is P3's
first batch, so these are all ten pairs; its pairs against p3-b2 are in `p3-b2.distinct.json`:

<!-- p3-b1-readings -->

| pair                              | colour apart | deuteranopia apart | luma apart | texture apart |
| --------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| pig iron vs soot zinc             | 0.164        | 0.169              | 0.098      | 0.100         |
| pig iron vs rail quartz           | 0.350        | 0.351              | 0.207      | 0.065         |
| pig iron vs smoke calcite (least) | 0.103        | 0.095              | 0.053      | 0.056         |
| pig iron vs step bismuth          | 0.254        | 0.158              | 0.071      | 0.071         |
| soot zinc vs rail quartz          | 0.186        | 0.183              | 0.109      | 0.094         |
| soot zinc vs smoke calcite        | 0.068        | 0.079              | 0.045      | 0.100         |
| soot zinc vs step bismuth         | 0.174        | 0.091              | 0.027      | 0.100         |
| rail quartz vs smoke calcite      | 0.250        | 0.259              | 0.154      | 0.071         |
| rail quartz vs step bismuth       | 0.223        | 0.234              | 0.136      | 0.070         |
| smoke calcite vs step bismuth     | 0.173        | 0.076              | 0.018      | 0.074         |

<!-- /p3-b1-readings -->

The materials table gives these five four cool near-greys: pig iron (hue 210, luma 0.55), smoke
calcite (232, 0.58), soot zinc (195, 0.62) and rail quartz (190, 0.80). Pig iron and smoke calcite
are the closest pair of the batch. The pig iron's blowholes were made larger, darker and more
numerous until the pocked face still showed at 22 px, and its base lifted only so far that the skin
averages its own hue slot's luma; the calcite's rhomb cleavage was drawn bold, so at a phone's tile
it reads as diagonal stripes against the pig iron's even pepper. Soot zinc is the one with broad
dark drifts, bright swipes and a lapped patch of scales. Step bismuth is the batch's only warm hue;
under deuteranopia it drifts toward the calcite (0.076), where the oxide fringes and hollow hoppers
stand against the rhombs.

Against p3-b2 the closest pair on the planet is **rail quartz vs native platinum** (colour 0.014,
deuteranopia 0.015, texture 0.059): their hue slots are all but one (190 at 0.80, 220 at 0.78).
Rail quartz is laid level for that reason, with light and dark bands, rods and silk threads all
running across the face, while the platinum's sweeps and pebble stringer run on the diagonal; at
22 px the one reads as bands and the other as streaks. The next closest are step bismuth vs coiled
ammonite (0.092 / 0.075: violet fringes and hoppers against rose bands and coils) and soot zinc vs
coiled ammonite under deuteranopia (0.017, texture 0.095: drifts and scales against level bands).
Every skin sits above its rock (contrast 1.84 for pig iron to 2.45 for rail quartz). Checked by eye
on `p3-b1.phone-x4.png`, `p3-b1.desktop.png`, the `p3-b1.scale-x4` copies with `-deutan` and
`-gray`, and `p3.scale-x4.png` (P3's ten skins side by side, with its blind copies).

From `sheets/p3-b2.distinct.json`, at 22 px a tile over P3's band 3 rock (luma 0.29). The ten pairs
below are within the batch; the report also holds its 25 pairs against p3-b1 (ticket 598, above):

<!-- p3-b2-readings -->

| pair                               | colour apart | deuteranopia apart | luma apart | texture apart |
| ---------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| apatite vs shell                   | 0.348        | 0.104              | 0.087      | 0.062         |
| apatite vs platinum                | 0.451        | 0.262              | 0.162      | 0.059         |
| apatite vs topaz                   | 0.327        | 0.272              | 0.086      | 0.064         |
| apatite vs ammonite                | 0.406        | 0.115              | 0.058      | 0.070         |
| shell vs platinum                  | 0.272        | 0.262              | 0.075      | 0.049         |
| shell vs topaz                     | 0.360        | 0.322              | 0.001      | 0.055         |
| shell vs ammonite                  | 0.188        | 0.186              | 0.029      | 0.059         |
| platinum vs topaz                  | 0.225        | 0.144              | 0.076      | 0.056         |
| platinum vs ammonite (least apart) | 0.180        | 0.184              | 0.104      | 0.063         |
| topaz vs ammonite                  | 0.275        | 0.158              | 0.028      | 0.059         |

<!-- /p3-b2-readings -->

The five hue slots are far apart (green, cream, near-white, sky blue, rose), so colour parts every
pair. The closest, platinum against ammonite, are told apart by luma (platinum is the planet's
brightest skin, 0.77 against 0.67) and by direction: platinum's sweeps and pebble stringer run
diagonal, the ammonite's nacre bands run level round its coils. Shell against topaz have one luma,
but cream against blue keep them 0.32 apart even under deuteranopia. With deuteranopia the apatite
turns khaki beside the shell's yellow and the ammonite's grey (0.10 and 0.12): apatite is the
darkest of the three, with upright streaks and end-on hexagons where the shell has rings and fans
and the ammonite level bands and spirals. Every skin sits above P3's slate rock (contrast 1.95 for
apatite to 2.43 for platinum). Checked by eye on `p3-b2.phone-x4.png`, `p3-b2.desktop.png` and
the `p3-b2.scale-x4` copies with `-deutan` and `-gray`. A batch is measured against all of its
planet's other batches (`planet_mates`), so its post holds p3-b2's pairs against p3-b1 and p3-b3,
and writes the planet strip `p3.scale`.

From `sheets/p3-b3.distinct.json`, at 22 px a tile over P3's band 3 rock (luma 0.29). The report
holds the 15 pairs within the batch and 60 against p3-b1 and p3-b2. The closest pairs:

<!-- p3-b3-readings -->

| pair                                   | colour apart | deuteranopia apart | luma apart | texture apart |
| -------------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| soot zinc vs meteoric iron (least)     | 0.036        | 0.035              | 0.012      | 0.102         |
| smoke calcite vs meteoric iron         | 0.061        | 0.059              | 0.033      | 0.083         |
| rail quartz vs opal jaw                | 0.077        | 0.041              | 0.014      | 0.062         |
| platinum vs opal jaw                   | 0.088        | 0.053              | 0.023      | 0.055         |
| ammonite vs meteoric iron              | 0.104        | 0.039              | 0.008      | 0.074         |
| apatite vs signature                   | 0.132        | 0.124              | 0.080      | 0.056         |
| opal jaw vs heart diamond (in batch)   | 0.189        | 0.112              | 0.076      | 0.056         |
| meteoric iron vs star sapphire (batch) | 0.206        | 0.269              | 0.078      | 0.075         |

<!-- /p3-b3-readings -->

Meteoric iron (hue 237, luma 0.64) is one of P3's cool near-greys, beside p3-b1's soot zinc,
smoke calcite and pig iron. Its mean colour all but meets soot zinc's (0.036), so texture keeps
them apart, the largest texture gap of the list: at 22 px the iron is fine diagonal bright streaks
of the Widmanstätten bands, the zinc broad dark drifts and bright swipes, the calcite a diamond
lattice. Native platinum, rail quartz and opal jaw share a luma near 0.79. The opal's patch mosaic
was drawn bold and its jawbone and teeth thick, so it reads as blotches and a level jaw against
the platinum's diagonal sweeps and the rail quartz's level bands. Coiled ammonite and meteoric
iron share a luma (0.67): the crosshatch stands against the ammonite's level waves and spirals.
The signature's teal is 0.13 from green apatite: it is darker (0.53 against 0.61), with gear
wheels and a ring-grained plate where the apatite has end-on hexagons and upright striae. Every
new skin sits above P3's slate rock (contrast 1.71 for the signature to 2.72 for heart diamond).
Checked by eye on `p3-b3.phone-x4.png`, `p3-b3.desktop.png`, the `p3-b3.scale-x4` copies and
`p3.scale-x4.png` with its `-deutan` and `-gray` copies, all sixteen P3 skins side by side.

From `sheets/p4-b1.distinct.json`, at 22 px a tile over P4's band 3 rock (`palette.planet_2`, luma
0.29). The first ten pairs are within the batch; the rest are the closest pairs against p4-b3's
skins and P4's signature (the report holds all 40):

<!-- p4-b1-readings -->

| pair                                                  | colour apart | deuteranopia apart | luma apart | texture apart |
| ----------------------------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| cobalt bloom vs antimony (least apart)                | 0.185        | 0.115              | 0.071      | 0.094         |
| bog iron vs cobalt bloom                              | 0.255        | 0.245              | 0.079      | 0.084         |
| rain quartz vs antimony                               | 0.263        | 0.264              | 0.153      | 0.077         |
| bog iron vs canal jasper                              | 0.289        | 0.075              | 0.020      | 0.097         |
| canal jasper vs antimony                              | 0.316        | 0.242              | 0.130      | 0.107         |
| bog iron vs antimony                                  | 0.337        | 0.317              | 0.150      | 0.076         |
| cobalt bloom vs rain quartz                           | 0.366        | 0.375              | 0.224      | 0.084         |
| cobalt bloom vs canal jasper                          | 0.380        | 0.174              | 0.059      | 0.106         |
| rain quartz vs canal jasper                           | 0.566        | 0.498              | 0.283      | 0.097         |
| bog iron vs rain quartz                               | 0.569        | 0.571              | 0.303      | 0.061         |
| alexandrite vs canal jasper (planet-wide least apart) | 0.067        | 0.066              | 0.007      | 0.117         |
| signature vs antimony                                 | 0.308        | 0.045              | 0.021      | 0.079         |
| starsteel vs antimony                                 | 0.121        | 0.113              | 0.051      | 0.101         |
| ichthyosaur eye vs rain quartz                        | 0.129        | 0.103              | 0.065      | 0.047         |
| painite vs bog iron                                   | 0.251        | 0.101              | 0.008      | 0.048         |
| alexandrite vs cobalt bloom                           | 0.355        | 0.111              | 0.052      | 0.121         |

<!-- /p4-b1-readings -->

Within the batch every pair stands well apart; the closest, cobalt bloom against antimony, still
differs by 0.185 in colour, and pink bloom patches stand against grey slanted blades. Under
deuteranopia bog iron and canal jasper come closest (0.075): there the crumbs and clods stand
against level ribbons and cobbles. Planet-wide the materials table gives canal jasper nearly
alexandrite's green (hue slots 140 and 160 at lumas 0.50 and 0.55), so colour barely parts them
(0.067). Texture does, by the largest margin in the report (0.117): the jasper is level dark and
pale ribbons with flat cobbles, the alexandrite soft raspberry-shadowed zones with two sixlings.
The jasper sits on its own slot's luma (0.50), a shade under the alexandrite. Under deuteranopia
antimony and P4's signature go the same grey (0.045). A brighter antimony did not part them (its
luma at 0.67 left them 0.042 apart, and closed starsteel to 0.061), so the antimony sits a shade
under its slot (luma 0.63) and texture parts the two: steep bladed stibnite with broom sprays
against riveted half-cell panels with rivet rows and broken cogs. Rain quartz is the planet's
palest skin, dew-beaded, apart from the ichthyosaur eye's bone plates. Every skin sits above its
rock (contrast 1.57 for bog iron to 2.47 for rain quartz). Checked by eye on `p4-b1.phone-x4.png`,
`p4-b1.desktop.png`, the `p4-b1.layers.jpg` sheet and the planet strip `p4.scale-x4` with its
`-deutan` and `-gray` copies.

From `sheets/p4-b2.distinct.json`, at 22 px a tile over P4's band 3 rock (`palette.planet_2`, luma
0.29). The first ten pairs are within the batch; the rest are the closest pairs against p4-b1's
and p4-b3's skins and P4's signature (the report holds all 65):

<!-- p4-b2-readings -->

| pair                                                 | colour apart | deuteranopia apart | luma apart | texture apart |
| ---------------------------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| rose quartz vs wire silver (batch least apart)       | 0.130        | 0.075              | 0.048      | 0.099         |
| trilobite vs belemnite                               | 0.207        | 0.194              | 0.024      | 0.072         |
| trilobite vs watermelon tourmaline                   | 0.226        | 0.064              | 0.011      | 0.073         |
| trilobite vs wire silver                             | 0.235        | 0.223              | 0.084      | 0.115         |
| rose quartz vs trilobite                             | 0.325        | 0.280              | 0.132      | 0.062         |
| wire silver vs watermelon tourmaline                 | 0.320        | 0.160              | 0.095      | 0.107         |
| watermelon tourmaline vs belemnite                   | 0.365        | 0.256              | 0.013      | 0.072         |
| rose quartz vs watermelon tourmaline                 | 0.446        | 0.220              | 0.143      | 0.067         |
| wire silver vs belemnite                             | 0.427        | 0.409              | 0.108      | 0.109         |
| rose quartz vs belemnite                             | 0.487        | 0.454              | 0.156      | 0.060         |
| rose quartz vs rain quartz (planet-wide least apart) | 0.105        | 0.069              | 0.028      | 0.054         |
| wire silver vs starsteel                             | 0.061        | 0.072              | 0.026      | 0.118         |
| wire silver vs ichthyosaur eye                       | 0.068        | 0.045              | 0.011      | 0.106         |
| watermelon tourmaline vs signature                   | 0.127        | 0.086              | 0.003      | 0.071         |
| rose quartz vs ichthyosaur eye                       | 0.170        | 0.059              | 0.037      | 0.053         |

<!-- /p4-b2-readings -->

Within the batch the closest pair, rose quartz against wire silver, still differs by 0.130 in
colour, and soft cracked haze stands against black tarnish blotches. Under deuteranopia trilobite
and watermelon tourmaline come closest (0.064): slanted ripples against upright pink-hearted
pencils. The batch lands in P4's crowd of pale cool skins (rain quartz, ichthyosaur eye, starsteel,
antimony, lumas 0.63 to 0.79). At first rose quartz and wire silver went the same grey under
deuteranopia (0.023, silver at luma 0.74). Black tarnish is the wire silver's pattern, so its
tarnish now runs heavy and its clean stone a shade low: the skin averages luma 0.71, under its slot
(0.80), between the ichthyosaur eye (0.72) and the rose (0.76). Its nearest are then starsteel in
colour (0.061) and the ichthyosaur eye under deuteranopia (0.045, the floor P4's first batch
accepted for antimony), and texture parts both by the widest margins in the report (0.118 and
0.106): tarnish blotches and ram's-horn curls against watered damask and plated bone. Planet-wide
the least apart are rose quartz and rain quartz (0.105 in colour, 0.054 in texture), pink against
blue-grey: a soft cracked haze with faceted masses against dew beads and crossed needle sheaves.
Watermelon tourmaline sits on the signature's luma (0.003 apart), but its green-and-pink upright
pencils stand 0.127 apart in colour from the teal riveted panels. Every skin sits above its rock
(contrast 1.92 for belemnite to 2.38 for rose quartz). Checked by eye on `p4-b2.phone-x4.png`,
`p4-b2.desktop.png`, the `p4-b2.layers.jpg` sheet and the planet strip `p4.scale-x4` with its
`-deutan` and `-gray` copies, all 16 P4 skins so far.

From `sheets/p4-b3.distinct.json`, at 22 px a tile over P4's band 3 rock (`palette.planet_2`, the
slate P3 wears too, luma 0.29). P4 has no other batch yet, so these are the batch's own fifteen
pairs; the closest eight:

<!-- p4-b3-readings -->

| pair                                       | colour apart | deuteranopia apart | luma apart | texture apart |
| ------------------------------------------ | ------------ | ------------------ | ---------- | ------------- |
| ichthyosaur eye vs starsteel (least apart) | 0.073        | 0.073              | 0.038      | 0.083         |
| clockspring vs starsteel                   | 0.208        | 0.210              | 0.121      | 0.105         |
| alexandrite vs signature                   | 0.227        | 0.231              | 0.102      | 0.105         |
| clockspring vs ichthyosaur eye             | 0.243        | 0.283              | 0.159      | 0.097         |
| clockspring vs alexandrite                 | 0.246        | 0.215              | 0.052      | 0.121         |
| clockspring vs signature                   | 0.265        | 0.216              | 0.050      | 0.101         |
| ichthyosaur eye vs signature               | 0.343        | 0.131              | 0.109      | 0.054         |
| starsteel vs signature                     | 0.365        | 0.099              | 0.071      | 0.084         |

<!-- /p4-b3-readings -->

The materials table gives P4 two pale cool hue slots in this batch, ichthyosaur eye (190 degrees,
luma 0.70) and starsteel (240 degrees, luma 0.72), so colour barely parts them (0.07), as it barely
parts P1's tin, lead and nickel. Texture has to: the eye is a crackle of bone plates with a shingled
ring, starsteel tight horizontal ripples with stars. Alexandrite and the signature are the two
greens of the planet: alexandrite is darker (luma 0.51 against 0.61) with raspberry zones and two
asterisk-shaped sixlings, the signature a brighter teal in riveted panels with cogs. Painite is the
planet's only red so far and clockspring its only mid blue. Under deuteranopia the eye, starsteel
and the signature all go pale grey (0.07 to 0.13 apart); there the plates and ring, the ripples and
the panels with their rivet rows keep them apart. Every skin sits above its rock (contrast 1.60 for
painite to 2.27 for the eye). Checked by eye on `p4-b3.phone-x4.png`, `p4-b3.desktop.png`, the
`p4-b3.skins.jpg` sheet and the `p4-b3.scale-x4` copies with `-deutan` and `-gray`.

From `sheets/p5-b1.distinct.json`, at 22 px a tile over P5's band 3 rock (`palette.planet_2`, the
slate P3 and P4 wear, luma 0.29). P5 has no other batch yet, so these are all ten pairs:

<!-- p5-b1-readings -->

| pair                                | colour apart | deuteranopia apart | luma apart | texture apart |
| ----------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| magnetite vs chromite (least apart) | 0.166        | 0.162              | 0.091      | 0.084         |
| furnace iron vs ember agate         | 0.186        | 0.166              | 0.094      | 0.059         |
| furnace iron vs magnetite           | 0.190        | 0.127              | 0.024      | 0.084         |
| ember agate vs chromite             | 0.249        | 0.152              | 0.021      | 0.058         |
| magnetite vs ember agate            | 0.273        | 0.152              | 0.070      | 0.076         |
| furnace iron vs chromite            | 0.286        | 0.263              | 0.115      | 0.072         |
| selenite blade vs chromite          | 0.401        | 0.414              | 0.244      | 0.053         |
| selenite blade vs ember agate       | 0.495        | 0.484              | 0.265      | 0.053         |
| magnetite vs selenite blade         | 0.564        | 0.572              | 0.335      | 0.075         |
| furnace iron vs selenite blade      | 0.636        | 0.646              | 0.359      | 0.061         |

<!-- /p5-b1-readings -->

The materials table gives P5 two reds in this batch, furnace iron (0 degrees, luma 0.48) and ember
agate (356 degrees, luma 0.55), and two blue-greys, magnetite (244, 0.50) and chromite (250, 0.58).
With the bases at a mean of one half the reds came out 0.088 apart (luma 0.027). So, as P3's pig
iron sits a shade under its slot, the scorched scale was lowered and the agate's bands raised until
the skins average their slots' lumas (0.48 and 0.58). That puts them 0.19 apart; the crackle of dark
flakes and clinkers still stands against nested rings and geodes. Magnetite and chromite are parted
by luma and by grain: magnetite is a coarse mosaic of grains with flashing facets and the loops of
the field, chromite a pale matrix pocked with round black seeds, each with its bead of light. Under
deuteranopia both reds go khaki (0.17); the flakes against the rings keep them apart. Selenite is
the planet's only near-white. Every skin sits above its rock (contrast 1.57 for furnace iron to
2.63 for selenite). Checked by eye on `p5-b1.phone-x4.png`, `p5-b1.desktop.png`, the
`p5-b1.layers.jpg` sheet and the `p5-b1.scale-x4` copies with `-deutan` and `-gray`.

From `sheets/p5-b2.distinct.json`, at 22 px a tile over P5's band 3 rock (luma 0.29). The first
ten pairs are within the batch; the rest are its closest pairs against p5-b1 (the report holds all
25):

<!-- p5-b2-readings -->

| pair                              | colour apart | deuteranopia apart | luma apart | texture apart |
| --------------------------------- | ------------ | ------------------ | ---------- | ------------- |
| wolfram vs saurian vertebra       | 0.141        | 0.148              | 0.054      | 0.088         |
| shark tooth vs wolfram            | 0.142        | 0.146              | 0.085      | 0.122         |
| shark tooth vs saurian vertebra   | 0.228        | 0.244              | 0.139      | 0.130         |
| peridot vs saurian vertebra       | 0.328        | 0.276              | 0.062      | 0.075         |
| peridot vs shark tooth            | 0.356        | 0.365              | 0.077      | 0.119         |
| peridot vs wolfram                | 0.399        | 0.377              | 0.008      | 0.069         |
| shark tooth vs fire garnet        | 0.402        | 0.172              | 0.079      | 0.122         |
| fire garnet vs saurian vertebra   | 0.437        | 0.305              | 0.218      | 0.083         |
| wolfram vs fire garnet            | 0.455        | 0.285              | 0.164      | 0.063         |
| peridot vs fire garnet            | 0.499        | 0.268              | 0.156      | 0.061         |
| chromite vs wolfram (least apart) | 0.078        | 0.087              | 0.050      | 0.070         |
| chromite vs shark tooth           | 0.075        | 0.063              | 0.035      | 0.121         |
| magnetite vs shark tooth          | 0.096        | 0.099              | 0.056      | 0.129         |
| ember agate vs fire garnet        | 0.187        | 0.105              | 0.093      | 0.056         |
| furnace iron vs fire garnet       | 0.224        | 0.066              | 0.001      | 0.064         |

<!-- /p5-b2-readings -->

The materials table gives P5 four cool near-greys across its first two batches: magnetite (244
degrees, luma 0.50), shark tooth (222, 0.58), chromite (250, 0.58) and wolfram (212, 0.64). Colour
barely parts them (0.08 for chromite against wolfram and against shark tooth), so the bases are
drawn in three directions that still show at 22 px. The bone bed is laid level in bold beds, wolfram
stands in upright blades, and chromite stays round black seeds in a pale matrix; so the shark tooth
and chromite, one colour, are 0.12 apart in texture, among the report's largest. Fire garnet,
P5's third red, is the saturated one: 0.19 from ember agate and 0.22 from furnace iron. Its base
first came out a shade dark (luma 0.47), so its body was lifted until the skin averages its slot's
luma (0.48 against 0.50). The bone's pores were made larger and denser until they showed at a
phone's tile, which also brought the saurian vertebra down onto its slot (0.70). Under deuteranopia
fire garnet and furnace iron both go khaki at one luma (0.066 apart). There, soft glowing cores and
faceted balls stand against dark flakes with pale rims and clinkers. Peridot is the planet's only
green. Every skin sits above its rock (contrast 1.57 for fire garnet to 2.22 for saurian vertebra).
Checked by eye on `p5-b2.phone-x4.png`, `p5-b2.desktop.png`, the `p5-b2.layers.jpg` sheet, the
`p5-b2.scale-x4` copies with `-deutan` and `-gray`, and `p5.scale-x4.png` (P5's ten skins side by
side, with its blind copies).

Known limits: the cells are unlit tone, so a skin does not turn with the vehicle's lamp (the vein's
own shading is baked from the stage's fixed headlamp, as the hero sprites are); the earthy sheen
is all but empty by design.
