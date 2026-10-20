# The hull rig-look parts

The Blender source and review renders of
[Rig look art: hull Blender parts (6 parts) (#584)](https://github.com/bjor2/steampunk-miner/issues/584),
wave 576-1B of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576):
every purchase on the `hull` track visibly changes the rig. Systems' table puts the hull's five
steps at 20, 80, 140, 260 and 440 in the model's hull counter (comment 6300543785 on #157), which
the registry (#577) counts as `levels.hull` purchases; Progression named them Riveted plate,
Banded iron, Brass-trimmed armour, Layered armour and Filigree armour (6300549964), and the base
rig keeps its unnamed default, here "Bronze pod".

**Not wired.** Nothing registers, exports or draws the asset: the per-track rig-look registry is
#577 and the hull's wiring, which reads the thresholds from the registry's row and swaps the part
on the slot, is #585. `hullLooks.json` here is the one table this folder's scripts share; the
wiring keeps its own rows (#576 "Registry": data, not code). The asset id follows the #52 kebab
form under the vehicle category, `vehicle-look-<track>`, so the registry can name it from the
track id; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_hull_looks.py` wrote the first version of
the file, and `art/blender/vehicle-look-hull/vehicle-look-hull.blend` is the source from now on
(Git LFS). The six parts were then appended into the live Blender through the Blender MCP and
looked over from the front and three-quarter; the sheets below are the headless renders.

## The parts

The asset is authored in its own frame with the track's attach slot, `hull.plates`, at the
origin, as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle
sidecar with no offset. The slot sits on the deck line, 0.21 m above the pod's axis
(`vehicle.parts.json`: the slot at (0, 0.14), the chassis at (0, -0.07)), and no rig part sits on
it, so a look lies over the pod rather than replacing a part. Every armour is plating on the
pod's camera-side skin: three rows of facets tangent to its cross-section between the stern and
the bow socket (x -0.24 to 0.24, 0.13 m under the deck to 0.08 m over the axis), a hatch opening
round the driver's porthole, and two brass lifting eyes on the deck line between the dome base
plate's rivets. The eyes put the slot inside each part's bounds, which the export requires of a
pivot; the base look carries them too, inside the dome's base plate where neither the render nor
the game shows them. Draw order `z` 5 (the slot's, the armour's) for the steps, 2 (the pod's) for
the base.

| Part                   | Step | Look                                                                                                              |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| `bronze-pod`           | 0    | the pod's own porthole, piece for piece, half a millimetre proud (`porthole_pieces` of the casing driller script) |
| `riveted-plate`        | 20   | warm grey iron plates, a brass rivet row round every plate                                                        |
| `banded-iron`          | 80   | dark iron plates under polished steel straps down every seam, steel studs where they cross                        |
| `brass-trimmed-armour` | 140  | pale steel plates edged in brass with a brass boss on each and a brass frame round the hatch                      |
| `layered-armour`       | 260  | two lapped courses of blued steel scales per bay on a dark iron backing, each scale lapping its neighbour         |
| `filigree-armour`      | 440  | guild-green enamel under a brass bar with a chain of beads either side, a teal gem glowing in each bay's centre   |

A swap, as the wiring will draw it (`render_hull_looks.py`): the rig keeps every part of its own
and the look's part stands on the slot. The base look reproduces the porthole the hatch shows, so
the wiring may draw nothing below the first step (the registry has no part there) and the rig is
the same either way. The plating's top row ends under the dome's base plate and its bottom row
above the keel's rivets, so a step changes what the pod is clad in, not the rig's outline.

## Files

| File                       | What it is                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `parts.png`                | each part alone in the game's front view at 768 px/m                                                 |
| `tier-1.png`, `tier-3.png` | the bare rig at that tier and the rig with each look on the slot, 512 px/m, the nose lit as drilling |
| `tier-<n>.ingame.png`      | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                        |
| `tier-<n>.phone.png`       | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing          |
| `glow.png`                 | the tier-1 rig, bare and with each look, by its emission alone: what the emissive map carries        |
| `outline.json`             | each look's silhouette cells outside the rig at tiers 1 and 3, and the base look's beyond the pod's  |
| `readability.json`         | the phone-size pixels each step changes, and the nose's brightest pixel against the plating's        |
| `hullLooks.json`           | the asset, its slot, its parts with their step names and thresholds                                  |
| `author_hull_looks.py`     | wrote the first version of the source (Blender)                                                      |
| `render_hull_looks.py`     | the renders above (Blender), on the casing driller review's frame and stage                          |
| `check_outline.py`         | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                          |
| `sheet_hull_looks.py`      | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                   |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/author_hull_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/render_hull_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-hull/sheet_hull_looks.py
```

## Checks (21 Oct 2026)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **Six parts modelled** (`parts.png`): the base look and the five steps; the thresholds served
  are 20, 80, 140, 260 and 440 (`hullLooks.json`), the table's.
- **Each part swaps on the track's slot** (`tier-1.png`, `tier-3.png`): every look stands on
  `hull.plates` at (0, 0.14), on the tier-1 rig the first steps are bought on and on the tier-3
  rig with its heavy hull, shields and skirt, whose bands sit elsewhere under the plating.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid, every armour has 0 cells outside
  the rig's silhouette at tier 1 and at tier 3, and the base look adds 0 cells to the pod's own
  skin where it lies. A first pass copied the pod's three bands as well: their lower rims left 8
  cells outside the tier-1 rig and 16 outside tier 3, and the heavy hull's bands sit at other
  positions, so the base keeps only the porthole, which is the same at every tier.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched. The wiring's digest check (#585) is where
  byte-identity is proved on the running game.
- **Distinct at 360 px** (`tier-<n>.phone.png`, `readability.json`): at 30 px/m, each step
  changes 57 to 84 of the plating footprint's 144 pixels against the look before it at tier 1 (69,
  59, 77, 84, 57; a channel moving by more than 24 of 255) and 58 to 84 at tier 3 (70, 58, 76,
  84, 59); the bare rig to the base look changes 1 at either tier. The bronze pod goes warm grey and
  studded, then dark with pale straps, then pale and gold-edged, then blue-grey and ribbed, then
  deep green with gold tracery.
- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 against the filigree's gems at 163 (the gem material
  glows at 0.3 against the nose seams' 1.6; the other looks' 15 is the porthole glass). Lit, no
  step raises the plating's brightest pixel more than one unit over the bare rig's brass
  highlights (180 to 199 at tier 1 against the rig's 199, 190 to 199 at tier 3 against 198), all
  under the lit nose (203 at tier 1, 253 at tier 3).
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. The screenshots of the running game at each step and two tail points are the wiring's
  (#585), since nothing draws the asset yet.

## Known limits

- The plating covers the pod's bands where it lies; at tier 3 the heavy hull's four bands show
  only above and below it. The lifting eyes stand in front of the dome's base plate, between
  its rivets, and in front of the twin-drum boiler's plate when #582's step is on.
- The hatch frame of the brass-trimmed and filigree looks lies over the neighbouring plates'
  edges; its sill runs along the plating's bottom edge inside the opening.
- The tail above 440 (tint, glow, plating) is the wiring's, on the filigree part.
