# The UI chrome sprites

The review sheets of
[Blender UI art: gauges, frames, sheet chrome (#683)](https://github.com/bjor2/steampunk-miner/issues/683),
built to the art brief in [docs/ui/design-system.md](../../ui/design-system.md) section 13 for
[Spec: UI redesign, phone first (#678)](https://github.com/bjor2/steampunk-miner/issues/678).
Authored in Blender 4.2.9 on the shared box headlessly (`scripts/art/author_ui_chrome.py` wrote
the first version, and the needle and glass frame of
[Brass gauge cluster (#716)](https://github.com/bjor2/steampunk-miner/issues/716); the `.blend`
files under `art/blender/ui-*/` are the sources from now on, Git LFS) and exported with `npm run art:export -- <id>` into `public/assets/ui/<id>/`. The pipeline
rules are in [docs/art-pipeline.md](../../art-pipeline.md), "UI chrome sprites".

## What is here

| File                 | What it is                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `sprites-1x.png`     | every 1x sprite at 4x nearest-neighbour: one CSS px is a 4 px square, so every stroke can be counted |
| `sprites-2x.png`     | the 2x files at 2x, the same scale, to compare the anti-aliasing of the two                          |
| `tints.png`          | the five tint masks filled with the accent colour: what a planet skin recolours                      |
| `sheet_ui_chrome.py` | writes the three sheets from `public/assets/ui/` (Pillow)                                            |

The odometer drum (16 x 240) is on the sheets at full height; the others sit in one row.

## The sprites

Each is one `.blend` with one flat part per sprite, the origin at the sprite's centre, authored at
one Blender unit per CSS px. Materials are the design tokens' three stops (`designTokens.json`
`materials`): a bezel grades shadow to highlight upwards, a well the other way, a stud is the
highlight over a shadow dot offset down and right, and `accent` is the flat colour a planet skin
replaces. Every stroke is at least 1 px at 1x; frames are hollow.

| Asset              | Parts                                                                 | Look                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-gauge-bar`     | `ui-gauge-bar` 96 x 16, insets 6 x 6                                  | an iron well in a 2 px brass bezel, rounded 5 px                                                                                                   |
| `ui-gauge-dial`    | `ui-gauge-dial` 64 x 64, tintable                                     | brass rim, dark gap, parchment face (the tint), 9 major and 16 minor ticks over 240 degrees, brass hub                                             |
| `ui-gauge-needle`  | `ui-gauge-needle` 4 x 28                                              | a brass pointer tapering from 4 px at its foot to 1 px at the tip, its right flank in shadow; the origin is the foot, where it turns (#716)        |
| `ui-edge-gauge`    | `ui-edge-gauge` 8 x 64, insets 0 x 8                                  | a vertical iron trough between two 1 px brass rails, 2 px caps                                                                                     |
| `ui-odometer-drum` | `ui-odometer-drum` 16 x 240                                           | ten parchment digits (Blender's built-in font) down an iron drum, each 24 px cell shaded on its own                                                |
| `ui-frame-sheet`   | `ui-frame-sheet` 128 x 128, insets 24 x 24                            | a 2 px brass edge, a 4 px iron band with a rivet in each corner, a brass hairline                                                                  |
| `ui-frame-card`    | `ui-frame-card` 96 x 64, insets 12 x 12                               | a 2 px bezel over a dark hairline, a stud in each corner                                                                                           |
| `ui-frame-glass`   | `ui-frame-glass` 48 x 48, insets 10 x 10                              | the gauge cluster's frame (#716): a 3 px bezel, a dark lip, a glint of glass along the top, a stud in each corner                                  |
| `ui-frame-tab`     | `ui-frame-tab`, `ui-frame-tab-active` 64 x 32, insets 8 x 8           | a 3 px brass top edge and 1 px sides, open at the foot; the active edge is the accent (tintable)                                                   |
| `ui-scroll-rail`   | `ui-scroll-rail` 8 x 64, `ui-scroll-rail-thumb` 12 x 24, insets 0 x 8 | the dim trough with brass caps; the brass thumb plate with two dark studs in its caps                                                              |
| `ui-slot-ring`     | `ui-slot-ring` 48 x 48, tintable                                      | a 4 px brass ring over an iron well, a 1 px accent ring inside it                                                                                  |
| `ui-status-plate`  | `ui-status-plate` 24 x 24                                             | the #158 triangle plate: a brass triangle round an iron face, pointing up                                                                          |
| `ui-gear-button`   | `ui-gear-button`, `ui-gear-button-pressed` 48 x 48, tintable          | an eight-tooth brass gear on a riveted iron plate with an accent lamp at the hub; pressed, the plate shades as a well and the gear sits 1 px lower |

## How they are drawn

`src/ui/kit/UiArtTokens.tsx` writes `--art-<token>` custom properties on the root from the shipped
catalogue (see the design system, section 13). The kit's dial (`kit/Gauge.module.css`) and scroll
area (`kit/ScrollArea.module.css`) use theirs; the HUD strip, the status icons, the sheet and the
tool slots are the later tickets of #678; the strip's gauge cluster (#716) draws the dial, the
needle and the glass frame.
