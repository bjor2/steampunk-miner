# The star map's sprites

The Blender source and review sheets of the map half of
[Star map S5: map art pass (#758)](https://github.com/bjor2/steampunk-miner/issues/758), wave
647-6C of [the star map plan (#650)](https://github.com/bjor2/steampunk-miner/issues/650): the
planets and the system view of the read-only star map
[#757](https://github.com/bjor2/steampunk-miner/issues/757) built. The chart is DOM, so the art is
a `ui` chrome asset as [#683](https://github.com/bjor2/steampunk-miner/issues/683) made them
(docs/ui/design-system.md section 13; docs/art-pipeline.md "UI chrome sprites"): one `.blend`,
`art/blender/ui-star-map/ui-star-map.blend`, flat sprites at one Blender unit per CSS px, shipped as
PNG at 1x and 2x under `public/assets/ui/ui-star-map/` and drawn through `--art-star-map-*`.

Authored in Blender 4.2.9 on the shared box headlessly: `author_star_map.py` wrote the first
version, and the `.blend` is the source from now on (Git LFS). The design token is
`art.starMap` and the sprite table row is `uiSprites["ui-star-map"]` in `art/asset-rules.json`.

## The sprites

| Part                 | 1x size | Look                                                                                                                                                                |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-star-map-planet` | 48 x 48 | a planet: a 2 px brass rim round the planet's disc (the `accent`, so it ships a tint mask), two 1 px strata rings, an iron-ringed ember core, a parchment highlight |
| `ui-star-map-sun`    | 64 x 64 | the system's star: twelve brass rays round a brass-rimmed amber disc with an ember heart                                                                            |
| `ui-star-map-here`   | 56 x 56 | the ring round the planet the session is on: a 2 px brass ring with a 2 x 6 px tick at each compass point                                                           |

Why a tint mask: the planets are procedural without end (design principle 1), so one sprite serves
every planet and the chart colours its disc per row with the planet's own ground, the view's
`colour` (`starMapView.ts` `planetMapColourOf`: the row look's surface rock, else the archetype
palette's), through `mask: var(--art-star-map-planet-tint)` as the dial's face is skinned. The rim,
rings, core and highlight stay what they are, so every planet reads as one of a family.

## How the chart draws them

`StarMapChart` (`src/ui/starMap/`) heads the system view with the sun, runs a brass rail down
behind the rows, and sets each row's glyph (the planet sprite over its tinted disc) on it; the here
ring sits round the glyph of the planet the session is on, and a dimmed row drains its glyph's
colour. The tank's bar is the existing `art.gaugeBar` sprite with a CSS fill. While the asset is a
placeholder the CSS discs behind the `var()`s stand in.

## Files

| File                 | What it is                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `sprites-1x.png`     | every 1x sprite at 4x nearest-neighbour: one CSS px is a 4 px square, so every stroke can be counted |
| `sprites-2x.png`     | the 2x files at 2x, the same scale, to compare the anti-aliasing of the two                          |
| `tints.png`          | the planet with its disc in each planet palette's surface colour, as the chart tints it              |
| `author_star_map.py` | wrote the first version of the source (Blender)                                                      |
| `sheet_star_map.py`  | writes the three sheets from `public/assets/ui/ui-star-map/` (Pillow)                                |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/star-map/author_star_map.py
npm run art:export -- ui-star-map
python3 docs/art/star-map/sheet_star_map.py
```

## Checks (24 Oct 2026)

- **Every stroke at least 1 px at 1x** (`sprites-1x.png`): the strata rings and the here ring's
  ticks are 1 and 2 px; the rims 2 px.
- **The disc tints and nothing else does** (`tints.png`): the three palettes' surfaces (planet 1's
  brown, planet 2's and the heat planets') fill the disc; the rim, rings and core keep their brass,
  iron and ember.
- **Sizes**: each exported part's `sizeM` is its brief size (`uiArt.test.ts` pins every token's
  asset to the sprite table), and the planet is the only new tintable part.
- **Both layouts**: the sprites are drawn at their 1x size on the phone's full-screen panel and
  desktop's 400 px dock alike; the browser spec `e2e/browser/ui/starMap.spec.ts` (#757) judges the
  rows against the model at 360x640 and 1280x800. The look was checked on these sheets, not in the
  running game.
