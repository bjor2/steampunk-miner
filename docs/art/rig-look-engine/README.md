# The engine rig-look parts

The Blender source and review renders of
[Rig look art: engine Blender parts (4 parts) (#586)](https://github.com/bjor2/steampunk-miner/issues/586),
wave 576-1A of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576):
every purchase on the `engine` track visibly changes the rig. Systems' table puts the track's three
look steps at 2, 18 and 26 purchases (comment 6300543785 on #157), the on-curve counts the player
leaves planets 1, 5 and 8 with (the engine's planet 2 and 3 counts repeat planet 1's and are
dropped), and the linear tail above the top step keeps every later purchase visible. Progression
named the steps Single piston, Triple flywheel and Guild turbine (6300549964); the base rig's hub
cap is the unnamed default.

**Retired by #726: the drive's tracks and wheels replaced these on the slot** ([#731](https://github.com/bjor2/steampunk-miner/issues/731), `vehicle-look-drive`, [docs/art/rig-look-drive/](../rig-look-drive/README.md); GD on #726: since #723 the engine track is the only drive purchase). `vehicle-look-engine` left `lookAssets`, and its manifest entry, placeholder sidecar and exported atlas were deleted; the `.blend` and this folder stay as the retired source. What follows is the asset as #587 wired it. The rig-look slice registered and exports the asset and lays each step's part
on the slot from the registry's rows (`src/features/rig-look/rigLook.json`, #577); below 2
purchases nothing is drawn, so `hub-cap` ships unused. `engineLooks.json` here is the one table this folder's scripts share;
the wiring keeps its own rows (#576 "Registry": data, not code). The asset id follows the #52
kebab form under the vehicle category, `vehicle-look-<track>`, so the registry can name it from
the track id; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_engine_looks.py` wrote the first version of
the file, and `art/blender/vehicle-look-engine/vehicle-look-engine.blend` is the source from now on
(Git LFS). The four parts were then appended into the live Blender through the Blender MCP and
looked over from the front and three-quarter (see Checks); the sheets below are the headless
renders.

## The parts

The asset is authored in its own frame with the track's attach slot, `chassis.drive`, at the
origin, as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle
sidecar with no offset. The slot is the middle roller's hub: `vehicle.parts.json` puts it and
`t1-wheel-2` both at (0, -0.36), where the middle leg's brass hub cap and axle nut (part of the
chassis) sit in front of the roller's own discs. No rig part stands on the slot (the table's
`replaces` is null), so a look lies over the roller's hub rather than replacing a part, the roller
keeps rolling under it, and every rig part stays. Draw order `z` 3, one over the chassis's 2 (the
wiring, #587, raised it from the slot's 2 so the look draws over the chassis's own hub cap).

Every look is a drive unit on the axle and keeps inside the roller's own disc (radius 0.12 at
tier 1, 0.13 at tier 3; the author script refuses a part reaching past 0.09 m from the hub), so
the rig's outline never grows and the steps differ by what stands on the hub and by colour: brass
and dark iron, then pale steel rims, then green enamel round a blue-lit window.

| Part              | Step           | Look                                                                                                                                                          |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hub-cap`         | 0, the default | the leg's own brass hub cap and dark-iron axle nut, piece for piece (`leg_pieces` of the casing driller's author script), 1 mm proud: the rig is unchanged    |
| `single-piston`   | 2 purchases    | a brass steam cylinder lying along the axle's left, its steel rod driving a crank pin on a dark-iron crank disc, a copper steam pipe rising from the cylinder |
| `triple-flywheel` | 18 purchases   | three spoked steel flywheels stacked down the axle on an iron backing disc, the largest at the back, brass spokes, a brass axle nut in front                  |
| `guild-turbine`   | 26 purchases   | a bolted steel casing with a guild-green enamel ring round a glass window, eight swept brass vanes over a faintly lit blue core, a brass hub                  |

A swap, as the wiring will draw it (`render_engine_looks.py`): the rig keeps all its parts and
the look's part stands on the slot. The hub cap reproduces the leg's own cap, so the wiring may
draw the base look either way (nothing, or the hub cap over the leg's) and the rig is the same
below the first step.

The turbine's core is the one glow (emission 0.5, under a third of the nose seams' 1.6), in the
registry's placeholder colour for the step, so the drill nose stays the brightest part of the rig
with every look.

## Files

| File                       | What it is                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `parts.png`                | each part alone in the game's front view at 768 px/m                                                                |
| `tier-1.png`, `tier-3.png` | the rig at that tier, bare and with each look on the slot, 512 px/m, the nose lit as while drilling                 |
| `tier-<n>.ingame.png`      | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                       |
| `tier-<n>.phone.png`       | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                         |
| `glow.png`                 | the tier-1 rig, bare and with each look, by its emission alone: what the emissive map carries                       |
| `outline.json`             | each look's silhouette cells outside the rig at tiers 1 and 3, and the base look's beyond the rig round the hub     |
| `readability.json`         | the phone-size pixels each step changes, and the nose's brightest pixel against the hub's and the rest of the rig's |
| `engineLooks.json`         | the asset, its slot, its parts with their step names and thresholds                                                 |
| `author_engine_looks.py`   | wrote the first version of the source (Blender)                                                                     |
| `render_engine_looks.py`   | the renders above (Blender), on the casing driller review's frame and stage                                         |
| `check_outline.py`         | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                                         |
| `sheet_engine_looks.py`    | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                                  |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-engine/author_engine_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-engine/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-engine/render_engine_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-engine/sheet_engine_looks.py
```

## Checks (21 Oct 2026)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **Four parts modelled** (`parts.png`): the hub cap and Progression's three steps; the thresholds
  served are 2, 18 and 26 (`engineLooks.json`), Systems' table.
- **Each part swaps on the track's slot** (`tier-1.png`, `tier-3.png`): every look stands on
  `chassis.drive` at (0, -0.36), the middle roller's hub, on the tier-1 rig the steps are bought on
  and on the tier-3 rig with its larger grousered rollers and belly skirt. The slot has no tiered
  part of its own, so the same four looks serve every rig.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid, no look has a cell outside the rig's
  silhouette at tier 1 or 3, and the hub cap adds 0 cells to the tier-1 rig round the hub. The
  author script also refuses a part reaching past 0.09 m from the hub (the roller's disc is 0.12 m
  at tier 1); the first cut's steam pipe reached 0.092 m and was shortened.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched. The wiring's digest check (#587) is where
  byte-identity is proved on the running game.
- **Distinct at 360 px** (`tier-<n>.phone.png`, `readability.json`): at 30 px/m the hub's footprint
  is 42 pixels (6 by 7), and each step changes these many of them from the look before it (a
  channel moving by more than 24 of 255):

  | Step                             | Changed of 42, tier 1 | Tier 3 |
  | -------------------------------- | --------------------: | -----: |
  | bare rig to hub cap              |                     0 |      0 |
  | hub cap to Single piston         |                    15 |     15 |
  | Single piston to Triple flywheel |                    20 |     19 |
  | Triple flywheel to Guild turbine |                    20 |     19 |

  The roller's dark sprocket and steel track go to a warm iron crank disc with a brass cylinder,
  then to pale steel rims on an iron backing, then to a green ring round a blue window. The first
  cut's single piston changed 8: its crank disc was the roller's own dark iron, so only the brass
  cylinder and rod read; it is now a wider disc of warm iron plate.

- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 against the turbine's core at 127 (the glow material at 0.3
  against the nose seams' 1.6; the other looks' 15 is the rig's own). Lit, no look raises the hub's
  brightest pixel over the lit nose: 183 to 193 at tier 1 against the nose's 203, 185 to 192 at
  tier 3 against 253. The first cut's turbine window, in the registry's pale placeholder cyan at
  0.5 and then at 0.3, read 217 and 211 lit at tier 1, over the nose's 203; its base colour was
  darkened to bring it under.
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. The screenshots of the running game at each step and two tail points are the wiring's
  (#587), since nothing draws the asset yet.
- **Blender MCP:** the four parts were appended into the box's live Blender through the MCP after
  each of the three cuts and looked over from the front and three-quarter: the drive units read as
  a cylinder-and-crank, three concentric spoked rims and a vaned window. The session's objects were
  removed from the live scene afterwards.

## Known limits

- The hub is a small part of the rig: at a 360 px phone the roller is seven pixels across and the
  drive unit five, so the steps read there by colour (dark iron, warm iron and brass, pale steel,
  green and blue) more than by detail; `readability.json` counts what changes. The hub cap to Single
  piston step is the least visible there (15 of 42); if #590's pixel-diff threshold asks for more,
  the crank disc is where to add brightness, keeping it under the flywheels' steel.
- The look first drew at the slot's `z` 2, the chassis's own, and the chassis's hub cap sits at the
  slot, so the two would fight for the same depth. The wiring (#587) set every part's `z` to 3 in
  the `.blend` (over the chassis's 2, under the thrusters' 4), so the look lies over the chassis as
  the hull's lies over the pod. Had the chassis drawn over it, only the leg's 32 mm brass cap and
  12 mm nut would show at the look's centre, which every engine covers with a boss of its own.
- The roller turns with the ground speed and the look stands still over its hub, as a real axle
  cap does; the wiring may turn the flywheels and turbine with the roller if it wants them to spin.
- The showcase's engine reaction lifts the rollers and chassis (`showcase.json`); a look on
  `chassis.drive` moves with the slot, which is the wiring's to carry.
- Below the first step the wiring can draw nothing or the hub cap; the hub cap exists so the swap
  is one rule for every step, not so the base rig changes.
- The tail above 26 (tint, glow, plating) is the wiring's, on the guild turbine.
