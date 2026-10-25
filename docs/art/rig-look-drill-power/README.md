# The drill power rig-look parts

The Blender source and review renders of
[LK12: drill_power look steps to P40 — Blender parts + data row (#875)](https://github.com/bjor2/steampunk-miner/issues/875),
wave 878-1A of the P1-P5 map (#647): the `drill_power` track of the rig look ladder
([#576](https://github.com/bjor2/steampunk-miner/issues/576)) authored to about P40. Since LK1
([#809](https://github.com/bjor2/steampunk-miner/issues/809)) the track steps on the power-decade
band rule, a band every 6 purchases, to 126 (about P40 on the median path). #554's nine glow rows
(a glow on the bit and the head plate, brighter row by row) keep the first nine edges, 6 to 54, as
glow-only steps; the twelve LK12 steps, 60 to 126, each fit one more part onto the drill housing,
the steam fittings first, then heavier hardware, then the aether glows, and the finish tail of #809
keeps every later band visible above 126. The GD lock of 25 Oct 06:48 (#875): at least 5 steps (the
Systems sizing row: at least 13), parts added in sockets, a fixed footprint, silhouette or part
changes only, never a recolour; looks are never unlocks.

**Wired by the data row.** The rig-look slice registers and exports the asset and lays each step's
part on the slot from the registry's rows (`src/features/rig-look/rigLook.json`, #577); the parts
form the track's third glow slot group, under the `rigBody` cap, so the finish tail paints them
while #554's bit and head glows keep their two groups. `drillPowerLooks.json` here is the one table
this folder's scripts share; the wiring keeps its own rows. The asset id follows the #52 kebab form
under the vehicle category, `vehicle-look-drill-power`; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_drill_power_looks.py` wrote the file, and
`art/blender/vehicle-look-drill-power/vehicle-look-drill-power.blend` is the source from now on
(Git LFS). The sheets below are the headless renders.

## The parts

The asset is authored in its own frame with the track's attach slot, `drill.housing`, at the
origin, as the tech gear is (#166), so the game draws a part at the slot's `atM` (0.26, 0.04) from
the vehicle sidecar with no offset. The slot is the Game Director's drill_power showcase point
(#180), on the pod's bow where the gimbal drive's drum (`t1-motor-housing`, draw order 3) sits.
No rig part stands on the slot, so a look lies over the rig rather than replacing a part
(`replaces: null`), body-fixed, at draw order 4: over the drum and the chassis, under the armour
(5) and the drill head (8). The drill head, its tip and the drill_tip crowns on it (#815) are
untouched: the parts are on the drill's body, never a second head sprite, so `drillTipAheadOf`
(#789) reads the same at every step.

**The sockets.** The rig outline the steps may not leave is, round the slot, the drum (radius 0.13
at (0.34, -0.07)) on the pod's bow. What the rig draws over the drum at the tiers these steps show
on (#20: 8 majors put the rig on tier 2, 20 on tier 3) is the bow armour plate (`t2-/t3-armour-
plate`, z 5, x 0.365 to 0.49, z -0.258 to -0.002) and the headlamp (z 4, from x 0.346 and z 0.01
at tier 2); the cargo hold's looks reach the drum's top-left corner (x to 0.345, z 0.009 up, z 3)
and the hull's bow cap plate its left edge (x to 0.31, z 5, from 960 hull purchases). The sockets
are the drum's face those leave open: a panel 5.5 cm wide and 20 cm tall, x 0.31 to 0.365, z
-0.195 to 0.009 in the vehicle frame, read top down as a power train. Every part stands with its
face nearer the camera than the drum's and the bow leg's hip, so the composite review renders show
it as the game draws the look sprite over the housing sprite, and reaches back to the slot by a
5 mm strut in the pod's own bronze, because the export requires a part's origin inside its bounds
(the sub-pixel line it draws over the pod is the pod's colour).

| Part               | Step | Adds                                                                                                                |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `gauged-housing`   | 60   | **Pressure gauge**: a brass-bezelled gauge with a pale dial and a red needle at the panel's top                     |
| `valved-housing`   | 66   | **Relief valve**: a brass valve body under it, a steel stem out of it and a brass handwheel facing the camera       |
| `piped-housing`    | 72   | **Steam feed**: two copper feed pipes down the panel's sides from the gauge's level to the flywheel's, brass unions |
| `finned-housing`   | 78   | **Cooling fins**: five dark-iron fins across the panel between the pipes                                            |
| `clamped-housing`  | 84   | **Clamp band**: a bright steel clamp band across the drum under the fins                                            |
| `flywheel-housing` | 90   | **Power flywheel**: a dark-iron-rimmed flywheel with four bright steel spokes and a brass hub at the bottom         |
| `bolted-housing`   | 96   | **Hex bolts**: bright steel hex bolts on the band's ends, the valve body's corners and round the gauge's bezel      |
| `ribbed-housing`   | 102  | **Iron ribs**: two dark-iron ribs down the panel's edges, outside the pipes                                         |
| `coiled-housing`   | 108  | **Copper coils**: two copper coils round each pipe between the gauge and the valve                                  |
| `lensed-housing`   | 114  | **Sight lenses**: a glowing teal ring round the dial inside the bezel, a glowing lens on each side of the valve     |
| `haloed-housing`   | 120  | **Flywheel halo**: a glowing teal halo inside the flywheel's rim and a glow on its hub                              |
| `aether-housing`   | 126  | **Aether housing**: glow strips along both pipes' faces and along every fin's face                                  |

The glows (`aether-glow`, emission 0.3) sit at the drive look's, under a fifth of the nose seams'
1.6 (`nose-glow`), so the drill nose stays the brightest part of the rig with every look.

## Files

| File                                     | What it is                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `parts.png`                              | each part alone in the game's front view at 768 px/m                                                                         |
| `tier-1.png`, `tier-2.png`, `tier-3.png` | the rig at that tier bare and with each look on the slot, seven a row, 512 px/m, the nose lit as while drilling              |
| `tier-<n>.ingame.png`                    | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                                |
| `tier-<n>.phone.png`                     | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                                  |
| `glow.png`                               | the tier-1 rig bare and with each look by its emission alone: what the emissive map carries                                  |
| `outline.json`                           | each look's silhouette cells outside the rig at tiers 1, 2 and 3                                                             |
| `readability.json`                       | the phone-size pixels of the look box each step changes from the one before (default and closest zoom), the brightest pixels |
| `drillPowerLooks.json`                   | the asset, its slot, its parts with their step names and thresholds, the look box                                            |
| `author_drill_power_looks.py`            | wrote the source, re-runnable (Blender)                                                                                      |
| `render_drill_power_looks.py`            | the renders above (Blender), on the casing driller review's frame and stage                                                  |
| `check_outline.py`                       | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                                                  |
| `sheet_drill_power_looks.py`             | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                                           |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-power/author_drill_power_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-power/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-power/render_drill_power_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-drill-power/sheet_drill_power_looks.py
```

## Checks (25 Oct 2026, LK12)

Against ticket 875's acceptance, with the numbers the scripts wrote:

- **Step count and edges** (`drillPowerLooks.json`, `rigLook.json`): twenty-one authored steps on
  every LK1 edge of 6 from 6 to 126, about P40 on the median path, at least the 13 Systems' sizing
  row asks for, so the median bot never goes more than 3 planets without a band step through P40
  by construction. #554's nine glow rows stay the first nine steps, glow only, in their order;
  the twelve LK12 parts follow, each an added part in a socket, none a recolour. The band rule,
  the edges and the finish cycle are LK1's as they were, so the economy and the thresholds do not
  move; above 126 the finish tail keeps the aether housing. The PK7 trace (#826) is not on main,
  so the thresholds are LK1's frozen edges, and the cadence lane (`rigLookPlanets.lane.test.ts`)
  is where the 3-planet rule is measured.
- **Inside the rig outline, the tip where it was** (`outline.json`, 4 mm grid): every look has
  **0 silhouette cells outside the rig** at tiers 1, 2 and 3; the looks grow from 112 cells
  (the gauge) to 555 (the aether housing), all of them cells of the drum or the pod's bow.
  The parts live on `drill.housing` only and never reach the head, so the drawn drill tip is the
  head's own at every step (`drillTipAheadOf`, #789; `drillPowerLooks.test.ts` pins it at tiers
  1 to 3), the head keeps its one sprite, and the collider is the code constant no art feeds;
  `vehicle.blend` is untouched.
- **Readable at 360 px and 1280+** (`tier-<n>.phone.png`, `tier-<n>.ingame.png`,
  `readability.json`): the pixels of the look box each step changes against the step before it
  (the bare rig first), a channel moving more than 24 of 255, untinted renders, at a 360 px phone's
  closest zoom (8 m, 45 px/m, where `rigLookSweep.spec.ts` judges one visible step as 16 pixels)
  and at its default zoom (12 m, 30 px/m), tier 1 / tier 2 / tier 3:

  | Step (from)          | Closest zoom | Default zoom |
  | -------------------- | ------------ | ------------ |
  | Pressure gauge (60)  | 6 / 6 / 0    | 2 / 2 / 0    |
  | Relief valve (66)    | 5 / 5 / 0    | 2 / 2 / 0    |
  | Steam feed (72)      | 4 / 5 / 1    | 0 / 1 / 0    |
  | Cooling fins (78)    | 4 / 4 / 2    | 3 / 2 / 1    |
  | Clamp band (84)      | 4 / 4 / 3    | 2 / 1 / 2    |
  | Power flywheel (90)  | 3 / 3 / 0    | 0 / 0 / 0    |
  | Hex bolts (96)       | 0 / 0 / 0    | 0 / 0 / 0    |
  | Iron ribs (102)      | 6 / 4 / 0    | 1 / 1 / 0    |
  | Copper coils (108)   | 0 / 0 / 0    | 0 / 0 / 0    |
  | Sight lenses (114)   | 2 / 1 / 0    | 0 / 0 / 0    |
  | Flywheel halo (120)  | 2 / 2 / 1    | 1 / 1 / 0    |
  | Aether housing (126) | 3 / 3 / 1    | 1 / 1 / 0    |

  The panel is 5.5 cm wide, two and a half phone pixels at 45 px/m, so no step clears the sweep's
  16 by geometry alone here: the gauge, the valve, the pipes, the fins, the band, the flywheel and
  the ribs move 3 to 6 pixels at tiers 1 and 2, the bolts and coils none (a 9 mm bolt and a 19 mm
  coil are under a pixel), the glows 1 to 3. **Finding for G&V:** in the game each band also wears
  its own tint and glow from `rigLook.json` on the nose, the head and the housing parts, which
  the sweep's crop diff sees and these renders leave out; whether that carries the steps on a
  phone is the Tester's sweep and G&V's call, as LK6, LK7 and LK8 found for their small parts.
  At 90 px/m (`tier-<n>.ingame.png`) the column reads on the rig at tiers 1 and 2. Tier 3 at
  rest faces right under the reamer collar (Known limits).

- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 with every look, the stock rig's own; the look box
  reads 34 to 139 (the sight lenses, the halo and the aether strips at 0.3),
  and the rest of the rig 253 (the headlamp lens), as on the stock rig. Lit, the look box's
  brightest pixel is 178 to 188 at tier 1 against the nose's 203
  and 197 to 198 at tier 3 against 253. In `rigLook.json` the housing group's glows are 0.6 to 0.74, each
  under the `rigBody` cap of 1 with the glint's 0.25, and #554's bit glow rises 2.401 to 2.412 on
  the new steps (the drill-look slice's rule: never dimmer), with the drill tip's 0.58 still under
  the `drillNose` cap of 3 (`drillPowerLooks.test.ts`, `rigLookReadability.test.ts`).
- **Band names**: `Pressure gauge`, `Relief valve`, `Steam feed`, `Cooling fins`, `Clamp band`,
  `Power flywheel`, `Hex bolts`, `Iron ribs`, `Copper coils`, `Sight lenses`, `Flywheel halo`,
  `Aether housing`, and for #554's glow rows `Amber glow` to `Sun glow`: data strings of 2 words in
  `rigLook.json` (`card`) and `drillPowerLooks.json`; the table checks refuse longer ones.
  Progression and G&V may rename them in those two files.

## Known limits

- **Tier 3 at rest, facing sideways.** The tier-3 rig's reamer collar (`t3-drill-bit-2`, draw
  order 7) rides the swivelling head, and facing right its left arc sweeps across the drum, over
  the panel: the tier-3 sheet shows every step but the flywheel's edge under it. The collar turns
  with the head, so while the rig drills down or up, the way the P8-P40 game is mostly played,
  the panel is clear; the tier-3 belly skirt (`t3-armour-plate-3`, z 5) is body-fixed and covers
  the panel's bottom 1 cm at every facing. The sweep spec sees these steps on the tier-1 and
  tier-2 rig (drill_power alone gives 6 to 12 majors), where the panel is open. A socket the
  collar never crosses would be the pod's bow cap left of the drum, which the hull line's bow
  plate claims from 960 purchases; moving there is a data and art edit if G&V prefers it.
- **Fitted items.** A power-up in the fifth slot (`hull.powerup.5`, (0.3, -0.02)) and the grapple
  winch on `hull.arm.right` ((0.36, -0.12)) draw over the panel at draw order 6, as every mounted
  item wins its point; the look keeps drawing under them.
- **A thin panel.** The drum's open face is 5.5 cm wide: at a 360 px phone's closest zoom
  (45 px/m) that is two and a half pixels, so the steps read there by the column's luminance
  (bright steel, copper and teal over dark iron and brass) more than by shape; the readability
  numbers above count what moves, and in the game each band also wears its own tint and glow from
  `rigLook.json`, which these untinted renders leave out.
