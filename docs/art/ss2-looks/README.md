# SS2 biome look tiles

The ground motif tiles of the eight biome looks every solar system past the first draws from
([SS2-4 art for missing archetypes/materials (#778)](https://github.com/bjor2/steampunk-miner/issues/778),
under [SS2 map: solar system 2 (generated) (#774)](https://github.com/bjor2/steampunk-miner/issues/774)
and Planet & Narrative's palette lock of 23 Oct on
[SS2-1 archetype palette + naming rules (#775)](https://github.com/bjor2/steampunk-miner/issues/775)):
one `ground-look-<look>` tile per look of `src/features/solar-systems/palette.json`, the lock's
ground motif in its hue pair, plus the colour row a planet wearing the look is drawn in
(`src/features/solar-systems/lookArt.json`, in the shape of a planet row's look, ticket 653). The
contact-sheet check the lock's acceptance 3 asks for (every pair distinct in hue and motif at 360 px
and 1280+) runs over the measures of the shipped maps, below.

Authored in Blender 4.2.9 on the shared box, headless, on the ground tile stage of
[docs/art-pipeline.md](../../art-pipeline.md) "Ground and casing tiles": each tile is one 4 x 4 m
quad with a procedural material that repeats at its edges, built on the node graph of
`scripts/art/author_tiles.py` (S7d), baked by `npm run art:export -- ground-look-<look>` into a
1024 px albedo and normal map. `author_look_tiles.py` wrote the first version of the eight sources;
from then on the `.blend` files under `art/blender/ground-look-<look>/` are the sources (Git LFS).
No tile glows: the basalt joints and the honeycomb rims are painted light, not emissive.

## The eight looks

| look               | act            | hue pair           | ground motif         | the tile                                                                                            |
| ------------------ | -------------- | ------------------ | -------------------- | --------------------------------------------------------------------------------------------------- |
| `cinder-basalt`    | fire           | black/orange glow  | hex basalt columns   | near-black hexagonal columns, five across the tile, bent a little, with thin orange-lit joints      |
| `ash-plain`        | fire           | grey/ember red     | layered ash strata   | nine soft grey ash beds with fine laminae, ember-red seams smouldering between some of them         |
| `rime-shelf`       | frost          | white/cyan         | cracked ice plates   | teal ice broken into large plates by dark water-filled cracks, pale frost blooming on the plates    |
| `hoarfrost-vein`   | frost          | slate/pale violet  | needle crystal veins | pale violet needles crossing a slate ground on the rising diagonal, a weaker set on the falling one |
| `lode-banded`      | lodestone      | rust/steel blue    | banded iron stripes  | twelve rust and dark-steel bands with sharp edges and hairlines, folded into waves across the tile  |
| `gauss-field`      | lodestone      | gunmetal/teal      | curled filings       | teal iron filings curling as the contour lines of a warped field over dark gunmetal                 |
| `hollow-honeycomb` | hollow         | umber/amber        | void honeycomb       | fourteen small hexagonal cells across, amber rims opening into near-black hollows                   |
| `brass-verdigris`  | foothold.heavy | brass/green patina | riveted plate shale  | 1 m brass plates with a rivet row along each seam, green patina spreading over faint shale laminae  |

Rules the looks keep: the mean colour of a tile is its look's surface rock from `lookArt.json`
(within an eighth of the channel range), so a tint of one draws it as its row says, the way the
strata tiles sit at planet 1's band colours; no rock of a row is brighter than the brightest
archetype host rock, so every materials hue slot stays above it (#151); any two looks' rock
surface, horizon and band colour lie at least 32 of 255 channel steps apart (ticket 653's rule);
materials are dielectric, because Cycles' diffuse pass is black on metal. Nothing draws a later
system's look yet: `planetRow` is keyed on the planet index alone (feature-slices 3.88).

## The contact sheet

`python3 docs/art/ss2-looks/look_post.py` reads each look's bake (`art/build/ground-look-<look>/`,
written by the export) and writes:

- `look-reads.json`: per look, the SHA-256 of the shipped albedo map and its measures at the two
  contact-sheet screens, a 4 m tile box-filtered to 120 px (360x640) and 268 px (1280x800), the
  tile's size at the default 12 m zoom (`hero_reads.SCREEN_TILE_PX`): the hue read (mean colour,
  luma, chroma-weighted mean hue, saturation) and the motif read, on luma alone so no hue leaks
  into it (the share of pixels on a luma edge of 0.08 or more; the edge anisotropy across against
  along the tile, and across the two diagonals; the luma spread; the shares of pixels a spread
  above and below the mean). The slice's spec `lookContactSheet.test.ts` judges every pair from
  these: at each screen, two looks read apart when their mean colours lie at least 32/255 apart
  (Euclidean, display values) and their motif vectors (edge share, half each anisotropy, spread,
  high and low share) do too. It refuses a read whose SHA-256 no longer matches the map on disk.
- `sheets/looks.360x640.png` and `sheets/looks.1280x800.png`: the eight tiles at each screen's
  size, labelled; `sheets/looks.review.jpg`: the bakes at 512 px.

<!-- reads -->

| look               | screen   | mean      | luma  | hue | sat   | edge  | aniso  | diag   | spread | high  | low   |
| ------------------ | -------- | --------- | ----- | --- | ----- | ----- | ------ | ------ | ------ | ----- | ----- |
| `cinder-basalt`    | 360x640  | `#493532` | 0.230 | 8   | 0.249 | 0.207 | +0.043 | -0.001 | 0.081  | 0.115 | 0.000 |
| `cinder-basalt`    | 1280x800 | `#493532` | 0.230 | 8   | 0.243 | 0.181 | +0.055 | -0.001 | 0.090  | 0.092 | 0.000 |
| `ash-plain`        | 360x640  | `#75645c` | 0.409 | 21  | 0.198 | 0.000 | -0.723 | +0.000 | 0.029  | 0.213 | 0.248 |
| `ash-plain`        | 1280x800 | `#75655c` | 0.410 | 21  | 0.197 | 0.000 | -0.692 | +0.000 | 0.030  | 0.205 | 0.245 |
| `rime-shelf`       | 360x640  | `#486d7c` | 0.392 | 197 | 0.426 | 0.197 | +0.008 | -0.007 | 0.075  | 0.109 | 0.158 |
| `rime-shelf`       | 1280x800 | `#486e7c` | 0.392 | 197 | 0.426 | 0.192 | +0.010 | -0.008 | 0.078  | 0.106 | 0.149 |
| `hoarfrost-vein`   | 360x640  | `#6c6687` | 0.422 | 250 | 0.252 | 0.324 | -0.006 | +0.525 | 0.106  | 0.164 | 0.000 |
| `hoarfrost-vein`   | 1280x800 | `#6c6688` | 0.422 | 250 | 0.253 | 0.327 | -0.005 | +0.527 | 0.118  | 0.164 | 0.000 |
| `lode-banded`      | 360x640  | `#614145` | 0.295 | 355 | 0.593 | 0.058 | -0.469 | +0.009 | 0.041  | 0.219 | 0.225 |
| `lode-banded`      | 1280x800 | `#614145` | 0.295 | 355 | 0.621 | 0.099 | -0.510 | +0.004 | 0.044  | 0.268 | 0.186 |
| `gauss-field`      | 360x640  | `#435859` | 0.320 | 183 | 0.241 | 0.092 | +0.007 | +0.001 | 0.032  | 0.139 | 0.072 |
| `gauss-field`      | 1280x800 | `#435859` | 0.321 | 183 | 0.234 | 0.284 | +0.006 | +0.004 | 0.046  | 0.152 | 0.000 |
| `hollow-honeycomb` | 360x640  | `#66481e` | 0.299 | 35  | 0.715 | 0.687 | +0.028 | +0.000 | 0.187  | 0.242 | 0.220 |
| `hollow-honeycomb` | 1280x800 | `#67481e` | 0.301 | 35  | 0.714 | 0.654 | +0.044 | +0.000 | 0.199  | 0.244 | 0.190 |
| `brass-verdigris`  | 360x640  | `#7d7f42` | 0.470 | 61  | 0.509 | 0.395 | -0.023 | -0.018 | 0.093  | 0.123 | 0.182 |
| `brass-verdigris`  | 1280x800 | `#7d7f42` | 0.470 | 61  | 0.508 | 0.372 | -0.020 | -0.006 | 0.108  | 0.106 | 0.123 |

Closest pairs: at 360x640, in colour cinder-basalt vs lode-banded (0.129) and in motif ash-plain vs lode-banded (0.142); at 1280x800, in colour cinder-basalt vs lode-banded (0.129) and in motif cinder-basalt vs gauss-field (0.129) (the floor is 32/255 = 0.125 for both).
<!-- /reads -->
