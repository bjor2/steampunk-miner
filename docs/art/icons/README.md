# The icon set

The icons of [#158 Icon language and full icon coverage](https://github.com/bjor2/steampunk-miner/issues/158),
built by [#163](https://github.com/bjor2/steampunk-miner/issues/163). One language for every
surface: **the frame says what kind of thing it is, the glyph says which one.**

| Frame         | Stands for                              | Colour axis                                      |
| ------------- | --------------------------------------- | ------------------------------------------------ |
| riveted plate | a buyable item or upgrade row           | brass (a stat track) or verdigris (a capability) |
| gear rim      | a tech node or power-up (the artefacts) | verdigris                                        |
| hex           | a resource: ore, core fragments         | the ore family's hue at the tier's luma          |
| triangle      | a warning or status, an enemy           | orange                                           |
| none          | a HUD gauge, label, panel or button     | brass (gauges) or steel (chrome)                 |

Colour means axis, never state. A state is a badge with its own shape: a padlock while a thing
is still to be unlocked, a star at its top, a rim glint while the buy would go through, and only
the price turns red when the wallet is short.

## Where it lives

- `src/systems/art/icons/iconSet.ts`: the registry. Every id derives from its registry id in the
  #52 kebab form (`icon-track-<track>`, `icon-enemy-<kind>`, `icon-status-<status>`,
  `icon-state-<mode>`, `icon-artefact-<id>`, `emblem-bay-<bay>`...), with its frame, axis, title
  and glyph.
- `src/systems/art/icons/iconGlyphs.ts`: the drawings on a 24 grid: one silhouette, at most three
  engraved lines, a few dots.
- `src/systems/art/icons/iconSvg.ts`: composes frame and glyph into SVG text.
- `src/systems/art/icons/oreIcon.ts`: ore icons are generated from the ore look (family hue, tier
  luma, the #140 grade as one to five pips), never drawn, so every tier has one by construction.
- `src/ui/icons/<id>.svg` and `art/assets/<id>.json`: the shipped files, written by
  `npm run art:icons`. `iconFiles.test.ts` fails on a stale file; never hand-edit an SVG.
- `src/ui/VectorIcon.tsx`: draws one icon at a #158 size: `hud` is 24 px at 1080p and never under
  20 physical px, `banner` 32 px, `menu` the surrounding type's size, `row` the shop's 2em.

## Coverage

`src/systems/art/icons/iconCoverage.test.ts` walks every surface's view model (HUD gauges, statuses,
threats, every bay row and button, the artefact cards, the hint table, the settings) and fails when
an id does not resolve to a final SVG or a generated ore icon. `KNOWN_ICON_GAPS` is the allowlist
and is empty; an entry there is a build finding, never a fix.

## Contact sheet

`contact-sheet.svg` is written by `npm run art:icons` from the same drawings the game ships: every
icon at 1x and 2x on the dark and the light panel, the same in grayscale and under a deuteranopia
simulation (Machado 2009), a row of generated ore icons across the five grades, and the six combat
statuses at 20, 24 and 32 px plain and in grayscale. Open it in a browser.

## Hand checks (6 Oct 2026, headless Chrome on the dev build)

- **16 px frame check:** on the sheet's grayscale panels every plate, gear, hex and triangle is
  told apart at 1x; the category reads before the glyph.
- **In play** (`in-play.png`, 1080p): the gauges, the status stack at 32 px, the position labels,
  the bay header emblem, the row plates with glints and badges all read at their sizes.
- **Blind-ID at 50% grayscale** (`in-play-grayscale-half.png`): the status triangles read as
  warnings and the three on screen (hull critical, overheat, low energy) are told apart by their
  glyph with effort; at 12 px the triangle leaves the glyph about 5 px, so the six are safest told
  apart at the banner's own 32 px. The threat and collapse statuses are on the sheet's status block
  at 20, 24 and 32 px; the capture did not catch an enemy telegraph or a collapse in time.
