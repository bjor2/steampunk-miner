# Ore visual tier ladder: three style directions × five grades

The prototype behind
[Spec: Ore visual and model progression (#151)](https://github.com/bjor2/steampunk-miner/issues/151),
made for
[Prototype: Ore visual tier ladder (#150)](https://github.com/bjor2/steampunk-miner/issues/150).
Three style directions, each a ladder of the five visual grades the Game Director fixed on #151 (G1
form, G2 **sheen**, G3 **structure**, G4 **inner light**, G5 **its own effect**; each grade adds one
channel and keeps the ones below). All three use the same demo family, azurite from the catalogue on
#140 (botryoidal bubbles, blue 215–235°), so the comparison is about style, not hue. Emission stays
cool, white or gold; orange is left to lava and the enemy ramp.

Authored in Blender 4.2.9 on the shared box through the Blender MCP, by the scripts in this folder;
the `.blend` files are the sources from now on (Git LFS). Nothing in the game changes.

## Files

| File                                           | What it is                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `<id>.blend`                                   | the direction's scene: five 1 m cells on their band's rock, lamp rig, camera         |
| `<id>.ladder.png`                              | the game's orthographic view at 256 px/m (the ground bake density, #151's test size) |
| `<id>.ladder-gray.png`                         | the same sheet in Rec. 709 luma: the grayscale blind-order test                      |
| `<id>.ladder-ingame.png`                       | the sheet at 85 px/m, about what a 1080p screen shows at the default 12 m zoom       |
| `<id>.closeup.png`                             | the five cells at 480 px/m                                                           |
| `<id>.motion.png`                              | grades 4 and 5 over the three pulse frames (top to bottom): pulse, sparkle, arcs     |
| `<id>.three-quarter.png`                       | grades 3 to 5 in perspective, to show the relief the flat view only hints at         |
| `<id>.luma.json`                               | measured luma per cell: ore area, rock margin, contrast, and whether the order holds |
| `author_ore_ladder.py`, `ladder_scene.py`, ... | the authoring and render scripts (below)                                             |

The `<id>`s are `assay`, `voltaic` and `stamped`. Cells sit on planet 1's band colours, band 1 for
G1 to band 5 for G5, so the rock darkens as the grade rises, the way it does in play. The lit
directions share one lamp rig (a warm sun from the front top-left, a cool area fill), and every
sheet goes through a compositor fog glow with threshold 1.0, standing in for the game's bloom pass.

## Directions

### Assay (mineralogical realism), `assay`

An assayer's tray: every grade is a real mineral habit with physically based materials, lit by the
game's warm headlamp and a cool fill. **G1** flat dark seams and grains half-sunk in the soil, matte.
**G2** adds sheen: botryoidal domes of steel-blue metal with a clear coat, so the lamp glints as the
camera moves. **G3** adds structure: nine translucent hex prisms radiating from a root and crossing
the cell edge, with a faint rim glow on their facing edges, plus six sparkle points. **G4** adds
inner light: a split geode, its rim in dark umber rock, fourteen lining crystals round a glowing
core, three crystals standing out of the rim, and four veins running from under the shell to the
cell's corners; core and veins pulse. **G5** adds its own effect: seven shards hovering 12 cm off
the rock in a crown round a white-blue core, arcs leaping core to shard (two alternating sets), and
a point light so the neighbouring rock is lit in the ore's hue. Animation per grade: none, glint,
sparkle (2 sets), pulse (0.7–1.0), pulse plus alternating arcs. Emission is the family's blue
(`#7fc0ff`) with a white core; nothing warm.

### Voltaic Foundry (engineered), `voltaic`

The ore as workshop material, leaning on #151's steampunk-fit test ("arcing, humming, lamp-lit").
**G1** slag clinker: bevelled angular chunks with a few brass specks. **G2** stepped cubes stacked
like ingots (the galena habit), bright steel with a coat. **G3** glass insulator rods in a hex
lattice, each on a brass collar, leaning so their length shows, two crossing the cell edge, with a
pale gold rim glow. **G4** a filament lamp: an iron cage (one ring, four meridians) round a glass
bulb with a gold filament core, and four gold veins to the corners each ending in a small insulator;
filament and veins pulse. **G5** a brass coil with a white-blue plasma core, four brass electrodes
floating inside it, arcs from the core to the coil and one cell corner in two alternating sets, and
a point light. Emission is gold (`#ffd45a`) for the lamp and white-blue (`#dcefff`) for the arcs,
both allowed by #151; the body stays the family's blue through the glass.

### Stamped (flat vector), `stamped`

The flat-vector look #13 chose for terrain, pushed up the ladder. Every surface is unlit emission,
so the colour on screen is the authored colour; depth comes from two-tone facets, ink outlines and
hard-edged halos, never from the lamp. The cell keeps the game's edge highlight (a light top-left
strip, a dark bottom-right strip). **G1** angular ink-outlined flecks. **G2** rounded nuggets with a
shade polygon and a four-point glint star. **G3** seven two-tone shards radiating from a root, the
longest crossing the cell edge, each with a flat rim halo, plus blinking sparkle stars. **G4** a
hexagon geode: dark shell, lit lining, a pulsing core, six small shards and six tapering vein spokes
to the cell edges. **G5** a ring of seven white two-tone shards orbiting a white core, a two-step
halo (the outer step crossing the cell edge, which is how a flat look lights its neighbours) and
square-section lightning polylines in two alternating sets. This is the direction that bakes most
cheaply and reads most like the live terrain shader.

## Readability at tile scale

Measured on each `ladder.png` (256 px/m) by `ladder_scene.report_tile_luma`: mean Rec. 709 luma of
the cell's central 0.7 m (the ore area) and of its outer 0.1 m (the rock margin), and the WCAG-style
contrast between them. The grayscale blind-order test asks that the ore luma rises with the grade;
all three directions pass it, while the rock gets darker with the band at the same time.

| direction | G1 ore / rock | G2 ore / rock | G3 ore / rock | G4 ore / rock | G5 ore / rock | order |
| --------- | ------------- | ------------- | ------------- | ------------- | ------------- | ----- |
| assay     | 0.13 / 0.15   | 0.16 / 0.12   | 0.21 / 0.09   | 0.33 / 0.16   | 0.38 / 0.08   | rises |
| voltaic   | 0.13 / 0.15   | 0.13 / 0.12   | 0.20 / 0.13   | 0.22 / 0.11   | 0.31 / 0.05   | rises |
| stamped   | 0.13 / 0.16   | 0.14 / 0.12   | 0.17 / 0.09   | 0.33 / 0.08   | 0.46 / 0.12   | rises |

What the numbers and the sheets say for #151:

- A saturated blue body fails the order on its own: blue has low luma, so the G2 and G3 bodies had
  to be lightened (desaturated) before they out-shone the G1 cell. Hue bands with low luma (blue,
  indigo, violet) will need the same treatment, or their sheen and rim channels must carry the step.
- G1 and G2 are the tight rungs in every direction (ore within 0.03 of each other and of the rock).
  The step between them is carried by the sheen highlight, not by mean brightness, so the G2 glint
  must survive the bake (a specular or coat term in the lit material, or a baked highlight for the
  flat look). Metals also need a lit world: against a black background a mirror-steel nugget renders
  darker than the G1 seams.
- From G3 up the order is wide and the ore-to-rock contrast climbs (1.4 to 3.7). G5 lights its own
  cell margin in the lit directions (rock luma drops to 0.05–0.08 because the neighbour light is
  cool and the band-5 rock is dark), which is the "lights the cells next to it" channel at work.
- Brass near a bright core is a hue risk: the Voltaic coil reflects its plasma as a gold ring whose
  hue sits at the 45° edge of the orange band reserved for lava. Brass in a G5 ore has to stay matte
  (roughness 0.7 here) and the glow has to come from the arcs and core, not the metal.
- At 85 px/m (`ladder-ingame.png`) the G1 seams and G2 nuggets still read as separate marks and the
  G3 cluster still breaks the cell edge in all three directions; the stamped glint stars are the
  smallest marks that survive (about 3 px).
- The pulse (0.7 to 1.0 of the authored strength) is invisible once a core clips to white; what
  moves in `motion.png` is the arc alternation and the sparkle sets. A visible pulse needs a core
  held below clipping (strength under about 4 with this glow) or a pulse on the halo rather than the
  core.

## Budgets per tier

Source triangles are measured on the `.blend` files (render-evaluated, modifiers applied) and do not
reach the game: per #52 and the #151 draft, ore ships as baked maps in a 256 px atlas cell per
variant (albedo with the part mask in alpha, normal, and an emissive map from the first grade that
glows), and all motion is shader-driven (pulse, sparkle, arc flicker), with no per-frame textures.
The assay counts are high at G2 and G3 because its domes carry a subdivision modifier; they bake the
same.

| grade | assay tris | voltaic tris | stamped tris | maps needed                    | motion (shader)                  |
| ----- | ---------- | ------------ | ------------ | ------------------------------ | -------------------------------- |
| G1    | 820        | 1 248        | 288          | albedo, normal                 | none                             |
| G2    | 13 440     | 792          | 600          | albedo, normal                 | glint as the camera moves        |
| G3    | 7 116      | 1 624        | 604          | albedo, normal, emissive (rim) | slow sparkle, 2 phases           |
| G4    | 1 600      | 4 028        | 384          | albedo, normal, emissive       | pulse, 3 frames                  |
| G5    | 390        | 1 944        | 312          | albedo, normal, emissive       | pulse, alternating arcs, 1 light |

The stamped direction needs no normal map (it is unlit), so its cell is albedo plus emissive only.
Per cell that is one 256 × 256 albedo and one emissive (G3 up), or 128 KB of ETC1S per map before
mips; the lit directions add a UASTC normal. A G5 point light counts against the #151 cap of 24
light-casting cells.

## Reproducing

Headless, from the repo root (writes every file above; deterministic: Cycles seed 0, layout seed
150):

```
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ore-ladder/author_ore_ladder.py -- [assay|voltaic|stamped ...] [--no-render]
```

Through the Blender MCP (`/workspace/claude-sessions/start-blender-mcp.sh`, port 9876), add this
folder to `sys.path`, `import author_ore_ladder` and call `author('assay')` (or
`author('assay', render=False)` and `look` through the camera while iterating). The modules reload
on every call, so edits to a direction file show up without restarting Blender. `render_direction`
renders a scene already open.
