# The cargo hold rig-look parts

The Blender source and review renders of
[Rig look art: cargo_hold Blender parts (4 parts) (#580)](https://github.com/bjor2/steampunk-miner/issues/580),
wave 576-1A of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576),
and of its LK4 steps,
[LK4: cargo_hold look steps to 5+ (#812)](https://github.com/bjor2/steampunk-miner/issues/812),
wave 647-7K of the P1-P5 map (#647): every purchase on the `cargo_hold` track visibly changes the
rig. Since LK1 (#809) the track's look steps sit on the band edges of 11 purchases: Progression's
Plank crate, Ore hopper and Riveted bin (6300549964) on 11, 22 and 33, then the LK4 parts fitted on
the bin in the ticket's order, Side racks on 44 and Strapped panniers on 55; the base rig's ore
hatch is the unnamed default, and the finish tail above the top step keeps every later band
visible.

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

| Part          | Step           | Look                                                                                                                                                                               |
| ------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ore-hatch`   | 0, the default | the rig's own hatch, piece for piece (`hatch_pieces` of the casing driller's author script), re-based on the slot: the rig's outline is unchanged with it in place                 |
| `plank-crate` | 11 purchases   | an oak crate under a tarred lid: five planks over a dark hold, iron corner straps nailed top and bottom, a brass hasp on the lid's edge                                            |
| `ore-hopper`  | 22 purchases   | an open brass hopper on riveted corner posts, a lip along its front edge, heaped with ore in four rows that show over the lip                                                      |
| `riveted-bin` | 33 purchases   | a pale blued-steel bin with two brass-riveted bands, steel corner plates, a steel hinge, a brass handle and a faintly lit sight glass                                              |
| `racked-bin`  | 44 purchases   | the riveted bin with a dark-iron stake rack hung under each of its ends down the pod's flank: three rails on four stakes, brass caps under the hatch, brass bolts at the feet      |
| `pannier-bin` | 55 purchases   | the racked bin with a tan leather pannier hanging in each rack under a dark flap, two canvas straps over the top rail with brass buckles; a bag on the flank, never an extra wagon |

A swap, as the wiring will draw it (`render_cargo_hold_looks.py`): the rig's `t1-hopper` is left
out and the look's part stands on the slot. The ore hatch reproduces the hatch exactly, so the
wiring may draw the base look either way (the rig's part, or the ore hatch in its place) and the
rig is the same below the first step.

**The LK4 sockets (#812).** The hatch is boxed in: the dome's plate against its left end, the
steam ram against its right, open sky over its lid, so the hold itself cannot grow, and above the
deck the rig outline the steps may not leave (#789) is the hatch's own. The one socket inside the
outline is the pod's flank under the hatch (vehicle x 0.135..0.305, z 0.012..0.1): bare riveted
bronze with the brass hoop at x 0.2, under the hull looks' armour (`vehicle-look-hull` stops at
z 0.01), clear of the motor housing (x 0.283 on, only below z 0.06) and of the dome's plate
(x 0.13 only above z 0.083). The racks hang from under the hatch's ends down that flank, standing
in front of the hoop's rivets so they draw over the pod (`z` 3 over the chassis's 2), and the
panniers hang in the racks in front of the rails, their straps over the top rail. `lookBoxM` in
`cargoHoldLooks.json` is the box every look fits inside (the hatch, that flank and the stay),
what the readability sheet measures a step over.

The slot sits 28 mm above the hatch's lid and the export refuses a part whose origin is outside its
bounds, so every look carries a dark iron stay up to the slot's height: 10 mm wide, standing behind
the steam ram's rod and barrel (`t1-piston`, draw order 4, in front of the hold). The ram covers it
at rest and at both ends of its 30 mm stroke (`PISTON_TRAVEL_M`), so in the game it never shows;
in `parts.png` it is the short bar at each part's top right.

The bin's sight glass is the one glow (emission 0.4, a quarter of the nose seams' 1.6), so the
drill nose stays the brightest part of the rig with every look.

## Files

| File                         | What it is                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parts.png`                  | each part alone in the game's front view at 768 px/m                                                                                                       |
| `tier-1.png`, `tier-3.png`   | the rig at that tier with each look on the slot, 512 px/m, the nose lit as while drilling                                                                  |
| `tier-<n>.ingame.png`        | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                                                              |
| `tier-<n>.phone.png`         | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                                                                |
| `glow.png`                   | the tier-1 rig with each look by its emission alone: what the emissive map carries                                                                         |
| `outline.json`               | each look's silhouette cells outside the rig at tiers 1 and 3, and the base look's against the rig                                                         |
| `readability.json`           | the look-box pixels each step changes from the one before at both phone zooms, and the nose's brightest pixel against the look box and the rest of the rig |
| `cargoHoldLooks.json`        | the asset, its slot, its look box, its parts with their step names and thresholds                                                                          |
| `author_cargo_hold_looks.py` | wrote the first version of the source (Blender)                                                                                                            |
| `author_cargo_hold_steps.py` | fitted the LK4 racks and panniers into the source (Blender, re-runnable: rewrites those two objects)                                                       |
| `render_cargo_hold_looks.py` | the renders above (Blender), on the casing driller review's frame and stage                                                                                |
| `check_outline.py`           | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                                                                                |
| `sheet_cargo_hold_looks.py`  | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                                                                         |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/author_cargo_hold_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-cargo-hold/author_cargo_hold_steps.py
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

## Checks (24 Oct 2026, LK4)

Against #812's acceptance, with the numbers the scripts wrote after `author_cargo_hold_steps.py`:

- **At least 5 authored steps on LK1's edges** (`cargoHoldLooks.json`, `rigLook.json`): five, on
  11, 22, 33, 44 and 55; the tail covers 66 on (`Burnished iron · L66`, `Bright brass · L77`, ...).
  Only the two steps the ticket named are added; the first three are #580's parts as they were.
- **A new part each, never a recolour** (`parts.png`): the racks are a dark-iron stake rack under
  each end of the bin, the panniers tan leather bags strapped into them. Both are added geometry
  on the riveted bin, which stays as it was above them.
- **Inside the rig outline, drill tip and collider unchanged** (`outline.json`): on a 4 mm grid,
  `racked-bin` and `pannier-bin` have **0** silhouette cells outside the rig at tiers 1 and 3
  (1,369 and 1,673 cells each, all over the hatch or the pod's flank). The parts live on
  `hull.cargo` only, the drill head is not drawn differently, and the collider is the code constant
  (`COLLIDER_M`) no art feeds; `vehicle.blend` is untouched.
- **Readable at 360 px and 1280+** (`readability.json`, `tier-<n>.phone.png`): look-box pixels
  each step changes against the one before (a channel moving more than 24 of 255). At the closest
  zoom (8 m, 45 px/m on a 360 px phone, where `rigLookSweep.spec.ts` judges one visible step as
  at least 16 px): racks **32** (tier 1) / **34** (tier 3), panniers **27** / **26**, against the
  first three steps' 24-30. At the default 12 m zoom (30 px/m): racks 16, panniers 11 (the hold is
  a 7 by 8 pixel box there). At 1280 px the parts are four times larger again
  (`tier-1.ingame.png`).
- **Glow under the `rigBody` cap** (`glow.png`, `readability.json`): the new parts add no
  emission; the bin's sight glass stays the hold's one glow. By emission alone the nose's brightest
  pixel is 247 against the look box's 175-178 (the sight glass, 0.4 against the nose seams' 1.6).
  Lit, the look box reads 195-196 under the bin's 200 at tier 1 and the nose's 255 at tier 3; the
  stock rig's 255 at tier 1 and 253 by emission are the headlamp lens, as before. The data row's
  step glows are 0.72 and 0.74, each under 1 with the glint's 0.25 (`rigLookTableChecks`).
- **Band names from data, 3 words or fewer:** `Side racks`, `Strapped panniers`, in `rigLook.json`
  (`card`) and `cargoHoldLooks.json`; the table checks refuse longer ones.
- **Checked by eye** on `tier-1.png` and the hold crops: the rack reads as a rack bolted under the
  hold, the panniers as bags hung in it, not as a wagon.

## Known limits

- The hold is a small part of the rig: at a 360 px phone it is six pixels across and three tall,
  so the steps read there by colour (dark steel, dark wood under a tarred lid, brass, pale blue
  steel) more than by detail; `readability.json` counts what changes. The ore hatch to Plank crate
  step is the least visible there (9 of 21); if #590's pixel-diff threshold asks for more, the
  crate's planks are where to add brightness, keeping clear of the hopper's brass. At the default
  12 m zoom the panniers move 11 of the look box's 56 pixels; at the closest zoom, where the sweep
  judges, 26-27.
- Every look reaches the slot by the stay behind the ram. Should the ram ever move further than
  its 30 mm stroke, or be drawn behind the hold, the stay would show as a dark bar above the lid.
- Below the first step the wiring can draw the rig's own `t1-hopper` or the ore hatch; the ore
  hatch exists so the swap is one rule for every step, not so the base rig changes.
- The tail above 55 (the finish bands of LK1) is the wiring's, on the pannier bin.
- The LK4 parts hang over the pod's flank at `z` 3; a mounted item at `hull.powerup.5` or
  `hull.nose` (`z` 6) draws over them as it draws over the hull's own hoops.
