# The star map carousel's art

The Blender sources, review sheets, mock frames and the look and motion notes of
[Star map carousel S1: Blender planet previews + solar system map art (#795)](https://github.com/bjor2/steampunk-miner/issues/795),
under [Map: Five open planets (#647)](https://github.com/bjor2/steampunk-miner/issues/647) and the
star map plan of [#650](https://github.com/bjor2/steampunk-miner/issues/650); the build is
[S2 (#796)](https://github.com/bjor2/steampunk-miner/issues/796). Bjor's request (24 Oct): "I want
the planets to be visualized there, with swipe / next-previous buttons to switch between them. It
should also show the position in the solar system visually; when going between them we kind of
move on the solar map."

The chart is DOM, so the art is `ui` chrome like [the star map's sprites](../star-map/README.md)
(docs/art-pipeline.md "UI chrome sprites"): one Blender unit per CSS px, shipped as PNG at 1x and
2x under `public/assets/ui/<id>/`. Authored in Blender 4.2.9 on the shared box headlessly:
`author_carousel.py` wrote the first version of every source, and the `.blend` files under
`art/blender/<id>/` are the sources from now on (Git LFS). The brief (sizes, orbit layout, motion)
is `src/data/design/starMapCarouselArt.json`, read by `systems/art/starMapCarouselArt.ts` and the
scripts here alike.

## The assets

| Asset                      | Parts (1x px)                                                                                          | Look                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-star-map-planet-<key>` | the hero `ui-star-map-planet-<key>` 256 x 256 (512 at 2x), its orbit dot `-dot` 24 x 24                | a lit sphere in the look's crust (a light from the upper left, a dark terminator, the horizon colour as rim light), a haze of the horizon colour fading out behind it, and a tilted brass armillary ring with nine rivets, its lower half in front; the dot is the same sphere in a 1 px brass rim                   |
| `ui-star-map-system`       | the backdrop `ui-star-map-system` 1008 x 252; `-frame` 64 x 64 (insets 20); `-here` 36; `-selected` 44 | a field at 35% alpha, the sun (16 brass rays round a brass-rimmed amber disc with an ember heart) at x 126, five brass orbit arcs centred on it with a brass socket where each planet sits; the frame a riveted rail nine-slice; the here ring brass with inward ticks; the selected marker amber with outward ticks |

The thirteen looks: the first system's five planets, keyed by place (`1` to `5`: each planet's row
look of ticket 653, planet 1 its archetype palette), and the eight SS2 palette looks of ticket 775
keyed by look id (their art rows of ticket 778). A later system's planets wear a palette look, so
the `solar-systems` slice names its previews with the kernel's rule and a new system needs no new
hand art (design principle 1). Each crust is the look's ground motif in its hue pair, the motif its
ground tile carries, so a planet reads the same on the map and on arrival.

| key                | name             | motif                | crust                                                                         |
| ------------------ | ---------------- | -------------------- | ----------------------------------------------------------------------------- |
| `1`                | Hearthmoor       | pitted sandstone     | warm sandstone with broad tone drifts, craters with dark floors and pale rims |
| `2`                | Gravelholm       | rockfall scree       | angular slate plates, each its own tone, dark joints between them             |
| `3`                | Coalfen          | coal seams           | dark blocky rock with thin coal-black seams and a faint murky-green gas sheen |
| `4`                | Spinegarth       | spine crystals       | glassy teal ground with bright crystal needles rising to the upper right      |
| `5`                | Kettlecrag       | steam vents          | dark basalt blotches cracked, with white vent plumes breathing out            |
| `cinder-basalt`    | Cinder Basalt    | hex basalt columns   | near-black columns, thin joints glowing orange                                |
| `ash-plain`        | Ash Plain        | layered ash strata   | grey beds with ember-red seams between some of them                           |
| `rime-shelf`       | Rime Shelf       | cracked ice plates   | pale frosted plates, dark water in the cracks                                 |
| `hoarfrost-vein`   | Hoarfrost Vein   | needle crystal veins | pale violet needles crossing a slate ground, mostly rising                    |
| `lode-banded`      | Lode Banded      | banded iron stripes  | rust and steel-blue bands folded into steep waves                             |
| `gauss-field`      | Gauss Field      | curled filings       | thin teal arcs along a warped field, drifted in patches over gunmetal         |
| `hollow-honeycomb` | Hollow Honeycomb | void honeycomb       | small amber-rimmed cells opening into dark hollows                            |
| `brass-verdigris`  | Brass Verdigris  | riveted plate shale  | brass plates gone green with patina, a bright rivet at every seam crossing    |

## Files

| File                    | What it is                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `carousel_looks.py`     | the thirteen looks from the rows the game reads (no bpy); the author, placeholder and post scripts share it                      |
| `author_carousel.py`    | wrote the first version of the fourteen sources (Blender)                                                                        |
| `write_placeholders.py` | the placeholder sidecars and manifest entries from the brief                                                                     |
| `preview_post.py`       | measures every shipped hero into `preview-reads.json`, writes the sheets, the mocks and the table below (python3, Pillow, numpy) |
| `mock_frames.py`        | the three mock frames, composed from the shipped sprites                                                                         |
| `preview-reads.json`    | the reads the kernel's `starMapCarouselSheet.test.ts` judges, with each hero's SHA-256                                           |
| `sheets/`               | `previews.360x640.png` (heroes at 160 px with their dots), `previews.1440x900.png` (256 px), `previews.review.jpg` (512 px)      |
| `mocks/`                | `phone-portrait-360x640.png`, `phone-landscape-844x390.png`, `desktop-1440x900.png`                                              |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/star-map-carousel/author_carousel.py [-- <key|system> ...]
python3 docs/art/star-map-carousel/write_placeholders.py && npm run format
npm run art:export -- ui-star-map-planet-<key>     # and ui-star-map-system
python3 docs/art/star-map-carousel/preview_post.py && npm run format  # then re-pin src/systems/art/starMapCarouselSheet.golden.json
```

## Look notes for the build (#796)

- **The hero** is drawn at 160 px on a phone and 256 px in the desktop dock (the two screens the
  reads are taken at), from the 2x file on a 2x display; never scaled up past 256 CSS px. It sits
  on the sheet's own colour: the haze and the field carry alpha, so nothing needs a dark backing.
- **A dimmed planet** (the #650 rule: unaffordable, never locked) drains its hero and dot the way
  the chart dims a row today (`filter: saturate(0.25) brightness(0.7)`), and keeps its name and
  numbers.
- **The system strip** is drawn at a height that fits the layout (about 90 px on a phone, 88 in
  the dock) with the backdrop scaled to it, inside the `-frame` rail (nine-slice, insets 20,
  `border-image-repeat: round`), and panned so the selected planet's socket is centred, clamped at
  the strip's ends. Each planet's `-dot` sits on its socket (`orbitPositionOf(place)` in
  `starMapCarouselArt.ts`), the `-here` ring on the session's planet and the `-selected` marker on
  the selection; both markers scale with the dot (here ring 1.5x the dot, marker 1.8x).
- **The orbit sockets** are baked into the backdrop, so the strip reads as an orrery even where no
  dot is drawn yet (a place past the system's planets on system 1's run past five, #781).

## Motion notes for the build (#796)

From `starMapCarouselArt.json` `motion`:

- **Pan:** on every step the strip's pan offset eases from the current to the selected socket in at
  most **400 ms** (`panMaxMs`), with the tokens' enter easing `cubic-bezier(0.2, 0.8, 0.2, 1)`
  (`panEasing`); shorter pans may take less, never more. Under reduced motion (`prefs.shake` off)
  the pan is a **cut** to the target offset; the selection still moves.
- **Swipe:** a pointer drag on the hero or the strip steps the carousel when it has travelled at
  least **48 px** along x (`swipeThresholdPx`) with at most **32 px** of drift along y
  (`swipeMaxOffAxisPx`) within **600 ms** (`swipeMaxMs`); a drag past the off-axis bound or the
  time is the chart's scroll and steps nothing. Left steps to the next planet, right to the
  previous; the carousel stops at the ends (the GD's default on #796).
- **Hero change** on a step: a crossfade of at most the tokens' `standard` 160 ms, a cut under
  reduced motion.

## Checks

<!-- reads -->

| look               | screen   | mean      | luma  | hue | sat   | edge  | aniso  | diag   | spread | high  | low   |
| ------------------ | -------- | --------- | ----- | --- | ----- | ----- | ------ | ------ | ------ | ----- | ----- |
| `1`                | 360x640  | `#8a6945` | 0.436 | 31  | 0.497 | 0.312 | -0.066 | +0.011 | 0.084  | 0.193 | 0.113 |
| `1`                | 1440x900 | `#8b6a46` | 0.437 | 31  | 0.495 | 0.188 | -0.085 | +0.008 | 0.089  | 0.199 | 0.110 |
| `2`                | 360x640  | `#566077` | 0.376 | 222 | 0.344 | 0.129 | -0.100 | +0.001 | 0.058  | 0.124 | 0.126 |
| `2`                | 1440x900 | `#576177` | 0.377 | 222 | 0.345 | 0.160 | -0.094 | -0.002 | 0.064  | 0.127 | 0.126 |
| `3`                | 360x640  | `#464734` | 0.268 | 62  | 0.263 | 0.113 | -0.424 | +0.003 | 0.072  | 0.038 | 0.148 |
| `3`                | 1440x900 | `#464734` | 0.270 | 62  | 0.261 | 0.067 | -0.446 | +0.001 | 0.075  | 0.033 | 0.148 |
| `4`                | 360x640  | `#497b73` | 0.421 | 170 | 0.487 | 0.258 | +0.044 | -0.012 | 0.115  | 0.130 | 0.035 |
| `4`                | 1440x900 | `#497c73` | 0.422 | 170 | 0.489 | 0.201 | +0.020 | -0.010 | 0.120  | 0.133 | 0.029 |
| `5`                | 360x640  | `#675a5a` | 0.368 | 0   | 0.175 | 0.189 | -0.086 | -0.006 | 0.114  | 0.120 | 0.054 |
| `5`                | 1440x900 | `#675a5a` | 0.370 | 0   | 0.174 | 0.122 | -0.114 | -0.008 | 0.117  | 0.120 | 0.052 |
| `cinder-basalt`    | 360x640  | `#6b3c28` | 0.282 | 18  | 0.530 | 0.442 | -0.075 | -0.024 | 0.097  | 0.145 | 0.057 |
| `cinder-basalt`    | 1440x900 | `#6b3c29` | 0.283 | 18  | 0.515 | 0.402 | -0.088 | -0.025 | 0.108  | 0.159 | 0.029 |
| `ash-plain`        | 360x640  | `#7a6257` | 0.409 | 19  | 0.269 | 0.064 | -0.466 | +0.008 | 0.045  | 0.106 | 0.115 |
| `ash-plain`        | 1440x900 | `#7b6358` | 0.410 | 19  | 0.266 | 0.053 | -0.463 | +0.007 | 0.050  | 0.096 | 0.101 |
| `rime-shelf`       | 360x640  | `#778f95` | 0.536 | 192 | 0.244 | 0.380 | -0.025 | +0.008 | 0.091  | 0.073 | 0.200 |
| `rime-shelf`       | 1440x900 | `#788f95` | 0.537 | 192 | 0.245 | 0.315 | -0.031 | +0.006 | 0.100  | 0.057 | 0.188 |
| `hoarfrost-vein`   | 360x640  | `#706784` | 0.428 | 258 | 0.261 | 0.274 | -0.271 | -0.001 | 0.116  | 0.160 | 0.049 |
| `hoarfrost-vein`   | 1440x900 | `#706885` | 0.429 | 258 | 0.262 | 0.200 | -0.294 | -0.006 | 0.121  | 0.165 | 0.046 |
| `lode-banded`      | 360x640  | `#675057` | 0.345 | 345 | 0.564 | 0.200 | -0.296 | -0.003 | 0.081  | 0.183 | 0.166 |
| `lode-banded`      | 1440x900 | `#685157` | 0.346 | 345 | 0.580 | 0.118 | -0.313 | +0.004 | 0.085  | 0.180 | 0.163 |
| `gauss-field`      | 360x640  | `#3c5955` | 0.313 | 173 | 0.341 | 0.135 | -0.118 | -0.008 | 0.059  | 0.093 | 0.076 |
| `gauss-field`      | 1440x900 | `#3c5955` | 0.314 | 173 | 0.337 | 0.173 | -0.110 | -0.013 | 0.066  | 0.106 | 0.066 |
| `hollow-honeycomb` | 360x640  | `#845d27` | 0.386 | 35  | 0.706 | 0.642 | -0.030 | -0.001 | 0.101  | 0.172 | 0.178 |
| `hollow-honeycomb` | 1440x900 | `#845d28` | 0.388 | 35  | 0.704 | 0.576 | -0.049 | -0.004 | 0.118  | 0.209 | 0.122 |
| `brass-verdigris`  | 360x640  | `#5a7e4e` | 0.429 | 107 | 0.449 | 0.039 | -0.237 | +0.010 | 0.048  | 0.029 | 0.135 |
| `brass-verdigris`  | 1440x900 | `#5a7e4f` | 0.431 | 107 | 0.448 | 0.065 | -0.247 | +0.007 | 0.053  | 0.027 | 0.162 |

Closest pairs: at 360x640, in colour 5 vs lode-banded (0.041) and in motif 2 vs gauss-field (0.060); at 1440x900, in colour 5 vs lode-banded (0.037) and in motif 2 vs gauss-field (0.066) (the floor is 32/255 = 0.125 for both).
<!-- /reads -->
