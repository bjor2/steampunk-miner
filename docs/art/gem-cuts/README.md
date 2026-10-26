# Gem cuts: the append-only library

The gem-cut library of
[ME: append-only Blender gem-cut library (~24 cuts), seeded pick + planet overlay (#889)](https://github.com/bjor2/steampunk-miner/issues/889)
under the Game Director's Materials Expansion lock of 25 Oct (P&N's ~24-cut library replaces the
earlier 12 per-act silhouettes; the HS asked for a planet-seeded facet or inclusion overlay on top
of the hue, since a recolour alone is not enough). Every gem of a planet drawing its generated pool
(system 1 from P6, every later system, feature-slices 3.101) draws one of these cuts, picked from
the world seed, the planet's address and the gem's slot by the `gem-cuts` slice
(`src/features/gem-cuts/`, feature-slices 3.102), coloured by its hue slot and laid under the
planet's overlay by the terrain shader. Nothing is authored per planet.

The library is `src/features/gem-cuts/gemCuts.json`. It is append-only: a cut's cell is its place
in the list (16 a page: `ground-gem-cut-atlas`, then `-page-<n>`), a cut is never removed, renamed or
reordered, and a cut added later goes last with a `since` of the next ore rules version, so the pick
of a planet already generated never moves (the slice's `gemCutPicks.golden.json` pins fixed
addresses). This folder holds the Blender sources and renders; the game draws the cells from the
pages `encode_gem_cut_atlas.py` packs.

Authored in Blender 4.2.9 on the shared box, headless, on the ore stage of
[docs/art/ores](../ores/README.md) (the same 1 m cell, lamp rig, orthographic camera and band rock
as the hero sprites of [docs/art/ore-heroes](../ore-heroes/README.md)). The `.blend` files under
`blend/` are the sources from now on (Git LFS).

## The neutral stone

A cut is one flat-shaded stone (`cut_marks.py`): a girdle outline in the face plane, a crown of
rings toward the camera (a twisted ring turns the quads into the kite and star triangles of a
brilliant crown, a plain ring makes a step cut), a table or an apex, and a pavilion sunk behind the
face, which the rock's holdout hides. One material for the whole library: a mid grey body
(`#6e6e6e`), a hard clear coat, a white rim and the gems' facet glint of ticket 744 with a softer
falloff than the hero gems' (strength 1.4, sharpness 6: a single stone has no neighbours to lend it
edges, so its own facets must step apart in luma, and a facet a way off the lamp still lifts a
little). The game maps the sprite's luma onto the gem's hue slot: the hue takes the luma below the
middle and the luma above runs to white, so the white highlight stays a highlight whatever the hue
(`gemCutSkin` in `src/scene/terrainKindShader.ts`); the planet's overlay swings the luma first.

## The cuts

Cell `i` of page `i div 16` at column `i mod 4`, row `i div 4` of the page. The reads are
`hero_reads.py`'s measures (ticket 785) of the neutral cell over the band-4 rock at the three read
screens: 24 px a tile (a 640x360 phone at 15 m, ticket 315's floor), 30 px (360x640) and 67 px
(1280x800). Every cut shows at least one highlight, at least 0.15 of its body on facet edges and a
1.2 contrast against its rock at every screen, neutral and coloured by the dimmest hue slot of the
materials table (`#877673`): the least facet-edge share is 0.157 neutral and
0.161 tinted, the least contrast 2.29.

<!-- cuts-889 -->

| cell | cut                                 | the stone                                                                                  | highlights 24 / 30 / 67 px | facet edges 24 / 30 / 67 px | contrast 24 / 67 px | bright share 67 px |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------- | --------------------------- | ------------------- | ------------------ |
| 0    | `gem-cut.brilliant` Brilliant       | a round brilliant: a girdle step and kite and star facets rising to an eight-sided table   | 1 / 1 / 1                  | 0.39 / 0.33 / 0.17          | 2.60 / 2.64         | 0.256              |
| 1    | `gem-cut.oval` Oval                 | an oval brilliant lying across the cell, a long table on a stepped crown                   | 1 / 1 / 1                  | 0.44 / 0.37 / 0.17          | 2.60 / 2.61         | 0.215              |
| 2    | `gem-cut.cushion` Cushion           | a square pillow with rounded corners, a girdle step and four kite facets to the table      | 1 / 1 / 1                  | 0.47 / 0.36 / 0.17          | 2.64 / 2.66         | 0.301              |
| 3    | `gem-cut.emerald` Emerald           | a step-cut rectangle with clipped corners, three parallel crown steps                      | 1 / 1 / 1                  | 0.51 / 0.37 / 0.21          | 2.60 / 2.61         | 0.250              |
| 4    | `gem-cut.asscher` Asscher           | a step-cut square with wide clipped corners, deep concentric steps to a small table        | 1 / 1 / 1                  | 0.41 / 0.33 / 0.16          | 2.59 / 2.63         | 0.249              |
| 5    | `gem-cut.princess` Princess         | a sharp square standing on a corner, four crown facets meeting at a point                  | 1 / 1 / 1                  | 0.53 / 0.43 / 0.20          | 2.61 / 2.61         | 0.194              |
| 6    | `gem-cut.radiant` Radiant           | a clipped-corner rectangle lying across the cell, with a brilliant crown of sixteen facets | 1 / 1 / 1                  | 0.49 / 0.42 / 0.22          | 2.66 / 2.63         | 0.260              |
| 7    | `gem-cut.pear` Pear                 | a teardrop, round at the foot and drawn to a point at the head                             | 1 / 1 / 1                  | 0.53 / 0.41 / 0.20          | 2.44 / 2.49         | 0.143              |
| 8    | `gem-cut.marquise` Marquise         | a boat with two points, lying across the cell, a long narrow table                         | 1 / 1 / 1                  | 0.60 / 0.50 / 0.24          | 2.56 / 2.59         | 0.129              |
| 9    | `gem-cut.heart` Heart               | a heart with a cleft top and a point below, lobed crown facets                             | 2 / 2 / 2                  | 0.55 / 0.47 / 0.21          | 2.61 / 2.61         | 0.168              |
| 10   | `gem-cut.trillion` Trillion         | a triangle with softly curved sides, a three-fold crown                                    | 2 / 2 / 4                  | 0.92 / 0.77 / 0.43          | 2.47 / 2.53         | 0.071              |
| 11   | `gem-cut.baguette` Baguette         | a long narrow step-cut bar standing upright, two crown steps                               | 1 / 1 / 1                  | 0.64 / 0.47 / 0.23          | 2.51 / 2.62         | 0.204              |
| 12   | `gem-cut.kite` Kite                 | a kite with a short head and a long tail, a ridge down its middle                          | 1 / 1 / 1                  | 0.68 / 0.61 / 0.32          | 2.52 / 2.55         | 0.102              |
| 13   | `gem-cut.shield` Shield             | a five-sided shield, flat top and a point below, stepped crown                             | 1 / 1 / 1                  | 0.56 / 0.46 / 0.22          | 2.63 / 2.69         | 0.230              |
| 14   | `gem-cut.hexagon` Hexagon           | a wide hexagon with a flat top edge, six crown facets to a hexagonal table                 | 1 / 1 / 1                  | 0.52 / 0.42 / 0.20          | 2.61 / 2.63         | 0.219              |
| 15   | `gem-cut.octagon` Octagon           | a tall octagon, eight crown facets round a large table                                     | 1 / 1 / 2                  | 0.51 / 0.38 / 0.20          | 2.62 / 2.63         | 0.237              |
| 16   | `gem-cut.lozenge` Lozenge           | a tall diamond rhombus, four crown facets meeting on a ridge                               | 1 / 1 / 1                  | 0.71 / 0.59 / 0.27          | 2.47 / 2.51         | 0.084              |
| 17   | `gem-cut.half-moon` Half-moon       | a half disc with its flat edge up, stepped crown along the curve                           | 1 / 1 / 1                  | 0.47 / 0.39 / 0.19          | 2.33 / 2.36         | 0.119              |
| 18   | `gem-cut.bullet` Bullet             | a bar with a pointed head and a square foot, standing upright                              | 1 / 1 / 1                  | 0.69 / 0.54 / 0.30          | 2.44 / 2.46         | 0.106              |
| 19   | `gem-cut.trapeze` Trapeze           | a wide trapezoid, the long side down, two crown steps                                      | 1 / 2 / 2                  | 0.59 / 0.49 / 0.23          | 2.62 / 2.70         | 0.223              |
| 20   | `gem-cut.rose` Rose                 | a small round dome of triangular facets rising to a point, no table                        | 1 / 1 / 1                  | 0.45 / 0.36 / 0.18          | 2.49 / 2.52         | 0.137              |
| 21   | `gem-cut.briolette` Briolette       | a hanging drop covered all over in small triangular facets, the point down                 | 1 / 1 / 1                  | 0.66 / 0.51 / 0.23          | 2.59 / 2.61         | 0.117              |
| 22   | `gem-cut.checkerboard` Checkerboard | a wide cushion whose crown is a chequer of square facets                                   | 7 / 7 / 5                  | 0.97 / 0.89 / 0.52          | 2.78 / 2.78         | 0.300              |
| 23   | `gem-cut.sugarloaf` Sugarloaf       | a steep four-sided pyramid on a small square foot, its four faces lit one at a time        | 1 / 1 / 1                  | 0.50 / 0.39 / 0.27          | 2.60 / 2.54         | 0.137              |

<!-- /cuts-889 -->

## Readings

From `sheets/gem-cuts.distinct.json`, at 40 px a tile over the band-4 rock (what the 20 m zoom
shows), neutral: the closest outlines of the library. Every pair of cuts is at least
0.106 apart in silhouette (1 - mask IoU); the round and square cuts sit closest, and read
apart by their crowns (a girdle step and kites against concentric steps or a chequer).

<!-- readings-889 -->

| pair                    | silhouette apart (1 - IoU) | luma apart |
| ----------------------- | -------------------------- | ---------- |
| brilliant vs cushion    | 0.106                      | 0.004      |
| cushion vs asscher      | 0.106                      | 0.012      |
| brilliant vs asscher    | 0.108                      | 0.008      |
| oval vs hexagon         | 0.115                      | 0.005      |
| cushion vs checkerboard | 0.116                      | 0.035      |
| emerald vs octagon      | 0.118                      | 0.002      |

<!-- /readings-889 -->

The game-scale strip `sheets/gem-cuts.scale-x4.png` shows every cut over its rock at 85, 67, 40,
30, 24 and 22 px a tile, coloured by three hue slots (a warm, a cool and a pale one) the shader's
way, with `-gray` and `-deutan` copies. At the 24 and 22 px rows all 24 read as 24 stones, each with
its highlight; the pale hue washes the body as its slot's luma asks. Checked by eye on 26 Oct.

## Files

| File                                                     | What it is                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `blend/cut-<name>.blend`                                 | the cut's scene: its 1 m cell on the band-4 rock, the shallow lamp rig and the game's camera framing the cell at 248 px                       |
| `blend/gem-cuts.blend`                                   | the review scene: every cut in two rows of twelve                                                                                             |
| `cells/<name>.png`                                       | the atlas cell: the 248 px neutral sprite (straight alpha, the mask) with its edge pixels extended into the 4 px gutter of a 256 px cell      |
| `gem-cut-cells.json`                                     | the cell table: the atlas shape, the pages and per cell its page, index, cut and content rect, and per cut its name, `since`, shape and files |
| `gem-cut-reads.json`                                     | every committed cell's gem-read measures at the three screens, neutral and tinted by the dimmest hue slot, with its SHA-256                   |
| `sheets/atlas-preview.ground-gem-cut-atlas[-page-n].png` | each 1024 px page as the encoder packs it; a preview, the shipped KTX2 is under `public/assets/ground/`                                       |
| `sheets/gem-cuts.shallow.jpg`, `-gray.png`               | the review sheet at 256 px/m under the headlamp and fill, and its greyscale copy                                                              |
| `sheets/gem-cuts.scale[-x4][-gray or -deutan].png`       | the game-scale strip, tinted, and its 4x, greyscale and deuteranopia copies                                                                   |
| `sheets/gem-cuts.distinct.json`                          | per cut at 40 px: coverage, luma, contrast; per pair: silhouette, luma and deuteranopia distance, and the least different pair                |

## Pipeline

```
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/gem-cuts/author_gem_cuts.py -- [cut-id ...] [--no-sheets | --sheets-only]   # the cuts' .blend files and sprites, the cell table, the review sheet
python3 docs/art/gem-cuts/cut_post.py                   # the cells, page previews, tinted scale strip, blind copies, distinctness, gem-cut-reads.json, JPEG shrink
python3 docs/art/gem-cuts/encode_gem_cut_atlas.py       # the shipped pages from the committed cells
```

Set `PYTHONDONTWRITEBYTECODE=1` so importing the modules leaves no `__pycache__`. The closeup
sheet is left out: 24 cells at 480 px a metre is more than the shared box renders in one go.

- `gem_cuts.py` reads the slice's library and writes `gem-cut-cells.json`; plain Python, shared
  by both steps.
- `cut_marks.py` builds each cut (`CUTS`, keyed by id) from outlines (circle, ellipse,
  superellipse, clipped rectangle, teardrop, lens, heart, bulged polygon, half-moon) and crown
  rings, in the one neutral material. A cut with no builder fails, never falls back.
- `author_gem_cuts.py` stages each cut's cell, saves its `.blend`, renders the sprite with the rock
  slab held out on a transparent film (no compositor glow: the shader adds the rarity glow, the
  frame and the rank glint), then the review sheet. Sprites land in `art/build/gem-cuts/`
  (gitignored).
- `cut_post.py` (python3, Pillow and numpy) pads the sprites into cells, packs the page previews,
  composites the tinted scale strip, writes the blind copies, measures distinctness and the reads,
  and shrinks the sheet to JPEG.
- Adding a cut: append it to `gemCuts.json` with `since` set to the next ore rules version, add
  its builder to `CUTS`, run the three steps, commit the new cell, the reads, the page it lands on
  (a new page needs its `art/assets/<id>.json` row, `final`) and the slice's spec; every earlier
  cell and every pinned pick stay as they were.
