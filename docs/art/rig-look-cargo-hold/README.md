# The cargo hold rig-look parts

The Blender source and review renders of
[Rig look art: cargo_hold Blender parts (4 parts) (#580)](https://github.com/bjor2/steampunk-miner/issues/580),
wave 576-1A of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576):
every purchase on the `cargo_hold` track visibly changes the rig. Systems' table puts the track's
three look steps at 23, 31 and 33 purchases (comment 6300543785 on #157), the on-curve counts the
player leaves planets 1, 5 and 8 with (the hold is front-loaded, so planets 2 and 3 repeat planet
1's count and are dropped), and the linear tail above the top step keeps every later purchase
visible. Progression named the steps Plank crate, Ore hopper and Riveted bin (6300549964); the base
rig's ore hatch is the unnamed default.

**Wired by #581.** The rig-look slice registers and exports the asset and swaps each step's part
onto the slot from the registry's rows (`src/features/rig-look/rigLook.json`, #577). `cargoHoldLooks.json` here is the one table this folder's scripts share;
the wiring keeps its own rows (#576 "Registry": data, not code). The asset id follows the #52 kebab
form under the vehicle category, `vehicle-look-<track>`, so the registry can name it from the track
id; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_cargo_hold_looks.py` wrote the first version
of the file, and `art/blender/vehicle-look-cargo-hold/vehicle-look-cargo-hold.blend` is the source
from now on (Git LFS). The four parts were then appended into the live Blender through the Blender
MCP and looked over from the front and three-quarter after each cut (see Checks); the sheets below
are the headless renders.

## The parts

The asset is authored in its own frame with the track's attach slot, `hull.cargo`, at the origin,
as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle sidecar
with no offset. Every look stands in place of the rig's ore hatch on the fore deck, `t1-hopper`,
whose base sits 0.02 m right of and 0.1 m under the slot (`vehicle.parts.json`), at the hatch's own
depth. Draw order `z` 3, the hatch's.

The #576 rules say cargo stays inside the rig's outline, and the rig's outline at the hold is the
hatch itself: a 170 mm frame 60 mm above the deck, its 180 mm lid to 72 mm, the hinge's bump at the
left. A look keeps inside that, so the steps differ by material and colour and by what fills the
box, not by growing the hold.

| Part          | Step           | Look                                                                                                                                                               |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ore-hatch`   | 0, the default | the rig's own hatch, piece for piece (`hatch_pieces` of the casing driller's author script), re-based on the slot: the rig's outline is unchanged with it in place |
| `plank-crate` | 23 purchases   | an oak crate under a tarred lid: five planks over a dark hold, iron corner straps nailed top and bottom, a brass hasp on the lid's edge                            |
| `ore-hopper`  | 31 purchases   | an open brass hopper on riveted corner posts, a lip along its front edge, heaped with ore in four rows that show over the lip                                      |
| `riveted-bin` | 33 purchases   | a pale blued-steel bin with two brass-riveted bands, steel corner plates, a steel hinge, a brass handle and a faintly lit sight glass                              |

A swap, as the wiring will draw it (`render_cargo_hold_looks.py`): the rig's `t1-hopper` is left
out and the look's part stands on the slot. The ore hatch reproduces the hatch exactly, so the
wiring may draw the base look either way (the rig's part, or the ore hatch in its place) and the
rig is the same below the first step.

The slot sits 28 mm above the hatch's lid and the export refuses a part whose origin is outside its
bounds, so every look carries a dark iron stay up to the slot's height: 10 mm wide, standing behind
the steam ram's rod and barrel (`t1-piston`, draw order 4, in front of the hold). The ram covers it
at rest and at both ends of its 30 mm stroke (`PISTON_TRAVEL_M`), so in the game it never shows;
in `parts.png` it is the short bar at each part's top right.

The bin's sight glass is the one glow (emission 0.4, a quarter of the nose seams' 1.6), so the
drill nose stays the brightest part of the rig with every look.

## Files

| File                         | What it is                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `parts.png`                  | each part alone in the game's front view at 768 px/m                                                                    |
| `tier-1.png`, `tier-3.png`   | the rig at that tier with each look on the slot, 512 px/m, the nose lit as while drilling                               |
| `tier-<n>.ingame.png`        | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                           |
| `tier-<n>.phone.png`         | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                             |
| `glow.png`                   | the tier-1 rig with each look by its emission alone: what the emissive map carries                                      |
| `outline.json`               | each look's silhouette cells outside the rig at tiers 1 and 3, and the base look's against the rig                      |
| `readability.json`           | the phone-size pixels each step changes from the one before, and the nose's brightest pixel against the rest of the rig |
| `cargoHoldLooks.json`        | the asset, its slot, its parts with their step names and thresholds                                                     |
| `author_cargo_hold_looks.py` | wrote the first version of the source (Blender)                                                                         |
| `render_cargo_hold_looks.py` | the renders above (Blender), on the casing driller review's frame and stage                                             |
| `check_outline.py`           | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                                             |
| `sheet_cargo_hold_looks.py`  | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                                      |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/author_cargo_hold_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/render_cargo_hold_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-cargo-hold/sheet_cargo_hold_looks.py
```

## Checks (21 Oct 2026)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **Four parts modelled** (`parts.png`): the ore hatch and Progression's three steps; the
  thresholds served are 23, 31 and 33 (`cargoHoldLooks.json`), Systems' table.
- **Each part swaps on the track's slot** (`tier-1.png`, `tier-3.png`): every look stands on
  `hull.cargo` at (0.2, 0.2) in place of `t1-hopper`, on the tier-1 rig the steps are bought on
  and on the tier-3 rig, whose second tank sits just over the hold. The hatch has no tier-2 or
  tier-3 successor, so the same four looks serve every rig.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid, no look has a cell outside the rig's
  silhouette at tier 1 or 3, and the ore hatch in place of the rig's own hatch changes the tier-1
  outline by 0 cells. The first cut had 22 to 40 cells out per look: below the lid the hatch is its
  170 mm frame, not the lid's 180 mm, and the frame's corners are bevelled, so the straps, posts
  and plates moved in to 2 mm inside the frame's edge. One cell then remained on the bin, at the
  lid's corner: the bevel modifier clamps the whole part's width to its thinnest edge, and the
  sight glass's 3 mm ring squared the lid's corners off against the rig's rounded ones, so the
  sight glass became two 10 mm discs and no piece in any look is thinner than twice the bevel.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched. The wiring's digest check (#581) is where
  byte-identity is proved on the running game.
- **Distinct at 360 px** (`tier-<n>.phone.png`, `readability.json`): at 30 px/m the hold's
  footprint is 21 pixels (7 by 3), and each step changes these many of them from the look before
  it (a channel moving by more than 24 of 255), the same at tiers 1 and 3:

  | Step                      | Changed of 21 |
  | ------------------------- | ------------: |
  | ore hatch to Plank crate  |             9 |
  | Plank crate to Ore hopper |            12 |
  | Ore hopper to Riveted bin |            14 |

  The footprint's top row is the lid's and its bottom row is half the pod's, so the middle row is
  where a look's body shows. The first cut's crate changed 4: its light wooden lid read as the
  hatch's brass lid in the top row and its iron band darkened the bottom row to the hatch's grille,
  so the lid was tarred dark, the band dropped and the planks widened, which lifted it to 9.

- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 with every look, the stock rig's own; no look raises it, and
  the sight glass's 0.4 adds no glow the measure sees elsewhere. The rest of the rig reads 253 with
  every look, which is the headlamp lens (`lamp-lens`, 1.5), the same on the stock rig: the looks
  leave that comparison as they found it. Lit, the nose is 255 against 226 at tier 3; at tier 1 the
  brass highlights of the body saturate at 255, as on the stock rig (the boiler and drill tip
  reviews found the same), and the looks do not change them.
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. The screenshots of the running game at each step and two tail points are the wiring's
  (#581), since nothing draws the asset yet.
- **Blender MCP:** the four parts were appended into the box's live Blender through the MCP after
  each cut and rendered from the front and three-quarter. That is where the first cut's hopper
  read as a flat brass cap with one row of ore on its front edge (now heaped in four rows), and
  where the final cut was accepted.

## Known limits

- The hold is a small part of the rig: at a 360 px phone it is six pixels across and three tall,
  so the steps read there by colour (dark steel, dark wood under a tarred lid, brass, pale blue
  steel) more than by detail; `readability.json` counts what changes. The ore hatch to Plank crate
  step is the least visible there (9 of 21); if #590's pixel-diff threshold asks for more, the
  crate's planks are where to add brightness, keeping clear of the hopper's brass.
- Every look reaches the slot by the stay behind the ram. Should the ram ever move further than
  its 30 mm stroke, or be drawn behind the hold, the stay would show as a dark bar above the lid.
- Below the first step the wiring can draw the rig's own `t1-hopper` or the ore hatch; the ore
  hatch exists so the swap is one rule for every step, not so the base rig changes.
- The tail above 33 (tint, glow, plating) is the wiring's, on the riveted bin.
