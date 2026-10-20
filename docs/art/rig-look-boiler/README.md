# The boiler rig-look parts

The Blender source and review renders of
[Rig look art: boiler Blender parts (2 parts) (#582)](https://github.com/bjor2/steampunk-miner/issues/582),
wave 576-1B of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576):
every purchase on the `boiler` track visibly changes the rig. The Game Director locked one look
step for the boiler, with no second model (comment 6300553486 on #157): Systems' table puts the
step at 16 purchases (6300543785), the count the on-curve player leaves planet 1 with, and the
linear tail above it keeps every later purchase visible. Progression named the step "Twin-drum
boiler" and left the base rig's dome as the unnamed "Kettle boiler" (6300549964).

**Not wired.** Nothing registers, exports or draws the asset: the per-track rig-look registry is
#577 and the boiler's wiring, which reads the threshold from the registry's row and swaps the part
on the slot, is #583. `boilerLooks.json` here is the one table this folder's scripts share; the
wiring keeps its own rows (#576 "Registry": data, not code). The asset id follows the #52 kebab
form under the vehicle category, `vehicle-look-<track>`, so the registry can name it from the
track id; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_boiler_looks.py` wrote the first version of
the file, and `art/blender/vehicle-look-boiler/vehicle-look-boiler.blend` is the source from now
on (Git LFS). The two parts were then appended into the live Blender through the Blender MCP and
looked over from the front and three-quarter; the sheets below are the headless renders.

## The parts

The asset is authored in its own frame with the track's attach slot, `hull.boiler`, at the origin,
as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle sidecar
with no offset. Both parts fill the footprint of the rig's own `t1-boiler` dome, whose base sits
0.01 m right of and 0.1 m under the slot (`vehicle.parts.json`). Draw order `z` 3, the dome's.

| Part               | Step           | Look                                                                                                                                                                                                                                       |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kettle-boiler`    | 0, the default | the rig's brass pressure dome, piece for piece (`dome_pieces` of the casing driller's author script), re-based on the slot: 0 cells differ from `t1-boiler` (`outline.json`)                                                               |
| `twin-drum-boiler` | 16 purchases   | two copper drums end-on, each a dished steel head rimmed in brass with eight rivets and a boss; between them an iron firebox with an ember door, a brass steam column with a gauge, its domed cap and the kettle's own safety valve on top |

A swap, as the wiring will draw it (`render_boiler_looks.py`): the rig's `t1-boiler` is left out
and the look's part stands on the slot. The kettle reproduces the dome exactly, so the wiring may
draw the base look either way (the rig's part, or the kettle in its place) and the rig is the same
below the first step. The twin-drum's drums, column and firebox stay under the dome's ellipse and
its valve is the dome's, so the step changes what the dome is made of, not the rig's outline.

## Files

| File                       | What it is                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `parts.png`                | each part alone in the game's front view at 768 px/m                                             |
| `tier-1.png`, `tier-3.png` | the rig at that tier with each look on the slot, 512 px/m, the nose lit as while drilling        |
| `tier-<n>.ingame.png`      | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                    |
| `tier-<n>.phone.png`       | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing      |
| `glow.png`                 | the tier-1 rig with each look by its emission alone: what the emissive map carries               |
| `outline.json`             | each look's silhouette cells outside the rig at tiers 1 and 3, and the kettle's against the dome |
| `readability.json`         | the phone-size pixels the step changes, and the nose's brightest pixel against the boiler's      |
| `boilerLooks.json`         | the asset, its slot, its parts with their step names and thresholds                              |
| `author_boiler_looks.py`   | wrote the first version of the source (Blender)                                                  |
| `render_boiler_looks.py`   | the renders above (Blender), on the casing driller review's frame and stage                      |
| `check_outline.py`         | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                      |
| `sheet_boiler_looks.py`    | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)               |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/render_boiler_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-boiler/sheet_boiler_looks.py
```

## Checks (20 Oct 2026)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **Both parts modelled** (`parts.png`): the kettle and the twin-drum, the two looks of the GD's
  one-step boiler; the threshold served is 16 (`boilerLooks.json`), the table's.
- **Each part swaps on the track's slot** (`tier-1.png`, `tier-3.png`): both stand on
  `hull.boiler` at (-0.13, 0.2) in place of `t1-boiler`, on the tier-1 rig the boiler is bought on
  and on the tier-3 rig with its fore tank and second stack.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid, the twin-drum has 0 cells outside
  the rig's silhouette at tier 1 and at tier 3, and the kettle differs from the rig's own dome by
  0 cells. A first pass had 21 cells out at the valve: a ring facing the camera covers its whole
  outer radius, so a smaller ring crossed the kettle ring's hole; the twin-drum now carries the
  kettle's ring.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched. The wiring's digest check (#583) is where
  byte-identity is proved on the running game.
- **Distinct at 360 px** (`tier-1.phone.png`, `readability.json`): at 30 px/m, 61 of the 176
  pixels of the boiler's footprint change between the looks (a channel moving by more than 24 of
  255). The dome reads as one bronze hump; the twin-drum as two pale steel discs on a brass base
  with the column between, visibly lower and two-lobed.
- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 against the twin-drum's ember door at 142 (the kettle's 15 is
  its glass); the ember material is 0.5 against the nose seams' 1.6. Lit, the step does not raise
  the boiler's brightest pixel over the base look's (209 against 210 at tier 1, 209 against 211 at
  tier 3); those are the brass highlights the rig already has, under the lit nose at tier 3 (253)
  and about level with it at tier 1 (203), as on the stock rig.
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. The screenshots of the running game at each step and two tail points are the wiring's
  (#583), since nothing draws the asset yet.

## Known limits

- The drums are end-on, so their copper barely shows from the front: the step reads by its steel
  heads and brass rims, which is what tells at 360 px, and the copper is there for the
  three-quarter and the tail's plating ladder if the wiring ever tints it.
- Below the first step the wiring can draw the rig's own `t1-boiler` or the kettle; the kettle
  exists so the swap is one rule for every step, not so the base rig changes.
- The tail above 16 (tint, glow, plating) is the wiring's, on this one part.
