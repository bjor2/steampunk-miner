# The magnetic planet: aurora, field lines and electrified cells

The review renders of
[Art: magnetic planet aurora, field lines, arc marker and planet card (#293)](https://github.com/bjor2/steampunk-miner/issues/293),
for the GD lock on [Spec: Magnetic planet (#258)](https://github.com/bjor2/steampunk-miner/issues/258)
"On screen" and the GD ruling on #293 Q1. Authored in Blender 4.2.9 on the shared box
(`scripts/art/author_magnetic_field.py` wrote the first version; the `.blend` under
`art/blender/prop-magnetic-field/` is the source from now on, Git LFS) and rendered through the
Blender MCP with `render_magnetic.py`.

## What is here

| Asset                 | Parts                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `prop-magnetic-field` | `aurora-ribbon` (3.75 × 1.25 m): curtains of light over a wavering foot, fading upward; `field-dash` (0.5 × 0.0625 m): a dash |

| Render                     | Shows                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `magnetic-field.front.png` | both parts front on, as the export bakes them                                                  |
| `aurora.band.png`          | three ribbons end to end at the band's 5 m height, 2 m over a ground strip, in the look's blue |

- Both parts are emissive planes. Only their light reaches the game: the sky band and the line
  shaders take a texel's brightest channel and colour it with the look's colour
  (`src/features/planet-mix/magneticLooks.json`), so the blue is tuned in data, not in Blender.
- Each pattern is whole sine periods across the part's width, so the ribbon repeated round the
  planet (every 15 m at the 5 m band) and the dash repeated along a line show no seam.
- The band is drawn additively, so the black under the ribbon's foot adds nothing to the sky.

## The electrified cells' arc (procedural)

The `arc-flicker` marker is no Blender asset. Like every #299 gate marker, the terrain shader
draws it (`src/scene/terrainShader.ts`), on the cell's electrified bit (bit 21 of `aGate`):

- a jagged arc strikes across the cell a few times a second, each strike at its own angle and on
  the cell's own beat, in its own pale blue (not the act tint), lighting the ore over whatever gate
  marker the cell already shows, so a gated ferrous cell shows both;
- some strikes stay dark, which is the flicker; with reduce motion (the shake switch) one arc
  holds lit and still;
- its id differs from every #142 marker (`electrifiedCells.test.ts`).
